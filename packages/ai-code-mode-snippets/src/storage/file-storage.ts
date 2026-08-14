import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { createDefaultTrustStrategy } from '../trust-strategies'
import type {
  Snippet,
  SnippetIndexEntry,
  SnippetSearchOptions,
  SnippetStorage,
} from '../types'
import type { TrustStrategy } from '../trust-strategies'

export interface FileSnippetStorageOptions {
  /**
   * Directory path for storing snippets
   */
  directory: string

  /**
   * Trust strategy for determining snippet trust levels
   * @default createDefaultTrustStrategy()
   */
  trustStrategy?: TrustStrategy
}

/**
 * File-system based snippet storage
 *
 * Directory structure:
 *   .snippets/
 *     _index.json          # Fast catalog loading
 *     fetch_github_stats/
 *       meta.json          # Metadata (description, schemas, hints, stats)
 *       code.ts            # The actual TypeScript code
 *     deploy_to_prod/
 *       meta.json
 *       code.ts
 */
export function createFileSnippetStorage(
  directoryOrOptions: string | FileSnippetStorageOptions,
): SnippetStorage {
  const options =
    typeof directoryOrOptions === 'string'
      ? { directory: directoryOrOptions }
      : directoryOrOptions

  const { directory, trustStrategy = createDefaultTrustStrategy() } = options
  const indexPath = join(directory, '_index.json')

  console.log('[FileSnippetStorage] Initialized with directory:', directory)

  async function ensureDirectory(): Promise<void> {
    if (!existsSync(directory)) {
      console.log('[FileSnippetStorage] Creating directory:', directory)
      await mkdir(directory, { recursive: true })
    }
  }

  async function loadIndex(): Promise<Array<SnippetIndexEntry>> {
    await ensureDirectory()

    if (!existsSync(indexPath)) {
      return []
    }

    const content = await readFile(indexPath, 'utf-8')
    return JSON.parse(content) as Array<SnippetIndexEntry>
  }

  async function loadAll(): Promise<Array<Snippet>> {
    const index = await loadIndex()
    const snippets: Array<Snippet> = []

    for (const entry of index) {
      const snippet = await get(entry.name)
      if (snippet) {
        snippets.push(snippet)
      }
    }

    return snippets
  }

  async function saveIndex(index: Array<SnippetIndexEntry>): Promise<void> {
    await writeFile(indexPath, JSON.stringify(index, null, 2))
  }

  async function get(name: string): Promise<Snippet | null> {
    const snippetDir = join(directory, name)
    const metaPath = join(snippetDir, 'meta.json')
    const codePath = join(snippetDir, 'code.ts')

    if (!existsSync(metaPath)) {
      return null
    }

    const [metaContent, code] = await Promise.all([
      readFile(metaPath, 'utf-8'),
      readFile(codePath, 'utf-8'),
    ])

    const meta = JSON.parse(metaContent) as Omit<Snippet, 'code'>
    return { ...meta, code }
  }

  async function save(
    snippet: Omit<Snippet, 'createdAt' | 'updatedAt'>,
  ): Promise<Snippet> {
    await ensureDirectory()

    const snippetDir = join(directory, snippet.name)
    const metaPath = join(snippetDir, 'meta.json')
    const codePath = join(snippetDir, 'code.ts')

    const now = new Date().toISOString()
    const existing = await get(snippet.name)

    const fullSnippet: Snippet = {
      ...snippet,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    // Separate code from metadata
    const { code, ...meta } = fullSnippet

    // Write snippet files
    await mkdir(snippetDir, { recursive: true })
    await Promise.all([
      writeFile(metaPath, JSON.stringify(meta, null, 2)),
      writeFile(codePath, code),
    ])

    // Update index
    const index = await loadIndex()
    const indexEntry: SnippetIndexEntry = {
      id: fullSnippet.id,
      name: fullSnippet.name,
      description: fullSnippet.description,
      usageHints: fullSnippet.usageHints,
      trustLevel: fullSnippet.trustLevel,
    }

    const existingIdx = index.findIndex((s) => s.name === snippet.name)
    if (existingIdx >= 0) {
      index[existingIdx] = indexEntry
    } else {
      index.push(indexEntry)
    }
    await saveIndex(index)

    return fullSnippet
  }

  async function deleteSnippet(name: string): Promise<boolean> {
    const snippetDir = join(directory, name)

    if (!existsSync(snippetDir)) {
      return false
    }

    await rm(snippetDir, { recursive: true })

    // Update index
    const index = await loadIndex()
    const filtered = index.filter((s) => s.name !== name)
    await saveIndex(filtered)

    return true
  }

  async function search(
    query: string,
    searchOptions: SnippetSearchOptions = {},
  ): Promise<Array<SnippetIndexEntry>> {
    const { limit = 5 } = searchOptions
    const index = await loadIndex()

    // Simple text matching - can be replaced with embeddings
    const queryLower = query.toLowerCase()
    const terms = queryLower.split(/\s+/)

    const scored = index.map((snippet) => {
      let score = 0
      const searchText = [snippet.name, snippet.description, ...snippet.usageHints]
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

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.snippet)
  }

  async function updateStats(name: string, success: boolean): Promise<void> {
    const snippet = await get(name)
    if (!snippet) return

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

    await save({
      ...snippet,
      stats: newStats,
      trustLevel: newTrustLevel,
    })
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
