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

/** An event carrying an EMPTY `id:` (SSE reset), plus its data line. */
function emptyIdEvent(delta: string): string {
  const chunk = {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm',
    model: 'test',
    timestamp: 0,
    delta,
    content: delta,
  }
  return `id:\ndata: ${JSON.stringify(chunk)}\n\n`
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
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient,
      reconnect: { delayMs: 0 },
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

  // A durable (id-tagged) run that ends with no terminal event and makes no
  // forward progress on reconnect must surface an error, not silently return
  // leaving the consumer with neither a terminal nor a failure.
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

    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient,
      reconnect: { delayMs: 0 },
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
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })

  it('retries a reconnect whose fetch() itself rejects (connection-establishment failure)', async () => {
    // A fetch rejection (offline / DNS blip / connection refused) on a reconnect
    // must be treated as a recoverable transport drop, not a fatal error, once
    // an offset is held — matching the XHR path. Without wrapping the rejection
    // as StreamReadError it would be a raw TypeError and hard-fail.
    const fetchClient = vi.fn<typeof fetch>(async () => {
      if (fetchClient.mock.calls.length === 1) {
        // Clean end with progress, no terminal → reconnect.
        return sseResponse(contentEvent('run@1', '1'))
      }
      if (fetchClient.mock.calls.length === 2) {
        throw new TypeError('Failed to fetch')
      }
      return sseResponse(contentEvent('run@2', '2') + finishedEvent('run@3'))
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
    expect(fetchClient).toHaveBeenCalledTimes(3)
  })

  it('surfaces a first-attempt fetch() rejection (no offset held) as a hard failure', async () => {
    // With no offset yet, a fetch rejection is not recoverable — it must surface.
    const fetchClient = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient,
      reconnect: { delayMs: 0 },
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
    }).rejects.toThrow()
    expect(fetchClient).toHaveBeenCalledTimes(1)
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

  it('bounds reconnection with a consecutive-no-progress ceiling', async () => {
    // Every pass replays only the already-seen boundary event then drops — no
    // new events ever arrive, so the run is genuinely stuck. The ceiling counts
    // these consecutive no-progress reconnects and fails.
    const fetchClient = vi.fn<typeof fetch>(async () =>
      failingSseResponse(
        contentEvent('run@1', 'x'),
        new TypeError('socket disconnected'),
      ),
    )
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

    // fetch #1 delivers run@1 (progress) then drops → resets the counter; fetches
    // #2-#5 each replay only the de-duped run@1 then drop (no progress), so the
    // 4th such reconnect (after fetch #5) trips maxAttempts=3.
    expect(fetchClient).toHaveBeenCalledTimes(5)
  })

  it('does not count progress-making reconnects toward the ceiling', async () => {
    // A deliberately low ceiling, but every pass delivers a NEW event before
    // dropping, so the no-progress counter keeps resetting and the run completes
    // instead of failing — a healthy socket-per-event run must not be bounded.
    let pass = 0
    const fetchClient = vi.fn<typeof fetch>(async () => {
      pass += 1
      if (pass <= 4) {
        return failingSseResponse(
          contentEvent(`run@${pass}`, String(pass)),
          new TypeError('socket rolled'),
        )
      }
      return sseResponse(finishedEvent('run@final'))
    })
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient,
      reconnect: { maxAttempts: 2, delayMs: 0 },
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

    // 4 progress-then-drop reconnects, each resetting the ceiling of 2, then a
    // clean finish — never trips the limit.
    expect(
      chunks
        .filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
        .map((chunk) => chunk.delta),
    ).toEqual(['1', '2', '3', '4'])
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    expect(fetchClient).toHaveBeenCalledTimes(5)
  })

  it('rejects invalid reconnect bounds (non-finite maxAttempts / delayMs)', async () => {
    const fetchClient = vi.fn<typeof fetch>(async () =>
      sseResponse(finishedEvent('run@1')),
    )
    for (const reconnect of [
      { maxAttempts: Number.NaN },
      { maxAttempts: Number.POSITIVE_INFINITY },
      { maxAttempts: -1 },
      { delayMs: Number.POSITIVE_INFINITY },
      { delayMs: -5 },
    ]) {
      const adapter = fetchServerSentEvents('/api/chat', {
        fetchClient,
        reconnect,
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
      }).rejects.toThrow(/Invalid reconnect\./)
    }
  })

  it('delivers an empty-id event and does not track "" as a durable offset', async () => {
    // A tagged event, then an event with an empty `id:` (SSE reset), then the
    // terminal — all in one response. The empty-id chunk must be delivered (not
    // dropped) and '' must not be recorded as an offset.
    const fetchClient = vi.fn<typeof fetch>(async () =>
      sseResponse(
        contentEvent('run@1', '1') + emptyIdEvent('2') + finishedEvent('run@3'),
      ),
    )
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
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    // Terminal reached on the first response — no reconnect.
    expect(fetchClient).toHaveBeenCalledTimes(1)
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
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient,
      reconnect: { delayMs: 0 },
    })
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
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient,
      reconnect: { delayMs: 0 },
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
    }).rejects.toThrow(/503 Unavailable/)
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })
})
