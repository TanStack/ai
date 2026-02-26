import type { ModelMessage, StreamChunk, Tool, ToolCall } from '../../../types'

// ===========================
// Middleware Context
// ===========================

/**
 * Phase of the chat middleware lifecycle.
 * - 'init': Initial config transform before the chat engine starts
 * - 'beforeModel': Before each adapter chatStream call (per agent iteration)
 * - 'modelStream': During model streaming
 * - 'beforeTools': Before tool execution phase
 * - 'afterTools': After tool execution phase
 */
export type ChatMiddlewarePhase =
  | 'init'
  | 'beforeModel'
  | 'modelStream'
  | 'beforeTools'
  | 'afterTools'

/**
 * Stable context object passed to all middleware hooks.
 * Created once per chat() invocation and shared across all hooks.
 */
export interface ChatMiddlewareContext {
  /** Unique identifier for this chat request */
  requestId: string
  /** Unique identifier for this stream */
  streamId: string
  /** Conversation identifier, if provided by the caller */
  conversationId?: string
  /** Current lifecycle phase */
  phase: ChatMiddlewarePhase
  /** Current agent loop iteration (0-indexed) */
  iteration: number
  /** Running count of chunks yielded so far */
  chunkIndex: number
  /** Abort signal from the chat request */
  signal?: AbortSignal
  /** Abort the chat run with a reason */
  abort: (reason?: string) => void
  /** Opaque user-provided value from chat() options */
  context: unknown
  /**
   * Defer a non-blocking side-effect promise.
   * Deferred promises do not block streaming and are awaited
   * after the terminal hook (onFinish/onAbort/onError).
   */
  defer: (promise: Promise<unknown>) => void
}

// ===========================
// Config passed to onConfig
// ===========================

/**
 * Chat configuration that middleware can observe or transform.
 * This is a subset of the chat engine's effective configuration
 * that middleware is allowed to modify.
 */
export interface ChatMiddlewareConfig {
  messages: Array<ModelMessage>
  systemPrompts: Array<string>
  tools: Array<Tool>
  temperature?: number
  topP?: number
  maxTokens?: number
  metadata?: Record<string, unknown>
  modelOptions?: Record<string, unknown>
}

// ===========================
// Tool Call Hook Context
// ===========================

/**
 * Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).
 */
export interface ToolCallHookContext {
  /** The tool call being executed */
  toolCall: ToolCall
  /** The resolved tool definition, if found */
  tool: Tool | undefined
  /** Parsed arguments for the tool call */
  args: unknown
  /** Name of the tool */
  toolName: string
  /** ID of the tool call */
  toolCallId: string
}

/**
 * Decision returned from onBeforeToolCall.
 * - undefined/void: continue with normal execution
 * - { type: 'transformArgs', args }: replace args used for execution
 * - { type: 'skip', result }: skip execution, use provided result
 * - { type: 'abort', reason }: abort the entire chat run
 */
export type BeforeToolCallDecision =
  | void
  | undefined
  | null
  | { type: 'transformArgs'; args: unknown }
  | { type: 'skip'; result: unknown }
  | { type: 'abort'; reason?: string }

/**
 * Outcome information provided to onAfterToolCall.
 */
export interface AfterToolCallInfo {
  /** The tool call that was executed */
  toolCall: ToolCall
  /** The resolved tool definition */
  tool: Tool | undefined
  /** Name of the tool */
  toolName: string
  /** ID of the tool call */
  toolCallId: string
  /** Whether the execution succeeded */
  ok: boolean
  /** Duration of tool execution in milliseconds */
  duration: number
  /** The result (if ok) or error (if not ok) */
  result?: unknown
  error?: unknown
}

// ===========================
// Usage Info
// ===========================

/**
 * Token usage statistics passed to the onUsage hook.
 * Extracted from the RUN_FINISHED chunk when usage data is present.
 */
export interface UsageInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

// ===========================
// Terminal Hook Info
// ===========================

/**
 * Information passed to onFinish.
 */
export interface FinishInfo {
  /** The finish reason from the last model response */
  finishReason: string | null
  /** Total duration of the chat run in milliseconds */
  duration: number
  /** Final accumulated text content */
  content: string
  /** Final usage totals, if available */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Information passed to onAbort.
 */
export interface AbortInfo {
  /** The reason for the abort, if provided */
  reason?: string
  /** Duration until abort in milliseconds */
  duration: number
}

/**
 * Information passed to onError.
 */
export interface ErrorInfo {
  /** The error that caused the failure */
  error: unknown
  /** Duration until error in milliseconds */
  duration: number
}

// ===========================
// Middleware Interface
// ===========================

/**
 * Chat middleware interface.
 *
 * All hooks are optional. Middleware is composed in array order:
 * - `onConfig`: config piped through middlewares in order (first transform influences later)
 * - `onChunk`: each output chunk is fed into the next middleware in order
 *
 * @example Logging middleware
 * ```ts
 * const loggingMiddleware: ChatMiddleware = {
 *   name: 'logging',
 *   onStart(ctx) { console.log('Chat started', ctx.requestId) },
 *   onChunk(ctx, chunk) { console.log('Chunk:', chunk.type) },
 *   onFinish(ctx, info) { console.log('Done:', info.duration, 'ms') },
 * }
 * ```
 *
 * @example Redaction middleware
 * ```ts
 * const redactionMiddleware: ChatMiddleware = {
 *   name: 'redaction',
 *   onChunk(ctx, chunk) {
 *     if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
 *       return { ...chunk, delta: redact(chunk.delta) }
 *     }
 *   },
 * }
 * ```
 */
export interface ChatMiddleware {
  /** Optional name for debugging and identification */
  name?: string

  /**
   * Called to observe or transform the chat configuration.
   * Called at init and at the beginning of each agent iteration.
   *
   * Return a partial config to merge with the current config, or void to pass through.
   * Only the fields you return are overwritten — everything else is preserved.
   */
  onConfig?: (
    ctx: ChatMiddlewareContext,
    config: ChatMiddlewareConfig,
  ) =>
    | void
    | null
    | Partial<ChatMiddlewareConfig>
    | Promise<void | Partial<ChatMiddlewareConfig>>

  /**
   * Called when the chat run starts (after initial onConfig).
   */
  onStart?: (ctx: ChatMiddlewareContext) => void | Promise<void>

  /**
   * Called for every chunk yielded by chat().
   * Can observe, transform, expand, or drop chunks.
   *
   * @returns void (pass through), chunk (replace), chunk[] (expand), null (drop)
   */
  onChunk?: (
    ctx: ChatMiddlewareContext,
    chunk: StreamChunk,
  ) =>
    | void
    | StreamChunk
    | Array<StreamChunk>
    | null
    | Promise<void | StreamChunk | Array<StreamChunk> | null>

  /**
   * Called before a tool is executed.
   * Can observe, transform args, skip execution, or abort the run.
   */
  onBeforeToolCall?: (
    ctx: ChatMiddlewareContext,
    hookCtx: ToolCallHookContext,
  ) => BeforeToolCallDecision | Promise<BeforeToolCallDecision>

  /**
   * Called after a tool execution completes (success or failure).
   */
  onAfterToolCall?: (
    ctx: ChatMiddlewareContext,
    info: AfterToolCallInfo,
  ) => void | Promise<void>

  /**
   * Called when usage data is available from a RUN_FINISHED chunk.
   * Called once per model iteration that reports usage.
   */
  onUsage?: (
    ctx: ChatMiddlewareContext,
    usage: UsageInfo,
  ) => void | Promise<void>

  /**
   * Called when the chat run completes normally.
   * Exactly one of onFinish/onAbort/onError will be called per run.
   */
  onFinish?: (
    ctx: ChatMiddlewareContext,
    info: FinishInfo,
  ) => void | Promise<void>

  /**
   * Called when the chat run is aborted.
   * Exactly one of onFinish/onAbort/onError will be called per run.
   */
  onAbort?: (
    ctx: ChatMiddlewareContext,
    info: AbortInfo,
  ) => void | Promise<void>

  /**
   * Called when the chat run encounters an unhandled error.
   * Exactly one of onFinish/onAbort/onError will be called per run.
   */
  onError?: (
    ctx: ChatMiddlewareContext,
    info: ErrorInfo,
  ) => void | Promise<void>
}
