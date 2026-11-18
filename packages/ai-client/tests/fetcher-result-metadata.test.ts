import { describe, expect, it, vi } from 'vitest'
import { ChatClient, stream } from '../src'
import { createTextChunks } from './test-utils'
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
})

describe('stream() adapter: tool result metadata', () => {
  it('sends no app metadata of a tool result to the stream factory', async () => {
    let sent: unknown
    const factory: Parameters<typeof stream>[0] = async function* (messages) {
      sent = messages
      yield* createTextChunks('ok', 'msg-2')
    }
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: stream(factory),
      initialMessages: [assistantWithToolResult],
    })

    await client.sendMessage('next')

    expect(JSON.stringify(sent)).not.toContain('example.com')
    expect(JSON.stringify(sent)).toContain('"toolResultOutcome":"denied"')
  })
})
