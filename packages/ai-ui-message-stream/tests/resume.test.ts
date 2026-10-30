import { describe, expect, it, vi } from 'vitest'
import { chat, memoryStream } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { ChatClient } from '@tanstack/ai-client'
import { DefaultChatTransport, readUIMessageStream } from 'ai'
import {
  fromAISDKMessages,
  fromChatTransport,
  resumeUIMessageStreamResponse,
  toResumableUIMessageStreamResponse,
} from '../src'
import type { ChatPersistedState } from '@tanstack/ai-client'
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

const REPLY: Array<UIMessageChunk> = [
  { type: 'start', messageId: 'a-1' },
  { type: 'text-start', id: 't' },
  { type: 'text-delta', id: 't', delta: 'Hel' },
  { type: 'text-delta', id: 't', delta: 'lo.' },
  { type: 'text-end', id: 't' },
  { type: 'finish', finishReason: 'stop' },
]

/** A stream of `list` that fails with a dropped connection after `dropAfter` chunks. */
function chunkStream(
  list: Array<UIMessageChunk>,
  dropAfter = Infinity,
): ReadableStream<UIMessageChunk> {
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index === dropAfter) controller.error(new TypeError('network error'))
      else if (index === list.length) controller.close()
      else controller.enqueue(list[index++]!)
    },
  })
}

function fakeTransport(
  reconnect: () => ReadableStream<UIMessageChunk> | null,
): ChatTransport<UIMessage> & { reconnects: Array<string> } {
  const reconnects: Array<string> = []
  return {
    resumeStreamIsReplay: true,
    reconnects,
    sendMessages: () => Promise.resolve(chunkStream(REPLY, 3)),
    reconnectToStream: ({ chatId }) => {
      reconnects.push(chatId)
      return Promise.resolve(reconnect())
    },
  }
}

function assistantText(client: ChatClient): string {
  const last = client.getMessages().at(-1)
  if (last?.role !== 'assistant') return ''
  return last.parts.map((p) => (p.type === 'text' ? p.content : '')).join('')
}

describe('TanStack client, AI SDK route: resume', () => {
  it('reconnects a dropped stream and skips the replayed prefix', async () => {
    const transport = fakeTransport(() => chunkStream(REPLY))
    const client = new ChatClient({
      threadId: 'chat-1',
      connection: fromChatTransport(transport),
    })

    await client.sendMessage('hi')

    expect(transport.reconnects).toEqual(['chat-1'])
    expect(client.getMessages().map((m) => m.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(assistantText(client)).toBe('Hello.')
    expect(client.getError()).toBeUndefined()
  })

  it('rejoins the run after a page reload from the persisted resume pointer', async () => {
    const transport = fakeTransport(() => chunkStream(REPLY))
    const saved: ChatPersistedState = {
      messages: [
        {
          id: 'u-1',
          role: 'user',
          parts: [{ type: 'text', content: 'hi' }],
        },
        {
          id: 'a-1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'Hel' }],
        },
      ],
      resume: { resumeState: { threadId: 'chat-1', runId: 'run-1' } },
    }
    const client = new ChatClient({
      threadId: 'chat-1',
      persistence: {
        getItem: () => saved,
        setItem: () => {},
        removeItem: () => {},
      },
      connection: fromChatTransport(transport, { threadId: 'chat-1' }),
    })

    client.attach()

    await vi.waitFor(() => expect(assistantText(client)).toBe('Hello.'))
    await vi.waitFor(() => expect(client.getIsLoading()).toBe(false))
    expect(transport.reconnects).toEqual(['chat-1'])
    expect(client.getMessages().map((m) => m.role)).toEqual([
      'user',
      'assistant',
    ])
  })

  it('drops the resume pointer when the route has nothing to resume', async () => {
    const transport = fakeTransport(() => null)
    const writes: Array<ChatPersistedState> = []
    const client = new ChatClient({
      threadId: 'chat-1',
      persistence: {
        getItem: () => ({
          messages: [
            {
              id: 'u-1',
              role: 'user',
              parts: [{ type: 'text', content: 'hi' }],
            },
          ],
          resume: { resumeState: { threadId: 'chat-1', runId: 'run-1' } },
        }),
        setItem: (_id, state) => void writes.push(state),
        removeItem: () => {},
      },
      connection: fromChatTransport(transport, { threadId: 'chat-1' }),
    })

    client.attach()

    await vi.waitFor(() => {
      expect(writes).not.toHaveLength(0)
      expect(writes.at(-1)?.resume).toBeUndefined()
    })
    expect(transport.reconnects).toEqual(['chat-1'])
    expect(client.getError()).toBeUndefined()
  })
})

describe('AI SDK client, TanStack route: resume', () => {
  function server() {
    const fake = fakeText()
    fake.setResponses([{ text: 'Resumed answer.' }])
    // The app records the chat's active run. With `@tanstack/ai-persistence`
    // this is `stores.runs.findActiveRun(chatId)`.
    const activeRuns = new Map<string, string>()

    async function POST(request: Request): Promise<Response> {
      const body: { id: string; messages: Array<UIMessage> } =
        await request.json()
      const runId = crypto.randomUUID()
      activeRuns.set(body.id, runId)
      return toResumableUIMessageStreamResponse(
        chat({
          adapter: fake,
          threadId: body.id,
          runId,
          messages: fromAISDKMessages(body.messages),
        }),
        memoryStream({ runId }),
      )
    }

    // GET /api/chat/:id/stream
    function GET(chatId: string): Response {
      const runId = activeRuns.get(chatId)
      return resumeUIMessageStreamResponse(
        runId === undefined ? null : memoryStream({ runId }),
      )
    }

    return new DefaultChatTransport<UIMessage>({
      api: 'http://test/api/chat',
      fetch: async (input, init) => {
        const url = new URL(String(input))
        const match = /^\/api\/chat\/(.+)\/stream$/.exec(url.pathname)
        if (match) return GET(decodeURIComponent(match[1]!))
        return POST(new Request(url, init))
      },
    })
  }

  async function lastMessage(
    stream: ReadableStream<UIMessageChunk>,
  ): Promise<UIMessage | undefined> {
    let last: UIMessage | undefined
    for await (const message of readUIMessageStream({ stream })) last = message
    return last
  }

  it('replays the whole run on the resume GET after the POST is dropped', async () => {
    const transport = server()
    const posted = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [
        { id: 'u-1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      ],
      abortSignal: undefined,
    })
    // The page reloads: the POST response is dropped after its first chunk.
    const reader = posted.getReader()
    await reader.read()
    await reader.cancel()

    const resumed = await transport.reconnectToStream({ chatId: 'chat-1' })
    expect(resumed).not.toBeNull()
    const message = await lastMessage(resumed!)

    expect(message?.parts.filter((p) => p.type === 'text')).toMatchObject([
      { type: 'text', text: 'Resumed answer.' },
    ])
    expect(JSON.stringify(message)).not.toContain('run.accepted')
  })

  it('answers 204 (no stream) when the chat has no active run', async () => {
    const transport = server()
    expect(await transport.reconnectToStream({ chatId: 'other' })).toBeNull()
  })
})
