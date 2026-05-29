/**
 * Helpers for extracting OpenRouter's provider-reported per-request cost from the
 * SDK usage object and shaping it for `RUN_FINISHED.usage`.
 *
 * OpenRouter returns an authoritative per-request `cost` plus an optional
 * `cost_details` breakdown on the usage object of chat/responses completions.
 * The `@openrouter/sdk` parser surfaces these (camelCased to `costDetails` on the
 * Chat Completions path), so we only need to read and forward them — no local
 * token-times-price math, which would drift across routing/fallback/BYOK/caching.
 *
 * Input is intentionally typed `unknown`: callers pass usage objects whose static
 * types are narrowed to token-only fields (notably the Responses adapter), and the
 * Responses usage normalizer can leave `cost_details` in snake_case. Reading both
 * `costDetails` and `cost_details` and narrowing here keeps every call site simple.
 */

/** Extracted cost shaped for `UsageTotals` (camelCased). */
export interface ExtractedCost {
  cost?: number
  costDetails?: Record<string, number | null>
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

/** Convert a snake_case key to camelCase, leaving already-camelCase keys intact. */
function toCamelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

/**
 * Narrow a raw `cost_details`/`costDetails` map to numeric (or explicitly null)
 * entries. Negative values (e.g. cache discounts) and `null` are preserved; only
 * non-finite numbers and non-numeric/non-null values are dropped.
 *
 * Keys are normalized to camelCase so the breakdown is identical regardless of
 * whether it arrived already camelCased (the SDK-parsed path) or raw snake_case
 * (the Responses adapter's UNKNOWN/raw `response.completed` fallback).
 */
function extractCostDetails(
  details: unknown,
): Record<string, number | null> | undefined {
  const record = asRecord(details)
  if (!record) return undefined

  const out: Record<string, number | null> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value === null) {
      out[toCamelCase(key)] = null
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[toCamelCase(key)] = value
    }
    // Anything else (undefined, strings, nested objects, NaN/Infinity) is skipped.
  }

  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Extract `cost`/`costDetails` from a provider usage object.
 *
 * - `cost` is attached only when it is a finite number — this preserves `cost === 0`
 *   and rejects `NaN`/`Infinity`, and does not clamp negative values.
 * - `costDetails` is attached only alongside a valid `cost` (an orphan breakdown
 *   without a total cannot be reconciled and is dropped). Both camelCase
 *   `costDetails` and snake_case `cost_details` are read.
 *
 * Returns an empty object when no usable cost is present, so call sites can spread
 * the result unconditionally.
 */
export function extractUsageCost(usage: unknown): ExtractedCost {
  const record = asRecord(usage)
  if (!record) return {}

  const cost = record.cost
  if (typeof cost !== 'number' || !Number.isFinite(cost)) return {}

  const costDetails = extractCostDetails(
    record.costDetails ?? record.cost_details,
  )

  return {
    cost,
    ...(costDetails && { costDetails }),
  }
}
