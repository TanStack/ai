/**
 * Helpers for extracting OpenRouter's provider-reported per-request cost from the
 * SDK usage object and shaping it for `RUN_FINISHED.usage`.
 *
 * OpenRouter returns an authoritative per-request `cost` plus an optional
 * `cost_details` breakdown. We forward `cost` verbatim and normalize the
 * breakdown onto `@tanstack/ai`'s canonical `UsageCostBreakdown` shape — so
 * consumer code reads the same three fields regardless of which adapter (or
 * which OpenRouter endpoint) produced them. OpenRouter exposes the breakdown
 * under two naming families (Chat Completions: `prompt`/`completions`,
 * Responses: `input`/`output`); both map onto the same canonical input/output
 * split, because they bill against the same tokens.
 *
 * Input is intentionally typed `unknown`: callers pass usage objects whose static
 * types are narrowed to token-only fields (notably the Responses adapter), and the
 * Responses usage normalizer can leave `cost_details` in snake_case. Reading both
 * `costDetails` and `cost_details` and narrowing here keeps every call site simple.
 */

import type { UsageCostBreakdown } from '@tanstack/ai'

export interface ExtractedCost {
  cost?: number
  costDetails?: UsageCostBreakdown
}

/**
 * Wire-key → canonical-key mapping. Snake_case keys come from the raw/UNKNOWN
 * `response.completed` fallback in the Responses adapter; camelCase keys come
 * from the SDK-parsed path. Both Chat Completions' prompt/completions naming
 * and Responses' input/output naming collapse onto `upstreamInputCost` /
 * `upstreamOutputCost`.
 */
const KNOWN_DETAIL_KEYS: Record<string, keyof UsageCostBreakdown> = {
  upstream_inference_cost: 'upstreamCost',
  upstreamInferenceCost: 'upstreamCost',
  upstream_inference_prompt_cost: 'upstreamInputCost',
  upstreamInferencePromptCost: 'upstreamInputCost',
  upstream_inference_input_cost: 'upstreamInputCost',
  upstreamInferenceInputCost: 'upstreamInputCost',
  upstream_inference_completions_cost: 'upstreamOutputCost',
  upstreamInferenceCompletionsCost: 'upstreamOutputCost',
  upstream_inference_output_cost: 'upstreamOutputCost',
  upstreamInferenceOutputCost: 'upstreamOutputCost',
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * Narrow a raw `cost_details`/`costDetails` map to the canonical fields of
 * `UsageCostBreakdown`. Negative values (e.g. discounts) are preserved; `null`,
 * non-finite numbers, non-numeric values, and unknown keys are dropped.
 */
function extractCostDetails(details: unknown): UsageCostBreakdown | undefined {
  const record = asRecord(details)
  if (!record) return undefined

  const out: UsageCostBreakdown = {}
  for (const [rawKey, value] of Object.entries(record)) {
    const key = KNOWN_DETAIL_KEYS[rawKey]
    if (!key) continue
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value
    }
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
