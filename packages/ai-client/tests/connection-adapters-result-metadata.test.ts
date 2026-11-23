import { describe, expect, it, vi } from 'vitest'
import { fetchServerSentEvents } from '../src/connection-adapters'
import type { RunAgentInput, UIMessage } from '@tanstack/ai/client'

function assistantWithToolResult(metadata: Record<string, unknown>) {
  const message: UIMessage = {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
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
        metadata,
      },
    ],
  }
  return message
}

async function sentToolRows(message: UIMessage) {
  const fetchClient = vi.fn<typeof fetch>(async () => new Response(''))
  const adapter = fetchServerSentEvents('/api/chat', { fetchClient })
  for await (const _chunk of adapter.connect([message], undefined, undefined, {
    threadId: 'thread-1',
    runId: 'run-1',
  })) {
    // Consume the empty stream.
  }
  const body: RunAgentInput = JSON.parse(
    String(fetchClient.mock.calls[0]?.[1]?.body),
  )
  return body.messages.filter((row) => row.role === 'tool')
}

describe('connection adapters: tool result metadata', () => {
  it('sends only the tanstack key of tool result metadata', async () => {
    const rows = await sentToolRows(
      assistantWithToolResult({
        sources: [{ url: 'https://example.com' }],
        tanstack: { toolResultOutcome: 'denied' },
      }),
    )

    expect(rows).toEqual([
      {
        role: 'tool',
        id: 'result-1',
        toolCallId: 'call-1',
        content: 'done',
        metadata: {
          tanstack: {
            toolResultOutcome: 'denied',
            toolResult: { id: 'result-1' },
          },
        },
      },
    ])
  })

  it('sends no app keys when the metadata has only app keys', async () => {
    const rows = await sentToolRows(
      assistantWithToolResult({ sources: [{ url: 'https://example.com' }] }),
    )

    expect(rows).toEqual([
      {
        role: 'tool',
        id: 'result-1',
        toolCallId: 'call-1',
        content: 'done',
        metadata: { tanstack: { toolResult: { id: 'result-1' } } },
      },
    ])
  })
})
