import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  DurableStreamIncompleteError,
  fetchServerSentEvents,
} from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

function readerFromString(body: string) {
  let sent = false
  return {
    read: vi.fn(async () => {
      if (sent) return { done: true, value: undefined }
      sent = true
      return { done: false, value: new TextEncoder().encode(body) }
    }),
    releaseLock: vi.fn(),
  }
}

function sseResponse(body: string): Response {
  return {
    ok: true,
    body: { getReader: () => readerFromString(body) },
    headers: new Headers(),
  } as unknown as Response
}

function contentEvent(id: string, delta: string): string {
  const chunk = {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm',
    model: 'test',
    timestamp: 0,
    delta,
    content: delta,
  }
  return `id: ${id}\ndata: ${JSON.stringify(chunk)}\n\n`
}

function finishedEvent(id: string): string {
  const chunk = {
    type: EventType.RUN_FINISHED,
    threadId: 't',
    runId: 'r',
    model: 'test',
    timestamp: 0,
    finishReason: 'stop',
  }
  return `id: ${id}\ndata: ${JSON.stringify(chunk)}\n\n`
}

describe('resumable SSE connection adapter', () => {
  it('reconnects with Last-Event-ID and de-dupes already-seen chunks', async () => {
    const fetchClient = vi.fn(async (_url: any, init: any) => {
      if (fetchClient.mock.calls.length === 1) {
        // First response: 3 tagged chunks, then the connection closes with no
        // terminal event (a mid-stream drop).
        return sseResponse(
          contentEvent('run@1', '1') +
            contentEvent('run@2', '2') +
            contentEvent('run@3', '3'),
        )
      }
      // Second response (reconnect): server replays from the offset — it
      // re-sends seq 3 (must be de-duped), then the tail + terminal.
      expect((init.headers as Record<string, string>)['Last-Event-ID']).toBe(
        'run@3',
      )
      return sseResponse(
        contentEvent('run@3', '3') +
          contentEvent('run@4', '4') +
          finishedEvent('run@5'),
      )
    })

    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient: fetchClient as unknown as typeof fetch,
    })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.connect(
      [{ role: 'user', content: 'hi' }],
      undefined,
      undefined,
      { threadId: 't', runId: 'r' },
    )) {
      chunks.push(chunk)
    }

    const deltas = chunks
      .filter((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((c) => (c as { delta: string }).delta)
    expect(deltas).toEqual(['1', '2', '3', '4'])
    expect(chunks[chunks.length - 1]?.type).toBe(EventType.RUN_FINISHED)
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })

  it('joinRun opens the stream from the start with ?offset=-1', async () => {
    const fetchClient = vi.fn(async (_url: unknown, _init?: unknown) =>
      sseResponse(finishedEvent('run@1')),
    )
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient: fetchClient as unknown as typeof fetch,
    })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.joinRun('run-x')) {
      chunks.push(chunk)
    }

    const calledUrl = String(fetchClient.mock.calls[0]![0])
    expect(calledUrl).toContain('offset=-1')
    expect(calledUrl).toContain('runId=run-x')
    expect(chunks.map((c) => c.type)).toContain(EventType.RUN_FINISHED)
  })

  // Finding 6: a durable (id-tagged) run that ends with no terminal event and
  // makes no forward progress on reconnect must surface an error, not silently
  // return leaving the consumer with neither a terminal nor a failure.
  it('surfaces an error when a durable run ends without a terminal and cannot progress', async () => {
    const fetchClient = vi.fn(async () => {
      if (fetchClient.mock.calls.length === 1) {
        // First pass: two tagged content events, then a clean end with NO
        // terminal — the adapter reconnects from run@2.
        return sseResponse(contentEvent('run@1', '1') + contentEvent('run@2', '2'))
      }
      // Reconnect: server replays nothing new (no progress) and still no
      // terminal — the run cannot complete.
      return sseResponse('')
    })

    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient: fetchClient as unknown as typeof fetch,
    })

    const deltas: Array<string> = []
    await expect(async () => {
      for await (const chunk of adapter.connect(
        [{ role: 'user', content: 'hi' }],
        undefined,
        undefined,
        { threadId: 't', runId: 'r' },
      )) {
        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
          deltas.push((chunk as { delta: string }).delta)
        }
      }
    }).rejects.toBeInstanceOf(DurableStreamIncompleteError)

    // The consumer still received everything delivered before the failure.
    expect(deltas).toEqual(['1', '2'])
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })
})
