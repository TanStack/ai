import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { createDefaultTrustStrategy } from '../trust-strategies'
import type {
  Skill,
  SkillIndexEntry,
  SkillSearchOptions,
  SkillStorage,
} from '../types'
import type { TrustStrategy } from '../trust-strategies'

export interface FileSkillStorageOptions {
  /**
   * Directory path for storing skills
   */
  directory: string

  /**
   * Trust strategy for determining skill trust levels
   * @default createDefaultTrustStrategy()
   */
  trustStrategy?: TrustStrategy
}

/**
 * File-system based skill storage
 *
 * Directory structure:
 *   .skills/
 *     _index.json          # Fast catalog loading
 *     fetch_github_stats/
 *       meta.json          # Metadata (description, schemas, hints, stats)
 *       code.ts            # The actual TypeScript code
 *     deploy_to_prod/
 *       meta.json
 *       code.ts
 */
export function createFileSkillStorage(
  directoryOrOptions: string | FileSkillStorageOptions,
): SkillStorage {
  const options =
    typeof directoryOrOptions === 'string'
      ? { directory: directoryOrOptions }
      : directoryOrOptions

  const { directory, trustStrategy = createDefaultTrustStrategy() } = options
  const indexPath = join(directory, '_index.json')

  console.log('[FileSkillStorage] Initialized with directory:', directory)

  async function ensureDirectory(): Promise<void> {
    if (!existsSync(directory)) {
      console.log('[FileSkillStorage] Creating directory:', directory)
      await mkdir(directory, { recursive: true })
    }
  }

  async function loadIndex(): Promise<Array<SkillIndexEntry>> {
    await ensureDirectory()

    if (!existsSync(indexPath)) {
      return []
    }

    const content = await readFile(indexPath, 'utf-8')
    return JSON.parse(content) as Array<SkillIndexEntry>
  }

  async function loadAll(): Promise<Array<Skill>> {
    const index = await loadIndex()
    const skills: Array<Skill> = []

    for (const entry of index) {
      const skill = await get(entry.name)
      if (skill) {
        skills.push(skill)
      }
    }

    return skills
  }

  async function saveIndex(index: Array<SkillIndexEntry>): Promise<void> {
    await writeFile(indexPath, JSON.stringify(index, null, 2))
  }

  async function get(name: string): Promise<Skill | null> {
    const skillDir = join(directory, name)
    const metaPath = join(skillDir, 'meta.json')
    const codePath = join(skillDir, 'code.ts')

    if (!existsSync(metaPath)) {
      return null
    }

    const [metaContent, code] = await Promise.all([
      readFile(metaPath, 'utf-8'),
      readFile(codePath, 'utf-8'),
    ])

    const meta = JSON.parse(metaContent) as Omit<Skill, 'code'>
    return { ...meta, code }
  }

  async function save(
    skill: Omit<Skill, 'createdAt' | 'updatedAt'>,
  ): Promise<Skill> {
    await ensureDirectory()

    const skillDir = join(directory, skill.name)
    const metaPath = join(skillDir, 'meta.json')
    const codePath = join(skillDir, 'code.ts')

    const now = new Date().toISOString()
    const existing = await get(skill.name)

    const fullSkill: Skill = {
      ...skill,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    // Separate code from metadata
    const { code, ...meta } = fullSkill

    // Write skill files
    await mkdir(skillDir, { recursive: true })
    await Promise.all([
      writeFile(metaPath, JSON.stringify(meta, null, 2)),
      writeFile(codePath, code),
    ])

    // Update index
    const index = await loadIndex()
    const indexEntry: SkillIndexEntry = {
      id: fullSkill.id,
      name: fullSkill.name,
      description: fullSkill.description,
      usageHints: fullSkill.usageHints,
      trustLevel: fullSkill.trustLevel,
    }

    const existingIdx = index.findIndex((s) => s.name === skill.name)
    if (existingIdx >= 0) {
      index[existingIdx] = indexEntry
    } else {
      index.push(indexEntry)
    }
    await saveIndex(index)

    return fullSkill
  }

  async function deleteSkill(name: string): Promise<boolean> {
    const skillDir = join(directory, name)

    if (!existsSync(skillDir)) {
      return false
    }

    await rm(skillDir, { recursive: true })

    // Update index
    const index = await loadIndex()
    const filtered = index.filter((s) => s.name !== name)
    await saveIndex(filtered)

    return true
  }

  async function search(
    query: string,
    options: SkillSearchOptions = {},
  ): Promise<Array<SkillIndexEntry>> {
    const { limit = 5 } = options
    const index = await loadIndex()

    // Simple text matching - can be replaced with embeddings
    const queryLower = query.toLowerCase()
    const terms = queryLower.split(/\s+/)

    const scored = index.map((skill) => {
      let score = 0
      const searchText = [skill.name, skill.description, ...skill.usageHints]
        .join(' ')
        .toLowerCase()

      for (const term of terms) {
        if (searchText.includes(term)) {
          score += 1
        }
        // Boost exact name matches
        if (skill.name.toLowerCase().includes(term)) {
          score += 2
        }
      }

      return { skill, score }
    })

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.skill)
  }

  async function updateStats(name: string, success: boolean): Promise<void> {
    const skill = await get(name)
    if (!skill) return

    const { executions, successRate } = skill.stats
    const newExecutions = executions + 1
    const newSuccessRate =
      (successRate * executions + (success ? 1 : 0)) / newExecutions

    const newStats = { executions: newExecutions, successRate: newSuccessRate }

    // Use trust strategy to calculate new trust level
    const newTrustLevel = trustStrategy.calculateTrustLevel(
      skill.trustLevel,
      newStats,
    )

    await save({
      ...skill,
      stats: newStats,
      trustLevel: newTrustLevel,
    })
  }

  return {
    loadIndex,
    loadAll,
    get,
    save,
    delete: deleteSkill,
    search,
    updateStats,
    trustStrategy,
  }
}
