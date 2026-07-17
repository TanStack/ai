import { describe, expect, it } from 'vitest'
import { memoryPersistence } from '../src/memory'
import { defineAIPersistence } from '../src/types'

describe('memoryPersistence', () => {
  it('returns a namespaced AIPersistence with every state store present', () => {
    const p = memoryPersistence()
    expect(p.stores.messages).toBeDefined()
    expect(p.stores.runs).toBeDefined()
    expect(p.stores.interrupts).toBeDefined()
    expect(p.stores.artifacts).toBeDefined()
    expect(p.stores.blobs).toBeDefined()
    expect(p.stores.locks).toBeDefined()
  })

  it('exposes the complete state store set', () => {
    expect(Object.keys(memoryPersistence().stores).sort()).toEqual([
      'artifacts',
      'blobs',
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
        status: 'pending',
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
        status: 'pending',
        requestedAt: 1,
        payload: { kind: 'approval' },
      })
      await interrupts!.create({
        interruptId: 'i2',
        runId: 'r1',
        threadId: 't2',
        status: 'pending',
        requestedAt: 2,
        payload: { kind: 'input' },
      })
      await interrupts!.create({
        interruptId: 'i3',
        runId: 'r2',
        threadId: 't1',
        status: 'pending',
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

  describe('artifacts', () => {
    it('saves, gets, and lists by run', async () => {
      const { artifacts } = memoryPersistence().stores
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

    it('deletes individual artifacts', async () => {
      const { artifacts } = memoryPersistence().stores
      await artifacts!.save({
        artifactId: 'art1',
        runId: 'r1',
        threadId: 't1',
        name: 'out.txt',
        mimeType: 'text/plain',
        size: 3,
        createdAt: 1,
      })

      await artifacts!.delete!('art1')

      expect(await artifacts!.get('art1')).toBeNull()
      expect(await artifacts!.list('r1')).toEqual([])
    })

    it('deletes artifacts for a run without touching other runs', async () => {
      const { artifacts } = memoryPersistence().stores
      await artifacts!.save({
        artifactId: 'art1',
        runId: 'r1',
        threadId: 't1',
        name: 'one.txt',
        mimeType: 'text/plain',
        size: 3,
        createdAt: 1,
      })
      await artifacts!.save({
        artifactId: 'art2',
        runId: 'r1',
        threadId: 't1',
        name: 'two.txt',
        mimeType: 'text/plain',
        size: 3,
        createdAt: 2,
      })
      await artifacts!.save({
        artifactId: 'art3',
        runId: 'r2',
        threadId: 't1',
        name: 'three.txt',
        mimeType: 'text/plain',
        size: 5,
        createdAt: 3,
      })

      await artifacts!.deleteForRun!('r1')

      expect(await artifacts!.list('r1')).toEqual([])
      expect((await artifacts!.get('art3'))?.name).toBe('three.txt')
    })
  })

  describe('blobs', () => {
    it('puts, reads, heads, lists, and deletes blobs', async () => {
      const { blobs } = memoryPersistence().stores

      const written = await blobs!.put('runs/r1/out.txt', 'hello', {
        contentType: 'text/plain',
        customMetadata: { runId: 'r1' },
      })

      expect(written.key).toBe('runs/r1/out.txt')
      expect(written.size).toBe(5)
      expect(written.contentType).toBe('text/plain')
      expect(written.customMetadata).toEqual({ runId: 'r1' })

      const head = await blobs!.head('runs/r1/out.txt')
      expect(head).toMatchObject({
        key: 'runs/r1/out.txt',
        size: 5,
        contentType: 'text/plain',
      })

      const object = await blobs!.get('runs/r1/out.txt')
      expect(await object!.text()).toBe('hello')
      expect(new Uint8Array(await object!.arrayBuffer())).toEqual(
        new TextEncoder().encode('hello'),
      )

      await blobs!.put('runs/r2/out.txt', new Uint8Array([1, 2, 3]))
      expect(
        (await blobs!.list({ prefix: 'runs/r1/' })).objects.map(
          (record) => record.key,
        ),
      ).toEqual(['runs/r1/out.txt'])

      await blobs!.delete('runs/r1/out.txt')

      expect(await blobs!.get('runs/r1/out.txt')).toBeNull()
      expect(await blobs!.head('runs/r1/out.txt')).toBeNull()
    })

    it('uses the same string ordering for pagination cursors as sorting', async () => {
      const { blobs } = memoryPersistence().stores
      await blobs!.put('k-a', 'a')
      await blobs!.put('k-B', 'b')
      await blobs!.put('k-c', 'c')

      const first = await blobs!.list({ prefix: 'k-', limit: 1 })
      const second = await blobs!.list({
        prefix: 'k-',
        limit: 10,
        cursor: first.cursor,
      })

      expect([
        ...first.objects.map((record) => record.key),
        ...second.objects.map((record) => record.key),
      ]).toEqual(['k-B', 'k-a', 'k-c'])
    })

    it('treats limit zero as an empty untruncated page without a cursor', async () => {
      const { blobs } = memoryPersistence().stores
      await blobs!.put('runs/r1/out.txt', 'hello')

      await expect(blobs!.list({ limit: 0 })).resolves.toEqual({
        objects: [],
        truncated: false,
      })
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
