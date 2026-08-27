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
import { MetadataCapability, getMetadata } from '@tanstack/ai'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'

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

/** Payload of {@link COMPACTION_STARTED_EVENT}. */
export interface CompactionStartedEventValue {
  before: number
  messagesBefore: number
  reusedCheckpoint: boolean
  maxTokens: number
  strategyKey?: string
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
}

interface PendingCompactionCustom {
  name: CompactionStreamEventName
  value: unknown
}

interface CompactionRequestState {
  pending: Array<PendingCompactionCustom>
}

const stateByCtx = new WeakMap<ChatMiddlewareContext, CompactionRequestState>()

function stageCompactionCustom(
  ctx: ChatMiddlewareContext,
  name: CompactionStreamEventName,
  value: unknown,
) {
  let state = stateByCtx.get(ctx)
  if (!state) {
    state = { pending: [] }
    stateByCtx.set(ctx, state)
  }
  state.pending.push({ name, value })
}

function stageCompactionCycle(
  ctx: ChatMiddlewareContext,
  stateValue: CompactionStateEventValue,
  durationMs: number,
) {
  stageCompactionCustom(ctx, COMPACTION_STARTED_EVENT, {
    before: stateValue.before,
    messagesBefore: stateValue.messagesBefore,
    reusedCheckpoint: stateValue.reusedCheckpoint,
    maxTokens: stateValue.maxTokens,
    ...(stateValue.strategyKey ? { strategyKey: stateValue.strategyKey } : {}),
  } satisfies CompactionStartedEventValue)
  stageCompactionCustom(ctx, COMPACTION_STATE_EVENT, stateValue)
  stageCompactionCustom(ctx, COMPACTION_ENDED_EVENT, {
    after: stateValue.after,
    messagesAfter: stateValue.messagesAfter,
    reusedCheckpoint: stateValue.reusedCheckpoint,
    maxTokens: stateValue.maxTokens,
    durationMs,
    ...(stateValue.strategyKey ? { strategyKey: stateValue.strategyKey } : {}),
  } satisfies CompactionEndedEventValue)
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

async function hashMessages(
  messages: ReadonlyArray<ModelMessage>,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(messages))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
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
  /**
   * Stable identity for persisted checkpoints. Set this for custom strategies
   * or estimators, and change it when their output can change.
   */
  strategyKey?: string
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
 * Drop the oldest messages and replace them with an LLM summary. Keeps the gist
 * of old turns at the cost of one summarization call. Wire `summarize` to
 * `summarize()` or any model call.
 */
export function summarizeOldest(options: {
  summarize: (messages: Array<ModelMessage>) => Promise<string>
  /** Tokens of recent messages to keep verbatim. Default `floor(maxTokens/2)`. */
  keepRecentTokens?: number
  /** Role of the injected summary message. Default `'assistant'`. */
  summaryRole?: 'user' | 'assistant'
}): CompactionStrategy {
  const strategy: CompactionStrategy = async (messages, ctx) => {
    const keep = options.keepRecentTokens ?? Math.floor(ctx.maxTokens / 2)
    const cut = splitAtRecent(messages, ctx.estimate, keep)
    if (cut <= 0) return null
    const summary = await options.summarize(messages.slice(0, cut))
    return [
      {
        role: options.summaryRole ?? 'assistant',
        content: `<untrusted-conversation-summary>\n${summary}\n</untrusted-conversation-summary>`,
      },
      ...messages.slice(cut),
    ]
  }
  return identifyStrategy(
    strategy,
    `summarize-oldest:${options.keepRecentTokens ?? 'half'}:${options.summaryRole ?? 'assistant'}`,
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
export function withCompaction(options: CompactionOptions): ChatMiddleware {
  const estimate = options.estimateTokens ?? estimateMessageTokens
  const strategy = options.strategy ?? evictOldest()
  const strategyKey =
    options.strategyKey ??
    (options.estimateTokens ? undefined : strategyKeys.get(strategy))
  const checkpointStrategyKey = strategyKey
    ? `${strategyKey}:maxTokens=${options.maxTokens}`
    : undefined

  return {
    name: 'compaction',
    optionalRequires: [MetadataCapability],
    async onConfig(ctx, config) {
      // init is discarded by the engine rebuild and can run before persistence
      // hydrates the thread. Compact only on model-bound phases.
      if (ctx.phase === 'init') return

      const startedAt = Date.now()
      const { messages } = config
      const inputMessages = config.providerMessages ?? messages
      const metadata = getMetadata(ctx, { optional: true })
      let workingMessages = inputMessages
      let reusedCheckpoint = false

      if (metadata && checkpointStrategyKey && inputMessages === messages) {
        const stored = await metadata.get(CHECKPOINT_NAMESPACE, ctx.threadId)
        if (
          isCompactionCheckpoint(stored) &&
          stored.strategyKey === checkpointStrategyKey &&
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

      const before = sum(workingMessages, estimate)
      if (before <= options.maxTokens) {
        if (reusedCheckpoint) {
          stageCompactionCycle(
            ctx,
            compactionStateValue({
              before,
              after: before,
              messagesBefore: workingMessages.length,
              messagesAfter: workingMessages.length,
              reusedCheckpoint: true,
              maxTokens: options.maxTokens,
              strategyKey: checkpointStrategyKey,
              afterMessages: workingMessages,
              estimate,
            }),
            Date.now() - startedAt,
          )
          return { providerMessages: workingMessages }
        }
        return
      }

      const next = await strategy(workingMessages, {
        maxTokens: options.maxTokens,
        estimate,
      })
      if (!next || next === workingMessages) {
        if (reusedCheckpoint) {
          stageCompactionCycle(
            ctx,
            compactionStateValue({
              before,
              after: before,
              messagesBefore: workingMessages.length,
              messagesAfter: workingMessages.length,
              reusedCheckpoint: true,
              maxTokens: options.maxTokens,
              strategyKey: checkpointStrategyKey,
              afterMessages: workingMessages,
              estimate,
            }),
            Date.now() - startedAt,
          )
          return { providerMessages: workingMessages }
        }
        return
      }

      const info = {
        before,
        after: sum(next, estimate),
        messagesBefore: workingMessages.length,
        messagesAfter: next.length,
      }
      options.onCompact?.(info)
      stageCompactionCycle(
        ctx,
        compactionStateValue({
          ...info,
          reusedCheckpoint,
          maxTokens: options.maxTokens,
          strategyKey: checkpointStrategyKey,
          beforeMessages: workingMessages,
          afterMessages: next,
          estimate,
        }),
        Date.now() - startedAt,
      )

      if (metadata && checkpointStrategyKey && inputMessages === messages) {
        const checkpoint: CompactionCheckpoint = {
          schemaVersion: 1,
          sourceMessageCount: messages.length,
          sourceHash: await hashMessages(messages),
          strategyKey: checkpointStrategyKey,
          compactedMessages: next,
        }
        if (!ctx.signal?.aborted) {
          await metadata.set(CHECKPOINT_NAMESPACE, ctx.threadId, checkpoint)
        }
      }

      return { providerMessages: next }
    },
    onChunk(ctx, chunk) {
      const state = stateByCtx.get(ctx)
      if (!state?.pending.length) return
      const pending = state.pending.splice(0)
      const customs: Array<StreamChunk> = pending.map((event) => ({
        type: 'CUSTOM',
        name: event.name,
        value: event.value,
        timestamp: Date.now(),
      }))
      return [chunk, ...customs]
    },
  }
}
