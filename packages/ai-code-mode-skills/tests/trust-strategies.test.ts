import { describe, expect, it } from 'vitest'
import {
  createAlwaysTrustedStrategy,
  createCustomTrustStrategy,
  createDefaultTrustStrategy,
  createRelaxedTrustStrategy,
} from '../src/trust-strategies'
import type { SkillStats, TrustLevel } from '../src/types'

describe('createDefaultTrustStrategy', () => {
  it('starts new skills as untrusted', () => {
    const strategy = createDefaultTrustStrategy()
    expect(strategy.getInitialTrustLevel()).toBe('untrusted')
  })

  it('promotes untrusted → provisional at 10 executions with 90% success', () => {
    const strategy = createDefaultTrustStrategy()
    const stats: SkillStats = { executions: 10, successRate: 0.9 }
    expect(strategy.calculateTrustLevel('untrusted', stats)).toBe('provisional')
  })

  it('does not promote with 9 executions (below threshold)', () => {
    const strategy = createDefaultTrustStrategy()
    const stats: SkillStats = { executions: 9, successRate: 1.0 }
    expect(strategy.calculateTrustLevel('untrusted', stats)).toBe('untrusted')
  })

  it('does not promote at 89% success rate', () => {
    const strategy = createDefaultTrustStrategy()
    const stats: SkillStats = { executions: 50, successRate: 0.89 }
    expect(strategy.calculateTrustLevel('untrusted', stats)).toBe('untrusted')
  })

  it('promotes provisional → trusted at 100 executions with 95% success', () => {
    const strategy = createDefaultTrustStrategy()
    const stats: SkillStats = { executions: 100, successRate: 0.95 }
    expect(strategy.calculateTrustLevel('provisional', stats)).toBe('trusted')
  })

  it('does not promote provisional → trusted at 99 executions', () => {
    const strategy = createDefaultTrustStrategy()
    const stats: SkillStats = { executions: 99, successRate: 1.0 }
    expect(strategy.calculateTrustLevel('provisional', stats)).toBe(
      'provisional',
    )
  })

  it('never downgrades a trusted skill', () => {
    const strategy = createDefaultTrustStrategy()
    const stats: SkillStats = { executions: 1000, successRate: 0.1 }
    expect(strategy.calculateTrustLevel('trusted', stats)).toBe('trusted')
  })

  it('never skips provisional (untrusted cannot jump to trusted)', () => {
    const strategy = createDefaultTrustStrategy()
    const stats: SkillStats = { executions: 500, successRate: 1.0 }
    expect(strategy.calculateTrustLevel('untrusted', stats)).toBe('provisional')
  })
})

describe('createAlwaysTrustedStrategy', () => {
  it('makes new skills trusted immediately', () => {
    const strategy = createAlwaysTrustedStrategy()
    expect(strategy.getInitialTrustLevel()).toBe('trusted')
  })

  it('keeps skills trusted regardless of stats', () => {
    const strategy = createAlwaysTrustedStrategy()
    const levels: Array<TrustLevel> = ['untrusted', 'provisional', 'trusted']
    for (const level of levels) {
      expect(
        strategy.calculateTrustLevel(level, { executions: 0, successRate: 0 }),
      ).toBe('trusted')
    }
  })
})

describe('createRelaxedTrustStrategy', () => {
  it('starts new skills as untrusted', () => {
    const strategy = createRelaxedTrustStrategy()
    expect(strategy.getInitialTrustLevel()).toBe('untrusted')
  })

  it('promotes untrusted → provisional at 3 executions with 80% success', () => {
    const strategy = createRelaxedTrustStrategy()
    const stats: SkillStats = { executions: 3, successRate: 0.8 }
    expect(strategy.calculateTrustLevel('untrusted', stats)).toBe('provisional')
  })

  it('promotes provisional → trusted at 10 executions with 90% success', () => {
    const strategy = createRelaxedTrustStrategy()
    const stats: SkillStats = { executions: 10, successRate: 0.9 }
    expect(strategy.calculateTrustLevel('provisional', stats)).toBe('trusted')
  })
})

describe('createCustomTrustStrategy', () => {
  it('respects custom initial level', () => {
    const strategy = createCustomTrustStrategy({ initialLevel: 'provisional' })
    expect(strategy.getInitialTrustLevel()).toBe('provisional')
  })

  it('defaults to untrusted initial level when none provided', () => {
    const strategy = createCustomTrustStrategy({})
    expect(strategy.getInitialTrustLevel()).toBe('untrusted')
  })

  it('respects custom provisional threshold', () => {
    const strategy = createCustomTrustStrategy({
      provisionalThreshold: { executions: 5, successRate: 0.5 },
    })
    const stats: SkillStats = { executions: 5, successRate: 0.5 }
    expect(strategy.calculateTrustLevel('untrusted', stats)).toBe('provisional')
  })

  it('respects custom trusted threshold', () => {
    const strategy = createCustomTrustStrategy({
      trustedThreshold: { executions: 20, successRate: 0.85 },
    })
    const stats: SkillStats = { executions: 20, successRate: 0.85 }
    expect(strategy.calculateTrustLevel('provisional', stats)).toBe('trusted')
  })

  it('does not promote below custom thresholds', () => {
    const strategy = createCustomTrustStrategy({
      provisionalThreshold: { executions: 5, successRate: 0.9 },
    })
    const stats: SkillStats = { executions: 5, successRate: 0.8 }
    expect(strategy.calculateTrustLevel('untrusted', stats)).toBe('untrusted')
  })
})
