import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { fetchServerSentEvents } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

function sseResponse(body: string) {
  const encoder = new TextEncoder()
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: encoder.encode(body),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }),
    },
  }
}

async function collectSse(body: string): Promise<Array<StreamChunk>> {
  const fetchClient = vi.fn().mockResolvedValue(sseResponse(body))
  const adapter = fetchServerSentEvents('/api/chat', { fetchClient })
  const chunks: Array<StreamChunk> = []
  for await (const chunk of adapter.connect([
    { role: 'user', content: 'Hello' },
  ])) {
    chunks.push(chunk)
  }
  return chunks
}

describe('SSE [DONE] synthetic RUN_FINISHED', () => {
  it('copies metadata.tanstack.model from RUN_STARTED and sets finishReason stop', async () => {
    const started = JSON.stringify({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-1',
      timestamp: 1,
      metadata: { tanstack: { model: 'gpt-5.5' } },
    })
    const chunks = await collectSse(`data: ${started}\n\ndata: [DONE]\n\n`)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.type).toBe(EventType.RUN_STARTED)
    const done = chunks[1]
    if (done === undefined || done.type !== EventType.RUN_FINISHED) {
      throw new Error('expected RUN_FINISHED')
    }
    expect(done).not.toHaveProperty('model')
    expect(done).not.toHaveProperty('finishReason')
    expect(done.metadata?.tanstack).toEqual({
      model: 'gpt-5.5',
      finishReason: 'stop',
    })
  })
})
