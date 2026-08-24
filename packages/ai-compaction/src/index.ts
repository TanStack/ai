/**
 * `@tanstack/ai-compaction` — context-window compaction as a `chat()`
 * middleware. `withCompaction({ maxTokens, strategy })` runs before each model
 * call: when the working message set grows past `maxTokens`, the chosen
 * `CompactionStrategy` rewrites the messages. Because it runs every call,
 * compaction is incremental and rolling.
 *
 * Strategies are pluggable, mirroring `AgentLoopStrategy`. Three are built in:
 * {@link evictOldest}, {@link summarizeOldest}, and {@link clearToolResults}.
 * Write your own by passing any {@link CompactionStrategy}.
 *
 * The system prompt is never touched — `chat()` keeps it separate from
 * `messages`.
 */
import type { ChatMiddleware, ModelMessage } from '@tanstack/ai'

/** Rough token estimate for one message. Default: characters / 4. */
export function estimateMessageTokens(message: ModelMessage): number {
  let text =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content ?? '')
  if (message.toolCalls?.length) text += JSON.stringify(message.toolCalls)
  return Math.ceil(text.length / 4)
}

/** What a {@link CompactionStrategy} receives alongside the messages. */
export interface CompactionContext {
  /** The `maxTokens` budget from `withCompaction`. */
  maxTokens: number
  /** The shared token estimator (default {@link estimateMessageTokens}). */
  estimate: (message: ModelMessage) => number
}

/**
 * Shrinks a message list. Called only when the estimate is over budget.
 * Return the rewritten messages, or `null` to leave them unchanged.
 */
export type CompactionStrategy = (
  messages: ReadonlyArray<ModelMessage>,
  ctx: CompactionContext,
) => Array<ModelMessage> | null | Promise<Array<ModelMessage> | null>

/** Reported to `onCompact` after each compaction event. */
export interface CompactionInfo {
  /** Estimated tokens before compaction. */
  before: number
  /** Estimated tokens after compaction. */
  after: number
  /** Message count before compaction. */
  messagesBefore: number
  /** Message count after compaction (unchanged for {@link clearToolResults}). */
  messagesAfter: number
}

export interface CompactionOptions {
  /** Compact when estimated tokens across `messages` exceed this. */
  maxTokens: number
  /** How to shrink the messages. Default: {@link evictOldest}. */
  strategy?: CompactionStrategy
  /** Per-message token estimator. Default: {@link estimateMessageTokens}. */
  estimateTokens?: (message: ModelMessage) => number
  /** Observe each compaction (logging, metrics). */
  onCompact?: (info: CompactionInfo) => void
}

const sum = (
  messages: ReadonlyArray<ModelMessage>,
  estimate: (m: ModelMessage) => number,
) => messages.reduce((total, m) => total + estimate(m), 0)

/**
 * Find the split point that keeps the most recent messages up to
 * `keepRecentTokens`, then moves the cut forward past any leading tool result
 * so the kept tail never starts with an orphan (its tool call would be dropped).
 * Returns the index where the tail begins (head is `messages[0..cut)`).
 */
function splitAtRecent(
  messages: ReadonlyArray<ModelMessage>,
  estimate: (m: ModelMessage) => number,
  keepRecentTokens: number,
): number {
  let kept = 0
  let cut = messages.length
  while (cut > 0) {
    const prev = messages[cut - 1]
    if (!prev) break
    const size = estimate(prev)
    if (kept + size > keepRecentTokens) break
    kept += size
    cut--
  }
  // Always keep at least the last message.
  if (cut >= messages.length) cut = messages.length - 1
  while (cut < messages.length && messages[cut]?.role === 'tool') cut++
  return cut
}

/**
 * Drop the oldest messages and replace them with a short marker. Cheapest
 * strategy — no extra model call. This is the default.
 */
export function evictOldest(
  options: {
    /** Tokens of recent messages to keep verbatim. Default `floor(maxTokens/2)`. */
    keepRecentTokens?: number
    /** Build the marker that replaces the dropped head. */
    marker?: (droppedCount: number) => string
  } = {},
): CompactionStrategy {
  return (messages, ctx) => {
    const keep = options.keepRecentTokens ?? Math.floor(ctx.maxTokens / 2)
    const cut = splitAtRecent(messages, ctx.estimate, keep)
    // ponytail: can't shrink past the recent window; raise keepRecentTokens or
    // lower maxTokens if compaction never fires.
    if (cut <= 0) return null
    const marker =
      options.marker?.(cut) ??
      `[${cut} earlier message(s) omitted to save context.]`
    return [{ role: 'user', content: marker }, ...messages.slice(cut)]
  }
}

/**
 * Drop the oldest messages and replace them with an LLM summary. Keeps the gist
 * of old turns at the cost of one summarization call. Wire `summarize` to
 * `summarize()` or any model call.
 */
export function summarizeOldest(options: {
  summarize: (messages: Array<ModelMessage>) => Promise<string>
  /** Tokens of recent messages to keep verbatim. Default `floor(maxTokens/2)`. */
  keepRecentTokens?: number
  /** Role of the injected summary message. Default `'user'`. */
  summaryRole?: 'user' | 'assistant'
}): CompactionStrategy {
  return async (messages, ctx) => {
    const keep = options.keepRecentTokens ?? Math.floor(ctx.maxTokens / 2)
    const cut = splitAtRecent(messages, ctx.estimate, keep)
    if (cut <= 0) return null
    const summary = await options.summarize(messages.slice(0, cut))
    return [
      {
        role: options.summaryRole ?? 'user',
        content: `Summary of earlier conversation:\n${summary}`,
      },
      ...messages.slice(cut),
    ]
  }
}

/**
 * Replace the content of old tool-result messages with a stub, keeping every
 * message and its tool-call pairing in place. Best for agent loops where tool
 * output (file reads, command output) dominates the token count — it clears the
 * bulk without disturbing the conversation shape. No extra model call.
 */
export function clearToolResults(
  options: {
    /** Number of most-recent tool results to keep verbatim. Default `3`. */
    keepRecentToolResults?: number
    /** Text that replaces a cleared tool result. */
    stub?: string
  } = {},
): CompactionStrategy {
  const keepN = options.keepRecentToolResults ?? 3
  const stub = options.stub ?? '[tool output cleared to save context]'
  return (messages) => {
    const toolIndexes: Array<number> = []
    messages.forEach((m, i) => {
      if (m.role === 'tool') toolIndexes.push(i)
    })
    if (toolIndexes.length <= keepN) return null
    const clearBefore = toolIndexes[toolIndexes.length - keepN] ?? 0
    let changed = false
    const next = messages.map((m, i) => {
      if (m.role === 'tool' && i < clearBefore && m.content !== stub) {
        changed = true
        return { ...m, content: stub }
      }
      return m
    })
    return changed ? next : null
  }
}

/**
 * Run several strategies in order, escalating: stop as soon as the running
 * estimate is back under `maxTokens`. Put the cheap, targeted strategy first
 * (for example {@link clearToolResults}) and a broad fallback last (for example
 * {@link evictOldest}) — the fallback only runs when clearing was not enough.
 * A strategy that returns `null` (no change) is skipped and the next one runs.
 *
 * @example
 * ```ts
 * withCompaction({
 *   maxTokens: 100_000,
 *   strategy: composeStrategies(clearToolResults(), evictOldest()),
 * })
 * ```
 */
export function composeStrategies(
  ...strategies: Array<CompactionStrategy>
): CompactionStrategy {
  return async (messages, ctx) => {
    let current: ReadonlyArray<ModelMessage> = messages
    let result: Array<ModelMessage> | null = null
    for (const strategy of strategies) {
      if (sum(current, ctx.estimate) <= ctx.maxTokens) break
      const out = await strategy(current, ctx)
      if (out) {
        current = out
        result = out
      }
    }
    return result
  }
}

/**
 * Context-compaction middleware. Add to `chat({ middleware: [...] })`.
 *
 * @example
 * ```ts
 * chat({
 *   adapter,
 *   messages,
 *   middleware: [withCompaction({ maxTokens: 100_000 })], // evictOldest by default
 * })
 * ```
 */
export function withCompaction(options: CompactionOptions): ChatMiddleware {
  const estimate = options.estimateTokens ?? estimateMessageTokens
  const strategy = options.strategy ?? evictOldest()

  return {
    name: 'compaction',
    async onConfig(_ctx, config) {
      const { messages } = config
      const before = sum(messages, estimate)
      if (before <= options.maxTokens) return

      const next = await strategy(messages, {
        maxTokens: options.maxTokens,
        estimate,
      })
      if (!next || next === messages) return

      options.onCompact?.({
        before,
        after: sum(next, estimate),
        messagesBefore: messages.length,
        messagesAfter: next.length,
      })

      return { messages: next }
    },
  }
}
