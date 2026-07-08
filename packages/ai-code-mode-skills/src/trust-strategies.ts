import type { SkillStats, TrustLevel } from './types'

/**
 * Strategy for determining skill trust levels
 */
export interface TrustStrategy {
  /**
   * Get the initial trust level for a newly created skill
   */
  getInitialTrustLevel: () => TrustLevel

  /**
   * Calculate the new trust level based on execution stats
   */
  calculateTrustLevel: (
    currentLevel: TrustLevel,
    stats: SkillStats,
  ) => TrustLevel
}

/**
 * Default trust strategy - skills must earn trust through successful executions
 *
 * - untrusted: New skill (0 executions)
 * - provisional: 10+ executions with ≥90% success rate
 * - trusted: 100+ executions with ≥95% success rate
 */
export function createDefaultTrustStrategy(): TrustStrategy {
  return {
    getInitialTrustLevel: () => 'untrusted',

    calculateTrustLevel: (currentLevel, stats) => {
      const { executions, successRate } = stats

      if (
        currentLevel === 'untrusted' &&
        executions >= 10 &&
        successRate >= 0.9
      ) {
        return 'provisional'
      }

      if (
        currentLevel === 'provisional' &&
        executions >= 100 &&
        successRate >= 0.95
      ) {
        return 'trusted'
      }

      return currentLevel
    },
  }
}

/**
 * Always trusted strategy - skills are immediately trusted upon creation
 *
 * Use this for development/testing or when you trust the LLM's code generation
 */
export function createAlwaysTrustedStrategy(): TrustStrategy {
  return {
    getInitialTrustLevel: () => 'trusted',
    calculateTrustLevel: () => 'trusted',
  }
}

/**
 * Relaxed trust strategy - faster trust promotion for development
 *
 * - untrusted: New skill (0 executions)
 * - provisional: 3+ executions with ≥80% success rate
 * - trusted: 10+ executions with ≥90% success rate
 */
export function createRelaxedTrustStrategy(): TrustStrategy {
  return {
    getInitialTrustLevel: () => 'untrusted',

    calculateTrustLevel: (currentLevel, stats) => {
      const { executions, successRate } = stats

      if (
        currentLevel === 'untrusted' &&
        executions >= 3 &&
        successRate >= 0.8
      ) {
        return 'provisional'
      }

      if (
        currentLevel === 'provisional' &&
        executions >= 10 &&
        successRate >= 0.9
      ) {
        return 'trusted'
      }

      return currentLevel
    },
  }
}

/**
 * Custom trust strategy with configurable thresholds
 */
export function createCustomTrustStrategy(config: {
  initialLevel?: TrustLevel
  provisionalThreshold?: { executions: number; successRate: number }
  trustedThreshold?: { executions: number; successRate: number }
}): TrustStrategy {
  const {
    initialLevel = 'untrusted',
    provisionalThreshold = { executions: 10, successRate: 0.9 },
    trustedThreshold = { executions: 100, successRate: 0.95 },
  } = config

  return {
    getInitialTrustLevel: () => initialLevel,

    calculateTrustLevel: (currentLevel, stats) => {
      const { executions, successRate } = stats

      if (
        currentLevel === 'untrusted' &&
        executions >= provisionalThreshold.executions &&
        successRate >= provisionalThreshold.successRate
      ) {
        return 'provisional'
      }

      if (
        currentLevel === 'provisional' &&
        executions >= trustedThreshold.executions &&
        successRate >= trustedThreshold.successRate
      ) {
        return 'trusted'
      }

      return currentLevel
    },
  }
}
