import { describe, expect, it } from 'vitest'
import { memorySandboxSnapshots } from '@tanstack/ai-sandbox'
import {
  comparePrompt,
  errorMessageFromBody,
  forkStudioThreads,
  previewUrlFrom,
  threadIdsFromForkBody,
  variantPrompt,
} from './app-studio-helpers'

async function seedHead(
  snapshots: Awaited<ReturnType<typeof memorySandboxSnapshots>>,
  threadId: string,
  conversation: Array<{ role: 'user'; content: string }> = [],
) {
  const writer = await snapshots.checkpoints.acquireWriter(threadId)
  await snapshots.checkpoints.append({
    checkpoint: {
      id: `${threadId}-head`,
      threadId,
      parentCheckpointId: null,
      createdAt: 1,
      reason: 'automatic',
      files: [],
      conversation,
      artifacts: [],
    },
    expectedHeadId: null,
    writer,
  })
  await writer.release()
}

describe('app studio helpers', () => {
  it('reads a preview URL from an exposePreview result', () => {
    expect(previewUrlFrom({ url: 'http://127.0.0.1:5173' })).toBe(
      'http://127.0.0.1:5173',
    )
    expect(previewUrlFrom('{"url":"http://127.0.0.1:5173"}')).toBe(
      'http://127.0.0.1:5173',
    )
    expect(previewUrlFrom('http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173',
    )
    expect(previewUrlFrom('not-a-url')).toBeNull()
  })

  it('builds distinct compare prompts', () => {
    expect(variantPrompt('Make it warmer', 'A')).toContain('variant A')
    expect(variantPrompt('Make it warmer', 'B')).toContain('variant B')
    expect(comparePrompt('   ')).toBe(
      'Keep the same product. Change only the visual direction.',
    )
    expect(comparePrompt('Make it warmer')).toBe('Make it warmer')
  })

  it('reads fork thread ids and error text from JSON bodies', () => {
    expect(
      threadIdsFromForkBody({
        forks: [{ threadId: 'a' }, { threadId: 'b' }],
      }),
    ).toEqual(['a', 'b'])
    expect(threadIdsFromForkBody({ forks: [{}] })).toEqual([])
    expect(errorMessageFromBody({ error: 'no checkpoint' }, 'fallback')).toBe(
      'no checkpoint',
    )
    expect(errorMessageFromBody({}, 'fallback')).toBe('fallback')
  })
})

describe('forkStudioThreads', () => {
  it('throws when the thread has no checkpoint', async () => {
    const snapshots = await memorySandboxSnapshots()
    await expect(
      forkStudioThreads({
        snapshots,
        threadId: 'empty',
        runId: 'run-1',
        count: 1,
      }),
    ).rejects.toThrow('Build the app first')
  })

  it('forks one destination from the saved head', async () => {
    const snapshots = await memorySandboxSnapshots()
    await seedHead(snapshots, 'source')
    const result = await forkStudioThreads({
      snapshots,
      threadId: 'source',
      runId: 'run-1',
      count: 1,
    })
    expect(result.sourceCheckpointId).toBe('source-head')
    expect(result.forks).toHaveLength(1)
    const destination = result.forks[0]
    expect(destination?.threadId.startsWith('studio-')).toBe(true)
    expect(
      await snapshots.checkpoints.getHead(destination?.threadId ?? ''),
    ).toBe(destination?.checkpointId)
  })

  it('forks two destinations for a compare', async () => {
    const snapshots = await memorySandboxSnapshots()
    await seedHead(snapshots, 'source')
    const result = await forkStudioThreads({
      snapshots,
      threadId: 'source',
      runId: 'run-2',
      count: 2,
    })
    expect(result.forks).toHaveLength(2)
    expect(result.forks[0]?.threadId).not.toBe(result.forks[1]?.threadId)
  })

  it('copies the source conversation onto each fork', async () => {
    const snapshots = await memorySandboxSnapshots()
    await seedHead(snapshots, 'source', [{ role: 'user', content: 'build it' }])
    const result = await forkStudioThreads({
      snapshots,
      threadId: 'source',
      runId: 'run-3',
      count: 1,
    })
    const destination = result.forks[0]
    const checkpoint = await snapshots.checkpoints.get(
      destination?.checkpointId ?? '',
    )
    expect(checkpoint?.conversation).toEqual([
      { role: 'user', content: 'build it' },
    ])
  })

  it('does not hide a save error that is not a missing-sandbox miss', async () => {
    const snapshots = await memorySandboxSnapshots()
    await seedHead(snapshots, 'source')
    const failing = {
      ...snapshots,
      save: async () => {
        throw new Error('disk full')
      },
    }
    await expect(
      forkStudioThreads({
        snapshots: failing,
        threadId: 'source',
        runId: 'run-4',
        count: 1,
      }),
    ).rejects.toThrow('disk full')
  })
})
