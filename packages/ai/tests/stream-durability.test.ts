import { describe, expect, it } from 'vitest'
import {
  decodeOffset,
  encodeOffset,
  memoryStream,
  runIdOf,
} from '../src/stream-durability'
import type { StreamChunk } from '../src/types'

function chunk(delta: string): StreamChunk {
  return {
    type: 'TEXT_MESSAGE_CONTENT',
    delta,
    timestamp: 0,
  } as StreamChunk
}

function terminal(): StreamChunk {
  return { type: 'RUN_FINISHED', timestamp: 0 } as StreamChunk
}

describe('encodeOffset / decodeOffset', () => {
  it('round-trips a runId and seq', () => {
    const offset = encodeOffset('run-abc', 7)
    expect(offset).toBe('run-abc@7')
    expect(decodeOffset(offset)).toEqual({ runId: 'run-abc', seq: 7 })
  })

  it('round-trips runIds that contain @', () => {
    const offset = encodeOffset('tenant@run-1', 3)
    expect(decodeOffset(offset)).toEqual({ runId: 'tenant@run-1', seq: 3 })
  })

  // Finding 2: the `now` / `-1` sentinels must not make decode / runId
  // extraction throw (`Number('now')` → NaN used to throw).
  it('decodes the `now` sentinel without throwing (tail → +Infinity)', () => {
    const offset = encodeOffset('run-x', 'now')
    expect(offset).toBe('run-x@now')
    expect(decodeOffset(offset)).toEqual({
      runId: 'run-x',
      seq: Number.POSITIVE_INFINITY,
    })
  })

  it('decodes the `-1` sentinel without throwing (from start)', () => {
    expect(decodeOffset('run-x@-1')).toEqual({ runId: 'run-x', seq: -1 })
  })

  it('extracts the runId from a sentinel offset without parsing the seq', () => {
    expect(runIdOf('run-x@now')).toBe('run-x')
    expect(runIdOf('run-x@-1')).toBe('run-x')
    expect(runIdOf('tenant@run-1@now')).toBe('tenant@run-1')
    expect(runIdOf('bare-run')).toBe('bare-run')
  })

  it('resolves a resume runId carried in Last-Event-ID with a `now` seq', () => {
    // A tail-join reconnect carries `runId@now`; runId() must not throw.
    const durability = memoryStream(
      new Request('https://example.test/api/chat', {
        method: 'POST',
        headers: { 'Last-Event-ID': encodeOffset('run-now', 'now') },
      }),
    )
    expect(durability.resumeFrom()).toBe('run-now@now')
    expect(durability.runId()).toBe('run-now')
  })

  it('still throws on a genuinely malformed offset', () => {
    expect(() => decodeOffset('no-at-sign')).toThrow(/missing @/)
    expect(() => decodeOffset('run@not-a-number')).toThrow(
      /Invalid durability offset seq/,
    )
  })
})

describe('memoryStream', () => {
  it('treats a request with no offset as a fresh run and replays from the start', async () => {
    const request = new Request('https://example.test/api/chat', {
      method: 'POST',
    })
    const durability = memoryStream(request)

    expect(durability.resumeFrom()).toBeNull()
    const runId = durability.runId()
    expect(runId).toBeTruthy()

    await durability.append([chunk('a'), chunk('b'), chunk('c')], 1)
    // Mark complete so the live-tailing read returns after draining.
    durability.markComplete!()

    const read: Array<{ seq: number; delta: string }> = []
    for await (const { seq, chunk: c } of durability.read('-1')) {
      read.push({ seq, delta: (c as { delta: string }).delta })
    }
    expect(read).toEqual([
      { seq: 1, delta: 'a' },
      { seq: 2, delta: 'b' },
      { seq: 3, delta: 'c' },
    ])
  })

  it('append returns the per-chunk backend offsets to tag with', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=run-off', {
        method: 'POST',
      }),
    )
    const offsets = await durability.append(
      [chunk('a'), chunk('b'), chunk('c')],
      1,
    )
    expect(offsets).toEqual([
      encodeOffset('run-off', 1),
      encodeOffset('run-off', 2),
      encodeOffset('run-off', 3),
    ])
  })

  it('resumes strictly after the offset carried in Last-Event-ID', async () => {
    // First, a producer writes three chunks under a known run.
    const producer = memoryStream(
      new Request('https://example.test/api/chat?runId=run-resume', {
        method: 'POST',
      }),
    )
    expect(producer.runId()).toBe('run-resume')
    const offsets = await producer.append(
      [chunk('a'), chunk('b'), chunk('c')],
      1,
    )
    expect(offsets).toEqual([
      encodeOffset('run-resume', 1),
      encodeOffset('run-resume', 2),
      encodeOffset('run-resume', 3),
    ])
    producer.markComplete!()

    // A reconnect arrives carrying Last-Event-ID at seq 2.
    const reconnect = memoryStream(
      new Request('https://example.test/api/chat', {
        method: 'POST',
        headers: { 'Last-Event-ID': encodeOffset('run-resume', 2) },
      }),
    )
    expect(reconnect.resumeFrom()).toBe(encodeOffset('run-resume', 2))
    expect(reconnect.runId()).toBe('run-resume')

    const read: Array<string> = []
    for await (const { chunk: c } of reconnect.read(reconnect.resumeFrom()!)) {
      read.push((c as { delta: string }).delta)
    }
    expect(read).toEqual(['c'])
  })

  it('reads the offset from the ?offset query param when no header is present', async () => {
    const producer = memoryStream(
      new Request('https://example.test/api/chat?runId=run-q', {
        method: 'POST',
      }),
    )
    await producer.append([chunk('x'), chunk('y')], 1)
    producer.markComplete!()

    const joiner = memoryStream(
      new Request(
        `https://example.test/api/chat?offset=${encodeURIComponent(
          encodeOffset('run-q', -1),
        )}`,
        { method: 'POST' },
      ),
    )
    expect(joiner.resumeFrom()).toBe(encodeOffset('run-q', -1))
    expect(joiner.runId()).toBe('run-q')

    const read: Array<string> = []
    for await (const { chunk: c } of joiner.read(joiner.resumeFrom()!)) {
      read.push((c as { delta: string }).delta)
    }
    expect(read).toEqual(['x', 'y'])
  })

  // Finding 3: a mid-stream join must live-tail — receive future appends up to
  // the terminal, not return at the snapshot tail before the run finishes.
  it('live-tails a join on a still-producing run through the terminal', async () => {
    const runId = 'run-live'
    const producer = memoryStream(
      new Request(`https://example.test/api/chat?runId=${runId}`, {
        method: 'POST',
      }),
    )
    await producer.append([chunk('a'), chunk('b')], 1)

    // A joiner attaches mid-stream and reads from the start.
    const joiner = memoryStream(
      new Request(
        `https://example.test/api/chat?offset=${encodeURIComponent(
          encodeOffset(runId, -1),
        )}`,
        { method: 'POST' },
      ),
    )

    const received: Array<string> = []
    const done = (async () => {
      for await (const { chunk: c } of joiner.read(joiner.resumeFrom()!)) {
        received.push((c as { delta?: string }).delta ?? `[${c.type}]`)
      }
    })()

    // Give the joiner a tick to drain the initial snapshot and park.
    await new Promise((r) => setTimeout(r, 10))
    expect(received).toEqual(['a', 'b'])

    // The producer emits more, then the terminal.
    await producer.append([chunk('c'), chunk('d')], 3)
    await producer.append([terminal()], 5)

    await done
    expect(received).toEqual(['a', 'b', 'c', 'd', '[RUN_FINISHED]'])
  })

  // Finding 2 (hang guard): a join to a runId with no in-process producer
  // (crash / cross-instance / bogus id) creates an empty log and parks — no
  // `markComplete` ever fires. Threading the consumer's AbortSignal must wake
  // the parked waiter so the iteration ends instead of hanging forever.
  it('does not hang: an aborted join to a never-produced runId terminates', async () => {
    const controller = new AbortController()
    const joiner = memoryStream(
      new Request('https://example.test/api/chat?runId=never-produced-run', {
        method: 'POST',
      }),
    )

    const received: Array<string> = []
    const iterated = (async () => {
      for await (const { chunk: c } of joiner.read('-1', controller.signal)) {
        received.push((c as { delta?: string }).delta ?? `[${c.type}]`)
      }
    })()

    // Nothing is ever produced under this runId, so the read parks. Give it a
    // tick to create its empty log and park on the (never-fired) next append.
    await new Promise((r) => setTimeout(r, 10))
    expect(received).toEqual([])

    // The abort must wake the parked waiter and end the iteration. Race against
    // a deadline so a regression (parking forever) fails loudly rather than
    // hanging the whole suite.
    controller.abort()
    const timedOut = Symbol('timed-out')
    const outcome = await Promise.race([
      iterated.then(() => 'done' as const),
      new Promise<typeof timedOut>((r) => setTimeout(() => r(timedOut), 1000)),
    ])
    expect(outcome).toBe('done')
    expect(received).toEqual([])
  })

  it('rejects a caller-supplied ?runId containing CR/LF (SSE injection)', () => {
    const durability = memoryStream(
      new Request(
        `https://example.test/api/chat?runId=${encodeURIComponent(
          'evil\ninjected',
        )}`,
        { method: 'POST' },
      ),
    )
    expect(() => durability.runId()).toThrow(/Invalid runId/)
  })
})
