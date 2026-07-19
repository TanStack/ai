import type {
  CompletionTokensDetails,
  PromptTokensDetails,
  ProviderUsageDetails,
  TokenUsage,
  UsageCostBreakdown,
} from '../types'

/**
 * Input parameters for building base TokenUsage.
 * Provider functions should extract these from their SDK's response.
 */
export interface BaseUsageInput {
  /** Total input/prompt tokens */
  promptTokens: number
  /** Total output/completion tokens */
  completionTokens: number
  /** Total tokens (prompt + completion) */
  totalTokens: number
}

/**
 * Builds the base TokenUsage object with core fields.
 * Provider-specific functions should use this and then add their own details.
 *
 * @param input - The base token counts
 * @returns A TokenUsage object with promptTokens, completionTokens, totalTokens
 *
 * @example
 * ```typescript
 * const base = buildBaseUsage({
 *   promptTokens: 100,
 *   completionTokens: 50,
 *   totalTokens: 150
 * });
 * // Returns: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
 * ```
 */
export function buildBaseUsage<TProviderDetails = ProviderUsageDetails>(
  input: BaseUsageInput,
): TokenUsage<TProviderDetails> {
  return {
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
  }
}

/**
 * Sum two optional finite numbers. Returns `undefined` only when neither side
 * reports a finite value — when only one side is present, that value wins
 * (so a single iteration's cost still surfaces on the roll-up).
 */
function sumOptional(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  const hasA = typeof a === 'number' && Number.isFinite(a)
  const hasB = typeof b === 'number' && Number.isFinite(b)
  if (hasA && hasB) return a + b
  if (hasA) return a
  if (hasB) return b
  return undefined
}

/**
 * Merge two optional numeric-detail bags field-by-field. Fields present on
 * only one side are preserved; fields present on both are summed; the result
 * is `undefined` only when both inputs are absent (no empty object littering
 * the merged `TokenUsage`).
 */
function mergeNumericBag<T>(
  a: T | undefined,
  b: T | undefined,
): T | undefined {
  if (!a && !b) return undefined
  const out: Record<string, number> = {}
  const keys = new Set<string>([
    ...(a ? Object.keys(a as Record<string, unknown>) : []),
    ...(b ? Object.keys(b as Record<string, unknown>) : []),
  ])
  let hasAny = false
  for (const k of keys) {
    const va = (a as Record<string, number | undefined> | undefined)?.[k]
    const vb = (b as Record<string, number | undefined> | undefined)?.[k]
    const v = sumOptional(va, vb)
    if (v !== undefined) {
      out[k] = v
      hasAny = true
    }
  }
  return hasAny ? (out as unknown as T) : undefined
}

/**
 * Accumulate `delta` usage into a running `acc` total. Used by the chat
 * engine to roll up per-iteration `RUN_FINISHED.usage` across the agent
 * loop so `FinishInfo.usage` carries cross-iteration totals — the
 * documented contract for the root `chat` span's `gen_ai.usage.*`
 * attributes (see `docs/advanced/otel.md`).
 *
 * Core counts (`promptTokens`, `completionTokens`, `totalTokens`) are
 * always summed. Optional numeric fields (cost, cache/reasoning
 * breakdowns, duration-based billing, upstream cost split) sum when both
 * sides report them; when only one side reports a field, that value is
 * preserved so a single iteration's cost still surfaces on the roll-up.
 * `providerUsageDetails` is provider-specific and not generally summable,
 * so the latest value (from `delta`) wins — matching how `onUsage`
 * consumers see the most recent per-iteration value.
 *
 * Returns a fresh object so callers can store the result without aliasing
 * either input.
 */
export function accumulateTokenUsage(
  acc: TokenUsage | null | undefined,
  delta: TokenUsage,
): TokenUsage {
  if (!acc) {
    return { ...delta }
  }

  const merged: TokenUsage = {
    promptTokens: acc.promptTokens + delta.promptTokens,
    completionTokens: acc.completionTokens + delta.completionTokens,
    totalTokens: acc.totalTokens + delta.totalTokens,
  }

  const cost = sumOptional(acc.cost, delta.cost)
  if (cost !== undefined) merged.cost = cost
  const durationSeconds = sumOptional(
    acc.durationSeconds,
    delta.durationSeconds,
  )
  if (durationSeconds !== undefined) merged.durationSeconds = durationSeconds
  const unitsBilled = sumOptional(acc.unitsBilled, delta.unitsBilled)
  if (unitsBilled !== undefined) merged.unitsBilled = unitsBilled

  const promptTokensDetails = mergeNumericBag<PromptTokensDetails>(
    acc.promptTokensDetails,
    delta.promptTokensDetails,
  )
  if (promptTokensDetails) {
    merged.promptTokensDetails = promptTokensDetails
  }

  const completionTokensDetails = mergeNumericBag<CompletionTokensDetails>(
    acc.completionTokensDetails,
    delta.completionTokensDetails,
  )
  if (completionTokensDetails) {
    merged.completionTokensDetails = completionTokensDetails
  }

  const costDetails = mergeNumericBag<UsageCostBreakdown>(
    acc.costDetails,
    delta.costDetails,
  )
  if (costDetails) {
    merged.costDetails = costDetails
  }

  // providerUsageDetails is provider-shaped (not generally summable).
  // Latest value wins — matches how `onUsage` consumers observe the most
  // recent per-iteration bag.
  if (delta.providerUsageDetails !== undefined) {
    merged.providerUsageDetails = delta.providerUsageDetails
  } else if (acc.providerUsageDetails !== undefined) {
    merged.providerUsageDetails = acc.providerUsageDetails
  }

  return merged
}
