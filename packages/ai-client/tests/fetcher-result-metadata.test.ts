import { describe, expect, it, vi } from 'vitest'
import { ChatClient, rpcStream, stream } from '../src'
import { createTextChunks } from './test-utils'
import type { ModelMessage } from '@tanstack/ai/client'
import type { ChatFetcher, UIMessage } from '../src/types'

const assistantWithToolResult: UIMessage = {
  id: 'assistant-1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-call',
      id: 'call-1',
      name: 'searchDocs',
      arguments: '{}',
      state: 'input-complete',
      resultMetadata: { sources: [{ url: 'https://example.com' }] },
    },
    {
      type: 'tool-result',
      id: 'result-1',
      toolCallId: 'call-1',
      content: 'done',
      state: 'complete',
      metadata: {
        sources: [{ url: 'https://example.com' }],
        tanstack: { toolResultOutcome: 'denied' },
      },
    },
  ],
}

async function fetcherMessages() {
  const fetcher = vi.fn<ChatFetcher>(async function* () {
    yield* createTextChunks('ok', 'msg-2')
  })
  const client = new ChatClient({
    threadId: 'thread-1',
    fetcher,
    initialMessages: [assistantWithToolResult],
  })

  await client.sendMessage('next')

  return fetcher.mock.calls[0]?.[0].messages
}

describe('ChatClient fetcher: tool result metadata', () => {
  it('sends no app metadata of a tool result to the fetcher', async () => {
    const messages = await fetcherMessages()

    expect(messages?.[0]?.parts).toEqual([
      {
        type: 'tool-call',
        id: 'call-1',
        name: 'searchDocs',
        arguments: '{}',
        state: 'input-complete',
      },
      {
        type: 'tool-result',
        id: 'result-1',
        toolCallId: 'call-1',
        content: 'done',
        state: 'complete',
        metadata: { tanstack: { toolResultOutcome: 'denied' } },
      },
    ])
  })

  it('strips nested subagent tool result metadata before the fetcher', async () => {
    const assistantWithChildToolResult: UIMessage = {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'subagent',
          subagent: {
            id: 'child-1',
            name: 'researcher',
            status: 'finished',
            messages: [assistantWithToolResult],
          },
        },
      ],
    }
    const fetcher = vi.fn<ChatFetcher>(async function* () {
      yield* createTextChunks('ok', 'msg-2')
    })
    const client = new ChatClient({
      threadId: 'thread-1',
      fetcher,
      initialMessages: [assistantWithChildToolResult],
    })

    await client.sendMessage('next')

    const child = fetcher.mock.calls[0]?.[0].messages?.[0]?.parts[0]
    expect(child?.type).toBe('subagent')
    if (child?.type !== 'subagent') throw new Error('expected subagent part')
    expect(JSON.stringify(child.subagent.messages)).not.toContain('example.com')
    expect(JSON.stringify(child.subagent.messages)).toContain(
      '"toolResultOutcome":"denied"',
    )
    expect(JSON.stringify(client.getMessages())).toContain('example.com')
  })
})

const toolRow: ModelMessage = {
  role: 'tool',
  toolCallId: 'call-1',
  content: 'done',
  metadata: {
    sources: [{ url: 'https://example.com' }],
    tanstack: { toolResultOutcome: 'denied' },
  },
}

describe.each([
  ['stream', stream],
  ['rpcStream', rpcStream],
])('%s() adapter: tool result metadata', (_name, createAdapter) => {
  function recordingAdapter() {
    const sent: { messages?: unknown } = {}
    const adapter = createAdapter(async function* (messages) {
      sent.messages = messages
      yield* createTextChunks('ok', 'msg-2')
    })
    return { adapter, sent }
  }

  it('sends no app metadata of a tool result to the callback', async () => {
    const { adapter, sent } = recordingAdapter()
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: adapter,
      initialMessages: [assistantWithToolResult],
    })

    await client.sendMessage('next')

    expect(JSON.stringify(sent.messages)).not.toContain('example.com')
    expect(JSON.stringify(sent.messages)).toContain(
      '"toolResultOutcome":"denied"',
    )
  })

  it('sends only the reserved metadata of a model tool row to the callback', async () => {
    const { adapter, sent } = recordingAdapter()

    for await (const _chunk of adapter.connect(
      [toolRow],
      undefined,
      undefined,
      {
        threadId: 'thread-1',
        runId: 'run-1',
      },
    )) {
      // Consume the stream.
    }

    expect(sent.messages).toEqual([
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: 'done',
        metadata: { tanstack: { toolResultOutcome: 'denied' } },
      },
    ])
  })
})
