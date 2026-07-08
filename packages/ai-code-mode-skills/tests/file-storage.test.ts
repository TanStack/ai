import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileSkillStorage } from '../src/storage/file-storage'
import { createAlwaysTrustedStrategy } from '../src/trust-strategies'
import type { SkillStorage } from '../src/types'

function makeSkillInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'id-1',
    name: 'fetch_data',
    description: 'Fetches data',
    code: 'return input;',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    usageHints: ['Use for fetching'],
    dependsOn: [],
    trustLevel: 'untrusted' as const,
    stats: { executions: 0, successRate: 0 },
    ...overrides,
  } as Parameters<SkillStorage['save']>[0]
}

describe('createFileSkillStorage', () => {
  let dir: string
  let storage: SkillStorage

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skills-test-'))
    storage = createFileSkillStorage(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns empty index for a fresh directory', async () => {
    expect(await storage.loadIndex()).toEqual([])
  })

  it('creates the directory if it does not exist yet', async () => {
    const nested = join(dir, 'nested', 'deep')
    const deepStorage = createFileSkillStorage(nested)
    await expect(deepStorage.loadIndex()).resolves.toEqual([])
  })

  it('saves a skill and round-trips it via get', async () => {
    const saved = await storage.save(makeSkillInput({ name: 'alpha' }))
    expect(saved.createdAt).toBeTruthy()
    expect(saved.updatedAt).toBeTruthy()

    const fetched = await storage.get('alpha')
    expect(fetched).not.toBeNull()
    expect(fetched!.code).toBe('return input;')
  })

  it('persists skills across independent storage instances pointing at the same dir', async () => {
    await storage.save(makeSkillInput({ name: 'persistent' }))

    const second = createFileSkillStorage(dir)
    const reloaded = await second.get('persistent')
    expect(reloaded).not.toBeNull()
    expect(reloaded!.name).toBe('persistent')
  })

  it('separates code from metadata on disk', async () => {
    await storage.save(makeSkillInput({ name: 'x', code: 'return 42;' }))
    const { readFile } = await import('node:fs/promises')
    const meta = JSON.parse(
      await readFile(join(dir, 'x', 'meta.json'), 'utf-8'),
    )
    const code = await readFile(join(dir, 'x', 'code.ts'), 'utf-8')
    expect(meta).not.toHaveProperty('code')
    expect(code).toBe('return 42;')
  })

  it('preserves createdAt when updating an existing skill', async () => {
    // Deterministic clock: real timer sleeps are flaky because
    // Date.prototype.toISOString() has millisecond resolution and on fast
    // machines two saves can land in the same millisecond.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      const first = await storage.save(makeSkillInput({ name: 'x' }))
      vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
      const second = await storage.save(
        makeSkillInput({ name: 'x', description: 'updated' }),
      )
      expect(second.createdAt).toBe(first.createdAt)
      expect(second.updatedAt).not.toBe(first.updatedAt)
      expect(second.description).toBe('updated')
    } finally {
      vi.useRealTimers()
    }
  })

  it('deletes a skill including its directory and index entry', async () => {
    await storage.save(makeSkillInput({ name: 'doomed' }))
    expect(await storage.delete('doomed')).toBe(true)
    expect(await storage.get('doomed')).toBeNull()
    expect(await storage.loadIndex()).toEqual([])
  })

  it('returns false when deleting a missing skill', async () => {
    expect(await storage.delete('missing')).toBe(false)
  })

  it('searches via matching and respects limit', async () => {
    await storage.save(makeSkillInput({ id: '1', name: 'github_stats' }))
    await storage.save(makeSkillInput({ id: '2', name: 'npm_search' }))
    await storage.save(makeSkillInput({ id: '3', name: 'other_github_tool' }))

    const results = await storage.search('github', { limit: 2 })
    expect(results).toHaveLength(2)
    for (const r of results) {
      expect(r.name).toContain('github')
    }
  })

  it('updateStats increments and applies the trust strategy', async () => {
    const alwaysTrusted = createFileSkillStorage({
      directory: dir,
      trustStrategy: createAlwaysTrustedStrategy(),
    })
    await alwaysTrusted.save(
      makeSkillInput({ name: 'x', trustLevel: 'untrusted' }),
    )
    await alwaysTrusted.updateStats('x', true)
    const after = await alwaysTrusted.get('x')
    expect(after!.stats.executions).toBe(1)
    expect(after!.trustLevel).toBe('trusted')
  })

  it('updateStats is a no-op when skill does not exist', async () => {
    await expect(storage.updateStats('missing', true)).resolves.toBeUndefined()
  })

  it('exposes the configured trust strategy', () => {
    const strategy = createAlwaysTrustedStrategy()
    const s = createFileSkillStorage({
      directory: dir,
      trustStrategy: strategy,
    })
    expect(s.trustStrategy).toBe(strategy)
  })
})
