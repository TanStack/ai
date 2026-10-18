import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { createHarnessHandler } from '../src/server'
import { createHarnessClient } from '../src/client'
import { mockAdapter, text } from './helpers'

/** The part of a /control request body that these tests read. */
const ControlBody = z.object({ input: z.object({ inputId: z.string() }) })

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A 200 response whose body sends `chunks` as separate reads. */
function streamed(chunks: ReadonlyArray<string>) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

/** A client on `fetch`, for the thread `t`. */
function clientOn(fetch: typeof globalThis.fetch, reconnectDelayMs?: number) {
  return createHarnessClient({
    url: 'http://x/api/harness',
    threadId: 't',
    fetch,
    ...(reconnectDelayMs === undefined ? {} : { reconnectDelayMs }),
  })
}

/** Every frame of a host-events body made of `chunks`. */
async function hostFrames(chunks: ReadonlyArray<string>) {
  const client = clientOn(async () => streamed(chunks))
  const frames: Array<unknown> = []
  for await (const frame of client.hostEvents()) frames.push(frame)
  return frames
}

/** One session event frame with the cursor `cursor`. */
const sessionFrame = (cursor: string) =>
  `data: ${JSON.stringify({
    type: 'harness.event',
    cursor,
    operationId: 'op',
    event: { type: 'CUSTOM', name: 'tick', value: cursor, timestamp: 1 },
  })}\n\n`

describe('SSE parsing', () => {
  it('ends lines with CR, LF, or CRLF, also a CRLF split across two reads', async () => {
    expect(
      await hostFrames([
        'data: {"n":1}\r\n\r',
        '\ndata: {"n":2}\r\rdata: {"n":3}\n\n',
      ]),
    ).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('joins the data lines of one event, with or without a space', async () => {
    expect(
      await hostFrames(['data: {"a":\n', 'data:1,\ndata:  "b": 2}\n\n']),
    ).toEqual([{ a: 1, b: 2 }])
  })

  it('skips comments and other fields', async () => {
    expect(
      await hostFrames([
        ': heartbeat\n\n',
        'event: status\nid: 7\n: note\ndata: {"n":1}\n\n',
      ]),
    ).toEqual([{ n: 1 }])
  })

  it('keeps an event split across reads until it ends', async () => {
    expect(await hostFrames(['da', 'ta: {"n"', ':1}', '\n', '\n'])).toEqual([
      { n: 1 },
    ])
  })
})

describe('events() reconnects', () => {
  it('adds one abort listener for all its connections, and removes it', async () => {
    let calls = 0
    // Each connection sends one event and closes, so the client reconnects.
    const client = clientOn(async () => {
      calls += 1
      return streamed([sessionFrame(String(calls))])
    }, 1)
    const controller = new AbortController()
    const added = vi.spyOn(controller.signal, 'addEventListener')
    const removed = vi.spyOn(controller.signal, 'removeEventListener')

    const seen: Array<string> = []
    // A cursor, so the client does not ask for the snapshot head first.
    for await (const entry of client.events({
      from: '0',
      signal: controller.signal,
    })) {
      seen.push(entry.cursor)
      if (seen.length === 20) break
    }

    expect(seen).toHaveLength(20)
    expect(added).toHaveBeenCalledTimes(1)
    expect(removed).toHaveBeenCalledTimes(1)
    expect(removed.mock.calls[0]?.[1]).toBe(added.mock.calls[0]?.[1])
  })

  it('waits longer after each failure, with jitter, and starts again after a read', async () => {
    vi.useFakeTimers()
    // The random part takes a quarter of each wait away.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const times: Array<number> = []
    const client = clientOn(async () => {
      times.push(Date.now())
      // The 8th connection reads one event. Every other one fails.
      if (times.length === 8) return streamed([sessionFrame('1')])
      throw new Error('network')
    })
    const controller = new AbortController()
    const iterator = client
      .events({ from: '0', signal: controller.signal })
      [Symbol.asyncIterator]()

    const first = iterator.next()
    // The 7 waits before the 8th connection.
    await vi.advanceTimersByTimeAsync(68_250)
    expect((await first).value?.cursor).toBe('1')
    const rest = iterator.next()
    await vi.advanceTimersByTimeAsync(2_250)
    controller.abort()
    expect(await rest).toEqual({ done: true, value: undefined })

    const waits = times.slice(1).map((time, index) => time - times[index]!)
    // 1 s doubled each try, capped at 30 s, times 0.75. After the read,
    // the wait is 0.75 s again.
    expect(waits).toEqual([
      750, 1500, 3000, 6000, 12_000, 22_500, 22_500, 750, 1500,
    ])
  })

  it('stops the wait before a reconnect when the signal aborts', async () => {
    vi.useFakeTimers()
    const client = clientOn(async () => {
      throw new Error('network')
    })
    const controller = new AbortController()
    const next = client
      .events({ signal: controller.signal })
      [Symbol.asyncIterator]()
      .next()
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()

    expect(await next).toEqual({ done: true, value: undefined })
  })
})

describe('control inputs', () => {
  /** A client on a real handler that keeps each /control request body. */
  function recorded() {
    const { adapter, calls } = mockAdapter([() => text('once')])
    const harness = defineHarness({ name: 'test/client-parse', adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const handler = createHarnessHandler({
      host,
      harness,
      openAccess: { principal: { id: 'u' } },
    })
    const bodies: Array<string> = []
    const client = createHarnessClient({
      url: 'http://local/api/harness',
      threadId: 'thread-ids',
      fetch: async (input, init) => {
        if (typeof init?.body === 'string') bodies.push(init.body)
        return handler(new Request(input, init))
      },
    })
    /** Send the body again, as a retry of the same request does. */
    const retry = async (body: string) => {
      const response = await handler(
        new Request('http://local/api/harness/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }),
      )
      return response.json()
    }
    return { host, client, bodies, calls, retry }
  }

  /** The `inputId` of the input in a /control request body. */
  const inputIdOf = (body: string | undefined) =>
    ControlBody.parse(JSON.parse(body ?? 'null')).input.inputId

  it('gives a send an inputId, so a retry of it is the same input', async () => {
    const { host, client, bodies, calls, retry } = recorded()

    const receipt = await client.send('hi')
    const again = await retry(bodies[0] ?? '')
    // Wait until the first turn ends. A second turn would start before.
    await vi.waitFor(async () => {
      expect(calls.length).toBeGreaterThan(0)
      expect((await client.snapshot()).status).toBe('idle')
    })
    await host.close()

    expect(inputIdOf(bodies[0])).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(receipt.inputId).toBe(inputIdOf(bodies[0]))
    expect(again).toEqual(receipt)
    expect(calls).toHaveLength(1)
  })

  it('keeps the inputId of the input to change in cancelInput', async () => {
    const { host, client, bodies } = recorded()

    await client.cancelInput('waiting-1').catch(() => undefined)
    await host.close()

    expect(inputIdOf(bodies[0])).toBe('waiting-1')
  })
})
