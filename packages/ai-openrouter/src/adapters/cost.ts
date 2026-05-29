/**
 * Helpers for extracting OpenRouter's provider-reported per-request cost from the
 * SDK usage object and shaping it for `RUN_FINISHED.usage`.
 *
 * OpenRouter returns an authoritative per-request `cost` plus an optional
 * `cost_details` breakdown. We forward the known breakdown fields verbatim — no
 * local token-times-price math, which would drift across routing/fallback/BYOK
 * /caching. Unknown breakdown keys are dropped so the public `UsageCostDetails`
 * shape stays closed.
 *
 * Input is intentionally typed `unknown`: callers pass usage objects whose static
 * types are narrowed to token-only fields (notably the Responses adapter), and the
 * Responses usage normalizer can leave `cost_details` in snake_case. Reading both
 * `costDetails` and `cost_details` and narrowing here keeps every call site simple.
 */

import type { UsageCostDetails } from '@tanstack/ai'

export interface ExtractedCost {
  cost?: number
  costDetails?: UsageCostDetails
}

/** Keys recognized in `cost_details` / `costDetails`, snake_case ↔ camelCase. */
const KNOWN_DETAIL_KEYS: Record<string, keyof UsageCostDetails> = {
  upstream_inference_cost: 'upstreamInferenceCost',
  upstreamInferenceCost: 'upstreamInferenceCost',
  upstream_inference_prompt_cost: 'upstreamInferencePromptCost',
  upstreamInferencePromptCost: 'upstreamInferencePromptCost',
  upstream_inference_completions_cost: 'upstreamInferenceCompletionsCost',
  upstreamInferenceCompletionsCost: 'upstreamInferenceCompletionsCost',
  upstream_inference_input_cost: 'upstreamInferenceInputCost',
  upstreamInferenceInputCost: 'upstreamInferenceInputCost',
  upstream_inference_output_cost: 'upstreamInferenceOutputCost',
  upstreamInferenceOutputCost: 'upstreamInferenceOutputCost',
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * Narrow a raw `cost_details`/`costDetails` map to the known fields of
 * `UsageCostDetails`. Negative values (e.g. discounts) are preserved; `null`,
 * non-finite numbers, non-numeric values, and unknown keys are dropped.
 */
function extractCostDetails(details: unknown): UsageCostDetails | undefined {
  const record = asRecord(details)
  if (!record) return undefined

  const out: UsageCostDetails = {}
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
