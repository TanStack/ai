import { describe, expect, it, vi } from 'vitest'
import { EventSchemas } from '@ag-ui/core/schemas'
import { EventType } from '@tanstack/ai'
import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { convertToModelMessages } from 'ai'
import { z } from 'zod'
import {
  fromAISDKMessages,
  fromChatTransport,
  fromUIMessageStream,
} from '../src'
import type { StreamChunk } from '@tanstack/ai'
import type { ChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

function chunkStream(
  list: Array<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of list) controller.enqueue(chunk)
      controller.close()
    },
  })
}

/** A transport that answers request N with `turns[N]`, after `gate` if set. */
function fakeTransport(
  turns: Array<Array<UIMessageChunk>>,
  gate?: Promise<void>,
) {
  const requests: Array<Array<UIMessage>> = []
  const transport: ChatTransport<UIMessage> = {
    async sendMessages({ messages }) {
      requests.push(messages)
      const turn = turns[requests.length - 1] ?? []
      if (requests.length === 1) await gate
      return chunkStream(turn)
    },
    reconnectToStream: () => Promise.resolve(null),
  }
  return { requests, transport }
}

/** One AI SDK reply with message id `messageId`, streaming `deltas`. */
function textTurn(
  messageId: string,
  ...deltas: Array<string>
): Array<UIMessageChunk> {
  return [
    { type: 'start', messageId },
    { type: 'text-start', id: '0' },
    ...deltas.map(
      (delta): UIMessageChunk => ({
        type: 'text-delta',
        id: '0',
        delta,
      }),
    ),
    { type: 'text-end', id: '0' },
    { type: 'finish', finishReason: 'stop' },
  ]
}

const recipe = z.object({ name: z.string(), steps: z.array(z.string()) })

async function collect(
  list: Array<UIMessageChunk>,
  outputSchema?: typeof recipe,
) {
  const out: Array<StreamChunk> = []
  for await (const event of fromUIMessageStream(chunkStream(list), {
    threadId: 't',
    runId: 'r',
    outputSchema,
  }))
    out.push(event)
  for (const event of out) EventSchemas.parse(event)
  return out
}

describe('AI SDK server, TanStack client: client features', () => {
  it('shows an Output.object answer as a typed structured-output part', async () => {
    const { transport } = fakeTransport([
      textTurn('a-1', '{"name":"Pan', 'cakes","steps":["Mix",', '"Fry"]}'),
    ])
    const partials: Array<unknown> = []
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fromChatTransport(transport, { outputSchema: recipe }),
      onMessagesChange: (messages) => {
        const part = messages
          .at(-1)
          ?.parts.find((p) => p.type === 'structured-output')
        if (part?.status === 'streaming') partials.push(part.partial)
      },
    })

    await client.sendMessage('A recipe')
    expect(partials).toContainEqual({ name: 'Pan' })
    expect(partials).toContainEqual({ name: 'Pancakes', steps: ['Mix'] })
    const assistant = client.getMessages().at(-1)
    expect(assistant?.parts).toEqual([
      {
        type: 'structured-output',
        status: 'complete',
        raw: '{"name":"Pancakes","steps":["Mix","Fry"]}',
        data: { name: 'Pancakes', steps: ['Mix', 'Fry'] },
        partial: { name: 'Pancakes', steps: ['Mix', 'Fry'] },
      },
    ])
  })

  it('wraps the answer text in structured-output events', async () => {
    const out = await collect(
      textTurn('a-1', '{"name":"A","steps":[]}'),
      recipe,
    )
    expect(
      out.map((e) => (e.type === EventType.CUSTOM ? e.name : e.type)),
    ).toEqual([
      EventType.RUN_STARTED,
      'structured-output.start',
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      'structured-output.complete',
      EventType.RUN_FINISHED,
    ])
    expect(
      out.find(
        (e) =>
          e.type === EventType.CUSTOM &&
          e.name === 'structured-output.complete',
      ),
    ).toMatchObject({
      value: { object: { name: 'A', steps: [] }, messageId: 'a-1' },
    })
  })

  it('ends with a RUN_ERROR when the answer fails the schema', async () => {
    for (const text of ['{"name":1}', 'not json']) {
      const out = await collect(textTurn('a-1', text), recipe)
      expect(out.at(-1)).toMatchObject({
        type: EventType.RUN_ERROR,
        code: 'structured-output-validation-failed',
      })
      expect(out.some((e) => e.type === EventType.RUN_FINISHED)).toBe(false)
    }
  })

  it('keeps plain text without outputSchema', async () => {
    const out = await collect(textTurn('a-1', '{"name":"A"}'))
    expect(out.some((e) => e.type === EventType.CUSTOM)).toBe(false)
  })

  it('queues a message sent while a reply streams and sends it after', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { requests, transport } = fakeTransport(
      [textTurn('a-1', 'First.'), textTurn('a-2', 'Second.')],
      gate,
    )
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fromChatTransport(transport),
    })

    const first = client.sendMessage('one')
    await vi.waitFor(() => expect(client.getIsLoading()).toBe(true))
    await client.sendMessage('two')
    expect(client.getQueue().map((q) => q.content)).toEqual(['two'])
    expect(requests).toHaveLength(1)

    release()
    await first
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    await vi.waitFor(() => expect(client.getIsLoading()).toBe(false))
    expect(client.getQueue()).toEqual([])
    expect(
      requests[1]!.map((m) =>
        m.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join(''),
      ),
    ).toEqual(['one', 'First.', 'two'])
  })

  it('emits devtools events for a bridged run', async () => {
    const { transport } = fakeTransport([textTurn('a-1', 'Hi.')])
    // The bridge useChat installs, as the framework hooks pass it.
    let bridge: ChatDevtoolsBridge | undefined
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fromChatTransport(transport),
      devtoolsBridgeFactory: (options) =>
        (bridge = createChatDevtoolsBridge(options)),
    })
    if (!bridge) throw new Error('expected a devtools bridge')
    const messageSent = vi.spyOn(bridge.events, 'messageSent')
    const textUpdated = vi.spyOn(bridge.events, 'textUpdated')
    const loadingChanged = vi.spyOn(bridge.events, 'loadingChanged')

    await client.sendMessage('Hello')
    expect(messageSent).toHaveBeenCalledWith(expect.any(String), 'Hello')
    expect(textUpdated).toHaveBeenCalledWith(expect.any(String), 'a-1', 'Hi.')
    expect(loadingChanged.mock.calls.map(([loading]) => loading)).toEqual([
      true,
      false,
    ])
  })

  it('loads saved AI SDK history and sends it back unchanged', async () => {
    const saved: Array<UIMessage> = [
      { id: 'u-1', role: 'user', parts: [{ type: 'text', text: 'Weather?' }] },
      {
        id: 'a-1',
        role: 'assistant',
        // As AI SDK useChat saves a two-step answer.
        parts: [
          { type: 'step-start' },
          {
            type: 'dynamic-tool',
            toolName: 'weather',
            toolCallId: 'c-1',
            input: { city: 'Paris' },
            state: 'output-available',
            output: { temp: 20 },
          },
          { type: 'step-start' },
          { type: 'text', text: 'It is 20 degrees.' },
        ],
      },
    ]
    const { requests, transport } = fakeTransport([textTurn('a-3', 'Yes.')])
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fromChatTransport(transport),
      initialMessages: fromAISDKMessages(saved),
    })
    expect(client.getMessages().map((m) => m.id)).toEqual(['u-1', 'a-1'])

    await client.sendMessage('Warm?')
    // The leading step-start is dropped. The route's model messages match.
    expect(await convertToModelMessages(requests[0]!.slice(0, 2))).toEqual(
      await convertToModelMessages(saved),
    )
    expect(requests[0]![1]!.parts.map((p) => p.type)).toEqual([
      'dynamic-tool',
      'step-start',
      'text',
    ])
    expect(requests[0]![2]).toMatchObject({
      role: 'user',
      parts: [{ type: 'text', text: 'Warm?' }],
    })
  })
})
