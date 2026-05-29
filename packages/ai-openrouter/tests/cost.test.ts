import { describe, expect, it } from 'vitest'
import { extractUsageCost } from '../src/adapters/cost'

describe('extractUsageCost', () => {
  it('extracts a finite cost', () => {
    expect(extractUsageCost({ cost: 0.0123 })).toEqual({ cost: 0.0123 })
  })

  it('preserves cost === 0 (not treated as absent)', () => {
    expect(extractUsageCost({ cost: 0 })).toEqual({ cost: 0 })
  })

  it('returns empty object when cost is absent', () => {
    expect(extractUsageCost({ promptTokens: 5 })).toEqual({})
  })

  it('returns empty object for non-number / non-finite cost', () => {
    expect(extractUsageCost({ cost: '0.5' })).toEqual({})
    expect(extractUsageCost({ cost: NaN })).toEqual({})
    expect(extractUsageCost({ cost: Infinity })).toEqual({})
    expect(extractUsageCost({ cost: null })).toEqual({})
  })

  it('returns empty object for non-object input', () => {
    expect(extractUsageCost(undefined)).toEqual({})
    expect(extractUsageCost(null)).toEqual({})
    expect(extractUsageCost(42)).toEqual({})
  })

  it('reads costDetails (camelCase) alongside a valid cost', () => {
    expect(
      extractUsageCost({
        cost: 0.01,
        costDetails: { upstreamInferenceCost: 0.008 },
      }),
    ).toEqual({ cost: 0.01, costDetails: { upstreamInferenceCost: 0.008 } })
  })

  it('reads cost_details (snake_case) alongside a valid cost, camelCasing keys', () => {
    expect(
      extractUsageCost({
        cost: 0.01,
        cost_details: { upstream_inference_cost: 0.008 },
      }),
    ).toEqual({ cost: 0.01, costDetails: { upstreamInferenceCost: 0.008 } })
  })

  it('normalizes snake_case detail keys to camelCase (stable across paths)', () => {
    expect(
      extractUsageCost({
        cost: 0.0042,
        cost_details: {
          upstream_inference_completions_cost: 0.0026,
          upstream_inference_cost: 0.0038,
          upstream_inference_prompt_cost: 0.0012,
        },
      }),
    ).toEqual({
      cost: 0.0042,
      costDetails: {
        upstreamInferenceCompletionsCost: 0.0026,
        upstreamInferenceCost: 0.0038,
        upstreamInferencePromptCost: 0.0012,
      },
    })
  })

  it('prefers camelCase costDetails when both are present', () => {
    expect(
      extractUsageCost({
        cost: 0.01,
        costDetails: { a: 1 },
        cost_details: { b: 2 },
      }),
    ).toEqual({ cost: 0.01, costDetails: { a: 1 } })
  })

  it('preserves null detail entries', () => {
    expect(
      extractUsageCost({ cost: 0.01, costDetails: { cacheDiscount: null } }),
    ).toEqual({ cost: 0.01, costDetails: { cacheDiscount: null } })
  })

  it('preserves negative detail values (e.g. cache discount)', () => {
    expect(
      extractUsageCost({ cost: 0.01, costDetails: { cacheDiscount: -0.002 } }),
    ).toEqual({ cost: 0.01, costDetails: { cacheDiscount: -0.002 } })
  })

  it('drops non-finite / non-numeric detail entries but keeps valid ones', () => {
    expect(
      extractUsageCost({
        cost: 0.01,
        costDetails: {
          good: 0.5,
          bad: 'x',
          infinite: Infinity,
          nan: NaN,
          nested: { x: 1 },
        },
      }),
    ).toEqual({ cost: 0.01, costDetails: { good: 0.5 } })
  })

  it('omits costDetails entirely when no valid entries remain', () => {
    expect(
      extractUsageCost({ cost: 0.01, costDetails: { bad: 'x' } }),
    ).toEqual({ cost: 0.01 })
  })

  it('drops an orphan costDetails when cost is absent', () => {
    expect(
      extractUsageCost({ costDetails: { upstreamInferenceCost: 0.008 } }),
    ).toEqual({})
  })
})
