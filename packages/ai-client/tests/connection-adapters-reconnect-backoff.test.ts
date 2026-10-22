import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  StreamReconnectLimitError,
  createReconnectTracker,
  fetchServerSentEvents,
} from '../src/connection-adapters'
import type { ReconnectOptions } from '../src/connection-adapters'

/** A durable SSE body: one id-tagged event, then the server goes away. */
function firstResponse() {
  const frame = `id: 1\ndata: ${JSON.stringify({
    type: EventType.RUN_STARTED,
    threadId: 'thread-1',
    runId: 'run-1',
    timestamp: 0,
  })}\n\n`
  return new Response(frame, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

/** The server is back: the run finishes. */
function finishedResponse() {
  const frame = `id: 2\ndata: ${JSON.stringify({
    type: EventType.RUN_FINISHED,
    threadId: 'thread-1',
    runId: 'run-1',
    timestamp: 0,
  })}\n\n`
  return new Response(frame, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

/**
 * Runs one durable run and records each request. `afterDrop` answers each
 * reconnect, with its 1-based index.
 */
async function run(
  afterDrop: (reconnect: number) => Promise<Response>,
  reconnect?: ReconnectOptions,
) {
  const requests: Array<{ at: number; lastEventId: string | null }> = []
  const start = Date.now()
  const connection = fetchServerSentEvents('http://chat.test/run', {
    fetchClient: async (_input, init) => {
      const headers = new Headers(init?.headers)
      requests.push({
        at: Date.now() - start,
        lastEventId: headers.get('Last-Event-ID'),
      })
      return requests.length === 1
        ? firstResponse()
        : afterDrop(requests.length - 1)
    },
    ...(reconnect && { reconnect }),
  })
  const chunks: Array<string> = []
  let error: unknown
  const done = (async () => {
    try {
      for await (const chunk of connection.connect(
        [{ role: 'user', content: 'Hi.' }],
        undefined,
        undefined,
        { threadId: 'thread-1', runId: 'run-1' },
      )) {
        chunks.push(chunk.type)
      }
    } catch (caught) {
      error = caught
    }
  })()
  await vi.runAllTimersAsync()
  await done
  const gaps = requests
    .slice(1)
    .map((request, index) => request.at - (requests[index]?.at ?? 0))
  return { requests, gaps, chunks, error }
}

const serverDown = () => Promise.reject(new TypeError('fetch failed'))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  // Jitter takes a delay from half of the backoff up to the full backoff.
  // `1` gives the full backoff.
  vi.spyOn(Math, 'random').mockReturnValue(1)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('reconnect backoff', () => {
  it('doubles the delay from 250 ms and still gives up after 5 reconnects', async () => {
    const { requests, gaps, chunks, error } = await run(serverDown)

    expect(chunks).toEqual([EventType.RUN_STARTED])
    expect(error).toBeInstanceOf(StreamReconnectLimitError)
    expect(requests).toHaveLength(7)
    expect(requests.slice(1).every((r) => r.lastEventId === '1')).toBe(true)
    // The first reconnect follows a delivered event, so it waits 250 ms.
    // Then each failed reconnect doubles the wait.
    expect(gaps).toEqual([250, 250, 500, 1000, 2000, 4000])
  })

  it('caps the delay at maxDelayMs', async () => {
    const { gaps } = await run(serverDown, { maxDelayMs: 600 })
    expect(gaps).toEqual([250, 250, 500, 600, 600, 600])
  })

  it('adds jitter that never makes a delay longer', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { gaps } = await run(serverDown)
    expect(gaps).toEqual([125, 125, 250, 500, 1000, 2000])
  })

  it('keeps reconnecting for budgetMs when a budget is set', async () => {
    const { requests, error } = await run(serverDown, { budgetMs: 30_000 })

    expect(error).toBeInstanceOf(StreamReconnectLimitError)
    expect(String(error)).toContain('30000 ms')
    // Far more than 5 reconnects, all inside the budget.
    expect(requests.length).toBeGreaterThan(7)
    const firstFailure = requests[1]?.at ?? 0
    expect((requests.at(-1)?.at ?? 0) - firstFailure).toBeLessThanOrEqual(
      30_000,
    )
  })

  it('rides out a restart with a budget', async () => {
    // The server is down for 20 s, then it comes back.
    const { chunks, error } = await run(
      () =>
        Date.now() < 20_000
          ? serverDown()
          : Promise.resolve(finishedResponse()),
      { budgetMs: 60_000 },
    )
    expect(error).toBeUndefined()
    expect(chunks).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED])
  })

  it('stops at the budget with initialDelayMs 0, after many tries', async () => {
    const tracker = createReconnectTracker({
      initialDelayMs: 0,
      budgetMs: 1000,
    })
    // Past 1024 tries, where `0 * 2 ** 1024` would make the delay NaN.
    for (let attempt = 0; attempt < 1100; attempt++) {
      await tracker.waitBeforeReconnect(false)
    }
    vi.setSystemTime(1001)
    await expect(tracker.waitBeforeReconnect(false)).rejects.toBeInstanceOf(
      StreamReconnectLimitError,
    )
  })

  it('rejects invalid backoff options', async () => {
    for (const reconnect of [
      { initialDelayMs: -1 },
      { maxDelayMs: Number.NaN },
      { budgetMs: 0 },
      { budgetMs: Number.POSITIVE_INFINITY },
    ]) {
      const { error } = await run(serverDown, reconnect)
      expect(String(error)).toMatch(/Invalid reconnect\./)
    }
  })
})

describe('reconnect on a temporary HTTP status', () => {
  it.each([408, 429, 502, 503, 504])(
    'retries a reconnect answered %i',
    async (status) => {
      const { requests, chunks, error } = await run(async (reconnect) =>
        reconnect < 3
          ? new Response('upstream unavailable', { status })
          : finishedResponse(),
      )
      expect(error).toBeUndefined()
      expect(chunks).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED])
      expect(requests).toHaveLength(4)
    },
  )

  it('waits for Retry-After, capped at maxDelayMs', async () => {
    const { gaps } = await run(
      async (reconnect) => {
        if (reconnect === 1) {
          return new Response('', {
            status: 503,
            headers: { 'retry-after': '2' },
          })
        }
        if (reconnect === 2) {
          return new Response('', {
            status: 429,
            headers: { 'retry-after': '120' },
          })
        }
        return finishedResponse()
      },
      { maxDelayMs: 10_000 },
    )
    expect(gaps).toEqual([250, 2000, 10_000])
  })

  it('fails at once on a status that is not temporary', async () => {
    const { requests, error } = await run(
      async () => new Response('no', { status: 401 }),
    )
    expect(requests).toHaveLength(2)
    expect(error).not.toBeInstanceOf(StreamReconnectLimitError)
    expect(String(error)).toContain('HTTP error! status: 401')
  })

  it('still gives up after maxAttempts when every reconnect is a 503', async () => {
    const { requests, error } = await run(
      async () => new Response('', { status: 503 }),
    )
    expect(error).toBeInstanceOf(StreamReconnectLimitError)
    expect(requests).toHaveLength(7)
  })
})
