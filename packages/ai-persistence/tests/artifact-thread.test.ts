import { describe, expect, it } from 'vitest'
import { memoryPersistence } from '../src/memory'
import type { ArtifactRecord } from '../src'

const artifact = (
  overrides: Partial<ArtifactRecord> & Pick<ArtifactRecord, 'artifactId'>,
): ArtifactRecord => ({
  runId: 'run-1',
  threadId: 'thread-1',
  name: 'file.txt',
  mimeType: 'text/plain',
  size: 1,
  createdAt: 1,
  ...overrides,
})

describe('ArtifactStore.listForThread', () => {
  it('lists a thread artifacts by createdAt then artifactId', async () => {
    const artifacts = memoryPersistence().stores.artifacts
    if (!artifacts)
      throw new Error('memory persistence should provide artifacts')

    await artifacts.save(artifact({ artifactId: 'b', createdAt: 2 }))
    await artifacts.save(artifact({ artifactId: 'a', createdAt: 2 }))
    await artifacts.save(artifact({ artifactId: 'earlier', createdAt: 1 }))
    await artifacts.save(
      artifact({
        artifactId: 'other-thread',
        threadId: 'thread-2',
        createdAt: 0,
      }),
    )

    expect(
      (await artifacts.listForThread('thread-1')).map((x) => x.artifactId),
    ).toEqual(['earlier', 'a', 'b'])
  })

  it('orders mixed ASCII, accented, and astral IDs by UTF-8 bytes', async () => {
    const artifacts = memoryPersistence().stores.artifacts
    if (!artifacts)
      throw new Error('memory persistence should provide artifacts')

    await artifacts.save(artifact({ artifactId: '😀' }))
    await artifacts.save(artifact({ artifactId: 'é' }))
    await artifacts.save(artifact({ artifactId: 'a' }))

    expect(
      (await artifacts.listForThread('thread-1')).map((x) => x.artifactId),
    ).toEqual(['a', 'é', '😀'])
  })
})
