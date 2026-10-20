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
 * The usage of a thread: every model call of its turns, their subagents, its
 * agent runs, the model calls of plugins (`ctx.model.chat`), of the router,
 * and of a transfer summary. `bySender` has the calls of a known sender
 * only, keyed by the user id, and `bySource` has only the calls that
 * have a source, so their sums can be less than `total`.
 */
export interface SessionUsage {
  total: UsageCounts
  /** By `provider/model`, for example `anthropic/claude-sonnet-5-5`. */
  byModel: Record<string, UsageCounts>
  /** By user id. */
  bySender: Record<string, UsageCounts>
  /**
   * By the source of a call: `plugin:<name>` (for example
   * `plugin:tanstack/title`), `router`, or `transfer`. Turns and agent runs
   * have no source, so they are not in it.
   */
  bySource: Record<string, UsageCounts>
}

/** One model call, as the log keeps it. A type, so it is a log record field set. */
export type UsageCall = {
  model: string
  user?: { id: string; tenantId?: string }
  /**
   * The run that made the call: a turn, or an agent run. Its usage also
   * counts for each run above it in the run tree.
   */
  runId?: string
  /**
   * Who made a call that is not a turn or an agent run: `plugin:<name>`
   * for `ctx.model.chat`, `router` for `model.chat` of `routing.router`,
   * and `transfer` for the summary of `host.transfer`.
   */
  source?: string
  /** The `label` of the call, for example `judge`, or `summary` for a transfer. */
  label?: string
  usage: Omit<UsageCounts, 'calls'>
}

export const emptyCounts = (): UsageCounts => ({
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
  bySource: {},
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

/** Add the counts of one call to `counts`, in place. */
export function addCounts(counts: UsageCounts, usage: UsageCall['usage']) {
  counts.calls += 1
  counts.promptTokens += usage.promptTokens
  counts.completionTokens += usage.completionTokens
  counts.totalTokens += usage.totalTokens
  counts.cachedTokens += usage.cachedTokens
  counts.cacheWriteTokens += usage.cacheWriteTokens
  if (usage.cost !== undefined) counts.cost = (counts.cost ?? 0) + usage.cost
}

/**
 * The counts under `key`, added when missing. An own property, so a key like
 * `__proto__` (a user id) never reaches the prototype.
 */
function countsOf(map: Record<string, UsageCounts>, key: string) {
  if (!Object.hasOwn(map, key)) {
    Object.defineProperty(map, key, {
      value: emptyCounts(),
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return map[key] as UsageCounts
}

/** Add one call to `totals`, in place. */
export function addUsage(totals: SessionUsage, call: UsageCall) {
  addCounts(totals.total, call.usage)
  addCounts(countsOf(totals.byModel, call.model), call.usage)
  if (call.user) {
    addCounts(countsOf(totals.bySender, call.user.id), call.usage)
  }
  if (call.source !== undefined) {
    addCounts(countsOf(totals.bySource, call.source), call.usage)
  }
}

/** Is `value` usage totals that the harness wrote? */
export function isSessionUsage(value: unknown): value is SessionUsage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'total' in value &&
    'byModel' in value &&
    'bySender' in value &&
    'bySource' in value
  )
}
