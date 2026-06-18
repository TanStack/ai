import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import type { StreamChunk } from '@tanstack/ai'

const chunk = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

describe('memoryPersistence', () => {
  it('defaults to agent mode with every store present', () => {
    const p = memoryPersistence()
    expect(p.mode).toBe('agent')
    expect(p.messages).toBeDefined()
    expect(p.runs).toBeDefined()
    expect(p.events).toBeDefined()
    expect(p.approvals).toBeDefined()
    expect(p.artifacts).toBeDefined()
    expect(p.locks).toBeDefined()
  })

  it('honors a requested mode', () => {
    expect(memoryPersistence({ mode: 'chat' }).mode).toBe('chat')
  })

  describe('runs', () => {
    it('createOrResume is idempotent and update patches status', async () => {
      const { runs } = memoryPersistence()
      const a = await runs!.createOrResume({
        runId: 'r1',
        threadId: 't1',
        startedAt: 100,
      })
      expect(a.status).toBe('running')
      // Resume returns the SAME record, not a fresh one.
      const b = await runs!.createOrResume({
        runId: 'r1',
        threadId: 't1',
        startedAt: 999,
      })
      expect(b.startedAt).toBe(100)

      await runs!.update('r1', { status: 'completed', finishedAt: 200 })
      const got = await runs!.get('r1')
      expect(got?.status).toBe('completed')
      expect(got?.finishedAt).toBe(200)
    })
  })

  describe('events', () => {
    it('appends, reports hasRun/latestSeq, and reads after a seq', async () => {
      const { events } = memoryPersistence()
      expect(await events!.hasRun('r1')).toBe(false)
      await events!.append('r1', 1, chunk('a'))
      await events!.append('r1', 2, chunk('b'))
      await events!.append('r1', 3, chunk('c'))
      expect(await events!.hasRun('r1')).toBe(true)
      expect(await events!.latestSeq('r1')).toBe(3)

      const seen: Array<number> = []
      for await (const e of events!.read('r1', { afterSeq: 1 })) {
        seen.push(e.seq)
      }
      expect(seen).toEqual([2, 3])
    })

    it('reads all events when no afterSeq is given', async () => {
      const { events } = memoryPersistence()
      await events!.append('r1', 1, chunk('a'))
      await events!.append('r1', 2, chunk('b'))
      const seen: Array<string> = []
      for await (const e of events!.read('r1')) {
        if (e.event.type === 'TEXT_MESSAGE_CONTENT') seen.push(e.event.delta)
      }
      expect(seen).toEqual(['a', 'b'])
    })
  })

  describe('messages', () => {
    it('round-trips a thread transcript', async () => {
      const { messages } = memoryPersistence()
      expect(await messages!.loadThread('t1')).toEqual([])
      await messages!.saveThread('t1', [{ role: 'user', content: 'hi' }])
      expect(await messages!.loadThread('t1')).toEqual([
        { role: 'user', content: 'hi' },
      ])
    })
  })

  describe('approvals', () => {
    it('creates, resolves, and reports thread decisions', async () => {
      const { approvals } = memoryPersistence()
      await approvals!.create({
        approvalId: 'a1',
        runId: 'r1',
        threadId: 't1',
        status: 'pending',
        requestedAt: 1,
        payload: {},
      })
      expect((await approvals!.get('a1'))?.status).toBe('pending')
      await approvals!.resolve('a1', true)
      expect((await approvals!.get('a1'))?.status).toBe('granted')
      const decisions = await approvals!.decisionsForThread('t1')
      expect(decisions.get('a1')).toBe(true)
    })
  })

  describe('artifacts', () => {
    it('saves, gets, and lists by run', async () => {
      const { artifacts } = memoryPersistence()
      await artifacts!.save({
        artifactId: 'art1',
        runId: 'r1',
        threadId: 't1',
        name: 'out.txt',
        mimeType: 'text/plain',
        size: 3,
        createdAt: 1,
      })
      expect((await artifacts!.get('art1'))?.name).toBe('out.txt')
      expect(await artifacts!.list('r1')).toHaveLength(1)
      expect(await artifacts!.list('other')).toHaveLength(0)
    })
  })
})
