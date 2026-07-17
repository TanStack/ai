import { describe, expect, it } from 'vitest'
import { createR2ArtifactStore } from '../src/index'
import { FakeR2Bucket } from './fake-r2'
import type { ArtifactRecord } from '@tanstack/ai-persistence'

function artifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    artifactId: 'art1',
    runId: 'old-run',
    threadId: 'thread1',
    name: 'output.txt',
    mimeType: 'text/plain',
    size: 5,
    createdAt: 10,
    ...overrides,
  }
}

const idKey = 'test-artifacts/by-id/art1/metadata.json'
const oldRunKey = 'test-artifacts/by-run/old-run/art1.json'
const newRunKey = 'test-artifacts/by-run/new-run/art1.json'

describe('R2 artifact compensation', () => {
  it('drops superseded inline byte fields at the adapter boundary', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket, {
      prefix: 'test-artifacts/',
    })
    const legacyRecord = {
      ...artifact(),
      bytes: new Uint8Array([1, 2, 3]),
    }

    await store.save(legacyRecord)

    expect(await bucket.text(idKey)).not.toContain('bytes')
    await expect(store.get('art1')).resolves.not.toHaveProperty('bytes')
  })

  it('removes a staged run index when the primary metadata write fails', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket, {
      prefix: 'test-artifacts/',
    })
    await store.save(artifact())
    bucket.failPuts.add(idKey)

    await expect(
      store.save(artifact({ runId: 'new-run', size: 9 })),
    ).rejects.toThrow(`put failed for ${idKey}`)

    expect(bucket.objects.has(newRunKey)).toBe(false)
    expect(bucket.objects.has(oldRunKey)).toBe(true)
    await expect(store.get('art1')).resolves.toMatchObject({
      runId: 'old-run',
      size: 5,
    })
    await expect(store.list('new-run')).resolves.toEqual([])
  })

  it('restores a same-run index when metadata replacement fails', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket, {
      prefix: 'test-artifacts/',
    })
    await store.save(artifact())
    const originalIndex = await bucket.text(oldRunKey)
    bucket.failPuts.add(idKey)

    await expect(store.save(artifact({ size: 9 }))).rejects.toThrow(
      `put failed for ${idKey}`,
    )

    expect(await bucket.text(oldRunKey)).toBe(originalIndex)
    await expect(store.get('art1')).resolves.toMatchObject({ size: 5 })
  })

  it('surfaces both the write failure and failed compensation', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket, {
      prefix: 'test-artifacts/',
    })
    await store.save(artifact())
    bucket.failPuts.add(idKey)
    bucket.failDeletes.add(newRunKey)

    const error = await store.save(artifact({ runId: 'new-run' })).then(
      () => undefined,
      (cause: unknown) => cause,
    )

    expect(error).toBeInstanceOf(AggregateError)
    expect(error).toMatchObject({
      errors: [
        expect.objectContaining({ message: `put failed for ${idKey}` }),
        expect.objectContaining({ message: `delete failed for ${newRunKey}` }),
      ],
    })
  })

  it('commits moved metadata but surfaces stale-index cleanup failure', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket, {
      prefix: 'test-artifacts/',
    })
    await store.save(artifact())
    bucket.failDeletes.add(oldRunKey)

    await expect(store.save(artifact({ runId: 'new-run' }))).rejects.toThrow(
      `delete failed for ${oldRunKey}`,
    )

    await expect(store.get('art1')).resolves.toMatchObject({
      runId: 'new-run',
    })
    await expect(store.list('old-run')).resolves.toEqual([])
    await expect(store.list('new-run')).resolves.toHaveLength(1)
  })

  it('surfaces index cleanup failure after deleting primary metadata', async () => {
    const bucket = new FakeR2Bucket()
    const store = createR2ArtifactStore(bucket, {
      prefix: 'test-artifacts/',
    })
    await store.save(artifact())
    bucket.failDeletes.add(oldRunKey)

    await expect(store.delete?.('art1')).rejects.toThrow(
      `delete failed for ${oldRunKey}`,
    )

    await expect(store.get('art1')).resolves.toBeNull()
    await expect(store.list('old-run')).resolves.toEqual([])

    bucket.failDeletes.delete(oldRunKey)
    await store.deleteForRun?.('old-run')
    expect(bucket.objects.has(oldRunKey)).toBe(false)
  })
})
