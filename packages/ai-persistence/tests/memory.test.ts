import { describe, expect, it } from 'vitest'
import { memoryPersistence } from '../src/memory'
import { defineAIPersistence } from '../src/types'

describe('memoryPersistence', () => {
  it('returns a namespaced AIPersistence with every state store present', () => {
    const p = memoryPersistence()
    expect(p.stores.messages).toBeDefined()
    expect(p.stores.runs).toBeDefined()
    expect(p.stores.interrupts).toBeDefined()
    expect(p.stores.locks).toBeDefined()
  })

  it('exposes the complete state store set', () => {
    expect(Object.keys(memoryPersistence().stores).sort()).toEqual([
      'interrupts',
      'locks',
      'messages',
      'metadata',
      'runs',
    ])
  })

  it('defineAIPersistence is an identity helper', () => {
    const persistence = memoryPersistence()
    expect(defineAIPersistence(persistence)).toBe(persistence)
  })

  describe('runs', () => {
    it('createOrResume is idempotent and update patches status', async () => {
      const { runs } = memoryPersistence().stores
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

  describe('messages', () => {
    it('round-trips a thread transcript', async () => {
      const { messages } = memoryPersistence().stores
      expect(await messages!.loadThread('t1')).toEqual([])
      await messages!.saveThread('t1', [{ role: 'user', content: 'hi' }])
      expect(await messages!.loadThread('t1')).toEqual([
        { role: 'user', content: 'hi' },
      ])
    })
  })

  describe('interrupts', () => {
    it('creates, resolves, and lists pending interrupts by thread', async () => {
      const { interrupts } = memoryPersistence().stores
      await interrupts!.create({
        interruptId: 'i1',
        runId: 'r1',
        threadId: 't1',
        requestedAt: 1,
        payload: { kind: 'approval' },
      })
      expect((await interrupts!.get('i1'))?.status).toBe('pending')
      expect(await interrupts!.listPending('t1')).toHaveLength(1)
      await interrupts!.resolve('i1', { action: 'approve' })
      expect((await interrupts!.get('i1'))?.status).toBe('resolved')
      expect(await interrupts!.listPending('t1')).toHaveLength(0)
    })

    it('lists interrupts and pending interrupts by run', async () => {
      const { interrupts } = memoryPersistence().stores
      await interrupts!.create({
        interruptId: 'i1',
        runId: 'r1',
        threadId: 't1',
        requestedAt: 1,
        payload: { kind: 'approval' },
      })
      await interrupts!.create({
        interruptId: 'i2',
        runId: 'r1',
        threadId: 't2',
        requestedAt: 2,
        payload: { kind: 'input' },
      })
      await interrupts!.create({
        interruptId: 'i3',
        runId: 'r2',
        threadId: 't1',
        requestedAt: 3,
        payload: { kind: 'other' },
      })

      await interrupts!.resolve('i2')

      expect(
        (await interrupts!.listByRun('r1')).map(
          (interrupt) => interrupt.interruptId,
        ),
      ).toEqual(['i1', 'i2'])
      expect(
        (await interrupts!.listPendingByRun('r1')).map(
          (interrupt) => interrupt.interruptId,
        ),
      ).toEqual(['i1'])
    })
  })

  describe('metadata', () => {
    it('returns null for missing metadata and preserves stored undefined', async () => {
      const { metadata } = memoryPersistence().stores
      expect(await metadata!.get('scope', 'missing')).toBeNull()

      await metadata!.set('scope', 'present', undefined)
      expect(await metadata!.get('scope', 'present')).toBeUndefined()

      await metadata!.delete('scope', 'present')
      expect(await metadata!.get('scope', 'present')).toBeNull()
    })
  })
})
