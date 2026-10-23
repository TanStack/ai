import type { ModelReasoning } from './reasoning'
import type { Modality, TokenUsage } from './types'

/**
 * Prices per 1M tokens, in `currency`. A rate the provider's price card does
 * not list is `undefined`: not known, not free.
 */
export interface ModelRates {
  input?: number
  output?: number
  /** Input tokens read from the prompt cache. */
  cacheRead?: number
  /** Input tokens written to the prompt cache (5-minute retention). */
  cacheWrite?: number
  /** Input tokens written to the prompt cache with a 1-hour retention. */
  cacheWrite1h?: number
}

/** The prices of a call with more than `inputTokensAbove` input tokens. */
export interface ModelPriceTier extends ModelRates {
  inputTokensAbove: number
}

/** A model's prices. */
export interface ModelPrices extends ModelRates {
  /** An ISO 4217 code, for example `'USD'` or `'CNY'`. */
  currency: string
  /**
   * Higher prices for a call with more input, for example long context.
   * Sorted by `inputTokensAbove`, from low to high.
   */
  tiers?: ReadonlyArray<ModelPriceTier>
}

/**
 * One model from a provider's catalog, as a provider package's `./models`
 * subpath exports it. A field the source does not list is `undefined`.
 */
export interface ModelRecord {
  /** The model id to send. */
  id: string
  name: string
  /** The input kinds the model reads. */
  input?: ReadonlyArray<Modality>
  reasoning: ModelReasoning
  prices?: ModelPrices
  /** The most input and output tokens of one call. */
  contextWindow?: number
  /** The most output tokens of one call. */
  maxOutputTokens?: number
}

/** What a call cost, in `currency`. */
export interface ModelCost {
  currency: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

/**
 * What a call cost, from the model's prices and the call's `usage`.
 * `undefined` when the model has no prices, or when the call used tokens of a
 * kind with no known price.
 *
 * The tier is the one with the highest `inputTokensAbove` below
 * `usage.promptTokens` (all input, cached or not).
 */
export function modelCost(
  model: Pick<ModelRecord, 'prices'>,
  usage: TokenUsage,
): ModelCost | undefined {
  const prices = model.prices
  if (!prices) return undefined
  const rates: ModelRates =
    prices.tiers
      ?.filter((tier) => usage.promptTokens > tier.inputTokensAbove)
      .at(-1) ?? prices
  const details = usage.promptTokensDetails
  const cacheRead = details?.cachedTokens ?? 0
  const cacheWrite = details?.cacheWriteTokens ?? 0
  const cacheWrite1h = details?.cacheWrite1hTokens ?? 0
  // NaN marks tokens with no known price. It makes the total NaN.
  const cost = (rate: number | undefined, tokens: number) =>
    tokens === 0 ? 0 : rate === undefined ? NaN : (rate / 1_000_000) * tokens
  const parts = {
    input: cost(rates.input, usage.promptTokens - cacheRead - cacheWrite),
    output: cost(rates.output, usage.completionTokens),
    cacheRead: cost(rates.cacheRead, cacheRead),
    cacheWrite:
      cost(rates.cacheWrite, cacheWrite - cacheWrite1h) +
      cost(rates.cacheWrite1h, cacheWrite1h),
  }
  const total = parts.input + parts.output + parts.cacheRead + parts.cacheWrite
  if (Number.isNaN(total)) return undefined
  return { currency: prices.currency, ...parts, total }
}
