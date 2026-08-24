/**
 * `@tanstack/ai-compaction` — context-window compaction as a `chat()`
 * middleware. When the working message set grows past `maxTokens`, it keeps the
 * recent tail verbatim and replaces the older head with a single note — either a
 * summary (if you pass `summarize`) or an eviction marker. Runs before every
 * model call, so compaction is incremental and rolling: a later compaction
 * re-folds the previous summary into the next one.
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

/** Reported to `onCompact` after each compaction event. */
export interface CompactionInfo {
  /** Estimated tokens before compaction. */
  before: number
  /** Estimated tokens after compaction. */
  after: number
  /** How many head messages were folded into the note. */
  droppedMessages: number
  /** True when a `summarize` callback produced the note. */
  summarized: boolean
}

export interface CompactionOptions {
  /** Compact when estimated tokens across `messages` exceed this. */
  maxTokens: number
  /**
   * Tokens of the most recent messages to always keep verbatim.
   * Default: `floor(maxTokens / 2)`. Must be `< maxTokens`.
   */
  keepRecentTokens?: number
  /** Per-message token estimator. Default: {@link estimateMessageTokens}. */
  estimateTokens?: (message: ModelMessage) => number
  /**
   * Summarize the dropped head into prose. Omit to evict (drop) it with a short
   * marker instead. Wire this to `summarize()` or any LLM call.
   */
  summarize?: (messages: Array<ModelMessage>) => Promise<string>
  /** Role of the injected note. Default `'user'`. */
  summaryRole?: 'user' | 'assistant'
  /** Observe each compaction (logging, metrics). */
  onCompact?: (info: CompactionInfo) => void
}

/**
 * Context-compaction middleware. Add to `chat({ middleware: [...] })`.
 *
 * @example
 * ```ts
 * chat({
 *   adapter,
 *   messages,
 *   middleware: [
 *     withCompaction({
 *       maxTokens: 100_000,
 *       summarize: (msgs) => summarizeToString(adapter, msgs),
 *     }),
 *   ],
 * })
 * ```
 */
export function withCompaction(options: CompactionOptions): ChatMiddleware {
  const keepRecentTokens =
    options.keepRecentTokens ?? Math.floor(options.maxTokens / 2)
  if (keepRecentTokens >= options.maxTokens) {
    throw new Error(
      `withCompaction: keepRecentTokens (${keepRecentTokens}) must be < maxTokens (${options.maxTokens})`,
    )
  }
  const estimate = options.estimateTokens ?? estimateMessageTokens
  const summaryRole = options.summaryRole ?? 'user'

  return {
    name: 'compaction',
    async onConfig(_ctx, config) {
      const { messages } = config
      const sizes = messages.map(estimate)
      const total = sizes.reduce((a, b) => a + b, 0)
      if (total <= options.maxTokens) return

      // Walk back from the end, keeping recent messages up to keepRecentTokens.
      let kept = 0
      let cut = messages.length
      while (cut > 0) {
        const size = sizes[cut - 1] ?? 0
        if (kept + size > keepRecentTokens) break
        kept += size
        cut--
      }
      // Always keep at least the last message.
      if (cut >= messages.length) cut = messages.length - 1
      // Integrity: the tail must not start with an orphaned tool result (its
      // matching tool call would be in the dropped head). Fold leading tool
      // results back into the head — which becomes prose, so no dangling call.
      while (cut < messages.length && messages[cut]?.role === 'tool') cut++

      const head = messages.slice(0, cut)
      // ponytail: can't shrink past the recent window; raise keepRecentTokens
      // or lower maxTokens if this fires every turn.
      if (head.length === 0) return
      const tail = messages.slice(cut)

      const note = options.summarize
        ? `Summary of earlier conversation:\n${await options.summarize(head)}`
        : `[${head.length} earlier message(s) omitted to save context.]`
      const noteMessage: ModelMessage = { role: summaryRole, content: note }
      const next = [noteMessage, ...tail]

      options.onCompact?.({
        before: total,
        after: next.reduce((a, m) => a + estimate(m), 0),
        droppedMessages: head.length,
        summarized: Boolean(options.summarize),
      })

      return { messages: next }
    },
  }
}
