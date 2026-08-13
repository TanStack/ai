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

  it('reads costDetails (camelCase) and normalizes to canonical keys', () => {
    expect(
      extractUsageCost({
        cost: 0.01,
        costDetails: { upstreamInferenceCost: 0.008 },
      }),
    ).toEqual({ cost: 0.01, costDetails: { upstreamCost: 0.008 } })
  })

  it('reads cost_details (snake_case) and normalizes to canonical keys', () => {
    expect(
      extractUsageCost({
        cost: 0.01,
        cost_details: { upstream_inference_cost: 0.008 },
      }),
    ).toEqual({ cost: 0.01, costDetails: { upstreamCost: 0.008 } })
  })

  it('collapses Chat Completions prompt/completions onto canonical input/output', () => {
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
        upstreamOutputCost: 0.0026,
        upstreamCost: 0.0038,
        upstreamInputCost: 0.0012,
      },
    })
  })

  it('collapses Responses input/output onto the same canonical input/output', () => {
    expect(
      extractUsageCost({
        cost: 0.0042,
        cost_details: {
          upstream_inference_cost: 0.0038,
          upstream_inference_input_cost: 0.0012,
          upstream_inference_output_cost: 0.0026,
        },
      }),
    ).toEqual({
      cost: 0.0042,
      costDetails: {
        upstreamCost: 0.0038,
        upstreamInputCost: 0.0012,
        upstreamOutputCost: 0.0026,
      },
    })
  })

  it('prefers camelCase costDetails when both are present', () => {
    expect(
      extractUsageCost({
        cost: 0.01,
        costDetails: { upstreamInferenceCost: 1 },
        cost_details: { upstream_inference_cost: 2 },
      }),
    ).toEqual({ cost: 0.01, costDetails: { upstreamCost: 1 } })
  })

  it('preserves negative detail values (e.g. cache discount)', () => {
    expect(
      extractUsageCost({
        cost: 0.01,
        costDetails: { upstreamInferenceCost: -0.002 },
      }),
    ).toEqual({ cost: 0.01, costDetails: { upstreamCost: -0.002 } })
  })

  it('drops null, non-finite, and non-numeric detail entries', () => {
    expect(
      extractUsageCost({
        cost: 0.01,
        costDetails: {
          upstreamInferenceCost: 0.5,
          upstreamInferenceInputCost: null,
          upstreamInferenceOutputCost: Infinity,
          upstreamInferencePromptCost: NaN,
          upstreamInferenceCompletionsCost: 'x',
        },
      }),
    ).toEqual({ cost: 0.01, costDetails: { upstreamCost: 0.5 } })
  })

  it('drops unknown breakdown keys', () => {
    expect(
      extractUsageCost({
        cost: 0.01,
        costDetails: {
          upstreamInferenceCost: 0.008,
          futureUnknownField: 0.001,
        },
      }),
    ).toEqual({ cost: 0.01, costDetails: { upstreamCost: 0.008 } })
  })

  it('omits costDetails entirely when no known entries remain', () => {
    expect(
      extractUsageCost({ cost: 0.01, costDetails: { unknownKey: 1 } }),
    ).toEqual({ cost: 0.01 })
  })

  it('drops an orphan costDetails when cost is absent', () => {
    expect(
      extractUsageCost({ costDetails: { upstreamInferenceCost: 0.008 } }),
    ).toEqual({})
  })
})
