import { createDefaultTrustStrategy } from '../trust-strategies'
import type {
  Skill,
  SkillIndexEntry,
  SkillSearchOptions,
  SkillStorage,
} from '../types'
import type { TrustStrategy } from '../trust-strategies'

export interface MemorySkillStorageOptions {
  /**
   * Initial skills to populate the storage with
   */
  initialSkills?: Array<Skill>

  /**
   * Trust strategy for determining skill trust levels
   * @default createDefaultTrustStrategy()
   */
  trustStrategy?: TrustStrategy
}

/**
 * In-memory skill storage for testing and demos
 */
export function createMemorySkillStorage(
  optionsOrSkills: MemorySkillStorageOptions | Array<Skill> = [],
): SkillStorage {
  const options = Array.isArray(optionsOrSkills)
    ? { initialSkills: optionsOrSkills }
    : optionsOrSkills

  const { initialSkills = [], trustStrategy = createDefaultTrustStrategy() } =
    options

  // Store skills in a Map for O(1) lookup
  const skills = new Map<string, Skill>()

  // Initialize with any provided skills
  for (const skill of initialSkills) {
    skills.set(skill.name, skill)
  }

  async function loadIndex(): Promise<Array<SkillIndexEntry>> {
    return Array.from(skills.values()).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      usageHints: skill.usageHints,
      trustLevel: skill.trustLevel,
    }))
  }

  async function loadAll(): Promise<Array<Skill>> {
    return Array.from(skills.values())
  }

  async function get(name: string): Promise<Skill | null> {
    return skills.get(name) ?? null
  }

  async function save(
    skill: Omit<Skill, 'createdAt' | 'updatedAt'>,
  ): Promise<Skill> {
    const now = new Date().toISOString()
    const existing = skills.get(skill.name)

    const fullSkill: Skill = {
      ...skill,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    skills.set(skill.name, fullSkill)
    return fullSkill
  }

  async function deleteSkill(name: string): Promise<boolean> {
    if (!skills.has(name)) {
      return false
    }
    skills.delete(name)
    return true
  }

  async function search(
    query: string,
    options: SkillSearchOptions = {},
  ): Promise<Array<SkillIndexEntry>> {
    const { limit = 5 } = options

    // Simple text matching
    const queryLower = query.toLowerCase()
    const terms = queryLower.split(/\s+/)

    const scored = Array.from(skills.values()).map((skill) => {
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
      .map((s) => ({
        id: s.skill.id,
        name: s.skill.name,
        description: s.skill.description,
        usageHints: s.skill.usageHints,
        trustLevel: s.skill.trustLevel,
      }))
  }

  async function updateStats(name: string, success: boolean): Promise<void> {
    const skill = skills.get(name)
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

    skills.set(name, {
      ...skill,
      stats: newStats,
      trustLevel: newTrustLevel,
      updatedAt: new Date().toISOString(),
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
