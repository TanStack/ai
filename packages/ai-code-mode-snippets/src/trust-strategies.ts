import type { SnippetStats, TrustLevel } from './types'

export interface TrustStrategy {
  getInitialTrustLevel: () => TrustLevel

  calculateTrustLevel: (
    currentLevel: TrustLevel,
    stats: SnippetStats,
  ) => TrustLevel
}

export function createDefaultTrustStrategy(): TrustStrategy {
  return {
    getInitialTrustLevel: () => 'untrusted',

    calculateTrustLevel: (currentLevel, stats) => {
      const { executions, successRate } = stats

      const earnedProvisional =
        currentLevel === 'untrusted' && executions >= 10 && successRate >= 0.9
      if (earnedProvisional) {
        return 'provisional'
      }

      const earnedTrusted =
        currentLevel === 'provisional' &&
        executions >= 100 &&
        successRate >= 0.95
      if (earnedTrusted) {
        return 'trusted'
      }

      return currentLevel
    },
  }
}

export function createAlwaysTrustedStrategy(): TrustStrategy {
  return {
    getInitialTrustLevel: () => 'trusted',
    calculateTrustLevel: () => 'trusted',
  }
}

export function createRelaxedTrustStrategy(): TrustStrategy {
  return {
    getInitialTrustLevel: () => 'untrusted',

    calculateTrustLevel: (currentLevel, stats) => {
      const { executions, successRate } = stats

      const earnedProvisional =
        currentLevel === 'untrusted' && executions >= 3 && successRate >= 0.8
      if (earnedProvisional) {
        return 'provisional'
      }

      const earnedTrusted =
        currentLevel === 'provisional' && executions >= 10 && successRate >= 0.9
      if (earnedTrusted) {
        return 'trusted'
      }

      return currentLevel
    },
  }
}

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

      const earnedProvisional =
        currentLevel === 'untrusted' &&
        executions >= provisionalThreshold.executions &&
        successRate >= provisionalThreshold.successRate
      if (earnedProvisional) {
        return 'provisional'
      }

      const earnedTrusted =
        currentLevel === 'provisional' &&
        executions >= trustedThreshold.executions &&
        successRate >= trustedThreshold.successRate
      if (earnedTrusted) {
        return 'trusted'
      }

      return currentLevel
    },
  }
}
