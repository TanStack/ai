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
    await log.open({ runId: 'r1', threadId: 't1' })
    expect(await log.append('r1', chunk(0))).toBe(0)
    expect(await log.append('r1', chunk(1))).toBe(1)
    expect(await log.append('r1', chunk(2))).toBe(2)
    const record = await log.get('r1')
    expect(record?.lastSeq).toBe(2)
    expect(record?.status).toBe('running')
  })

  it('replays the backlog after fromSeq then returns on terminal', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1', threadId: 't1' })
    await log.append('r1', chunk(0))
    await log.append('r1', chunk(1))
    await log.append('r1', chunk(2))
    await log.finish('r1', 'completed')

    const seen: Array<number> = []
    for await (const event of log.read('r1', { fromSeq: 0 })) {
      seen.push(event.seq)
    }
    // fromSeq is EXCLUSIVE: seq 0 is skipped, 1 and 2 replayed.
    expect(seen).toEqual([1, 2])
  })

  it('replays from the start when fromSeq is omitted', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1', threadId: 't1' })
    await log.append('r1', chunk(0))
    await log.append('r1', chunk(1))
    await log.finish('r1', 'completed')

    const seen: Array<number> = []
    for await (const event of log.read('r1')) seen.push(event.seq)
    expect(seen).toEqual([0, 1])
  })

  it('live-tails: a reader that joins mid-run sees backlog + new events', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1', threadId: 't1' })
    await log.append('r1', chunk(0))

    const seen: Array<number> = []
    const reading = (async () => {
      for await (const event of log.read('r1')) seen.push(event.seq)
    })()
    // Append more, then finish, after the reader is tailing.
    await log.append('r1', chunk(1))
    await log.append('r1', chunk(2))
    await log.finish('r1', 'completed')
    await reading
    expect(seen).toEqual([0, 1, 2])
  })

  it('rejects append after terminal', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1', threadId: 't1' })
    await log.finish('r1', 'completed')
    await expect(log.append('r1', chunk(0))).rejects.toThrow(/terminal/)
  })

  it('finish is idempotent and keeps the first terminal status', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1', threadId: 't1' })
    await log.finish('r1', 'failed', { message: 'boom' })
    await log.finish('r1', 'completed')
    const record = await log.get('r1')
    expect(record?.status).toBe('failed')
    expect(record?.error?.message).toBe('boom')
  })

  it('open is idempotent', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    const a = await log.open({ runId: 'r1', threadId: 't1' })
    await log.append('r1', chunk(0))
    // The second call's threadId is ignored: the existing record wins.
    const b = await log.open({ runId: 'r1', threadId: 't2' })
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
    await writer.open({ runId: 'r1', threadId: 't1' })

    const seen: Array<number> = []
    const reading = (async () => {
      for await (const event of reader.read('r1')) seen.push(event.seq)
    })()
    await writer.append('r1', chunk(0))
    await writer.append('r1', chunk(1))
    await writer.finish('r1', 'completed')
    await reading
    expect(seen).toEqual([0, 1])
  })

  it('migrates a legacy terminal record on read and writes it back', async () => {
    const storage = fakeStorage()
    // A record persisted by the pre-convergence layout: legacy status
    // vocabulary, createdAt/updatedAt, no threadId.
    await storage.put('rec:legacy', {
      runId: 'legacy',
      status: 'done',
      lastSeq: 0,
      error: undefined,
      createdAt: 100,
      updatedAt: 200,
    })
    await storage.put(`evt:legacy:${'0'.padStart(8, '0')}`, chunk(0))

    const log = new DurableObjectRunEventLog(storage)
    const record = await log.get('legacy')
    expect(record?.status).toBe('completed')
    expect(record?.startedAt).toBe(100)
    expect(record?.finishedAt).toBe(200)
    expect(record?.updatedAt).toBe(200)
    // No thread was stored — the self-referential backfill, never a fake one.
    expect(record?.threadId).toBe('legacy')

    // Write-back: the stored value is now the converged layout, so the
    // conversion is paid exactly once.
    const stored = await storage.get<{ status: string; startedAt?: number }>(
      'rec:legacy',
    )
    expect(stored?.status).toBe('completed')
    expect(stored?.startedAt).toBe(100)

    // The migrated run replays like any other.
    const seen: Array<number> = []
    for await (const event of log.read('legacy')) seen.push(event.seq)
    expect(seen).toEqual([0])
  })

  it('a migrated legacy running record stays appendable with a continuous seq', async () => {
    const storage = fakeStorage()
    await storage.put('rec:legacy', {
      runId: 'legacy',
      threadId: 't1',
      status: 'error',
      lastSeq: 1,
      createdAt: 100,
      updatedAt: 200,
    })
    await storage.put('rec:live', {
      runId: 'live',
      threadId: 't2',
      status: 'running',
      lastSeq: 2,
      createdAt: 100,
      updatedAt: 200,
    })

    const log = new DurableObjectRunEventLog(storage)
    // `error` maps to `failed` and stays terminal: appends still reject.
    await expect(log.append('legacy', chunk(9))).rejects.toThrow(/terminal/)
    expect((await log.get('legacy'))?.status).toBe('failed')

    // A running record migrates without gaining finishedAt and keeps its cursor.
    const live = await log.get('live')
    expect(live?.status).toBe('running')
    expect(live?.finishedAt).toBeUndefined()
    expect(await log.append('live', chunk(3))).toBe(3)

    // `list` (the watchdog's view) also observes only the converged layout.
    const statuses = (await log.list()).map((r) => r.status).sort()
    expect(statuses).toEqual(['failed', 'running'])
  })
})
