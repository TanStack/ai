import { describe, expect, it } from 'vitest'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '../src/memory'
import { defineAIPersistence } from '../src/types'

describe('memoryPersistence', () => {
  it('returns a namespaced AIPersistence with every state store present', () => {
    const p = memoryPersistence()
    expect(p.stores.messages).toBeDefined()
    expect(p.stores.activities).toBeDefined()
    expect(p.stores.runs).toBeDefined()
    expect(p.stores.interrupts).toBeDefined()
    expect(p.stores.metadata).toBeDefined()
    expect(p.stores.log).toBeDefined()
  })

  it('exposes the complete state store set (no locks)', () => {
    expect(Object.keys(memoryPersistence().stores).sort()).toEqual([
      'activities',
      'artifacts',
      'blobs',
      'generationRuns',
      'interrupts',
      'log',
      'messages',
      'metadata',
      'runs',
      'sessions',
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

    it('implements the optional listByThread and listReclaimable methods', async () => {
      const { runs } = memoryPersistence().stores
      // `memoryPersistence()` is annotated `ChatPersistence`, so `runs` is typed
      // as the bare `RunStore` interface and the optional methods come back as
      // possibly-undefined even though this backend implements them. Assert
      // their presence first: that is the feature detection every consumer of
      // the contract performs, and it turns a genuine omission into a stated
      // expectation instead of an opaque `TypeError` at the call site.
      const listByThread = runs.listByThread?.bind(runs)
      const listReclaimable = runs.listReclaimable?.bind(runs)
      if (!listByThread || !listReclaimable) {
        throw new Error(
          'MemoryRunStore must implement listByThread and listReclaimable; ' +
            'they are the only optional RunStore methods this backend promises.',
        )
      }

      await runs.createOrResume({ runId: 'a', threadId: 't1', startedAt: 2 })
      await runs.createOrResume({ runId: 'b', threadId: 't1', startedAt: 1 })
      expect((await listByThread('t1')).map((r) => r.runId)).toEqual(['b', 'a'])

      await runs.update('a', { detachedSince: 1_000 })
      const reclaimable = await listReclaimable({
        now: 10_000,
        ttlMs: 5_000,
      })
      expect(reclaimable.map((r) => r.runId)).toEqual(['a'])
    })
  })

  describe('messages', () => {
    const twoMessageTranscript = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
    ] as const

    async function saveTwoMessageThread() {
      const { messages } = memoryPersistence().stores
      await messages.saveThread('t-two', [...twoMessageTranscript])
      return messages
    }

    it('round-trips a thread transcript', async () => {
      const { messages } = memoryPersistence().stores
      expect(await messages!.loadThread('t1')).toEqual([])
      await messages!.saveThread('t1', [{ role: 'user', content: 'hi' }])
      expect(await messages!.loadThread('t1')).toEqual([
        { role: 'user', content: 'hi' },
      ])
    })

    it('returns the full saved array when loadThread is called with no options', async () => {
      const messages = await saveTwoMessageThread()
      const loaded = await messages.loadThread('t-two')
      expect(Array.isArray(loaded)).toBe(true)
      expect(loaded).toEqual(twoMessageTranscript)
    })

    it('does not throw when loadThread is given limit and before', async () => {
      const messages = await saveTwoMessageThread()
      expect(
        await messages.loadThread('t-two', {
          limit: 1,
          before: 'cursor-1',
        }),
      ).toEqual(twoMessageTranscript)
    })
  })

  describe('activities', () => {
    it('round-trips a thread and replaces the full list', async () => {
      const { activities } = memoryPersistence().stores
      expect(await activities!.loadActivities('unknown')).toEqual([])
      await activities!.saveActivities('t1', [
        {
          id: 'act-1',
          activityType: 'SEARCH',
          content: { q: 'x' },
          index: 1,
        },
      ])
      expect(await activities!.loadActivities('t1')).toEqual([
        {
          id: 'act-1',
          activityType: 'SEARCH',
          content: { q: 'x' },
          index: 1,
        },
      ])
      await activities!.saveActivities('t1', [
        {
          id: 'act-2',
          activityType: 'PLAN',
          content: { steps: [] },
          index: 0,
        },
      ])
      expect(await activities!.loadActivities('t1')).toEqual([
        {
          id: 'act-2',
          activityType: 'PLAN',
          content: { steps: [] },
          index: 0,
        },
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

    it('orders list results by requestedAt even when inserts are reverse order', async () => {
      const { interrupts } = memoryPersistence().stores
      await interrupts!.create({
        interruptId: 'late',
        runId: 'r1',
        threadId: 't1',
        requestedAt: 30,
        payload: {},
      })
      await interrupts!.create({
        interruptId: 'early',
        runId: 'r1',
        threadId: 't1',
        requestedAt: 10,
        payload: {},
      })
      expect((await interrupts!.list('t1')).map((i) => i.interruptId)).toEqual([
        'early',
        'late',
      ])
    })
  })

  describe('metadata', () => {
    it('keeps colon-containing namespace and key pairs distinct', async () => {
      const { metadata } = memoryPersistence().stores
      await metadata!.set('a:b', 'c', 'left')
      await metadata!.set('a', 'b:c', 'right')
      expect(await metadata!.get('a:b', 'c')).toBe('left')
      expect(await metadata!.get('a', 'b:c')).toBe('right')
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

describe('memoryLogState({ now })', () => {
  const logId = 'log-1'
  const harness = 'test/clock'

  /** A store on a log state whose clock the test moves. */
  function clockedStore() {
    const clock = { now: 1_000 }
    const store = memoryLogStore({
      state: memoryLogState({ now: () => clock.now }),
    })
    return { clock, store }
  }

  it('expires an ownership when its clock passes the ttl', async () => {
    const { clock, store } = clockedStore()
    await store.acquireOwnership({ logId, harness, ownerId: 'a', ttlMs: 500 })

    clock.now = 1_499
    expect(
      await store.acquireOwnership({
        logId,
        harness,
        ownerId: 'b',
        ttlMs: 500,
      }),
    ).toBeNull()
    clock.now = 1_500
    expect(
      await store.acquireOwnership({
        logId,
        harness,
        ownerId: 'b',
        ttlMs: 500,
      }),
    ).toEqual({ epoch: 2, expired: true })
  })

  it('lists a released log for its wake only when its clock reaches the wake time', async () => {
    const { clock, store } = clockedStore()
    const owned = await store.acquireOwnership({
      logId,
      harness,
      ownerId: 'a',
      ttlMs: 500,
    })
    if (owned === null) throw new Error('The first acquire must succeed.')
    await store.releaseOwnership({
      logId,
      ownerId: 'a',
      epoch: owned.epoch,
      wakeInMs: 60_000,
    })

    clock.now = 60_999
    expect(await store.listLogsWithoutOwner({ limit: 10 })).toEqual([])
    clock.now = 61_000
    expect(await store.listLogsWithoutOwner({ limit: 10 })).toEqual([
      { logId, harness, reason: 'wake' },
    ])
  })

  it('stamps an offer with its clock', async () => {
    const { store } = clockedStore()
    await store.offerInput({
      logId,
      harness,
      inputId: 'in-1',
      record: { type: 'app.input' },
    })

    expect(await store.listOfferedInputs({ logId })).toEqual([
      { inputId: 'in-1', record: { type: 'app.input' }, offeredAt: 1_000 },
    ])
  })
})
