import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  DurableStreamIncompleteError,
  StreamReconnectLimitError,
  fetchServerSentEvents,
} from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

function sseResponse(body: string): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function failingSseResponse(body: string, error: Error): Response {
  const bytes = new TextEncoder().encode(body)
  let sent = false
  return new Response(
    new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (!sent) {
            sent = true
            controller.enqueue(bytes)
            return
          }
          controller.error(error)
        },
      },
      { highWaterMark: 0 },
    ),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
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
    const fetchClient = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe('/api/chat?runId=r')
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
      expect(new Headers(init?.headers).get('Last-Event-ID')).toBe('run@3')
      return sseResponse(
        contentEvent('run@3', '3') +
          contentEvent('run@4', '4') +
          finishedEvent('run@5'),
      )
    })

    const adapter = fetchServerSentEvents('/api/chat', { fetchClient })

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
      .map((c) => c.delta)
    expect(deltas).toEqual(['1', '2', '3', '4'])
    expect(chunks[chunks.length - 1]?.type).toBe(EventType.RUN_FINISHED)
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })

  it('preserves query parameters while replacing a stale runId', async () => {
    const fetchClient = vi.fn<typeof fetch>(async () =>
      sseResponse(finishedEvent('run@1')),
    )
    const adapter = fetchServerSentEvents(
      '/api/chat?provider=openai&runId=stale#response',
      { fetchClient },
    )

    for await (const _chunk of adapter.connect(
      [{ role: 'user', content: 'hi' }],
      undefined,
      undefined,
      { threadId: 't', runId: 'current' },
    )) {
      // drain
    }

    expect(String(fetchClient.mock.calls[0]![0])).toBe(
      '/api/chat?provider=openai&runId=current#response',
    )
  })

  it('joinRun opens the stream from the start with ?offset=-1', async () => {
    const fetchClient = vi.fn<typeof fetch>(async () =>
      sseResponse(finishedEvent('run@1')),
    )
    const adapter = fetchServerSentEvents('/api/chat', { fetchClient })

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
    const fetchClient = vi.fn<typeof fetch>(async () => {
      if (fetchClient.mock.calls.length === 1) {
        // First pass: two tagged content events, then a clean end with NO
        // terminal — the adapter reconnects from run@2.
        return sseResponse(
          contentEvent('run@1', '1') + contentEvent('run@2', '2'),
        )
      }
      // Reconnect: server replays nothing new (no progress) and still no
      // terminal — the run cannot complete.
      return sseResponse('')
    })

    const adapter = fetchServerSentEvents('/api/chat', { fetchClient })

    const deltas: Array<string> = []
    await expect(async () => {
      for await (const chunk of adapter.connect(
        [{ role: 'user', content: 'hi' }],
        undefined,
        undefined,
        { threadId: 't', runId: 'r' },
      )) {
        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
          deltas.push(chunk.delta)
        }
      }
    }).rejects.toBeInstanceOf(DurableStreamIncompleteError)

    // The consumer still received everything delivered before the failure.
    expect(deltas).toEqual(['1', '2'])
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })

  it('reconnects after a body reader failure and resumes exactly once', async () => {
    const fetchClient = vi.fn<typeof fetch>(async (_url, init) => {
      if (fetchClient.mock.calls.length === 1) {
        return failingSseResponse(
          contentEvent('run@1', '1'),
          new TypeError('socket disconnected'),
        )
      }
      expect(new Headers(init?.headers).get('Last-Event-ID')).toBe('run@1')
      return sseResponse(
        contentEvent('run@1', '1') +
          contentEvent('run@2', '2') +
          finishedEvent('run@3'),
      )
    })
    const adapter = fetchServerSentEvents('/api/chat', { fetchClient })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.connect(
      [{ role: 'user', content: 'hi' }],
      undefined,
      undefined,
      { threadId: 't', runId: 'r' },
    )) {
      chunks.push(chunk)
    }

    expect(
      chunks
        .filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
        .map((chunk) => chunk.delta),
    ).toEqual(['1', '2'])
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })

  it('retries a transport drop that replayed only the de-duped overlap (no new progress that attempt)', async () => {
    // A caught-up run whose reconnect replays only the already-seen boundary
    // event and then the socket drops must retry from the offset, not fail
    // hard — the drop is transient and we still hold a valid resume point.
    const fetchClient = vi.fn<typeof fetch>(async () => {
      if (fetchClient.mock.calls.length === 1) {
        // First pass: one new event, then the socket drops.
        return failingSseResponse(
          contentEvent('run@1', '1'),
          new TypeError('socket disconnected'),
        )
      }
      if (fetchClient.mock.calls.length === 2) {
        // Reconnect: replays ONLY the de-duped overlap (run@1), then drops
        // again before any new event — this attempt makes no forward progress.
        return failingSseResponse(
          contentEvent('run@1', '1'),
          new TypeError('socket disconnected again'),
        )
      }
      // Final reconnect delivers the tail + terminal.
      return sseResponse(
        contentEvent('run@1', '1') +
          contentEvent('run@2', '2') +
          finishedEvent('run@3'),
      )
    })
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient,
      reconnect: { delayMs: 0 },
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

    expect(
      chunks
        .filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
        .map((chunk) => chunk.delta),
    ).toEqual(['1', '2'])
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    // The no-progress overlap-only drop was retried, not surfaced as an error.
    expect(fetchClient).toHaveBeenCalledTimes(3)
  })

  it('bounds reconnection with a total-attempts ceiling', async () => {
    // Every pass delivers one NEW tagged event then ends cleanly with no
    // terminal — an endless progress-then-drop flapper the ceiling must stop.
    let pass = 0
    const fetchClient = vi.fn<typeof fetch>(async () => {
      pass += 1
      return sseResponse(contentEvent(`run@${pass}`, 'x'))
    })
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient,
      reconnect: { maxAttempts: 3, delayMs: 0 },
    })

    await expect(async () => {
      for await (const _chunk of adapter.connect(
        [{ role: 'user', content: 'hi' }],
        undefined,
        undefined,
        { threadId: 't', runId: 'r' },
      )) {
        // drain
      }
    }).rejects.toBeInstanceOf(StreamReconnectLimitError)

    // Initial fetch + 3 permitted reconnects; the 4th trips the ceiling before
    // re-fetching.
    expect(fetchClient).toHaveBeenCalledTimes(4)
  })

  it('stops reconnecting promptly when aborted during the throttle delay', async () => {
    const controller = new AbortController()
    let pass = 0
    const fetchClient = vi.fn<typeof fetch>(async () => {
      pass += 1
      return sseResponse(contentEvent(`run@${pass}`, 'x'))
    })
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient,
      signal: controller.signal,
      reconnect: { delayMs: 10_000 },
    })

    const chunks: Array<StreamChunk> = []
    const done = (async () => {
      for await (const chunk of adapter.connect(
        [{ role: 'user', content: 'hi' }],
        undefined,
        undefined,
        { threadId: 't', runId: 'r' },
      )) {
        chunks.push(chunk)
      }
    })()

    // Let the first pass finish and enter the 10s throttle, then abort — the
    // delay must resolve immediately rather than stalling for 10s.
    await new Promise((resolve) => setTimeout(resolve, 20))
    controller.abort()
    await done

    expect(chunks).toHaveLength(1)
    expect(fetchClient).toHaveBeenCalledTimes(1)
  })

  it('does not reconnect a body reader after the caller aborts', async () => {
    const fetchClient = vi.fn<typeof fetch>(async () =>
      failingSseResponse(
        contentEvent('run@1', '1'),
        new TypeError('socket disconnected'),
      ),
    )
    const adapter = fetchServerSentEvents('/api/chat', { fetchClient })
    const controller = new AbortController()
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.connect(
      [{ role: 'user', content: 'hi' }],
      undefined,
      controller.signal,
      { threadId: 't', runId: 'r' },
    )) {
      chunks.push(chunk)
      controller.abort()
    }

    expect(chunks).toHaveLength(1)
    expect(fetchClient).toHaveBeenCalledOnce()
  })

  it('does not retry HTTP setup failures after earlier progress', async () => {
    const fetchClient = vi.fn<typeof fetch>(async () => {
      if (fetchClient.mock.calls.length === 1) {
        return sseResponse(contentEvent('run@1', '1'))
      }
      return new Response(null, { status: 503, statusText: 'Unavailable' })
    })
    const adapter = fetchServerSentEvents('/api/chat', { fetchClient })

    await expect(async () => {
      for await (const _chunk of adapter.connect(
        [{ role: 'user', content: 'hi' }],
        undefined,
        undefined,
        { threadId: 't', runId: 'r' },
      )) {
        // drain
      }
    }).rejects.toThrow(/503 Unavailable/)
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })
})
