import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/ai-persistence', () => {
  throw new Error('memorySandboxSnapshots must not load the persistence root')
})

const { memorySandboxSnapshots } = await import('../src/memory-snapshots')

describe('memorySandboxSnapshots runtime dependencies', () => {
  it('does not load the ai-persistence root when creating a store', async () => {
    await expect(memorySandboxSnapshots()).resolves.toMatchObject({
      persistence: expect.any(Object),
      checkpoints: expect.any(Object),
    })
  })
})
