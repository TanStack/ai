import type { TokenUsage } from '@tanstack/ai'

/** The token counts of some model calls, and their cost when known. */
export interface UsageCounts {
  /** How many model calls reported usage. */
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** Prompt tokens read from the cache of the provider. */
  cachedTokens: number
  /** Prompt tokens written to the cache of the provider. */
  cacheWriteTokens: number
  /**
   * The sum of the cost that the providers reported, in their currency (USD
   * for most). Set only when at least one call reported a cost.
   */
  cost?: number
}

/**
 * The usage of a thread: every model call of its turns, their subagents, and
 * its agent runs. `bySender` has the calls of a known sender only, keyed by
 * the principal id, so its sum can be less than `total`.
 */
export interface SessionUsage {
  total: UsageCounts
  /** By `provider/model`, for example `anthropic/claude-sonnet-5-5`. */
  byModel: Record<string, UsageCounts>
  /** By principal id. */
  bySender: Record<string, UsageCounts>
}

/** One model call, as the log keeps it. A type, so it is a log record field set. */
export type UsageCall = {
  model: string
  principal?: { id: string; tenantId?: string }
  usage: Omit<UsageCounts, 'calls'>
}

const emptyCounts = (): UsageCounts => ({
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
  cacheWriteTokens: 0,
})

export const emptyUsage = (): SessionUsage => ({
  total: emptyCounts(),
  byModel: {},
  bySender: {},
})

/** The counts that one call adds, from what the provider reported. */
export function callUsage(usage: TokenUsage): UsageCall['usage'] {
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    cachedTokens: usage.promptTokensDetails?.cachedTokens ?? 0,
    cacheWriteTokens: usage.promptTokensDetails?.cacheWriteTokens ?? 0,
    ...(typeof usage.cost === 'number' ? { cost: usage.cost } : {}),
  }
}

function add(counts: UsageCounts, usage: UsageCall['usage']) {
  counts.calls += 1
  counts.promptTokens += usage.promptTokens
  counts.completionTokens += usage.completionTokens
  counts.totalTokens += usage.totalTokens
  counts.cachedTokens += usage.cachedTokens
  counts.cacheWriteTokens += usage.cacheWriteTokens
  if (usage.cost !== undefined) counts.cost = (counts.cost ?? 0) + usage.cost
}

/** Add one call to `totals`, in place. */
export function addUsage(totals: SessionUsage, call: UsageCall) {
  add(totals.total, call.usage)
  add((totals.byModel[call.model] ??= emptyCounts()), call.usage)
  if (call.principal) {
    add((totals.bySender[call.principal.id] ??= emptyCounts()), call.usage)
  }
}

/** Is `value` usage totals that the harness wrote? */
export function isSessionUsage(value: unknown): value is SessionUsage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'total' in value &&
    'byModel' in value &&
    'bySender' in value
  )
}
