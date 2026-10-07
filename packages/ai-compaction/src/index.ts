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
import {
  LogRecordsCapability,
  MetadataCapability,
  getLogRecords,
  getMetadata,
} from '@tanstack/ai'
import {
  COMPACTION_RECORD_TYPE,
  compactionRecord,
  projectCompaction,
} from './record'
import {
  readSummary,
  splitDetails,
  summaryBody,
  summaryContent,
} from './summarizer'
import {
  USAGE_NAMESPACE,
  countFromUsage,
  hashMessages,
  memoryMetadata,
  sumUsage,
  toUsageCount,
} from './usage-count'
import type {
  AnyTextAdapter,
  ChatMiddleware,
  ChatMiddlewareContext,
  FetchWrapper,
  ModelMessage,
  TokenUsage,
} from '@tanstack/ai'
import type { CompactionRecord } from './record'
import type { SummarizeInput, Summarizer } from './summarizer'

export { COMPACTION_RECORD_TYPE, projectCompaction } from './record'
export type { CompactionRecord } from './record'
export { conversationSummarizer } from './summarizer'
export type { SummarizeInput, Summarizer } from './summarizer'

/** CUSTOM stream event: compaction is about to run. */
export const COMPACTION_STARTED_EVENT = 'compaction:started'
/** CUSTOM stream event: compaction result (counts and previews). */
export const COMPACTION_STATE_EVENT = 'compaction:state'
/** CUSTOM stream event: compaction finished. */
export const COMPACTION_ENDED_EVENT = 'compaction:ended'

export type CompactionStreamEventName =
  | typeof COMPACTION_STARTED_EVENT
  | typeof COMPACTION_STATE_EVENT
  | typeof COMPACTION_ENDED_EVENT

const PREVIEW_CHARS = 4000
const MAX_PREVIEWS = 24

/** One message in a `compaction:state` preview list. */
export interface CompactionMessagePreview {
  role: string
  tokens: number
  text: string
}

/** Why a compaction ran. */
export type CompactionReason =
  | 'threshold'
  | 'forced'
  | 'after-turn'
  | 'background'

/** Payload of {@link COMPACTION_STARTED_EVENT}. */
export interface CompactionStartedEventValue {
  before: number
  messagesBefore: number
  reusedCheckpoint: boolean
  maxTokens: number
  strategyKey?: string
  reason: CompactionReason
}

/** Payload of {@link COMPACTION_STATE_EVENT}. */
export interface CompactionStateEventValue {
  before: number
  after: number
  messagesBefore: number
  messagesAfter: number
  reusedCheckpoint: boolean
  maxTokens: number
  strategyKey?: string
  /** Messages removed or rewritten. */
  dropped?: Array<CompactionMessagePreview>
  /** Messages the model will see after compaction. */
  result?: Array<CompactionMessagePreview>
}

/** Payload of {@link COMPACTION_ENDED_EVENT}. */
export interface CompactionEndedEventValue {
  after: number
  messagesAfter: number
  reusedCheckpoint: boolean
  maxTokens: number
  durationMs: number
  strategyKey?: string
  reason: CompactionReason
  /** The sum of the strategy's `addUsage` calls, for example its summary call. */
  usage?: TokenUsage
  /** Set when the strategy threw. */
  error?: { message: string }
  /** `true`: a ready background summary no longer fit the messages, and was dropped. */
  stale?: boolean
}

function emitCompactionStarted(
  ctx: ChatMiddlewareContext,
  value: CompactionStartedEventValue,
) {
  ctx.emitCustomEvent(COMPACTION_STARTED_EVENT, value)
}

function emitCompactionState(
  ctx: ChatMiddlewareContext,
  value: CompactionStateEventValue,
) {
  ctx.emitCustomEvent(COMPACTION_STATE_EVENT, value)
}

function emitCompactionEnded(
  ctx: ChatMiddlewareContext,
  value: CompactionEndedEventValue,
) {
  ctx.emitCustomEvent(COMPACTION_ENDED_EVENT, value)
}

const strategyKeys = new WeakMap<CompactionStrategy, string>()
const CHECKPOINT_NAMESPACE = '@tanstack/ai-compaction'

interface CompactionCheckpoint {
  schemaVersion: 1
  sourceMessageCount: number
  sourceHash: string
  strategyKey: string
  compactedMessages: Array<ModelMessage>
}

function identifyStrategy(
  strategy: CompactionStrategy,
  key: string | undefined,
): CompactionStrategy {
  if (key) strategyKeys.set(strategy, key)
  return strategy
}

function isModelMessage(value: unknown): value is ModelMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'role' in value &&
    (value.role === 'user' ||
      value.role === 'assistant' ||
      value.role === 'tool') &&
    'content' in value
  )
}

function isCompactionCheckpoint(value: unknown): value is CompactionCheckpoint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'sourceMessageCount' in value &&
    typeof value.sourceMessageCount === 'number' &&
    Number.isInteger(value.sourceMessageCount) &&
    value.sourceMessageCount >= 0 &&
    'sourceHash' in value &&
    typeof value.sourceHash === 'string' &&
    'strategyKey' in value &&
    typeof value.strategyKey === 'string' &&
    'compactedMessages' in value &&
    Array.isArray(value.compactedMessages) &&
    value.compactedMessages.every(isModelMessage)
  )
}

/** The metadata namespace of a ready background summary. The key is the thread. */
const BACKGROUND_NAMESPACE = '@tanstack/ai-compaction:background'

/** The memory namespace of the run of the last call of each thread. */
const RUN_NAMESPACE = '@tanstack/ai-compaction:run'

/** A ready background summary: the record of its result, built on its snapshot. */
interface BackgroundReady {
  record: CompactionRecord
  /** The hash of the snapshot before `record.from`, for a record with no `firstKeptId`. */
  prefixHash: string
}

function isBackgroundReady(value: unknown): value is BackgroundReady {
  return (
    typeof value === 'object' &&
    value !== null &&
    'prefixHash' in value &&
    typeof value.prefixHash === 'string' &&
    'record' in value &&
    typeof value.record === 'object' &&
    value.record !== null &&
    'type' in value.record &&
    value.record.type === COMPACTION_RECORD_TYPE &&
    'from' in value.record &&
    typeof value.record.from === 'number'
  )
}

/** Wait for `job`. Throw the signal's reason when it aborts first. */
function abortable(job: Promise<void>, signal: AbortSignal | undefined) {
  if (!signal) return job
  return new Promise<void>((resolve, reject) => {
    const stop = () => reject(signal.reason)
    if (signal.aborted) {
      stop()
      return
    }
    signal.addEventListener('abort', stop, { once: true })
    // A job never rejects: it reports its own failure.
    void job.then(() => {
      signal.removeEventListener('abort', stop)
      resolve()
    })
  })
}

function messagePreviewText(message: ModelMessage): string {
  if (typeof message.content === 'string') return message.content
  return JSON.stringify(message.content ?? '')
}

function toMessagePreview(
  message: ModelMessage,
  estimate: (message: ModelMessage) => number,
): CompactionMessagePreview {
  const text = messagePreviewText(message)
  return {
    role: message.role,
    tokens: estimate(message),
    text:
      text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text,
  }
}

function previewList(
  messages: ReadonlyArray<ModelMessage>,
  estimate: (message: ModelMessage) => number,
): Array<CompactionMessagePreview> {
  const mapped = messages.map((message) => toMessagePreview(message, estimate))
  if (mapped.length <= MAX_PREVIEWS) return mapped
  return mapped.slice(0, MAX_PREVIEWS)
}

function droppedMessages(
  before: ReadonlyArray<ModelMessage>,
  after: ReadonlyArray<ModelMessage>,
): Array<ModelMessage> {
  const afterKeys = new Set(after.map((message) => JSON.stringify(message)))
  return before.filter((message) => !afterKeys.has(JSON.stringify(message)))
}

function compactionStateValue(args: {
  before: number
  after: number
  messagesBefore: number
  messagesAfter: number
  reusedCheckpoint: boolean
  maxTokens: number
  strategyKey?: string
  beforeMessages?: ReadonlyArray<ModelMessage>
  afterMessages?: ReadonlyArray<ModelMessage>
  estimate: (message: ModelMessage) => number
}): CompactionStateEventValue {
  const value: CompactionStateEventValue = {
    before: args.before,
    after: args.after,
    messagesBefore: args.messagesBefore,
    messagesAfter: args.messagesAfter,
    reusedCheckpoint: args.reusedCheckpoint,
    maxTokens: args.maxTokens,
    ...(args.strategyKey ? { strategyKey: args.strategyKey } : {}),
  }
  if (args.afterMessages) {
    value.result = previewList(args.afterMessages, args.estimate)
  }
  if (args.beforeMessages && args.afterMessages) {
    value.dropped = previewList(
      droppedMessages(args.beforeMessages, args.afterMessages),
      args.estimate,
    )
  }
  return value
}

/** Rough token estimate for one message. Default: characters / 4. */
export function estimateMessageTokens(message: ModelMessage): number {
  let text = messagePreviewText(message)
  if (message.toolCalls?.length) text += JSON.stringify(message.toolCalls)
  return Math.ceil(text.length / 4)
}

/** What a {@link CompactionStrategy} receives alongside the messages. */
export interface CompactionContext {
  /** The `maxTokens` budget from `withCompaction`. */
  maxTokens: number
  /** The shared token estimator (default {@link estimateMessageTokens}). */
  estimate: (message: ModelMessage) => number
  /** Report the usage of a model call the strategy made, for example a summary. */
  addUsage: (usage: TokenUsage) => void
  /** Aborted when the run is cancelled. Pass it to a model call. */
  signal?: AbortSignal
}

/**
 * Shrinks a message list. Called when the count is over `maxTokens`, or when
 * `compactNext` forces it.
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
  /** Why the compaction ran. */
  reason: CompactionReason
  /** The usage the strategy reported with `addUsage`. */
  usage?: TokenUsage
  /**
   * Set when the after-turn check failed (the strategy, the store, or
   * `onCompact` threw), or when a background summary failed. The run goes
   * on. When the strategy failed, a later check tries again.
   */
  error?: { message: string }
  /** `true`: a ready background summary no longer fit the messages, and was dropped. */
  stale?: boolean
}

export interface CompactionOptions {
  /** Compact when the token count of `messages` passes this (see `countTokens` and `auto`). */
  maxTokens: number
  /** How to shrink the messages. Default: {@link evictOldest}. */
  strategy?: CompactionStrategy
  /** Per-message token estimator. Default: {@link estimateMessageTokens}. */
  estimateTokens?: (message: ModelMessage) => number
  /**
   * Stable identity for persisted checkpoints. Set this for custom strategies
   * or estimators, and change it when their output can change.
   */
  strategyKey?: string
  /** Observe each compaction (logging, metrics). */
  onCompact?: (info: CompactionInfo) => void
  /**
   * How to count the tokens of the list. `'usage'`: the usage the provider
   * reported for the last model call, plus the estimate of each message after
   * its reply. The estimate counts when no saved usage fits the list. The
   * strategies still use the estimate to choose the cut. Default
   * `'estimate'`.
   */
  countTokens?: 'estimate' | 'usage'
  /**
   * `false`: do not compact when the count passes `maxTokens`.
   * `compactNext` and the after-turn overflow check still compact. Default
   * `true`.
   */
  auto?: boolean
  /**
   * The model's context window in tokens. With `countTokens: 'usage'` and
   * `durable: true` on a host with a log, the check after the last model call
   * of a run compacts when the usage is over it, even with `auto: false`. A
   * failed after-turn compaction never fails the run: `onCompact` gets
   * `error`. Only a failed log append fails it.
   */
  contextWindow?: number
  /**
   * Write each compaction as a log record when the host provides
   * `LogRecordsCapability` (a durable harness session). Fold the record with
   * {@link projectCompaction}. Without the capability, the checkpoint is
   * used, and there is no after-turn check. When an earlier middleware set
   * `providerMessages`, the result stays provider-only. Default `false`.
   */
  durable?: boolean
  /**
   * `true`: when the strategy throws in the check before a model call, report
   * the error in `compaction:ended` and send the list without compaction.
   * Default `false`: the run fails. The after-turn check never fails the run.
   */
  continueOnError?: boolean
  /**
   * Prepare the summary before the list is over `maxTokens`. When the count
   * at a model call is over `atTokens` and not over `maxTokens`, the strategy
   * runs on a copy of the messages, and the call does not wait for it. The
   * result applies at the first model call of the next run. A call over
   * `maxTokens` while it runs waits for it. A ready result waits in the
   * metadata store, or in memory without one. `atTokens` must be below
   * `maxTokens`. Default: off.
   */
  background?: { atTokens: number }
  /**
   * Compact with the provider's own endpoint. Pass the adapter of the
   * `chat()` call. When the adapter has `compact`, it runs in place of
   * `strategy`. Else `strategy` runs. Default: off.
   */
  native?: Pick<AnyTextAdapter, 'compact'>
}

/** What {@link withCompaction} returns: a chat middleware with `compactNext`. */
export interface CompactionMiddleware extends ChatMiddleware {
  /**
   * Compact at the next model call on `threadId`, even when the count is
   * under `maxTokens` or `auto` is `false`. That call clears the flag.
   */
  compactNext: (threadId: string) => void
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
  // Trailing tool results: skipping orphans would drop the whole tail (the
  // normal agent-loop state). Keep those results and the message that owns them.
  if (cut >= messages.length) {
    cut = messages.length
    while (cut > 0 && messages[cut - 1]?.role === 'tool') cut--
    if (cut > 0) cut--
  }
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
  const strategy: CompactionStrategy = (messages, ctx) => {
    const keep = options.keepRecentTokens ?? Math.floor(ctx.maxTokens / 2)
    const cut = splitAtRecent(messages, ctx.estimate, keep)
    // Can't shrink past the recent window; raise keepRecentTokens or lower
    // maxTokens if compaction never fires.
    if (cut <= 0) return null
    const marker =
      options.marker?.(cut) ??
      `[${cut} earlier message(s) omitted to save context.]`
    return [{ role: 'user', content: marker }, ...messages.slice(cut)]
  }
  return identifyStrategy(
    strategy,
    options.marker
      ? undefined
      : `evict-oldest:${options.keepRecentTokens ?? 'half'}`,
  )
}

/**
 * The start of the turn that holds index `cut`: its user message. When no
 * user message comes after an earlier summary at index 0, the turn started
 * before the summary. Then the cut is not a split turn: it returns `cut`, and
 * one update call merges the messages into the summary.
 */
function turnStart(messages: ReadonlyArray<ModelMessage>, cut: number) {
  let start = cut
  // The walk stops at index 0 also when the summary has the role 'user'.
  while (start > 0 && messages[start]?.role !== 'user') start -= 1
  return start === 0 && readSummary(messages[0]) ? cut : start
}

/**
 * Drop the oldest messages and replace them with an LLM summary. Keeps the gist
 * of old turns at the cost of one summarization call. Wire `summarize` to
 * {@link conversationSummarizer}, `summarize()`, or any model call.
 *
 * When the messages start with an earlier summary, `summarize` gets its text
 * as `previousSummary`, so it can merge the new messages into it.
 */
export function summarizeOldest(options: {
  /** Returns the summary text, or the text and the usage of its model call. */
  summarize: Summarizer
  /** Tokens of recent messages to keep verbatim. Default `floor(maxTokens/2)`. */
  keepRecentTokens?: number
  /** Role of the injected summary message. Default `'assistant'`. */
  summaryRole?: 'user' | 'assistant'
  /**
   * `'turn'`: when the kept tail starts inside a turn, summarize the history
   * before the turn and the first part of the turn, in two parallel calls.
   * When the user message of the turn comes right after an earlier summary,
   * only the second call runs. When no user message comes after an earlier
   * summary, the turn started before it: one update call runs, as with
   * `'message'`. Default `'message'`.
   */
  cut?: 'message' | 'turn'
}): CompactionStrategy {
  const strategy: CompactionStrategy = async (messages, ctx) => {
    const keep = options.keepRecentTokens ?? Math.floor(ctx.maxTokens / 2)
    const cut = splitAtRecent(messages, ctx.estimate, keep)
    if (cut <= 0) return null
    // Follows the signal of the run. When one call fails, it aborts the other
    // call, so that call stops and adds no usage after the end event.
    const controller = new AbortController()
    const stop = () => controller.abort(ctx.signal?.reason)
    if (ctx.signal?.aborted) stop()
    ctx.signal?.addEventListener('abort', stop, { once: true })
    const summarize = async (
      part: Array<ModelMessage>,
      input: SummarizeInput,
    ) => {
      try {
        const result = await options.summarize(part, {
          ...input,
          signal: controller.signal,
        })
        const summary = typeof result === 'string' ? result : result.summary
        if (typeof result !== 'string' && result.usage) {
          ctx.addUsage(result.usage)
        }
        // An empty summary would replace the history with nothing. Fail the
        // compaction instead, so the history stays as it is.
        if (summary.trim() === '') {
          throw new Error('The summarizer returned an empty summary.')
        }
        return summary
      } catch (error) {
        controller.abort(error)
        throw error
      }
    }
    const earlier = readSummary(messages[0])
    const start =
      options.cut === 'turn' && messages[cut]?.role !== 'user'
        ? turnStart(messages, cut)
        : cut
    const prefix = messages.slice(start, cut)
    // With a turn prefix, an earlier summary right before the turn is the
    // whole history. Keep its text, and make no history call.
    const historyCall =
      start > 0 && !(earlier && start === 1 && prefix.length > 0)
    const previousDetails =
      earlier?.details !== undefined ? { previousDetails: earlier.details } : {}
    const [history, turn] = await Promise.all([
      historyCall
        ? summarize(messages.slice(0, start), {
            ...(earlier ? { previousSummary: earlier.summary } : {}),
            ...previousDetails,
            ...(prefix.length > 0 ? { turnPrefixMessages: prefix } : {}),
          })
        : undefined,
      prefix.length > 0
        ? summarize(prefix, {
            turnPrefix: true,
            // With no history call, this call writes the details.
            ...(historyCall
              ? {}
              : { turnPrefixMessages: prefix, ...previousDetails }),
          })
        : undefined,
    ]).finally(() => ctx.signal?.removeEventListener('abort', stop))
    let historyText = history
    let turnText = turn
    if (!historyCall && turn !== undefined) {
      // The details of the turn-prefix call go with the history, before the
      // turn context. When the call gives details, they replace the details
      // of the earlier summary. Otherwise the earlier details stay.
      const split = splitDetails(turn)
      historyText = summaryBody(
        earlier?.summary ?? '',
        split.details ?? earlier?.details,
      )
      turnText = split.summary
    }
    const body = [
      historyText,
      turnText === undefined ? undefined : `## Turn context\n\n${turnText}`,
    ]
      .filter((part) => part !== undefined && part !== '')
      .join('\n\n')
    return [
      {
        role: options.summaryRole ?? 'assistant',
        content: summaryContent(body),
      },
      ...messages.slice(cut),
    ]
  }
  return identifyStrategy(
    strategy,
    `summarize-oldest:${options.keepRecentTokens ?? 'half'}:${options.summaryRole ?? 'assistant'}${options.cut === 'turn' ? ':turn' : ''}`,
  )
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
  const strategy: CompactionStrategy = (messages) => {
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
  return identifyStrategy(strategy, `clear-tool-results:${keepN}:${stub}`)
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
  const strategy: CompactionStrategy = async (messages, ctx) => {
    let current: ReadonlyArray<ModelMessage> = messages
    let result: Array<ModelMessage> | null = null
    for (const itemStrategy of strategies) {
      if (sum(current, ctx.estimate) <= ctx.maxTokens) break
      const out = await itemStrategy(current, ctx)
      if (out) {
        current = out
        result = out
      }
    }
    return result
  }
  const keys = strategies.map((item) => strategyKeys.get(item))
  return identifyStrategy(
    strategy,
    keys.every((key) => key !== undefined) ? keys.join('|') : undefined,
  )
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
export function withCompaction(
  options: CompactionOptions,
): CompactionMiddleware {
  const background = options.background
  if (background && background.atTokens >= options.maxTokens) {
    throw new Error(
      'withCompaction: background.atTokens must be below maxTokens.',
    )
  }
  const estimate = options.estimateTokens ?? estimateMessageTokens
  const configured = options.strategy ?? evictOldest()
  const nativeCompact = options.native?.compact?.bind(options.native)
  /** The strategy of a call: the adapter's `compact` when `native` has it. */
  const strategyOf = (
    ctx: ChatMiddlewareContext,
    wrapFetch?: FetchWrapper,
  ): CompactionStrategy =>
    nativeCompact
      ? (messages, compaction) =>
          nativeCompact({
            messages: [...messages],
            model: ctx.model,
            ...(compaction.signal ? { signal: compaction.signal } : {}),
            ...(wrapFetch ? { wrapFetch } : {}),
          })
      : configured
  const strategyKey =
    options.strategyKey ??
    (nativeCompact
      ? 'native'
      : options.estimateTokens
        ? undefined
        : strategyKeys.get(configured))
  const checkpointStrategyKey = strategyKey
    ? `${strategyKey}:maxTokens=${options.maxTokens}`
    : undefined
  const countUsage = options.countTokens === 'usage'
  const auto = options.auto !== false
  const memory = memoryMetadata()
  // The store of the checkpoint and of the usage. With countTokens: 'usage',
  // a run with no store, or a strategy with no key, uses the memory of this
  // middleware. Then the next call reuses the compacted list, and the saved
  // usage fits that list.
  const storeOf = (ctx: ChatMiddlewareContext) => {
    const shared = getMetadata(ctx, { optional: true })
    if (shared && checkpointStrategyKey) return shared
    return countUsage ? memory : undefined
  }
  // True when the last model call of a run got a compacted view. The usage of
  // that view fits a later call only when that call reuses the checkpoint.
  const compactedViews = new WeakMap<ChatMiddlewareContext, boolean>()
  /** The threads whose next model call compacts. */
  const forced = new Set<string>()
  /** The running background summary of each thread. */
  const jobs = new Map<string, Promise<void>>()
  /** Where a ready background summary waits: the metadata store, else memory. */
  const backgroundStore = (ctx: ChatMiddlewareContext) =>
    getMetadata(ctx, { optional: true }) ?? memory

  /**
   * Run the strategy on `snapshot`, apart from the run: the run's signal does
   * not stop it, and the model call does not wait for it. The result waits in
   * the store until the first model call of a later run applies it.
   */
  function startBackground(
    ctx: ChatMiddlewareContext,
    snapshot: Array<ModelMessage>,
    before: number,
    reusedCheckpoint: boolean,
    wrapFetch: FetchWrapper | undefined,
  ) {
    const startedAt = Date.now()
    const store = backgroundStore(ctx)
    const strategyField = checkpointStrategyKey
      ? { strategyKey: checkpointStrategyKey }
      : {}
    emitCompactionStarted(ctx, {
      before,
      messagesBefore: snapshot.length,
      reusedCheckpoint,
      maxTokens: options.maxTokens,
      ...strategyField,
      reason: 'background',
    })
    const spent: { usage?: TokenUsage } = {}
    // This event reaches the stream only while the run that started the job
    // still runs. onCompact always gets a failure.
    const end = (error?: { message: string }) =>
      emitCompactionEnded(ctx, {
        after: before,
        messagesAfter: snapshot.length,
        reusedCheckpoint,
        maxTokens: options.maxTokens,
        durationMs: Date.now() - startedAt,
        ...strategyField,
        reason: 'background',
        ...(spent.usage ? { usage: spent.usage } : {}),
        ...(error ? { error } : {}),
      })
    // The job starts after `jobs.set`, so a strategy that throws at once
    // still removes its entry.
    const done = Promise.resolve().then(async () => {
      try {
        const next = await strategyOf(ctx, wrapFetch)(snapshot, {
          maxTokens: options.maxTokens,
          estimate,
          addUsage: (usage) => {
            spent.usage = sumUsage(spent.usage, usage)
          },
        })
        if (!next || next === snapshot) {
          end()
          return
        }
        const record = compactionRecord({
          reason: 'background',
          before: snapshot,
          after: next,
          tokensBefore: before,
          tokensAfter: sum(next, estimate),
          ...(spent.usage ? { usage: spent.usage } : {}),
        })
        const ready: BackgroundReady = {
          record,
          prefixHash: await hashMessages(snapshot.slice(0, record.from)),
        }
        await store.set(BACKGROUND_NAMESPACE, ctx.threadId, ready)
      } catch (failure) {
        const error = {
          message: failure instanceof Error ? failure.message : String(failure),
        }
        end(error)
        try {
          options.onCompact?.({
            before,
            after: before,
            messagesBefore: snapshot.length,
            messagesAfter: snapshot.length,
            reason: 'background',
            ...(spent.usage ? { usage: spent.usage } : {}),
            error,
          })
        } catch {
          // An onCompact that throws must not reject the job.
        }
      } finally {
        jobs.delete(ctx.threadId)
      }
    })
    jobs.set(ctx.threadId, done)
  }

  /**
   * After the last model call of a run on a durable host: compact when the
   * usage is over the context window, or over `maxTokens` with `auto` on, and
   * write the record. Custom events from `onFinish` do not reach the stream,
   * so only `onCompact` reports it.
   */
  async function afterTurn(ctx: ChatMiddlewareContext) {
    // Without a log the result could go only to a checkpoint, and that can
    // miss on the next run. The next call's own check covers it.
    const logRecords = getLogRecords(ctx, { optional: true })
    const store = storeOf(ctx)
    if (!logRecords || !store) return
    const messages = [...ctx.messages]
    const spent: { usage?: TokenUsage } = {}
    let tokens = 0
    const info = (after: number, messagesAfter: number): CompactionInfo => ({
      before: tokens,
      after,
      messagesBefore: messages.length,
      messagesAfter,
      reason: 'after-turn',
      ...(spent.usage ? { usage: spent.usage } : {}),
    })
    // The answer already streamed, so only a failed log append fails the run.
    // Other errors go to onCompact.
    const fail = (error: unknown, done = info(tokens, messages.length)) => {
      try {
        options.onCompact?.({
          ...done,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        })
      } catch {
        // An onCompact that throws here must not fail the run either.
      }
    }

    let next: Array<ModelMessage> | null
    let tokensAfter: number
    try {
      // A durable run never reuses a checkpoint. So this is true only when
      // the last call of this run compacted, and the list here is the folded
      // view that the saved usage counted.
      const counted = await countFromUsage(
        await store.get(USAGE_NAMESPACE, ctx.threadId),
        messages,
        estimate,
        compactedViews.get(ctx) === true,
      )
      if (counted === undefined) return
      tokens = counted
      const isOverflow =
        options.contextWindow !== undefined && tokens > options.contextWindow
      if (!isOverflow && !(auto && tokens > options.maxTokens)) return
      next = await strategyOf(ctx)(messages, {
        maxTokens: options.maxTokens,
        estimate,
        signal: ctx.signal,
        addUsage: (usage) => {
          spent.usage = sumUsage(spent.usage, usage)
        },
      })
      if (!next || next === messages || ctx.signal?.aborted) return
      tokensAfter = sum(next, estimate)
    } catch (error) {
      // The saved usage stays, and the next call's own check tries again.
      fail(error)
      return
    }
    const record = compactionRecord({
      reason: 'after-turn',
      before: messages,
      after: next,
      tokensBefore: tokens,
      tokensAfter,
      ...(spent.usage ? { usage: spent.usage } : {}),
    })
    // Append first, so a failed append is never reported as a success.
    // withPersistence saved the reply before this hook: it is earlier in the
    // middleware list. If it was not, firstKeptId finds the kept tail, or the
    // fold skips the record.
    await logRecords.append([record])
    const done = info(tokensAfter, next.length)
    try {
      // The saved usage counted the list before this compaction.
      await store.delete(USAGE_NAMESPACE, ctx.threadId)
      options.onCompact?.(done)
    } catch (error) {
      fail(error, done)
    }
  }

  return {
    name: 'compaction',
    optionalRequires: options.durable
      ? [MetadataCapability, LogRecordsCapability]
      : [MetadataCapability],
    compactNext: (threadId) => {
      forced.add(threadId)
    },
    async onConfig(ctx, config) {
      // init is discarded by the engine rebuild and can run before persistence
      // hydrates the thread. Compact only on model-bound phases.
      if (ctx.phase === 'init') return
      const force = forced.delete(ctx.threadId)
      const reason: CompactionReason = force ? 'forced' : 'threshold'

      const startedAt = Date.now()
      const { messages } = config
      const inputMessages = config.providerMessages ?? messages
      const store = storeOf(ctx)
      // A durable compaction goes to the log, and the fold gives the next
      // call the compacted list, so it needs no checkpoint. A list that an
      // earlier middleware made provider-only cannot be recorded.
      const logRecords =
        options.durable && inputMessages === messages
          ? getLogRecords(ctx, { optional: true })
          : undefined
      const metadata = logRecords ? undefined : store
      const checkpointKey = checkpointStrategyKey ?? 'memory'
      let workingMessages = inputMessages
      let reusedCheckpoint = false

      if (metadata && inputMessages === messages) {
        const stored = await metadata.get(CHECKPOINT_NAMESPACE, ctx.threadId)
        if (
          isCompactionCheckpoint(stored) &&
          stored.strategyKey === checkpointKey &&
          stored.sourceMessageCount <= messages.length &&
          stored.sourceHash ===
            (await hashMessages(messages.slice(0, stored.sourceMessageCount)))
        ) {
          workingMessages = [
            ...stored.compactedMessages,
            ...messages.slice(stored.sourceMessageCount),
          ]
          reusedCheckpoint = true
        }
      }
      // A reused checkpoint is always given to the model. A new compaction
      // sets this again below.
      compactedViews.set(ctx, reusedCheckpoint)

      const fromUsage =
        countUsage && store
          ? await countFromUsage(
              await store.get(USAGE_NAMESPACE, ctx.threadId),
              messages,
              estimate,
              reusedCheckpoint,
            )
          : undefined
      let before = fromUsage ?? sum(workingMessages, estimate)

      /**
       * Give the model `next` in place of `from`, and keep it: the record on
       * a durable host, else the checkpoint. Returns the count of `next`.
       */
      const commit = async (
        from: Array<ModelMessage>,
        next: Array<ModelMessage>,
        tokensBefore: number,
        why: CompactionReason,
        usage: TokenUsage | undefined,
      ) => {
        const info: CompactionInfo = {
          before: tokensBefore,
          after: sum(next, estimate),
          messagesBefore: from.length,
          messagesAfter: next.length,
          reason: why,
          ...(usage ? { usage } : {}),
        }
        options.onCompact?.(info)
        emitCompactionState(
          ctx,
          compactionStateValue({
            before: info.before,
            after: info.after,
            messagesBefore: info.messagesBefore,
            messagesAfter: info.messagesAfter,
            reusedCheckpoint,
            maxTokens: options.maxTokens,
            strategyKey: checkpointStrategyKey,
            beforeMessages: from,
            afterMessages: next,
            estimate,
          }),
        )
        emitCompactionEnded(ctx, {
          after: info.after,
          messagesAfter: info.messagesAfter,
          reusedCheckpoint,
          maxTokens: options.maxTokens,
          durationMs: Date.now() - startedAt,
          ...(checkpointStrategyKey
            ? { strategyKey: checkpointStrategyKey }
            : {}),
          reason: why,
          ...(usage ? { usage } : {}),
        })

        if (countUsage) {
          // The saved usage counted the list before this compaction.
          await store?.delete(USAGE_NAMESPACE, ctx.threadId)
        }

        if (logRecords) {
          // The model gets `next` now. The record makes the log fold the same.
          if (!ctx.signal?.aborted) {
            await logRecords.append([
              compactionRecord({
                reason: why,
                before: from,
                after: next,
                tokensBefore,
                tokensAfter: info.after,
                ...(usage ? { usage } : {}),
              }),
            ])
          }
        } else if (metadata && inputMessages === messages) {
          const checkpoint: CompactionCheckpoint = {
            schemaVersion: 1,
            sourceMessageCount: messages.length,
            sourceHash: await hashMessages(messages),
            strategyKey: checkpointKey,
            compactedMessages: next,
          }
          if (!ctx.signal?.aborted) {
            await metadata.set(CHECKPOINT_NAMESPACE, ctx.threadId, checkpoint)
          }
        }

        compactedViews.set(ctx, true)
        return info.after
      }

      /**
       * Apply the ready background summary of the thread, or drop it when it
       * no longer fits: a newer compaction cut past its kept message, or,
       * without a kept id, the messages before the cut changed. Returns the
       * new list, or `undefined`.
       */
      const applyReady = async () => {
        const readyStore = backgroundStore(ctx)
        const ready = await readyStore.get(BACKGROUND_NAMESPACE, ctx.threadId)
        if (!isBackgroundReady(ready)) return undefined
        await readyStore.delete(BACKGROUND_NAMESPACE, ctx.threadId)
        const { record, prefixHash } = ready
        // Without a kept id, the messages before the cut must be the ones
        // that the summary read.
        const fits =
          record.firstKeptId !== undefined ||
          (record.from <= workingMessages.length &&
            (await hashMessages(workingMessages.slice(0, record.from))) ===
              prefixHash)
        const next = fits
          ? projectCompaction({ messages: workingMessages, record })
          : undefined
        if (next) {
          await commit(
            workingMessages,
            next,
            before,
            'background',
            record.usage,
          )
          return next
        }
        const usageField = record.usage ? { usage: record.usage } : {}
        options.onCompact?.({
          before,
          after: before,
          messagesBefore: workingMessages.length,
          messagesAfter: workingMessages.length,
          reason: 'background',
          stale: true,
          ...usageField,
        })
        emitCompactionEnded(ctx, {
          after: before,
          messagesAfter: workingMessages.length,
          reusedCheckpoint,
          maxTokens: options.maxTokens,
          durationMs: Date.now() - startedAt,
          ...(checkpointStrategyKey
            ? { strategyKey: checkpointStrategyKey }
            : {}),
          reason: 'background',
          stale: true,
          ...usageField,
        })
        return undefined
      }

      // Set when a background summary was applied at this call.
      let applied = false
      if (background) {
        // ponytail: the run of the last call of each thread, in the memory
        // store (its newest 1000 threads). A forgotten thread counts as a
        // first call.
        const firstCall =
          (await memory.get(RUN_NAMESPACE, ctx.threadId)) !== ctx.runId
        if (firstCall) await memory.set(RUN_NAMESPACE, ctx.threadId, ctx.runId)
        // Over maxTokens while a summary runs: wait for it and apply it, so
        // the summary runs once, not twice. The run's signal stops the wait.
        const running =
          !force && auto && before > options.maxTokens
            ? jobs.get(ctx.threadId)
            : undefined
        if (running) await abortable(running, ctx.signal)
        // A ready summary applies at the first model call of a run, and
        // after the wait. Never in the middle of a run otherwise.
        const checked = firstCall || running !== undefined
        if (checked) {
          const next = await applyReady()
          if (next) {
            workingMessages = next
            before = sum(next, estimate)
            applied = true
          }
        }
        if (
          !force &&
          auto &&
          before > background.atTokens &&
          before <= options.maxTokens &&
          !jobs.has(ctx.threadId) &&
          // A checked call took the ready summary already.
          (checked ||
            !isBackgroundReady(
              await backgroundStore(ctx).get(
                BACKGROUND_NAMESPACE,
                ctx.threadId,
              ),
            ))
        ) {
          // The model call goes on at once, with the messages as they are.
          startBackground(
            ctx,
            [...workingMessages],
            before,
            reusedCheckpoint,
            config.wrapFetch,
          )
        }
      }
      const startedValue: CompactionStartedEventValue = {
        before,
        messagesBefore: workingMessages.length,
        reusedCheckpoint,
        maxTokens: options.maxTokens,
        ...(checkpointStrategyKey
          ? { strategyKey: checkpointStrategyKey }
          : {}),
        reason,
      }

      if (!force && (!auto || before <= options.maxTokens)) {
        // A background summary was applied above, and its events went out.
        if (applied) return { providerMessages: workingMessages }
        if (reusedCheckpoint) {
          emitCompactionStarted(ctx, startedValue)
          const stateValue = compactionStateValue({
            before,
            after: before,
            messagesBefore: workingMessages.length,
            messagesAfter: workingMessages.length,
            reusedCheckpoint: true,
            maxTokens: options.maxTokens,
            strategyKey: checkpointStrategyKey,
            afterMessages: workingMessages,
            estimate,
          })
          emitCompactionState(ctx, stateValue)
          emitCompactionEnded(ctx, {
            after: before,
            messagesAfter: workingMessages.length,
            reusedCheckpoint: true,
            maxTokens: options.maxTokens,
            durationMs: Date.now() - startedAt,
            ...(checkpointStrategyKey
              ? { strategyKey: checkpointStrategyKey }
              : {}),
            reason,
          })
          return { providerMessages: workingMessages }
        }
        return
      }

      emitCompactionStarted(ctx, startedValue)
      // An object, so the closure below can write it and TypeScript reads it.
      const spent: { usage?: TokenUsage } = {}
      let next: Array<ModelMessage> | null
      try {
        next = await strategyOf(ctx, config.wrapFetch)(workingMessages, {
          maxTokens: options.maxTokens,
          estimate,
          signal: ctx.signal,
          addUsage: (usage) => {
            spent.usage = sumUsage(spent.usage, usage)
          },
        })
      } catch (error) {
        emitCompactionEnded(ctx, {
          after: before,
          messagesAfter: workingMessages.length,
          reusedCheckpoint,
          maxTokens: options.maxTokens,
          durationMs: Date.now() - startedAt,
          ...(checkpointStrategyKey
            ? { strategyKey: checkpointStrategyKey }
            : {}),
          reason,
          ...(spent.usage ? { usage: spent.usage } : {}),
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        })
        // An aborted run must stop. Do not call the adapter with its signal.
        if (!options.continueOnError || ctx.signal?.aborted) throw error
        return reusedCheckpoint
          ? { providerMessages: workingMessages }
          : undefined
      }
      if (!next || next === workingMessages) {
        emitCompactionEnded(ctx, {
          after: before,
          messagesAfter: workingMessages.length,
          reusedCheckpoint,
          maxTokens: options.maxTokens,
          durationMs: Date.now() - startedAt,
          ...(checkpointStrategyKey
            ? { strategyKey: checkpointStrategyKey }
            : {}),
          reason,
          ...(spent.usage ? { usage: spent.usage } : {}),
        })
        if (reusedCheckpoint) {
          return { providerMessages: workingMessages }
        }
        return
      }

      await commit(workingMessages, next, before, reason, spent.usage)
      return { providerMessages: next }
    },
    onUsage: countUsage
      ? async (ctx, usage) => {
          const saved = await toUsageCount(
            ctx.messages,
            usage,
            compactedViews.get(ctx) ?? false,
          )
          // A cancelled call keeps the last good usage.
          if (!saved || ctx.signal?.aborted) return
          await storeOf(ctx)?.set(USAGE_NAMESPACE, ctx.threadId, saved)
        }
      : undefined,
    // Only a durable run checks after the turn (orchestrator decision).
    onFinish:
      countUsage && options.durable ? (ctx) => afterTurn(ctx) : undefined,
  }
}
