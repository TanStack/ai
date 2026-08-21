import { describe, expect, it } from 'vitest'
import { createMemorySnippetStorage } from '../src/storage/memory-storage'
import {
  createAlwaysTrustedStrategy,
  createRelaxedTrustStrategy,
} from '../src/trust-strategies'
import type { Snippet } from '../src/types'

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: overrides.id ?? 'snippet-1',
    name: overrides.name ?? 'fetch_data',
    description: overrides.description ?? 'Fetches data from an API',
    code: overrides.code ?? 'return { ok: true };',
    inputSchema: overrides.inputSchema ?? { type: 'object', properties: {} },
    outputSchema: overrides.outputSchema ?? { type: 'object', properties: {} },
    usageHints: overrides.usageHints ?? ['Use when fetching'],
    dependsOn: overrides.dependsOn ?? [],
    trustLevel: overrides.trustLevel ?? 'untrusted',
    stats: overrides.stats ?? { executions: 0, successRate: 0 },
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  }
}

describe('createMemorySnippetStorage', () => {
  describe('initialization', () => {
    it('accepts an empty array', async () => {
      const storage = createMemorySnippetStorage([])
      expect(await storage.loadAll()).toEqual([])
    })

    it('accepts an array of initial snippets', async () => {
      const snippet = makeSnippet()
      const storage = createMemorySnippetStorage([snippet])
      expect(await storage.loadAll()).toHaveLength(1)
    })

    it('accepts an options object with initialSnippets', async () => {
      const snippet = makeSnippet()
      const storage = createMemorySnippetStorage({ initialSnippets: [snippet] })
      expect(await storage.loadAll()).toHaveLength(1)
    })

    it('exposes configured trust strategy', () => {
      const strategy = createAlwaysTrustedStrategy()
      const storage = createMemorySnippetStorage({ trustStrategy: strategy })
      expect(storage.trustStrategy).toBe(strategy)
    })
  })

  describe('loadIndex', () => {
    it('returns lightweight entries without code', async () => {
      const snippet = makeSnippet({ code: 'return secret_value;' })
      const storage = createMemorySnippetStorage([snippet])
      const index = await storage.loadIndex()
      expect(index).toHaveLength(1)
      expect(index[0]).not.toHaveProperty('code')
      expect(index[0]).toHaveProperty('name', snippet.name)
      expect(index[0]).toHaveProperty('trustLevel', snippet.trustLevel)
    })
  })

  describe('get', () => {
    it('returns null for a missing snippet', async () => {
      const storage = createMemorySnippetStorage([])
      expect(await storage.get('nonexistent')).toBeNull()
    })

    it('returns the snippet when it exists', async () => {
      const snippet = makeSnippet({ name: 'alpha' })
      const storage = createMemorySnippetStorage([snippet])
      expect(await storage.get('alpha')).toEqual(snippet)
    })
  })

  describe('save', () => {
    it('creates a new snippet with timestamps', async () => {
      const storage = createMemorySnippetStorage([])
      const saved = await storage.save({
        id: 'x',
        name: 'new_snippet',
        description: 'd',
        code: 'c',
        inputSchema: {},
        outputSchema: {},
        usageHints: [],
        dependsOn: [],
        trustLevel: 'untrusted',
        stats: { executions: 0, successRate: 0 },
      })
      expect(saved.createdAt).toBeTruthy()
      expect(saved.updatedAt).toBeTruthy()
    })

    it('preserves createdAt when updating an existing snippet', async () => {
      const existing = makeSnippet({
        name: 'x',
        createdAt: '2020-01-01T00:00:00.000Z',
      })
      const storage = createMemorySnippetStorage([existing])

      const updated = await storage.save({
        id: existing.id,
        name: existing.name,
        description: 'new description',
        code: existing.code,
        inputSchema: existing.inputSchema,
        outputSchema: existing.outputSchema,
        usageHints: existing.usageHints,
        dependsOn: existing.dependsOn,
        trustLevel: existing.trustLevel,
        stats: existing.stats,
      })

      expect(updated.createdAt).toBe('2020-01-01T00:00:00.000Z')
      expect(updated.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
      expect(updated.description).toBe('new description')
    })
  })

  describe('delete', () => {
    it('returns false when snippet does not exist', async () => {
      const storage = createMemorySnippetStorage([])
      expect(await storage.delete('nothing')).toBe(false)
    })

    it('returns true and removes the snippet when it exists', async () => {
      const storage = createMemorySnippetStorage([makeSnippet({ name: 'x' })])
      expect(await storage.delete('x')).toBe(true)
      expect(await storage.get('x')).toBeNull()
    })
  })

  describe('search', () => {
    it('returns empty array when no snippets match', async () => {
      const storage = createMemorySnippetStorage([makeSnippet()])
      const results = await storage.search('completely unrelated query')
      expect(results).toEqual([])
    })

    it('matches on name, description, and usageHints', async () => {
      const storage = createMemorySnippetStorage([
        makeSnippet({
          name: 'github_stats',
          description: 'Fetches GitHub repository statistics',
          usageHints: ['Use for repo analysis'],
        }),
        makeSnippet({
          id: 'snippet-2',
          name: 'npm_search',
          description: 'Search the npm registry',
          usageHints: ['Use for packages'],
        }),
      ])

      const results = await storage.search('github')
      expect(results).toHaveLength(1)
      expect(results[0]!.name).toBe('github_stats')
    })

    it('boosts exact name matches over description-only matches', async () => {
      const storage = createMemorySnippetStorage([
        makeSnippet({
          id: 'a',
          name: 'widget',
          description: 'Just a description',
        }),
        makeSnippet({
          id: 'b',
          name: 'processor',
          description: 'Processes widget data',
        }),
      ])

      const results = await storage.search('widget')
      expect(results[0]!.name).toBe('widget')
    })

    it('respects the limit option', async () => {
      const storage = createMemorySnippetStorage([
        makeSnippet({ id: '1', name: 'data_one' }),
        makeSnippet({ id: '2', name: 'data_two' }),
        makeSnippet({ id: '3', name: 'data_three' }),
      ])
      const results = await storage.search('data', { limit: 2 })
      expect(results).toHaveLength(2)
    })
  })

  describe('updateStats', () => {
    it('is a no-op when the snippet does not exist', async () => {
      const storage = createMemorySnippetStorage([])
      await expect(
        storage.updateStats('nothing', true),
      ).resolves.toBeUndefined()
    })

    it('increments execution count and recalculates success rate', async () => {
      const storage = createMemorySnippetStorage([
        makeSnippet({ name: 'x', stats: { executions: 0, successRate: 0 } }),
      ])
      await storage.updateStats('x', true)
      const after = await storage.get('x')
      expect(after!.stats.executions).toBe(1)
      expect(after!.stats.successRate).toBe(1)
    })

    it('computes a running success rate across failures and successes', async () => {
      const storage = createMemorySnippetStorage([
        makeSnippet({ name: 'x', stats: { executions: 0, successRate: 0 } }),
      ])
      await storage.updateStats('x', true)
      await storage.updateStats('x', false)
      const after = await storage.get('x')
      expect(after!.stats.executions).toBe(2)
      expect(after!.stats.successRate).toBe(0.5)
    })

    it('promotes trust level when stats cross the strategy threshold', async () => {
      const storage = createMemorySnippetStorage({
        initialSnippets: [
          makeSnippet({
            name: 'x',
            trustLevel: 'untrusted',
            stats: { executions: 0, successRate: 0 },
          }),
        ],
        trustStrategy: createRelaxedTrustStrategy(),
      })
      await storage.updateStats('x', true)
      await storage.updateStats('x', true)
      await storage.updateStats('x', true)
      const after = await storage.get('x')
      expect(after!.trustLevel).toBe('provisional')
    })

    it('updates the updatedAt timestamp', async () => {
      const storage = createMemorySnippetStorage([
        makeSnippet({
          name: 'x',
          updatedAt: '2020-01-01T00:00:00.000Z',
        }),
      ])
      await storage.updateStats('x', true)
      const after = await storage.get('x')
      expect(after!.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
    })
  })
})
