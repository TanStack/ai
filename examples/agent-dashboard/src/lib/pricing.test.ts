import { describe, expect, it } from 'vitest'
import { costUsd } from './pricing'

describe('costUsd', () => {
  it('prices model-backed harnesses and keeps scripted harnesses free', () => {
    expect(costUsd('sentiment/react', 1_000_000, 1_000_000)).toBe(6)
    expect(costUsd('support/triage', 1_000_000, 1_000_000)).toBe(0)
  })
})
