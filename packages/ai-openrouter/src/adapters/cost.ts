import type { UsageCostBreakdown } from '@tanstack/ai'

export interface ExtractedCost {
  cost?: number
  costDetails?: UsageCostBreakdown
}

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

function extractCostDetails(details: unknown): UsageCostBreakdown | undefined {
  const record = asRecord(details)
  if (!record) return undefined

  const out: UsageCostBreakdown = {}
  const costEntries = Object.entries(record)
  for (const [rawKey, value] of costEntries) {
    const key = KNOWN_DETAIL_KEYS[rawKey]
    if (!key) continue
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value
    }
  }

  return Object.keys(out).length > 0 ? out : undefined
}

export function extractUsageCost(usage: unknown): ExtractedCost {
  const record = asRecord(usage)
  if (!record) return {}

  const cost = record.cost
  const isNotFiniteCost = typeof cost !== 'number' || !Number.isFinite(cost)
  if (isNotFiniteCost) return {}

  const costDetails = extractCostDetails(
    record.costDetails ?? record.cost_details,
  )

  return {
    cost: cost as number,
    ...(costDetails && { costDetails }),
  }
}
