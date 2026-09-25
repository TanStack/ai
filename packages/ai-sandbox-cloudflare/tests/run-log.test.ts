import { describe, expect, it } from 'vitest'
import { InMemoryRunEventLog } from '../src/run-log'
import type { StreamChunk } from '@tanstack/ai'

const chunk = (text: string): StreamChunk =>
  ({ type: 'TEXT_MESSAGE_CONTENT', delta: text }) as unknown as StreamChunk

async function collect<T>(it: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const v of it) out.push(v)
  return out
}

describe('InMemoryRunEventLog', () => {
  it('assigns gap-free monotonic seqs from 0', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1', threadId: 't1' })
    expect(await log.append('r1', chunk('a'))).toBe(0)
    expect(await log.append('r1', chunk('b'))).toBe(1)
    expect(await log.append('r1', chunk('c'))).toBe(2)
    const rec = await log.get('r1')
    expect(rec?.lastSeq).toBe(2)
    expect(rec?.status).toBe('running')
  })

  it('replays the full backlog then returns once terminal', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1', threadId: 't1' })
    await log.append('r1', chunk('a'))
    await log.append('r1', chunk('b'))
    await log.finish('r1', 'completed')

    const events = await collect(log.read('r1'))
    expect(events.map((e) => e.seq)).toEqual([0, 1])
    expect(events.map((e) => (e.chunk as { delta: string }).delta)).toEqual([
      'a',
      'b',
    ])
  })

  it('resumes from a cursor (fromSeq is exclusive)', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1', threadId: 't1' })
    for (const t of ['a', 'b', 'c', 'd']) await log.append('r1', chunk(t))
    await log.finish('r1', 'completed')

    const events = await collect(log.read('r1', { fromSeq: 1 }))
    expect(events.map((e) => e.seq)).toEqual([2, 3])
  })

  it('replays backlog, then blocks for append and finish', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1', threadId: 't1' })
    await log.append('r1', chunk('a'))
    const reader = log.read('r1')[Symbol.asyncIterator]()

    const backlog = await reader.next()
    expect(backlog.value?.seq).toBe(0)
    const next = reader.next()
    await log.append('r1', chunk('b'))
    const appended = await next
    expect(appended.value?.seq).toBe(1)
    const done = reader.next()
    await log.finish('r1', 'completed')
    expect((await done).done).toBe(true)
  })

  it('stops tailing when the read signal aborts (client disconnect)', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1', threadId: 't1' })
    await log.append('r1', chunk('a'))
    const ac = new AbortController()
    const reader = log.read('r1', { signal: ac.signal })[Symbol.asyncIterator]()

    expect((await reader.next()).value?.seq).toBe(0)
    const done = reader.next()
    ac.abort()
    expect((await done).done).toBe(true)
  })

  it('open is idempotent and rejects appends after terminal', async () => {
    const log = new InMemoryRunEventLog()
    const a = await log.open({ runId: 'r1', threadId: 't1' })
    // Idempotent open returns the EXISTING record unchanged — the second
    // call's threadId is ignored, matching core's createOrResume invariant.
    const b = await log.open({ runId: 'r1', threadId: 't2' })
    expect(b.startedAt).toBe(a.startedAt) // same record
    expect(b.threadId).toBe('t1')

    await log.finish('r1', 'failed', { message: 'boom', code: 'E' })
    const rec = await log.get('r1')
    expect(rec?.status).toBe('failed')
    expect(rec?.error).toEqual({ message: 'boom', code: 'E' })
    await expect(log.append('r1', chunk('x'))).rejects.toThrow(/terminal/)
  })

  it('get resolves null for an unknown run; read rejects', async () => {
    const log = new InMemoryRunEventLog()
    expect(await log.get('nope')).toBeNull()
    await expect(collect(log.read('nope'))).rejects.toThrow(/unknown runId/)
  })
})
