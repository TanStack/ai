/**
 * Behavioral tests for {@link DurableObjectRunEventLog} against a Map-backed
 * `DurableObjectStorage` stub (no Workers runtime). Re-runs the core run-log
 * contract — gap-free seq, replay-then-tail, fromSeq resume, terminal rejection,
 * unknown-runId handling — plus the durable-specific eviction/re-poll path.
 */
import { describe, expect, it } from 'vitest'
import { DurableObjectRunEventLog } from '../src/run-log-do'
import type { StreamChunk } from '@tanstack/ai'

/** A minimal in-memory `DurableObjectStorage`: a sorted-key Map. */
function fakeStorage(): DurableObjectStorage {
  const map = new Map<string, unknown>()
  const sortedEntries = (): Array<[string, unknown]> =>
    [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const storage = {
    get<T>(key: string): Promise<T | undefined> {
      return Promise.resolve(map.get(key) as T | undefined)
    },
    put(key: string, value: unknown): Promise<void> {
      map.set(key, value)
      return Promise.resolve()
    },
    delete(key: string): Promise<boolean> {
      return Promise.resolve(map.delete(key))
    },
    list<T>(options?: {
      prefix?: string
      start?: string
    }): Promise<Map<string, T>> {
      const out = new Map<string, T>()
      for (const [key, value] of sortedEntries()) {
        if (options?.prefix !== undefined && !key.startsWith(options.prefix)) {
          continue
        }
        if (options?.start !== undefined && key < options.start) continue
        out.set(key, value as T)
      }
      return Promise.resolve(out)
    },
    async transaction<T>(
      closure: (txn: {
        put: (k: string, v: unknown) => Promise<void>
      }) => Promise<T>,
    ): Promise<T> {
      return closure({
        put: (k, v) => {
          map.set(k, v)
          return Promise.resolve()
        },
      })
    },
  }
  return storage as unknown as DurableObjectStorage
}

const chunk = (n: number): StreamChunk =>
  ({ type: 'TEXT', text: `c${n}` }) as unknown as StreamChunk

describe('DurableObjectRunEventLog', () => {
  it('assigns gap-free seq starting at 0 and tracks lastSeq', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1' })
    expect(await log.append('r1', chunk(0))).toBe(0)
    expect(await log.append('r1', chunk(1))).toBe(1)
    expect(await log.append('r1', chunk(2))).toBe(2)
    const record = await log.get('r1')
    expect(record?.lastSeq).toBe(2)
    expect(record?.status).toBe('running')
  })

  it('replays the backlog after fromSeq then returns on terminal', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1' })
    await log.append('r1', chunk(0))
    await log.append('r1', chunk(1))
    await log.append('r1', chunk(2))
    await log.finish('r1', 'done')

    const seen: Array<number> = []
    for await (const event of log.read('r1', { fromSeq: 0 })) {
      seen.push(event.seq)
    }
    // fromSeq is EXCLUSIVE: seq 0 is skipped, 1 and 2 replayed.
    expect(seen).toEqual([1, 2])
  })

  it('replays from the start when fromSeq is omitted', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1' })
    await log.append('r1', chunk(0))
    await log.append('r1', chunk(1))
    await log.finish('r1', 'done')

    const seen: Array<number> = []
    for await (const event of log.read('r1')) seen.push(event.seq)
    expect(seen).toEqual([0, 1])
  })

  it('live-tails: a reader that joins mid-run sees backlog + new events', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1' })
    await log.append('r1', chunk(0))

    const seen: Array<number> = []
    const reading = (async () => {
      for await (const event of log.read('r1')) seen.push(event.seq)
    })()
    // Append more, then finish, after the reader is tailing.
    await log.append('r1', chunk(1))
    await log.append('r1', chunk(2))
    await log.finish('r1', 'done')
    await reading
    expect(seen).toEqual([0, 1, 2])
  })

  it('rejects append after terminal', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1' })
    await log.finish('r1', 'done')
    await expect(log.append('r1', chunk(0))).rejects.toThrow(/terminal/)
  })

  it('finish is idempotent and keeps the first terminal status', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1' })
    await log.finish('r1', 'error', { message: 'boom' })
    await log.finish('r1', 'done')
    const record = await log.get('r1')
    expect(record?.status).toBe('error')
    expect(record?.error?.message).toBe('boom')
  })

  it('open is idempotent', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    const a = await log.open({ runId: 'r1', threadId: 't1' })
    await log.append('r1', chunk(0))
    const b = await log.open({ runId: 'r1' })
    expect(b.lastSeq).toBe(a.lastSeq + 1)
    expect(b.threadId).toBe('t1')
  })

  it('get resolves null for an unknown run; append/read reject', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    expect(await log.get('nope')).toBeNull()
    await expect(log.append('nope', chunk(0))).rejects.toThrow(/unknown runId/)
    await expect(async () => {
      for await (const _ of log.read('nope')) void _
    }).rejects.toThrow(/unknown runId/)
  })

  it('a reader whose in-memory waiter was lost still progresses (eviction poll)', async () => {
    const storage = fakeStorage()
    // Two independent log instances over the SAME storage simulate eviction: the
    // writer's appends never wake the reader's waiter set, so the reader can only
    // make progress via the TAIL_POLL_MS fallback re-read.
    const reader = new DurableObjectRunEventLog(storage)
    const writer = new DurableObjectRunEventLog(storage)
    await writer.open({ runId: 'r1' })

    const seen: Array<number> = []
    const reading = (async () => {
      for await (const event of reader.read('r1')) seen.push(event.seq)
    })()
    await writer.append('r1', chunk(0))
    await writer.append('r1', chunk(1))
    await writer.finish('r1', 'done')
    await reading
    expect(seen).toEqual([0, 1])
  })
})
