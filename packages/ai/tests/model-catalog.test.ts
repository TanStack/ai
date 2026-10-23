import { describe, expect, it } from 'vitest'
import { modelCost } from '../src'
import type { ModelPrices, TokenUsage } from '../src'

const flat: ModelPrices = {
  currency: 'USD',
  input: 3,
  output: 15,
  cacheRead: 0.3,
  cacheWrite: 3.75,
  cacheWrite1h: 6,
}

const tiered: ModelPrices = {
  ...flat,
  tiers: [{ inputTokensAbove: 200_000, input: 6, output: 22.5 }],
}

const usage = (
  promptTokens: number,
  completionTokens: number,
  promptTokensDetails?: TokenUsage['promptTokensDetails'],
): TokenUsage => ({
  promptTokens,
  completionTokens,
  totalTokens: promptTokens + completionTokens,
  promptTokensDetails,
})

describe('modelCost', () => {
  it('prices each kind of token, and splits the 1-hour cache write out', () => {
    expect(
      modelCost(
        { prices: flat },
        usage(1_000_000, 1_000_000, {
          cachedTokens: 100_000,
          cacheWriteTokens: 300_000,
          cacheWrite1hTokens: 100_000,
        }),
      ),
    ).toEqual({
      currency: 'USD',
      input: expect.closeTo(1.8),
      output: 15,
      cacheRead: expect.closeTo(0.03),
      cacheWrite: expect.closeTo(0.75 + 0.6),
      total: expect.closeTo(1.8 + 15 + 0.03 + 1.35),
    })
  })

  it('uses a tier only above its threshold', () => {
    expect(modelCost({ prices: tiered }, usage(200_000, 0))?.input).toBeCloseTo(
      0.6,
    )
    expect(modelCost({ prices: tiered }, usage(200_001, 0))?.input).toBeCloseTo(
      1.200006,
    )
  })

  it('is undefined when a price it needs is not known', () => {
    // The tier has no cache read price, so a long call cannot price one.
    expect(
      modelCost({ prices: tiered }, usage(300_000, 0, { cachedTokens: 1 })),
    ).toBeUndefined()
    expect(modelCost({ prices: tiered }, usage(300_000, 0))).toBeDefined()
    expect(modelCost({}, usage(10, 10))).toBeUndefined()
  })
})
