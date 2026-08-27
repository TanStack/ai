import { createDefaultTrustStrategy } from '../trust-strategies'
import type {
  Snippet,
  SnippetIndexEntry,
  SnippetSearchOptions,
  SnippetStorage,
} from '../types'
import type { TrustStrategy } from '../trust-strategies'

export interface MemorySnippetStorageOptions {
  initialSnippets?: Array<Snippet>

  trustStrategy?: TrustStrategy
}

export function createMemorySnippetStorage(
  optionsOrSnippets: MemorySnippetStorageOptions | Array<Snippet> = [],
): SnippetStorage {
  const options = Array.isArray(optionsOrSnippets)
    ? { initialSnippets: optionsOrSnippets }
    : optionsOrSnippets

  const { initialSnippets = [], trustStrategy = createDefaultTrustStrategy() } =
    options

  // Store snippets in a Map for O(1) lookup
  const snippets = new Map<string, Snippet>()

  // Initialize with any provided snippets
  for (const snippet of initialSnippets) {
    snippets.set(snippet.name, snippet)
  }

  function loadIndex(): Promise<Array<SnippetIndexEntry>> {
    return Promise.resolve(
      Array.from(snippets.values()).map((snippet) => ({
        id: snippet.id,
        name: snippet.name,
        description: snippet.description,
        usageHints: snippet.usageHints,
        trustLevel: snippet.trustLevel,
      })),
    )
  }

  function loadAll(): Promise<Array<Snippet>> {
    return Promise.resolve(Array.from(snippets.values()))
  }

  function get(name: string): Promise<Snippet | null> {
    return Promise.resolve(snippets.get(name) ?? null)
  }

  function save(
    snippet: Omit<Snippet, 'createdAt' | 'updatedAt'>,
  ): Promise<Snippet> {
    const now = new Date().toISOString()
    const existing = snippets.get(snippet.name)

    const fullSnippet: Snippet = {
      ...snippet,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    snippets.set(snippet.name, fullSnippet)
    return Promise.resolve(fullSnippet)
  }

  function deleteSnippet(name: string): Promise<boolean> {
    if (!snippets.has(name)) {
      return Promise.resolve(false)
    }
    snippets.delete(name)
    return Promise.resolve(true)
  }

  function search(
    query: string,
    searchOptions: SnippetSearchOptions = {},
  ): Promise<Array<SnippetIndexEntry>> {
    const { limit = 5 } = searchOptions

    // Simple text matching
    const queryLower = query.toLowerCase()
    const terms = queryLower.split(/\s+/)

    const scored = Array.from(snippets.values()).map((snippet) => {
      let score = 0
      const searchText = [
        snippet.name,
        snippet.description,
        ...snippet.usageHints,
      ]
        .join(' ')
        .toLowerCase()

      for (const term of terms) {
        if (searchText.includes(term)) {
          score += 1
        }
        // Boost exact name matches
        if (snippet.name.toLowerCase().includes(term)) {
          score += 2
        }
      }

      return { snippet, score }
    })

    return Promise.resolve(
      scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => ({
          id: s.snippet.id,
          name: s.snippet.name,
          description: s.snippet.description,
          usageHints: s.snippet.usageHints,
          trustLevel: s.snippet.trustLevel,
        })),
    )
  }

  function updateStats(name: string, success: boolean): Promise<void> {
    const snippet = snippets.get(name)
    if (!snippet) return Promise.resolve()

    const { executions, successRate } = snippet.stats
    const newExecutions = executions + 1
    const newSuccessRate =
      (successRate * executions + (success ? 1 : 0)) / newExecutions

    const newStats = { executions: newExecutions, successRate: newSuccessRate }

    // Use trust strategy to calculate new trust level
    const newTrustLevel = trustStrategy.calculateTrustLevel(
      snippet.trustLevel,
      newStats,
    )

    snippets.set(name, {
      ...snippet,
      stats: newStats,
      trustLevel: newTrustLevel,
      updatedAt: new Date().toISOString(),
    })
    return Promise.resolve()
  }

  return {
    loadIndex,
    loadAll,
    get,
    save,
    delete: deleteSnippet,
    search,
    updateStats,
    trustStrategy,
  }
}
