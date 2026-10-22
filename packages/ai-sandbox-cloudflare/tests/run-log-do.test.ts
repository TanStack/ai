import { describe, expect, it } from 'vitest'
import { DurableObjectRunEventLog } from '../src/run-log-do'
import { fakeDurableStorage } from './fixtures'
import type { StreamChunk } from '@tanstack/ai'

const fakeStorage = fakeDurableStorage

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
    expect(seen).toEqual([1, 2])
  })

  it('live-tails: a reader that joins mid-run sees backlog + new events', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1', threadId: 't1' })
    await log.append('r1', chunk(0))

    const seen: Array<number> = []
    const reading = (async () => {
      for await (const event of log.read('r1')) seen.push(event.seq)
    })()
    await log.append('r1', chunk(1))
    await log.append('r1', chunk(2))
    await log.finish('r1', 'completed')
    await reading
    expect(seen).toEqual([0, 1, 2])
  })

  it('finish is idempotent, immutable, and rejects later appends', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    await log.open({ runId: 'r1', threadId: 't1' })
    await log.finish('r1', 'failed', { message: 'boom' })
    await log.finish('r1', 'completed')
    const record = await log.get('r1')
    expect(record?.status).toBe('failed')
    expect(record?.error?.message).toBe('boom')
    await expect(log.append('r1', chunk(0))).rejects.toThrow(/terminal/)
  })

  it('open is idempotent', async () => {
    const log = new DurableObjectRunEventLog(fakeStorage())
    const a = await log.open({ runId: 'r1', threadId: 't1' })
    await log.append('r1', chunk(0))
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

  it('rejects a 0.x record and leaves it out of list()', async () => {
    const storage = fakeStorage()
    const log = new DurableObjectRunEventLog(storage)
    await log.open({ runId: 'live', threadId: 't1' })
    await storage.put('rec:old', {
      runId: 'old',
      status: 'done',
      lastSeq: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    await expect(log.get('old')).rejects.toThrow(/0\.x record layout/)
    await expect(log.touch('old')).rejects.toThrow(/0\.x record layout/)
    expect((await log.list()).map((r) => r.runId)).toEqual(['live'])
  })
})
