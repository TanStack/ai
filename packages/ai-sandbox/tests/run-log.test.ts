import { describe, expect, it } from 'vitest'
import { InMemoryRunEventLog, isTerminalRunStatus } from '../src/run-log'
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
    await log.open({ runId: 'r1' })
    expect(await log.append('r1', chunk('a'))).toBe(0)
    expect(await log.append('r1', chunk('b'))).toBe(1)
    expect(await log.append('r1', chunk('c'))).toBe(2)
    const rec = await log.get('r1')
    expect(rec?.lastSeq).toBe(2)
    expect(rec?.status).toBe('running')
  })

  it('replays the full backlog then returns once terminal', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1' })
    await log.append('r1', chunk('a'))
    await log.append('r1', chunk('b'))
    await log.finish('r1', 'done')

    const events = await collect(log.read('r1'))
    expect(events.map((e) => e.seq)).toEqual([0, 1])
    expect(events.map((e) => (e.chunk as { delta: string }).delta)).toEqual([
      'a',
      'b',
    ])
  })

  it('resumes from a cursor (fromSeq is exclusive)', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1' })
    for (const t of ['a', 'b', 'c', 'd']) await log.append('r1', chunk(t))
    await log.finish('r1', 'done')

    const events = await collect(log.read('r1', { fromSeq: 1 }))
    expect(events.map((e) => e.seq)).toEqual([2, 3])
  })

  it('live-tails: a blocked reader wakes on append and on finish', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1' })

    const seen: Array<number> = []
    const reader = (async () => {
      for await (const e of log.read('r1')) seen.push(e.seq)
    })()

    // Reader is blocked (no events yet). Append over a few microtask turns.
    await log.append('r1', chunk('a'))
    await new Promise((r) => setTimeout(r, 0))
    await log.append('r1', chunk('b'))
    await new Promise((r) => setTimeout(r, 0))
    await log.finish('r1', 'done')

    await reader
    expect(seen).toEqual([0, 1])
  })

  it('a reader that joins mid-run gets backlog + live tail, resumably', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1' })
    await log.append('r1', chunk('a')) // seq 0 — before the reader joins

    const seen: Array<number> = []
    const reader = (async () => {
      for await (const e of log.read('r1', { fromSeq: -1 })) seen.push(e.seq)
    })()

    await new Promise((r) => setTimeout(r, 0))
    await log.append('r1', chunk('b')) // seq 1 — live
    await log.finish('r1', 'done')
    await reader

    expect(seen).toEqual([0, 1])
  })

  it('stops tailing when the read signal aborts (client disconnect)', async () => {
    const log = new InMemoryRunEventLog()
    await log.open({ runId: 'r1' })
    await log.append('r1', chunk('a'))

    const ac = new AbortController()
    const seen: Array<number> = []
    const reader = (async () => {
      for await (const e of log.read('r1', { signal: ac.signal })) {
        seen.push(e.seq)
      }
    })()

    await new Promise((r) => setTimeout(r, 0))
    ac.abort() // run never finishes; reader must still return
    await reader
    expect(seen).toEqual([0])
  })

  it('open is idempotent and rejects appends after terminal', async () => {
    const log = new InMemoryRunEventLog()
    const a = await log.open({ runId: 'r1', threadId: 't1' })
    const b = await log.open({ runId: 'r1' })
    expect(b.createdAt).toBe(a.createdAt) // same record
    expect(b.threadId).toBe('t1')

    await log.finish('r1', 'error', { message: 'boom', code: 'E' })
    const rec = await log.get('r1')
    expect(rec?.status).toBe('error')
    expect(rec?.error).toEqual({ message: 'boom', code: 'E' })
    await expect(log.append('r1', chunk('x'))).rejects.toThrow(/terminal/)
  })

  it('get resolves null for an unknown run; read rejects', async () => {
    const log = new InMemoryRunEventLog()
    expect(await log.get('nope')).toBeNull()
    await expect(collect(log.read('nope'))).rejects.toThrow(/unknown runId/)
  })

  it('isTerminalRunStatus classifies terminal states', () => {
    expect(isTerminalRunStatus('done')).toBe(true)
    expect(isTerminalRunStatus('error')).toBe(true)
    expect(isTerminalRunStatus('aborted')).toBe(true)
    expect(isTerminalRunStatus('running')).toBe(false)
  })
})
