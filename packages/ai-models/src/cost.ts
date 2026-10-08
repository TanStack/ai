import type { Cost, ModelRecord, TokenCounts } from './types'

/**
 * What a call cost in USD: each price is per 1M tokens, so the cost of a part
 * is `price / 1_000_000 * tokens`. pi's rules:
 * - A call with more input than a tier's `inputTokensAbove` uses that tier's
 *   prices: the tier with the highest threshold below the input (uncached +
 *   cache read + cache write).
 * - A 1-hour cache write (`cacheWrite1h`) costs 2x the input price. The rest
 *   of `cacheWrite` costs the cache write price.
 */
export function modelCost(
  model: Pick<ModelRecord, 'cost'>,
  usage: TokenCounts,
): Cost {
  const totalInput =
    usage.input + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0)
  const rates =
    (model.cost.tiers ?? [])
      .filter((tier) => totalInput > tier.inputTokensAbove)
      .sort((a, b) => b.inputTokensAbove - a.inputTokensAbove)[0] ?? model.cost
  const part = (price: number, tokens = 0) => (price / 1_000_000) * tokens
  const longWrite = usage.cacheWrite1h ?? 0
  const input = part(rates.input, usage.input)
  const output = part(rates.output, usage.output)
  const cacheRead = part(rates.cacheRead, usage.cacheRead)
  const cacheWrite =
    part(rates.cacheWrite, (usage.cacheWrite ?? 0) - longWrite) +
    part(rates.input * 2, longWrite)
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  }
}
