import type { Cost, ModelRecord, TokenCounts } from './types'

/**
 * What a call cost in USD: each price is per 1M tokens, so the cost of a part
 * is `price / 1_000_000 * tokens`.
 */
export function modelCost(
  model: Pick<ModelRecord, 'cost'>,
  usage: TokenCounts,
): Cost {
  const part = (price: number, tokens = 0) => (price / 1_000_000) * tokens
  const input = part(model.cost.input, usage.input)
  const output = part(model.cost.output, usage.output)
  const cacheRead = part(model.cost.cacheRead, usage.cacheRead)
  const cacheWrite = part(model.cost.cacheWrite, usage.cacheWrite)
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  }
}
