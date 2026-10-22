import type { TokenUsage, UsageCostBreakdown } from '@tanstack/ai'

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

/** Gateway sends decimal strings (`"0"`, `"0.000035"`). Chat usage may send numbers. */
function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Copy Vercel AI Gateway cost onto {@link TokenUsage}.
 *
 * Responses puts it on `provider_metadata.gateway` (`cost`, `marketCost`,
 * `generationId`, `routing.finalProvider`). Chat Completions can put `cost`
 * and `market_cost` on `usage`. `cost` is the amount debited. `marketCost`
 * is the list price, stored as `costDetails.upstreamCost`.
 */
export function withGatewayCost(
  usage: TokenUsage | undefined,
  source: unknown,
): TokenUsage | undefined {
  if (!usage) return undefined
  const record = asRecord(source)
  if (!record) return usage

  const meta =
    asRecord(record.provider_metadata) ?? asRecord(record.providerMetadata)
  const gateway = asRecord(meta?.gateway)
  const nestedUsage = asRecord(record.usage)
  const bag = gateway ?? nestedUsage ?? record

  const cost = finiteNumber(bag.cost)
  if (cost === undefined) return usage

  const market = finiteNumber(bag.marketCost ?? bag.market_cost)
  const costDetails: UsageCostBreakdown | undefined =
    market === undefined ? undefined : { upstreamCost: market }

  const generationId =
    typeof bag.generationId === 'string' ? bag.generationId : undefined
  const routing = asRecord(bag.routing)
  const finalProvider =
    typeof routing?.finalProvider === 'string'
      ? routing.finalProvider
      : undefined
  const providerUsageDetails = {
    ...(generationId ? { generationId } : {}),
    ...(finalProvider ? { finalProvider } : {}),
  }

  return {
    ...usage,
    cost,
    ...(costDetails ? { costDetails } : {}),
    ...(Object.keys(providerUsageDetails).length > 0
      ? {
          providerUsageDetails: {
            ...usage.providerUsageDetails,
            ...providerUsageDetails,
          },
        }
      : {}),
  }
}
