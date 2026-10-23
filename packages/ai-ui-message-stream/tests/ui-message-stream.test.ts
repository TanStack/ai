import { describe, expect, it, vi } from 'vitest'
import { EventSchemas } from '@ag-ui/core/schemas'
import { EventType, chat, convertMessagesToModelMessages } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { toolDefinition } from '@tanstack/ai/client'
import { ChatClient } from '@tanstack/ai-client'
import { readUIMessageStream } from 'ai'
import { z } from 'zod'
import {
  fromAISDKMessages,
  fromChatTransport,
  fromUIMessageStream,
  toUIMessageStream,
} from '../src'
import type { StreamChunk } from '@tanstack/ai'
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

async function* events(list: Array<StreamChunk>): AsyncGenerator<StreamChunk> {
  yield* list
}

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

describe('TanStack server, AI SDK client', () => {
  it('builds the AI SDK message and replays it into chat()', async () => {
    const stream = toUIMessageStream(
      events([
        { type: EventType.RUN_STARTED, threadId: 't', runId: 'r' },
        {
          type: EventType.REASONING_MESSAGE_START,
          messageId: 'think-1',
          role: 'reasoning',
        },
        {
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: 'think-1',
          delta: 'Plan.',
        },
        {
          type: EventType.REASONING_ENCRYPTED_VALUE,
          subtype: 'message',
          entityId: 'think-1',
          encryptedValue: 'sig-1',
        },
        { type: EventType.REASONING_MESSAGE_END, messageId: 'think-1' },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'msg-1',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'Checking.',
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: 'msg-1' },
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call-1',
          toolCallName: 'weather',
          parentMessageId: 'msg-1',
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call-1',
          delta: '{"city":"NYC"}',
        },
        { type: EventType.TOOL_CALL_END, toolCallId: 'call-1' },
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: 'res-1',
          toolCallId: 'call-1',
          content: '{"temp":72}',
          role: 'tool',
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'msg-1',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'It is 72F.',
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: 'msg-1' },
        {
          type: EventType.RUN_FINISHED,
          threadId: 't',
          runId: 'r',
          outcome: { type: 'success' },
          metadata: { tanstack: { finishReason: 'stop' } },
        },
      ]),
    )

    let assistant: UIMessage | undefined
    for await (const message of readUIMessageStream({ stream })) {
      assistant = message
    }

    expect(assistant?.parts).toMatchObject([
      {
        type: 'reasoning',
        text: 'Plan.',
        providerMetadata: { tanstack: { signature: 'sig-1' } },
      },
      { type: 'text', text: 'Checking.' },
      {
        type: 'tool-weather',
        toolCallId: 'call-1',
        state: 'output-available',
        input: { city: 'NYC' },
        output: { temp: 72 },
      },
      { type: 'text', text: 'It is 72F.' },
    ])

    const user: UIMessage = {
      id: 'u-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Weather in NYC?' }],
    }
    const history = convertMessagesToModelMessages(
      fromAISDKMessages([user, assistant!]),
    )
    expect(history).toMatchObject([
      { role: 'user', content: 'Weather in NYC?' },
      {
        role: 'assistant',
        content: 'Checking.',
        thinking: [{ content: 'Plan.', signature: 'sig-1' }],
        toolCalls: [
          {
            id: 'call-1',
            function: { name: 'weather', arguments: '{"city":"NYC"}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call-1', content: '{"temp":72}' },
      { role: 'assistant', content: 'It is 72F.' },
    ])
  })

  it('serves real chat() output, then continues after an AI SDK client tool', async () => {
    const fake = fakeText()
    fake.setResponses([
      {
        thinking: 'Plan.',
        toolCalls: [{ name: 'weather', input: { city: 'NYC' } }],
      },
      { toolCalls: [{ name: 'ask', input: { q: 'Units?' } }] },
      ({ request }) => ({
        text: `Answer: ${String(request.messages.at(-1)?.content)}`,
      }),
    ])
    const weather = toolDefinition({
      name: 'weather',
      description: 'Weather for a city',
      inputSchema: z.object({ city: z.string() }),
    }).server(() => ({ temp: 72 }))
    const ask = toolDefinition({
      name: 'ask',
      description: 'Ask the user',
      inputSchema: z.object({ q: z.string() }),
    })

    async function turn(messages: Array<UIMessage>): Promise<UIMessage> {
      const stream = toUIMessageStream(
        chat({
          adapter: fake,
          threadId: 'chat-1',
          messages: fromAISDKMessages(messages),
          tools: [weather, ask],
        }),
      )
      let last: UIMessage | undefined
      for await (const message of readUIMessageStream({ stream }))
        last = message
      return last!
    }

    const user: UIMessage = {
      id: 'u-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Weather?' }],
    }
    const first = await turn([user])
    expect(first.parts).toMatchObject([
      { type: 'reasoning', text: 'Plan.' },
      { type: 'tool-weather', state: 'output-available', output: { temp: 72 } },
      { type: 'tool-ask', state: 'input-available', input: { q: 'Units?' } },
    ])

    // The AI SDK client runs `ask` and posts the history with its output.
    const answered: UIMessage = {
      ...first,
      parts: first.parts.map((part) =>
        part.type === 'tool-ask' && part.state === 'input-available'
          ? { ...part, state: 'output-available', output: 'Fahrenheit' }
          : part,
      ),
    }
    const second = await turn([user, answered])
    expect(second.parts).toMatchObject([
      { type: 'text', text: 'Answer: Fahrenheit' },
    ])
  })

  it('sends an AI SDK tool error back as an error result', () => {
    const [assistant] = convertMessagesToModelMessages(
      fromAISDKMessages([
        {
          id: 'a-1',
          role: 'assistant',
          parts: [
            {
              type: 'dynamic-tool',
              toolName: 'ping',
              toolCallId: 'c-1',
              state: 'output-error',
              input: {},
              errorText: 'offline',
            },
          ],
        },
      ]),
    ).slice(1)
    expect(assistant).toMatchObject({
      role: 'tool',
      toolCallId: 'c-1',
      error: 'offline',
    })
  })
})

describe('AI SDK server, TanStack client', () => {
  const firstTurn: Array<UIMessageChunk> = [
    { type: 'start', messageId: 'a-1' },
    { type: 'start-step' },
    { type: 'reasoning-start', id: '0' },
    { type: 'reasoning-delta', id: '0', delta: 'Hmm.' },
    {
      type: 'reasoning-end',
      id: '0',
      providerMetadata: { anthropic: { signature: 'sig' } },
    },
    { type: 'text-start', id: '1' },
    { type: 'text-delta', id: '1', delta: 'Pinging.' },
    { type: 'text-end', id: '1' },
    { type: 'tool-input-start', toolCallId: 'c-1', toolName: 'ping' },
    { type: 'tool-input-delta', toolCallId: 'c-1', inputTextDelta: '{}' },
    {
      type: 'tool-input-available',
      toolCallId: 'c-1',
      toolName: 'ping',
      input: {},
    },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'tool-calls' },
  ]

  it('emits valid AG-UI events', async () => {
    const out: Array<StreamChunk> = []
    for await (const event of fromUIMessageStream(chunkStream(firstTurn), {
      threadId: 't',
      runId: 'r',
    })) {
      out.push(event)
    }
    for (const event of out) EventSchemas.parse(event)
    expect(out.map((e) => e.type)).toEqual([
      'RUN_STARTED',
      'REASONING_MESSAGE_START',
      'REASONING_MESSAGE_CONTENT',
      'REASONING_ENCRYPTED_VALUE',
      'REASONING_MESSAGE_END',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'RUN_FINISHED',
    ])
  })

  it('runs a client tool and sends its output and reasoning back', async () => {
    const requests: Array<Array<UIMessage>> = []
    const transport: ChatTransport<UIMessage> = {
      sendMessages({ messages }) {
        requests.push(messages)
        return Promise.resolve(
          chunkStream(
            requests.length === 1
              ? firstTurn
              : [
                  { type: 'start' },
                  { type: 'text-start', id: '0' },
                  { type: 'text-delta', id: '0', delta: 'Got pong.' },
                  { type: 'text-end', id: '0' },
                  { type: 'finish', finishReason: 'stop' },
                ],
          ),
        )
      },
      reconnectToStream: () => Promise.resolve(null),
    }
    const execute = vi.fn(() => ({ reply: 'pong' }))
    const ping = toolDefinition({
      name: 'ping',
      description: 'Reply with pong',
      inputSchema: z.object({}),
    }).client(execute)
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fromChatTransport(transport),
      tools: [ping],
    })

    await client.sendMessage('ping me')

    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(execute).toHaveBeenCalledTimes(1)
    const sent = requests[1]!.find((m) => m.role === 'assistant')
    expect(sent?.parts).toMatchObject([
      {
        type: 'reasoning',
        text: 'Hmm.',
        providerMetadata: { anthropic: { signature: 'sig' } },
      },
      { type: 'text', text: 'Pinging.' },
      {
        type: 'dynamic-tool',
        toolName: 'ping',
        toolCallId: 'c-1',
        state: 'output-available',
        output: { reply: 'pong' },
      },
    ])
    await vi.waitFor(() =>
      expect(JSON.stringify(client.getMessages())).toContain('Got pong.'),
    )
  })
})
