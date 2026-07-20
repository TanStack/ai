/**
 * Text Activity
 *
 * Handles agentic text generation, one-shot text generation, and agentic structured output.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { devtoolsMiddleware } from '@tanstack/ai-event-client'
import { undoNullWidening } from '@tanstack/ai-utils'
import { stripToSpecMiddleware } from '../../strip-to-spec-middleware'
import { streamToText } from '../../stream-to-response.js'
import { resolveDebugOption } from '../../logger/resolve'
import { EventType } from '../../types'
import { getInterruptPersistence } from '../../interrupts'
import {
  InterruptResumeValidationError,
  readUnopenedInterruptBinding,
  validateInterruptResumeBatch,
} from '../../interrupt-resume'
import {
  canonicalInterruptJson,
  digestInterruptJson,
} from '../../interrupt-serialization'
import { normalizeToolResult } from '../../utilities/tool-result'
import { isProviderExecutedToolCall } from '../../utilities/provider-executed'
import { LazyToolManager } from './tools/lazy-tool-manager'
import {
  MiddlewareAbortError,
  ToolCallManager,
  executeToolCalls,
} from './tools/tool-calls'
import {
  convertSchemaForStructuredOutput,
  convertSchemaToJsonSchema,
  isStandardSchema,
  parseWithStandardSchema,
} from './tools/schema-converter'
import {
  hashSchemaInput,
  normalizeApprovalSchema,
} from './tools/approval-schema'
import { maxIterations as maxIterationsStrategy } from './agent-loop-strategies'
import { convertMessagesToModelMessages, generateMessageId } from './messages'
import { MiddlewareRunner } from './middleware/compose'
import { provideSandboxRuntime } from './middleware/sandbox-runtime'
import { CapabilityRegistry } from './middleware/capabilities'
import { validateCapabilities } from './middleware/validate'
import { MCPManager } from './mcp/manager'
import type {
  InterruptBinding,
  InterruptRecoveryStateV1,
  InterruptSubmissionError,
  ToolApprovalResolution,
} from '../../interrupts'
import type {
  ApprovalRequest,
  ClientToolRequest,
  ToolResult,
} from './tools/tool-calls'
import type { ApprovalSchemaConfig } from './tools/tool-definition'
import type {
  AnyTextAdapter,
  StructuredOutputOptions,
  StructuredOutputResult,
} from './adapter'
import type {
  AgentLoopStrategy,
  AnyTool,
  ChatStream,
  ConstrainedModelMessage,
  CustomEvent,
  InferSchemaType,
  Interrupt,
  JSONSchema,
  LazyToolsConfig,
  MessagesSnapshotEvent,
  ModelMessage,
  RunFinishedEvent,
  SchemaInput,
  StreamChunk,
  StructuredOutputCompleteEvent,
  StructuredOutputStream,
  TextMessageContentEvent,
  TextOptions,
  ToolCall,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
  UIMessage,
} from '../../types'
import type {
  AnyChatMiddleware,
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ChatResumeToolState,
  SandboxFileHookEvent,
  StructuredOutputMiddlewareConfig,
} from './middleware/types'
import type { CheckCoverage } from './middleware/builder'
import type { SystemPrompt } from '../../system-prompts'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { ProviderTool } from '../../tools/provider-tool'
import type {
  ContextFromMiddleware,
  ContextFromTool,
  DefinedContext,
  MergeContext,
  UnionToIntersection,
} from './runtime-context-types'
import type { ChatMCPOptions } from './mcp/types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'text' as const

type AnyRuntimeTool = AnyTool
type RuntimeToolWithApproval = AnyRuntimeTool & {
  approvalSchema?: ApprovalSchemaConfig
}
const interruptBindingMetadataKey = 'tanstack:interruptBinding'

interface StructuralInterruptFailure {
  error: Error
  errors: ReadonlyArray<InterruptSubmissionError>
  recovery?: InterruptRecoveryStateV1
}

function isInterruptSubmissionError(
  value: unknown,
): value is InterruptSubmissionError {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  if (
    !('scope' in value) ||
    !('code' in value) ||
    !('message' in value) ||
    !('source' in value) ||
    !('retryable' in value) ||
    !('threadId' in value) ||
    !('interruptedRunId' in value) ||
    !('generation' in value) ||
    typeof value.code !== 'string' ||
    typeof value.message !== 'string' ||
    typeof value.retryable !== 'boolean' ||
    typeof value.threadId !== 'string' ||
    typeof value.interruptedRunId !== 'string' ||
    typeof value.generation !== 'number'
  ) {
    return false
  }
  if (value.scope === 'item') {
    return (
      'interruptId' in value &&
      typeof value.interruptId === 'string' &&
      (value.source === 'client' || value.source === 'server')
    )
  }
  return (
    value.scope === 'batch' &&
    'interruptIds' in value &&
    Array.isArray(value.interruptIds) &&
    value.interruptIds.every((id) => typeof id === 'string') &&
    (value.source === 'client' ||
      value.source === 'server' ||
      value.source === 'transport')
  )
}

function isInterruptRecoveryState(
  value: unknown,
): value is InterruptRecoveryStateV1 {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'state' in value &&
    typeof value.state === 'string' &&
    'threadId' in value &&
    typeof value.threadId === 'string' &&
    'interruptedRunId' in value &&
    typeof value.interruptedRunId === 'string' &&
    'generation' in value &&
    typeof value.generation === 'number' &&
    'pendingInterrupts' in value &&
    Array.isArray(value.pendingInterrupts)
  )
}

function structuralInterruptFailure(
  error: unknown,
): StructuralInterruptFailure | undefined {
  if (
    !(error instanceof Error) ||
    error.name !== 'InterruptResumeValidationError' ||
    !('errors' in error) ||
    !Array.isArray(error.errors) ||
    error.errors.length === 0 ||
    !error.errors.every(isInterruptSubmissionError)
  ) {
    return undefined
  }
  const recovery =
    'recovery' in error && isInterruptRecoveryState(error.recovery)
      ? error.recovery
      : undefined
  return {
    error,
    errors: error.errors,
    ...(recovery !== undefined ? { recovery } : {}),
  }
}

function normalizePublicInterruptBinding(
  value: unknown,
  expectedInterruptId: string,
): InterruptBinding | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const binding: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  )
  if (
    binding.interruptId !== expectedInterruptId ||
    typeof binding.interruptedRunId !== 'string' ||
    typeof binding.generation !== 'number' ||
    !Number.isInteger(binding.generation) ||
    binding.generation < 0 ||
    typeof binding.responseSchemaHash !== 'string' ||
    (binding.expiresAt !== undefined && typeof binding.expiresAt !== 'string')
  ) {
    return undefined
  }
  const base = {
    interruptId: binding.interruptId,
    interruptedRunId: binding.interruptedRunId,
    generation: binding.generation,
    responseSchemaHash: binding.responseSchemaHash,
    ...(typeof binding.expiresAt === 'string'
      ? { expiresAt: binding.expiresAt }
      : {}),
  }
  if (binding.kind === 'generic') {
    return { kind: binding.kind, ...base }
  }
  if (
    typeof binding.toolName !== 'string' ||
    typeof binding.toolCallId !== 'string'
  ) {
    return undefined
  }
  if (
    binding.kind === 'client-tool-execution' &&
    typeof binding.outputSchemaHash === 'string'
  ) {
    return {
      kind: binding.kind,
      ...base,
      toolName: binding.toolName,
      toolCallId: binding.toolCallId,
      outputSchemaHash: binding.outputSchemaHash,
    }
  }
  if (
    binding.kind === 'tool-approval' &&
    Object.prototype.hasOwnProperty.call(binding, 'originalArgs') &&
    typeof binding.inputSchemaHash === 'string' &&
    typeof binding.approvalSchemaHash === 'string'
  ) {
    return {
      kind: binding.kind,
      ...base,
      toolName: binding.toolName,
      toolCallId: binding.toolCallId,
      originalArgs: binding.originalArgs,
      inputSchemaHash: binding.inputSchemaHash,
      approvalSchemaHash: binding.approvalSchemaHash,
    }
  }
  return undefined
}

// The leaf context-inference primitives (KnownContext, MergeContext,
// UnionToIntersection, DefinedContext, ContextFromTool, ContextFromMiddleware)
// are shared with the tool execution layer — see ./runtime-context-types.
type ContextFromConsumer<T> = ContextFromTool<T> | ContextFromMiddleware<T>

type RequiredContextFromConsumerUnion<T> = T extends unknown
  ? undefined extends ContextFromConsumer<T>
    ? never
    : ContextFromConsumer<T>
  : never

type ContextFromConsumerUnion<T> = [
  UnionToIntersection<DefinedContext<ContextFromConsumer<T>>>,
] extends [never]
  ? never
  : [RequiredContextFromConsumerUnion<T>] extends [never]
    ? UnionToIntersection<DefinedContext<ContextFromConsumer<T>>> | undefined
    : UnionToIntersection<DefinedContext<ContextFromConsumer<T>>>

type ContextFromArray<T> = T extends readonly [infer THead, ...infer TTail]
  ? MergeContext<ContextFromConsumer<THead>, ContextFromArray<TTail>>
  : T extends ReadonlyArray<infer TItem>
    ? ContextFromConsumerUnion<TItem>
    : never

type ContextFromInputs<TTools, TMiddleware> = MergeContext<
  ContextFromArray<NonNullable<TTools>>,
  ContextFromArray<NonNullable<TMiddleware>>
>

type InferredContext<TTools, TMiddleware> = [
  ContextFromInputs<TTools, TMiddleware>,
] extends [never]
  ? unknown
  : ContextFromInputs<TTools, TMiddleware>

type RequiredContextFromInputs<TTools, TMiddleware> = [
  ContextFromInputs<TTools, TMiddleware>,
] extends [never]
  ? { context?: unknown }
  : undefined extends ContextFromInputs<TTools, TMiddleware>
    ? { context?: ContextFromInputs<TTools, TMiddleware> }
    : { context: ContextFromInputs<TTools, TMiddleware> }

type TextActivityOptionsWithContext<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined,
  TStream extends boolean,
  TTools extends TextActivityOptions<TAdapter, TSchema, TStream, any>['tools'],
  TMiddleware extends TextActivityOptions<
    TAdapter,
    TSchema,
    TStream,
    any
  >['middleware'],
> = Omit<
  TextActivityOptions<TAdapter, TSchema, TStream, any>,
  'tools' | 'middleware' | 'context'
> & {
  tools?: TTools
  middleware?: TMiddleware &
    CheckCoverage<Extract<TMiddleware, ReadonlyArray<AnyChatMiddleware>>>
} & RequiredContextFromInputs<TTools, TMiddleware>

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the text activity.
 * Types are extracted directly from the adapter (which has pre-resolved generics).
 *
 * @template TAdapter - The text adapter type (created by a provider function)
 * @template TSchema - Optional Standard Schema for structured output
 * @template TStream - Whether to stream the output (default: true)
 */
export interface TextActivityOptions<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined,
  TStream extends boolean,
  TContext = unknown,
> {
  /** The text adapter to use (created by a provider function like openaiText('gpt-5.5')) */
  adapter: TAdapter
  /**
   * Conversation messages. Accepts:
   * - `ConstrainedModelMessage` — content types constrained by the adapter's input modalities.
   * - `ModelMessage` — unconstrained model message (e.g., forwarded from an AG-UI wire payload).
   * - `UIMessage` — parts-based UI representation; converted internally via `convertMessagesToModelMessages`.
   *
   * The three shapes can be mixed in a single array (e.g., when forwarding a wire payload that includes both anchor UIMessages and AG-UI fan-out ModelMessages).
   */
  messages?:
    | Array<
        | UIMessage
        | ModelMessage
        | ConstrainedModelMessage<{
            inputModalities: TAdapter['~types']['inputModalities']
            messageMetadataByModality: TAdapter['~types']['messageMetadataByModality']
          }>
      >
    | undefined
  /**
   * System prompts to prepend to the conversation.
   *
   * Accepts plain strings or `{ content, metadata }` objects. The `metadata`
   * field is typed by the adapter — Anthropic narrows it to
   * `AnthropicSystemPromptMetadata` (with `cache_control` for prompt
   * caching), providers without per-prompt metadata reject the field
   * entirely.
   */
  systemPrompts?:
    | Array<SystemPrompt<TAdapter['~types']['systemPromptMetadata']>>
    | undefined
  /**
   * Tools for function calling (auto-executed when called).
   *
   * Accepts two shapes:
   *  - User-defined tools via `toolDefinition()` — plain `Tool`, always assignable.
   *  - Provider tools from `@tanstack/ai-<provider>/tools` (e.g. `webSearchTool`)
   *    — branded and type-checked against the selected model's
   *    `supports.tools` list. Passing an unsupported tool produces a
   *    compile-time error on the array element.
   */
  tools?:
    | Array<
        | (AnyRuntimeTool & { readonly '~toolKind'?: never })
        | ProviderTool<string, TAdapter['~types']['toolCapabilities'][number]>
      >
    | undefined
  /**
   * Hand MCP clients/pools to chat(): their tools are discovered at run start
   * and merged into the run; `connection` controls whether chat() closes them
   * when the run ends. See docs/tools/mcp.md "Managing MCP clients with chat()".
   */
  mcp?: ChatMCPOptions
  /** Additional metadata to attach to the request. */
  metadata?: TextOptions['metadata']
  /** Model-specific provider options (type comes from adapter) */
  modelOptions?: TAdapter['~types']['providerOptions']
  /** AbortController for cancellation */
  abortController?: TextOptions['abortController']
  /** Strategy for controlling the agent loop */
  agentLoopStrategy?: TextOptions['agentLoopStrategy']
  /**
   * Cap how many tool calls from a single model turn are executed.
   * Excess calls receive error results. See {@link TextOptions.maxToolCallsPerTurn}.
   */
  maxToolCallsPerTurn?: TextOptions['maxToolCallsPerTurn']
  /**
   * Optional configuration for lazy-tool discovery (tools marked `lazy: true`).
   * Tunes how much of each lazy tool's description appears in the discovery
   * catalog. Optional — defaults to `{ includeDescription: 'none' }`.
   */
  lazyToolsConfig?: LazyToolsConfig
  /** Unique conversation identifier for tracking */
  conversationId?: TextOptions['conversationId']
  /** Thread/conversation ID for AG-UI protocol. Auto-generated if not provided. */
  threadId?: TextOptions['threadId']
  /** Run ID override for AG-UI protocol. Auto-generated by adapter if not provided. */
  runId?: TextOptions['runId']
  /** Parent run ID for AG-UI protocol nested run correlation. */
  parentRunId?: TextOptions['parentRunId']
  /** Application state mirrored in a STATE_SNAPSHOT before an interrupt terminal. */
  state?: TextOptions['state']
  /**
   * AG-UI interrupt resume responses. Persistence middleware validates these
   * before accepting new input on a thread with pending interrupts.
   */
  resume?: TextOptions['resume']
  /**
   * Optional Standard Schema for structured output.
   * When provided, the activity will:
   * 1. Run the full agentic loop (executing tools as needed)
   * 2. Once complete, return a Promise with the parsed output matching the schema
   *
   * Supports any Standard Schema compliant library (Zod v4+, ArkType, Valibot, etc.)
   *
   * @example
   * ```ts
   * const result = await chat({
   *   adapter: openaiText('gpt-5.5'),
   *   messages: [{ role: 'user', content: 'Generate a person' }],
   *   outputSchema: z.object({ name: z.string(), age: z.number() })
   * })
   * // result is { name: string, age: number }
   * ```
   */
  outputSchema?: TSchema
  /**
   * Whether to stream the text result.
   * When true (default), returns an AsyncIterable<StreamChunk> for streaming output.
   * When false, returns a Promise<string> with the collected text content.
   *
   * Note: If outputSchema is provided, this option is ignored and the result
   * is always a Promise<InferSchemaType<TSchema>>.
   *
   * @default true
   *
   * @example Non-streaming text
   * ```ts
   * const text = await chat({
   *   adapter: openaiText('gpt-5.5'),
   *   messages: [{ role: 'user', content: 'Hello!' }],
   *   stream: false
   * })
   * // text is a string with the full response
   * ```
   */
  stream?: TStream
  /**
   * Optional middleware array for observing/transforming chat behavior.
   * Middleware hooks are called in array order. See {@link ChatMiddleware} for available hooks.
   *
   * @example
   * ```ts
   * const stream = chat({
   *   adapter: openaiText('gpt-5.5'),
   *   messages: [...],
   *   middleware: [loggingMiddleware, redactionMiddleware],
   * })
   * ```
   */
  middleware?: Array<ChatMiddleware<TContext>>
  /**
   * Runtime context value passed to middleware hooks and server tools.
   */
  context?: TContext
  /**
   * Enable debug logging. Pass `true` to enable all categories with the default
   * console logger, `false` to silence everything, or a `DebugConfig` object for
   * granular control and/or a custom `Logger`. Defaults to `undefined`, which
   * means only the `errors` category is active.
   */
  debug?: DebugOption
}

// ===========================
// Chat Options Helper
// ===========================

/**
 * Create typed options for the chat() function without executing.
 * This is useful for pre-defining configurations with full type inference.
 *
 * @example
 * ```ts
 * const chatOptions = createChatOptions({
 *   adapter: anthropicText('claude-sonnet-4-5'),
 * })
 *
 * const stream = chat({ ...chatOptions, messages })
 * ```
 */
export function createChatOptions<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined = undefined,
  TStream extends boolean = true,
  const TTools extends TextActivityOptions<
    TAdapter,
    TSchema,
    TStream,
    any
  >['tools'] = TextActivityOptions<TAdapter, TSchema, TStream, any>['tools'],
  const TMiddleware extends TextActivityOptions<
    TAdapter,
    TSchema,
    TStream,
    any
  >['middleware'] = TextActivityOptions<
    TAdapter,
    TSchema,
    TStream,
    any
  >['middleware'],
>(
  options: TextActivityOptionsWithContext<
    TAdapter,
    TSchema,
    TStream,
    TTools,
    TMiddleware
  >,
): TextActivityOptions<
  TAdapter,
  TSchema,
  TStream,
  InferredContext<TTools, TMiddleware>
> {
  return options
}

// ===========================
// Activity Result Type
// ===========================

/**
 * Result type for the text activity.
 * - If outputSchema is provided AND stream is explicitly true:
 *   StructuredOutputStream<InferSchemaType<TSchema>> — yields raw JSON deltas
 *   via TEXT_MESSAGE_CONTENT plus a terminal StructuredOutputCompleteEvent
 *   carrying the validated object.
 * - If outputSchema is provided without explicit stream:true:
 *   Promise<InferSchemaType<TSchema>>.
 * - If stream is explicitly false (no schema): Promise<string>.
 * - Otherwise (default): AsyncIterable<StreamChunk>.
 *
 * `[TStream] extends [true]` is used (not `TStream extends true`) so that the
 * default `boolean` value of `TStream` does *not* match the streaming branch.
 * Without this, plain `chat({ outputSchema })` would type as a stream while
 * the runtime returns a Promise — see issue #526.
 */
export type TextActivityResult<
  TSchema extends SchemaInput | undefined,
  TStream extends boolean = boolean,
> = TSchema extends SchemaInput
  ? [TStream] extends [true]
    ? StructuredOutputStream<InferSchemaType<TSchema>>
    : Promise<InferSchemaType<TSchema>>
  : [TStream] extends [false]
    ? Promise<string>
    : ChatStream

// ===========================
// ChatEngine Implementation
// ===========================

interface TextEngineConfig<
  TAdapter extends AnyTextAdapter,
  TContext = unknown,
  TParams extends TextOptions<any, any, TContext> = TextOptions<
    any,
    any,
    TContext
  >,
> {
  adapter: TAdapter
  systemPrompts?: Array<SystemPrompt>
  params: TParams
  middleware?: Array<ChatMiddleware<TContext>>
  context?: TContext
  /**
   * If set, after the agent loop finishes the engine runs a
   * structured-output finalization step through the same middleware
   * pipeline. See `runStructuredFinalization` for the flow.
   *
   * - jsonSchema: the JSON Schema to send to the provider
   * - yieldChunks: when true, finalization chunks are yielded to the caller
   *   (used by runStreamingStructuredOutput). When false, chunks are
   *   consumed internally for middleware visibility but not yielded
   *   (used by runAgenticStructuredOutput).
   * - normalize: optional schema-aware transform applied to the captured
   *   structured-output object the moment it enters the engine — BEFORE it is
   *   stored, validated, or yielded. Used to undo strict-mode null-widening
   *   (`undoNullWidening`): strict schemas widen optional fields to
   *   `required` + nullable so the provider returns `null` for an absent
   *   optional, and this strips exactly those synthesized nulls while keeping
   *   the ones a `.nullable()` field genuinely allows. Applied here (not in
   *   the adapter) because the engine is the only layer holding the original
   *   schema's null-widening map, and applying it at capture fixes BOTH the
   *   streaming chunk and the Promise<T> result with one transform.
   * - validate: optional callback invoked AFTER `normalize` and AFTER the
   *   structured-output result is captured, but BEFORE the terminal hook
   *   fires. If it throws, the engine records a `finalizationError` and fires
   *   `onError` instead of `onFinish` (per spec §7.3). On success, the
   *   returned value is stored as the validated result and retrievable via
   *   `getValidatedStructuredOutput()`. Used by `runAgenticStructuredOutput`
   *   to perform Standard Schema validation inside the engine.
   * - nativeCombined: when true, the adapter declared
   *   `supportsCombinedToolsAndSchema()` and the engine wires `jsonSchema`
   *   into the regular `chatStream` call instead of running a separate
   *   finalization round-trip. The agent loop's final-turn text is the
   *   schema-constrained JSON; the engine parses it from accumulated
   *   content. The `'structuredOutput'` middleware phase does NOT fire on
   *   this path — middleware sees the run through `beforeModel` /
   *   `modelStream` as usual.
   */
  finalStructuredOutput?: {
    jsonSchema: JSONSchema
    yieldChunks: boolean
    normalize?: (data: unknown) => unknown
    validate?: (data: unknown) => unknown
    nativeCombined?: boolean
  }
}

type ToolPhaseResult = 'continue' | 'stop' | 'wait'
type CyclePhase = 'processText' | 'executeToolCalls'

/**
 * Validate and normalize `maxToolCallsPerTurn`.
 * Unset → unlimited. `0` → execute none. Negatives / non-finite → throw
 * (Array#slice treats negatives as "from end", which is not a useful cap).
 */
function resolveMaxToolCallsPerTurn(
  cap: number | undefined,
): number | undefined {
  if (cap == null) return undefined
  if (!Number.isFinite(cap) || cap < 0) {
    throw new Error(
      `maxToolCallsPerTurn must be a non-negative finite number, got ${cap}`,
    )
  }
  return Math.floor(cap)
}

/**
 * Combine two optional AbortSignals into one that aborts when either does.
 * Returns the other signal directly when one is absent or already aborted.
 * (Manual implementation — `AbortSignal.any` requires Node >= 20.3.)
 */
function combineAbortSignals(
  a: AbortSignal | undefined,
  b: AbortSignal | undefined,
): AbortSignal | undefined {
  if (!a) return b
  if (!b) return a
  if (a.aborted) return a
  if (b.aborted) return b
  const controller = new AbortController()
  const onAbort = (source: AbortSignal) => () => {
    controller.abort(source.reason)
  }
  a.addEventListener('abort', onAbort(a), { once: true })
  b.addEventListener('abort', onAbort(b), { once: true })
  return controller.signal
}

class TextEngine<
  TAdapter extends AnyTextAdapter,
  TContext = unknown,
  TParams extends TextOptions<any, any, TContext> = TextOptions<
    any,
    any,
    TContext
  >,
> {
  private readonly adapter: TAdapter
  private params: TParams
  private systemPrompts: Array<SystemPrompt>
  private tools: Array<AnyRuntimeTool>
  private readonly loopStrategy: AgentLoopStrategy
  private toolCallManager: ToolCallManager<ReadonlyArray<AnyTool>, TContext>
  private readonly lazyToolManager: LazyToolManager
  private readonly initialMessageCount: number
  private readonly requestId: string
  private readonly streamId: string
  private readonly effectiveRequest?: Request | RequestInit
  private readonly effectiveSignal?: AbortSignal

  private messages: Array<ModelMessage>
  private iterationCount = 0
  /** Cumulative tool calls counted in this run (emitted + pending resume). */
  private toolCallCount = 0
  /** Tool calls in the most recent budgeted batch (0 when none). */
  private lastTurnToolCallCount = 0
  /** Tool call IDs already counted toward `toolCallCount` (avoids double-count on resume). */
  private readonly countedToolCallIds = new Set<string>()
  private lastFinishReason: string | null = null
  private streamStartTime = 0
  private totalChunkCount = 0
  private currentMessageId: string | null = null
  private accumulatedContent = ''
  private accumulatedThinking: Array<{ content: string; signature?: string }> =
    []
  private currentThinkingContent = ''
  private currentThinkingSignature = ''
  private eventOptions?: Record<string, unknown> | undefined
  private eventToolNames?: Array<string>
  private finishedEvent: RunFinishedEvent | null = null
  private deferredToolCallRunFinishedChunks: Array<StreamChunk> = []
  private earlyTermination = false
  private toolPhase: ToolPhaseResult = 'continue'
  private cyclePhase: CyclePhase = 'processText'
  private readonly maxToolCallsPerTurn: number | undefined
  // Client state extracted from initial messages (before conversion to ModelMessage)
  private readonly initialApprovals: Map<string, ToolApprovalResolution>
  private readonly initialClientToolResults: Map<string, any>
  private readonly resumeApprovals = new Map<string, ToolApprovalResolution>()
  private readonly resumeClientToolResults = new Map<string, any>()
  private readonly resumeDeniedToolResults = new Map<string, unknown>()
  private readonly resumeCancelledToolCallIds = new Set<string>()

  // AG-UI protocol IDs
  private readonly threadId: string
  private readonly runIdOverride?: string
  private readonly parentRunIdOverride?: string

  // Middleware support
  private readonly middlewareRunner: MiddlewareRunner<TContext>
  private readonly middlewareCtx: ChatMiddlewareContext<TContext>
  private readonly sandboxFileQueue: Array<StreamChunk> = []
  private readonly deferredPromises: Array<Promise<unknown>> = []
  private abortReason?: string
  private readonly middlewareAbortController?: AbortController
  // Combines the caller's signal with middleware abort() so running tools
  // observe both cancellation sources via ctx.abortSignal.
  private readonly toolAbortSignal?: AbortSignal
  private terminalHookCalled = false

  private readonly logger: InternalLogger

  // Structured-output finalization state (populated by runStructuredFinalization)
  private structuredOutputResult: { data: unknown; rawText: string } | null =
    null
  // Native combined mode: tracks whether we've already emitted the synthetic
  // `structured-output.start` event before the schema-constrained final-turn
  // text begins streaming. The event must precede the first
  // TEXT_MESSAGE_START so the client-side StreamProcessor routes the JSON
  // deltas into a StructuredOutputPart instead of a plain TextPart.
  private combinedStartEmitted = false
  // Native combined mode: messageId we want the synthetic
  // `structured-output.start` (and any error emitted before deltas arrive)
  // to carry, so the client matches it to the streaming text deltas.
  private combinedStructuredMessageId: string | null = null
  // Holds the validated value when `finalStructuredOutput.validate` is provided
  // and succeeds. Distinct from `structuredOutputResult.data` (the normalized
  // but unvalidated payload from the structured-output.complete chunk).
  private validatedStructuredOutput: unknown = undefined
  private hasValidatedStructuredOutput = false
  private finalizationError: {
    message: string
    code?: string
    cause?: unknown
  } | null = null
  private readonly finalStructuredOutput?: {
    jsonSchema: JSONSchema
    yieldChunks: boolean
    normalize?: (data: unknown) => unknown
    validate?: (data: unknown) => unknown
    nativeCombined?: boolean
  }

  constructor(
    config: TextEngineConfig<TAdapter, TContext, TParams>,
    logger: InternalLogger,
  ) {
    this.logger = logger
    this.adapter = config.adapter
    this.finalStructuredOutput = config.finalStructuredOutput
    this.params = config.params
    this.systemPrompts = config.params.systemPrompts || []
    this.loopStrategy =
      config.params.agentLoopStrategy || maxIterationsStrategy(5)
    this.maxToolCallsPerTurn = resolveMaxToolCallsPerTurn(
      config.params.maxToolCallsPerTurn,
    )
    this.initialMessageCount = config.params.messages.length

    // Extract client state (approvals, client tool results) from original messages BEFORE conversion
    // This preserves UIMessage parts data that would be lost during conversion to ModelMessage
    const { approvals, clientToolResults } =
      this.extractClientStateFromOriginalMessages(
        config.params.messages as Array<any>,
      )
    this.initialApprovals = approvals
    this.initialClientToolResults = clientToolResults

    // Convert messages to ModelMessage format (handles both UIMessage and ModelMessage input)
    // This ensures consistent internal format regardless of what the client sends
    this.messages = convertMessagesToModelMessages(config.params.messages)

    // Initialize lazy tool manager after messages are converted (needs message history for scanning)
    this.lazyToolManager = new LazyToolManager(
      config.params.tools || [],
      this.messages,
      config.params.lazyToolsConfig,
    )
    this.tools = this.lazyToolManager.getActiveTools()
    this.toolCallManager = new ToolCallManager<
      ReadonlyArray<AnyTool>,
      TContext
    >(this.tools)
    this.requestId = this.createId('chat')
    this.streamId = this.createId('stream')
    this.effectiveRequest = config.params.abortController
      ? { signal: config.params.abortController.signal }
      : undefined
    this.effectiveSignal = config.params.abortController?.signal
    // `conversationId` is the legacy alias of `threadId` — accept it
    // as a fallback so `chat({ conversationId })` keeps working, with
    // explicit `threadId` winning when both are set.
    this.threadId =
      config.params.threadId ||
      config.params.conversationId ||
      this.createId('thread')
    this.runIdOverride = config.params.runId
    this.parentRunIdOverride = config.params.parentRunId

    // Initialize middleware — devtools first, strip-to-spec always last.
    // handleStreamChunk processes raw chunks BEFORE middleware, so internal
    // state management sees extended fields (finishReason, delta, toolCallName, etc.).
    // The strip middleware ensures the yielded public stream is AG-UI spec-compliant.
    const allMiddleware: Array<ChatMiddleware<TContext>> = [
      devtoolsMiddleware(),
      ...(config.middleware || []),
      stripToSpecMiddleware(),
    ]
    this.middlewareRunner = new MiddlewareRunner(allMiddleware, logger)
    this.middlewareAbortController = new AbortController()
    this.toolAbortSignal = combineAbortSignals(
      this.effectiveSignal,
      this.middlewareAbortController.signal,
    )
    this.middlewareCtx = {
      requestId: this.requestId,
      streamId: this.streamId,
      runId: this.runIdOverride ?? this.requestId,
      parentRunId: this.parentRunIdOverride,
      threadId: this.threadId,
      // Legacy alias kept on the ctx so middleware that reads
      // `ctx.conversationId` keeps working. Always equals `threadId`.
      conversationId: this.threadId,
      phase: 'init',
      iteration: 0,
      chunkIndex: 0,
      signal: this.effectiveSignal,
      abort: (reason?: string) => {
        this.abortReason = reason
        this.middlewareAbortController?.abort(reason)
      },
      context: config.context as TContext,
      defer: (promise: Promise<unknown>) => {
        this.deferredPromises.push(promise)
      },
      // Provider / adapter info
      activity: 'chat',
      provider: config.adapter.name,
      model: config.params.model,
      source: 'server',
      streaming: true,
      // Config-derived (updated in beforeRun and applyMiddlewareConfig)
      systemPrompts: this.systemPrompts,
      toolNames: undefined,
      options: undefined,
      modelOptions: config.params.modelOptions,
      // Computed
      messageCount: this.initialMessageCount,
      hasTools: this.tools.length > 0,
      // Mutable per-iteration
      currentMessageId: null,
      accumulatedContent: '',
      // References
      messages: this.messages,
      createId: (prefix: string) => this.createId(prefix),
      // Capability bookkeeping for this request (populated by middleware setup)
      capabilities: new CapabilityRegistry(),
      // Convenience accessors that delegate to a capability handle's own
      // tuple getter/provider, keyed by this context. `getX(ctx)` and
      // `ctx.get(X)` are interchangeable.
      get: (capability) => capability[0](this.middlewareCtx),
      getOptional: (capability) =>
        capability[0](this.middlewareCtx, { optional: true }),
      provide: (capability, value) => capability[1](this.middlewareCtx, value),
    }

    // Provide the internal SandboxRuntime capability so harness adapters and
    // sandbox middleware can emit file events. The sink logs, fans the event
    // out through the middleware `onFile*` hooks (fire-and-forget), and queues
    // a `sandbox.file` custom chunk to be drained into the public stream.
    provideSandboxRuntime(this.middlewareCtx, {
      logger: this.logger,
      emit: (event: SandboxFileHookEvent) => {
        this.logger.sandbox(`file ${event.type} ${event.path}`, {
          event: {
            type: event.type,
            path: event.path,
            timestamp: event.timestamp,
          },
        })
        void this.middlewareRunner
          .runSandboxFile(this.middlewareCtx, event)
          .catch((err: unknown) => {
            this.logger.errors('sandbox file hook failed', { error: err })
          })
        this.sandboxFileQueue.push(
          this.createCustomEventChunk('sandbox.file', {
            type: event.type,
            path: event.path,
            timestamp: event.timestamp,
          }),
        )
      },
      emitFileDiff: (value: { path: string; diff: string }) => {
        this.sandboxFileQueue.push(
          this.createCustomEventChunk('sandbox.file.diff', value),
        )
      },
    })
  }

  /** Get the accumulated content after the chat loop completes */
  getAccumulatedContent(): string {
    return this.accumulatedContent
  }

  /** Get the final messages array after the chat loop completes */
  getMessages(): Array<ModelMessage> {
    return this.messages
  }

  /** Returns the structured-output result if finalization ran successfully. */
  getStructuredOutputResult(): { data: unknown; rawText: string } | null {
    return this.structuredOutputResult
  }

  /**
   * Returns the validated structured-output value (the result of running
   * `finalStructuredOutput.validate` against the raw structured-output data)
   * wrapped in a `{ value }` object so callers can distinguish "no validation
   * happened" from "validation produced undefined". Returns `null` when no
   * validator was configured or validation hasn't been performed yet.
   */
  getValidatedStructuredOutput(): { value: unknown } | null {
    return this.hasValidatedStructuredOutput
      ? { value: this.validatedStructuredOutput }
      : null
  }

  /** Returns the recorded finalization error, if any. */
  getFinalizationError(): {
    message: string
    code?: string
    cause?: unknown
  } | null {
    return this.finalizationError
  }

  async *run(): AsyncGenerator<StreamChunk> {
    this.beforeRun()
    this.logger.agentLoop('run started', {
      threadId: this.middlewareCtx.threadId,
    })

    try {
      // Provision capabilities before any consumer (onConfig onward) can read them
      await this.middlewareRunner.runSetup(this.middlewareCtx)

      // Run initial onConfig (phase = init)
      this.middlewareCtx.phase = 'init'
      const initialConfig = this.buildMiddlewareConfig()
      const transformedConfig = await this.middlewareRunner.runOnConfig(
        this.middlewareCtx,
        initialConfig,
      )
      this.applyMiddlewareConfig(transformedConfig)
      await this.applyEphemeralInterruptResume(transformedConfig)

      // Run onStart (devtools middleware emits text:request:started and initial messages here)
      await this.middlewareRunner.runOnStart(this.middlewareCtx)

      const pendingPhase = yield* this.checkForPendingToolCalls()
      if (pendingPhase === 'wait') {
        return
      }

      // Skip the agent loop entirely when there are no tools AND a separate
      // structured-output finalization will run. Without tools the model has
      // nothing to do in the loop, so executing one iteration would burn an
      // extra provider call before the finalization request.
      //
      // Native combined mode does NOT skip — the agent loop itself produces
      // the schema-constrained final answer in one pass (model emits the
      // schema-constrained text on its natural final turn). Even with zero
      // tools, the single chatStream call IS the structured-output call.
      const skipAgentLoop =
        !!this.finalStructuredOutput &&
        this.tools.length === 0 &&
        this.finalStructuredOutput.nativeCombined !== true

      if (!skipAgentLoop) {
        do {
          if (this.earlyTermination || this.isCancelled()) {
            return
          }

          this.logger.agentLoop(`iteration=${this.middlewareCtx.iteration}`, {
            iteration: this.middlewareCtx.iteration,
          })

          await this.beginCycle()

          if (this.cyclePhase === 'processText') {
            // Run onConfig before each model call (phase = beforeModel)
            this.middlewareCtx.phase = 'beforeModel'
            this.middlewareCtx.iteration = this.iterationCount
            const iterConfig = this.buildMiddlewareConfig()
            const iterTransformedConfig =
              await this.middlewareRunner.runOnConfig(
                this.middlewareCtx,
                iterConfig,
              )
            this.applyMiddlewareConfig(iterTransformedConfig)

            yield* this.streamModelResponse()
          } else {
            yield* this.processToolCalls()
          }

          this.endCycle()
        } while (this.shouldContinue())
      }

      this.logger.agentLoop('run finished', {
        finishReason: this.lastFinishReason,
      })

      // After the agent loop ends, if a structured-output finalization was
      // requested AND the run hasn't already errored/aborted, run it through
      // the middleware pipeline. The terminal hook fires once at the very
      // end (after finalization), not after the agent loop.
      // Actionable waits already emitted a RUN_FINISHED interrupt terminal, so
      // do not run finalization after `processToolCalls()` pauses the stream.
      //
      // Native combined mode takes a different path: the agent loop's final-
      // turn text IS the schema-constrained JSON, so we harvest it from
      // `accumulatedContent` instead of issuing a second provider call.
      if (
        this.finalStructuredOutput &&
        this.toolPhase !== 'wait' &&
        !this.isCancelled() &&
        !this.finalizationError
      ) {
        if (this.finalStructuredOutput.nativeCombined === true) {
          yield* this.harvestCombinedStructuredOutput()
        } else {
          yield* this.runStructuredFinalization()
        }
      }

      // Call terminal hook (skip when waiting for client — stream is paused, not finished).
      // Priority: finalizationError → onError; otherwise normal onFinish.
      // Skip on cancellation — the finally block routes aborts to onAbort.
      if (
        !this.terminalHookCalled &&
        this.toolPhase !== 'wait' &&
        !this.isCancelled()
      ) {
        if (this.finalizationError) {
          this.terminalHookCalled = true
          const errForHook = new Error(
            this.finalizationError.message,
            this.finalizationError.cause !== undefined
              ? { cause: this.finalizationError.cause }
              : undefined,
          )
          if (this.finalizationError.code !== undefined) {
            Object.defineProperty(errForHook, 'code', {
              value: this.finalizationError.code,
              enumerable: true,
            })
          }
          await this.middlewareRunner.runOnError(this.middlewareCtx, {
            error: errForHook,
            duration: Date.now() - this.streamStartTime,
          })
        } else {
          this.terminalHookCalled = true
          await this.middlewareRunner.runOnFinish(this.middlewareCtx, {
            finishReason: this.lastFinishReason,
            duration: Date.now() - this.streamStartTime,
            content: this.accumulatedContent,
            usage: this.finishedEvent?.usage,
          })
        }
      }
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === 'InterruptReplaySignal' &&
        'continuationRunId' in error &&
        typeof error.continuationRunId === 'string'
      ) {
        this.terminalHookCalled = true
        yield {
          type: EventType.RUN_FINISHED,
          timestamp: Date.now(),
          threadId: this.threadId,
          runId: this.runIdOverride ?? this.requestId,
          finishReason: 'stop',
          outcome: { type: 'success' },
          result: {
            replayed: true,
            continuationRunId: error.continuationRunId,
          },
        }
        return
      }
      const interruptFailure = structuralInterruptFailure(error)
      if (interruptFailure) {
        this.terminalHookCalled = true
        this.logger.errors('chat interrupt resume failed', {
          error,
          threadId: this.middlewareCtx.threadId,
        })
        await this.middlewareRunner.runOnError(this.middlewareCtx, {
          error: interruptFailure.error,
          duration: Date.now() - this.streamStartTime,
        })
        yield this.buildInterruptRunErrorChunk(error)
        return
      }
      if (!this.terminalHookCalled) {
        this.terminalHookCalled = true
        if (error instanceof MiddlewareAbortError) {
          // Middleware abort decision — call onAbort, not onError
          this.abortReason = error.message
          await this.middlewareRunner.runOnAbort(this.middlewareCtx, {
            reason: error.message,
            duration: Date.now() - this.streamStartTime,
          })
        } else {
          // Genuine error — call onError
          this.logger.errors('chat run failed', {
            error,
            threadId: this.middlewareCtx.threadId,
          })
          await this.middlewareRunner.runOnError(this.middlewareCtx, {
            error,
            duration: Date.now() - this.streamStartTime,
          })
        }
      }
      // Don't rethrow middleware abort errors — the run just stops gracefully
      if (!(error instanceof MiddlewareAbortError)) {
        throw error
      }
    } finally {
      // Check for abort terminal hook
      if (!this.terminalHookCalled && this.isCancelled()) {
        this.terminalHookCalled = true
        await this.middlewareRunner.runOnAbort(this.middlewareCtx, {
          reason: this.abortReason,
          duration: Date.now() - this.streamStartTime,
        })
      }

      // Await deferred promises (non-blocking side effects)
      if (this.deferredPromises.length > 0) {
        await Promise.allSettled(this.deferredPromises)
      }
    }
  }

  private beforeRun(): void {
    this.streamStartTime = Date.now()
    const { tools, metadata } = this.params

    // Gather flattened options into an object for context
    const options: Record<string, unknown> = {}
    if (metadata !== undefined) options.metadata = metadata

    this.eventOptions = Object.keys(options).length > 0 ? options : undefined
    this.eventToolNames = tools?.map((t) => t.name)

    // Update middleware context with computed fields
    this.middlewareCtx.options = this.eventOptions
    this.middlewareCtx.toolNames = this.eventToolNames
  }

  private async beginCycle(): Promise<void> {
    if (this.cyclePhase === 'processText') {
      await this.beginIteration()
    }
  }

  private endCycle(): void {
    if (this.cyclePhase === 'processText') {
      this.cyclePhase = 'executeToolCalls'
      return
    }

    this.cyclePhase = 'processText'
    this.iterationCount++
  }

  private async beginIteration(): Promise<void> {
    this.currentMessageId = this.createId('msg')
    this.accumulatedContent = ''
    this.accumulatedThinking = []
    this.currentThinkingContent = ''
    this.currentThinkingSignature = ''
    this.finishedEvent = null

    // Update mutable context fields
    this.middlewareCtx.currentMessageId = this.currentMessageId
    this.middlewareCtx.accumulatedContent = ''

    // Notify middleware of new iteration (devtools emits assistant message:created here)
    await this.middlewareRunner.runOnIteration(this.middlewareCtx, {
      iteration: this.iterationCount,
      messageId: this.currentMessageId,
    })
  }

  private async *streamModelResponse(): AsyncGenerator<StreamChunk> {
    const { metadata, modelOptions } = this.params
    const tools = this.tools

    // Convert tool schemas to JSON Schema before passing to adapter
    const toolsWithJsonSchemas = tools.map((tool) => ({
      ...tool,
      inputSchema: tool.inputSchema
        ? convertSchemaToJsonSchema(tool.inputSchema)
        : undefined,
      outputSchema: tool.outputSchema
        ? convertSchemaToJsonSchema(tool.outputSchema)
        : undefined,
    }))

    this.middlewareCtx.phase = 'modelStream'

    const providerName =
      (this.adapter as { provider?: string }).provider ?? this.adapter.name
    this.logger.request(
      `activity=chat provider=${providerName} model=${this.params.model} messages=${this.messages.length} tools=${this.tools.length} stream=true`,
      {
        provider: providerName,
        model: this.params.model,
        messageCount: this.messages.length,
        toolCount: this.tools.length,
      },
    )

    // When the adapter declared `supportsCombinedToolsAndSchema()`, the
    // activity layer set `nativeCombined: true` and we forward the
    // pre-converted JSON Schema into the regular chatStream call. The
    // adapter wires it into the upstream request (e.g. `response_format`,
    // `text.format`, `output_format`) so the model's final-turn text is
    // schema-constrained and the engine can harvest it from the agent loop
    // without a separate finalization round-trip.
    const combinedSchema =
      this.finalStructuredOutput?.nativeCombined === true
        ? this.finalStructuredOutput.jsonSchema
        : undefined

    const { approvals } = this.collectClientState()
    const adapterApprovals = new Map<string, boolean>()
    for (const [approvalId, resolution] of approvals) {
      adapterApprovals.set(
        approvalId,
        typeof resolution === 'boolean' ? resolution : resolution.approved,
      )
    }

    for await (const chunk of this.adapter.chatStream({
      model: this.params.model,
      messages: this.messages,
      tools: toolsWithJsonSchemas,
      metadata,
      request: this.effectiveRequest,
      modelOptions,
      systemPrompts: this.systemPrompts,
      logger: this.logger,
      threadId: this.threadId,
      runId: this.runIdOverride,
      parentRunId: this.parentRunIdOverride,
      // Expose provided capabilities (e.g. sandbox) to harness adapters.
      capabilities: this.middlewareCtx,
      // Client approval decisions, for harness interactive-approval resolution.
      approvals: adapterApprovals,
      ...(combinedSchema ? { outputSchema: combinedSchema } : {}),
    })) {
      if (this.isCancelled()) {
        break
      }

      this.totalChunkCount++

      // Process the original (unstripped) chunk for internal state management
      // BEFORE middleware, so fields like finishReason, delta, etc. are available
      this.handleStreamChunk(chunk)

      // Native combined mode: synthesize `structured-output.start` BEFORE
      // the first TEXT_MESSAGE_START so the client-side StreamProcessor
      // routes the schema-constrained JSON deltas into a
      // StructuredOutputPart. We delay synthesis until we actually see
      // text starting — intermediate tool-call iterations don't need it,
      // and emitting at run-start would wrap tool-call commentary into a
      // structured-output part too.
      if (
        this.finalStructuredOutput?.nativeCombined === true &&
        this.finalStructuredOutput.yieldChunks &&
        !this.combinedStartEmitted &&
        chunk.type === EventType.TEXT_MESSAGE_START
      ) {
        this.combinedStartEmitted = true
        const messageId =
          typeof chunk.messageId === 'string' && chunk.messageId !== ''
            ? chunk.messageId
            : generateMessageId()
        this.combinedStructuredMessageId = messageId
        const synthStart: StreamChunk = {
          type: EventType.CUSTOM,
          name: 'structured-output.start',
          value: { messageId },
          model: this.params.model,
          timestamp: Date.now(),
          threadId: this.threadId,
          ...(this.runIdOverride ? { runId: this.runIdOverride } : {}),
        }
        const synthOutputs = await this.middlewareRunner.runOnChunk(
          this.middlewareCtx,
          synthStart,
        )
        for (const outputChunk of synthOutputs) {
          yield outputChunk
          this.middlewareCtx.chunkIndex++
        }
      }

      // Pipe chunk through middleware (devtools middleware observes; strip-to-spec cleans)
      const outputChunks = await this.middlewareRunner.runOnChunk(
        this.middlewareCtx,
        chunk,
      )
      // When a streaming structured-output finalization step will run after
      // the agent loop, suppress the agent-loop's RUN_STARTED/RUN_FINISHED
      // here — the finalization step emits the single outer lifecycle pair
      // that reaches the consumer.
      //
      // Native combined mode does NOT issue a second adapter stream — the
      // agent loop's lifecycle IS the outer pair the consumer sees.
      const suppressAgentLifecycle =
        !!this.finalStructuredOutput &&
        this.finalStructuredOutput.yieldChunks &&
        this.finalStructuredOutput.nativeCombined !== true
      for (const outputChunk of outputChunks) {
        if (
          suppressAgentLifecycle &&
          (outputChunk.type === EventType.RUN_STARTED ||
            outputChunk.type === EventType.RUN_FINISHED)
        ) {
          continue
        }
        if (this.shouldDeferToolCallRunFinished(outputChunk)) {
          this.deferredToolCallRunFinishedChunks.push(outputChunk)
          continue
        }
        this.logger.output(`type=${outputChunk.type}`, { chunk: outputChunk })
        yield outputChunk
        this.middlewareCtx.chunkIndex++
      }

      // Handle usage via middleware
      if (chunk.type === 'RUN_FINISHED' && chunk.usage) {
        await this.middlewareRunner.runOnUsage(this.middlewareCtx, chunk.usage)
      }

      // Drain any sandbox.file events emitted while processing this chunk.
      yield* this.drainSandboxFileQueue()

      if (this.earlyTermination) {
        break
      }
    }

    // Drain any remaining sandbox.file events emitted after the stream ended.
    yield* this.drainSandboxFileQueue()
  }

  private handleStreamChunk(chunk: StreamChunk): void {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- AG-UI EventType enum members vs string-literal case labels; default branch handles untraced events.
    switch (chunk.type) {
      // AG-UI Events
      case 'TEXT_MESSAGE_CONTENT':
        this.handleTextMessageContentEvent(chunk)
        break
      case 'TOOL_CALL_START':
        this.handleToolCallStartEvent(chunk)
        break
      case 'TOOL_CALL_ARGS':
        this.handleToolCallArgsEvent(chunk)
        break
      case 'TOOL_CALL_END':
        this.handleToolCallEndEvent(chunk)
        break
      case 'RUN_FINISHED':
        this.handleRunFinishedEvent(chunk)
        break
      case 'RUN_ERROR':
        this.handleRunErrorEvent(chunk)
        break
      case 'STEP_STARTED':
        this.handleStepStartedEvent()
        break
      case 'STEP_FINISHED':
        this.handleStepFinishedEvent(chunk)
        break

      case 'TOOL_CALL_RESULT':
        // Tool result is already added to messages in buildToolResultChunks
        break

      case 'REASONING_START':
      case 'REASONING_MESSAGE_START':
      case 'REASONING_MESSAGE_CONTENT':
      case 'REASONING_MESSAGE_END':
      case 'REASONING_END':
        // Reasoning events are handled by StreamProcessor
        break

      default:
        // RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_END,
        // STATE_SNAPSHOT, STATE_DELTA, CUSTOM
        // - no special handling needed in chat activity
        break
    }
  }

  // ===========================
  // AG-UI Event Handlers
  // ===========================

  private handleTextMessageContentEvent(chunk: TextMessageContentEvent): void {
    if (chunk.content) {
      this.accumulatedContent = chunk.content
    } else {
      this.accumulatedContent += chunk.delta
    }
    this.middlewareCtx.accumulatedContent = this.accumulatedContent
  }

  private handleToolCallStartEvent(chunk: ToolCallStartEvent): void {
    this.toolCallManager.addToolCallStartEvent(chunk)
  }

  private handleToolCallArgsEvent(chunk: ToolCallArgsEvent): void {
    this.toolCallManager.addToolCallArgsEvent(chunk)
  }

  private handleToolCallEndEvent(chunk: ToolCallEndEvent): void {
    this.toolCallManager.completeToolCall(chunk)
  }

  private handleRunFinishedEvent(chunk: RunFinishedEvent): void {
    this.finishedEvent = chunk
    this.lastFinishReason = chunk.finishReason ?? null
  }

  private handleRunErrorEvent(
    _chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): void {
    this.earlyTermination = true
  }

  private finalizeCurrentThinkingStep(): void {
    if (this.currentThinkingContent) {
      this.accumulatedThinking.push({
        content: this.currentThinkingContent,
        ...(this.currentThinkingSignature && {
          signature: this.currentThinkingSignature,
        }),
      })
      this.currentThinkingContent = ''
      this.currentThinkingSignature = ''
    }
  }

  private handleStepStartedEvent(): void {
    this.finalizeCurrentThinkingStep()
  }

  private handleStepFinishedEvent(
    chunk: Extract<StreamChunk, { type: 'STEP_FINISHED' }>,
  ): void {
    if (chunk.delta) {
      this.currentThinkingContent += chunk.delta
    }
    if (chunk.signature) {
      this.currentThinkingSignature = chunk.signature
    }
  }

  /**
   * Tools available for execution this turn. The discovery tool is dropped
   * from the advertised set (`this.tools`) once every lazy tool is discovered,
   * but a model may still re-request discovery; this widens execution lookup
   * to include it so such calls don't fail with "Unknown tool". Centralised so
   * both execution sites (`processToolCalls` and `checkForPendingToolCalls`)
   * stay in sync.
   */
  private resolveExecutableTools(
    toolCalls: ReadonlyArray<ToolCall>,
  ): ReadonlyArray<AnyTool> {
    return this.lazyToolManager.getExecutableTools(
      this.tools,
      toolCalls.map((tc) => tc.function.name),
    )
  }

  private async *checkForPendingToolCalls(): AsyncGenerator<
    StreamChunk,
    ToolPhaseResult,
    void
  > {
    const pendingToolCalls = this.getPendingToolCallsFromMessages()
    if (pendingToolCalls.length === 0) {
      return 'continue'
    }

    const finishEvent = this.createSyntheticFinishedEvent()

    // Same fan-out budget as live model turns (seeded history / resume).
    // Count is deduped so wait→resume after a live turn does not double-count.
    const { toExecute: budgetedToolCalls, skippedResults } =
      this.applyToolCallBudget(pendingToolCalls)

    // Handle undiscovered lazy tool calls with self-correcting error messages
    const undiscoveredLazyResults: Array<ToolResult> = []
    const executablePendingCalls = budgetedToolCalls.filter((tc) => {
      if (this.lazyToolManager.isUndiscoveredLazyTool(tc.function.name)) {
        undiscoveredLazyResults.push({
          toolCallId: tc.id,
          toolName: tc.function.name,
          result: {
            error: this.lazyToolManager.getUndiscoveredToolError(
              tc.function.name,
            ),
          },
          state: 'output-error',
        })
        return false
      }
      return true
    })

    // Non-executed outcomes (undiscovered lazy + per-turn fan-out skips).
    // Emitted after executed results so the stream prefers real results first.
    const deferredErrorResults = [...undiscoveredLazyResults, ...skippedResults]

    // Build args lookup so buildToolResultChunks can emit TOOL_CALL_START +
    // TOOL_CALL_ARGS before TOOL_CALL_END during continuation re-executions.
    const argsMap = new Map<string, string>()
    for (const tc of pendingToolCalls) {
      argsMap.set(tc.id, tc.function.arguments)
    }

    if (executablePendingCalls.length === 0) {
      if (deferredErrorResults.length > 0) {
        for (const chunk of this.buildToolResultChunks(
          deferredErrorResults,
          finishEvent,
          argsMap,
        )) {
          yield* this.pipeThroughMiddleware(chunk)
        }
      }
      return 'continue'
    }

    const { approvals, clientToolResults } = this.collectClientState()

    const generator = executeToolCalls(
      executablePendingCalls,
      this.resolveExecutableTools(executablePendingCalls),
      approvals,
      clientToolResults,
      (eventName, data) => this.createCustomEventChunk(eventName, data),
      {
        onBeforeToolCall: async (toolCall, tool, args) => {
          this.logger.tools(`phase=before name=${toolCall.function.name}`, {
            name: toolCall.function.name,
            args,
          })
          const hookCtx = {
            toolCall,
            tool,
            args,
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
          }
          return this.middlewareRunner.runOnBeforeToolCall(
            this.middlewareCtx,
            hookCtx,
          )
        },
        onAfterToolCall: async (info) => {
          this.logger.tools(`phase=after name=${info.toolName}`, {
            name: info.toolName,
            result: info.result,
          })
          await this.middlewareRunner.runOnAfterToolCall(
            this.middlewareCtx,
            info,
          )
        },
      },
      this.middlewareCtx.context,
      this.toolAbortSignal,
      {
        deniedToolResults: this.resumeDeniedToolResults,
        cancelledToolCallIds: this.resumeCancelledToolCallIds,
      },
    )

    // Consume the async generator, yielding custom events and collecting the return value
    const executionResult = yield* this.drainToolCallGenerator(generator)

    // Check if middleware aborted during pending tool execution
    if (this.isMiddlewareAborted()) {
      this.setToolPhase('stop')
      return 'stop'
    }

    const allResults = [...executionResult.results, ...deferredErrorResults]

    // Notify middleware of tool phase completion (devtools emits aggregate events here)
    await this.middlewareRunner.runOnToolPhaseComplete(this.middlewareCtx, {
      toolCalls: pendingToolCalls,
      results: allResults,
      needsApproval: executionResult.needsApproval,
      needsClientExecution: executionResult.needsClientExecution,
    })

    if (
      executionResult.needsApproval.length > 0 ||
      executionResult.needsClientExecution.length > 0
    ) {
      this.discardDeferredToolCallRunFinishedChunks()

      if (allResults.length > 0) {
        for (const chunk of this.buildToolResultChunks(
          allResults,
          finishEvent,
        )) {
          yield* this.pipeThroughMiddleware(chunk)
        }
      }

      const emitted = yield* this.emitActionableInterruptBoundary(
        finishEvent,
        executionResult.needsApproval,
        executionResult.needsClientExecution,
      )
      this.setToolPhase(emitted ? 'wait' : 'stop')
      return emitted ? 'wait' : 'stop'
    }

    const toolResultChunks = this.buildToolResultChunks(
      allResults,
      finishEvent,
    )

    for (const chunk of toolResultChunks) {
      yield* this.pipeThroughMiddleware(chunk)
    }

    return 'continue'
  }

  private async *processToolCalls(): AsyncGenerator<StreamChunk, void, void> {
    if (!this.shouldExecuteToolPhase()) {
      // Text-only turn — clear per-turn count so strategies see 0 tools.
      this.lastTurnToolCallCount = 0
      this.setToolPhase('stop')
      return
    }

    const toolCalls = this.toolCallManager.getToolCalls()
    const finishEvent = this.finishedEvent

    if (!finishEvent || toolCalls.length === 0) {
      this.lastTurnToolCallCount = 0
      this.setToolPhase('stop')
      return
    }

    // Count every model-emitted tool call (including ones we may skip).
    const { toExecute: budgetedToolCalls, skippedResults } =
      this.applyToolCallBudget(toolCalls)

    this.addAssistantToolCallMessage(toolCalls)

    // Handle undiscovered lazy tool calls with self-correcting error messages
    const undiscoveredLazyResults: Array<ToolResult> = []
    const executableToolCalls = budgetedToolCalls.filter((tc) => {
      if (this.lazyToolManager.isUndiscoveredLazyTool(tc.function.name)) {
        undiscoveredLazyResults.push({
          toolCallId: tc.id,
          toolName: tc.function.name,
          result: {
            error: this.lazyToolManager.getUndiscoveredToolError(
              tc.function.name,
            ),
          },
          state: 'output-error',
        })
        return false
      }
      return true
    })

    // Non-executed outcomes (undiscovered lazy + per-turn fan-out skips).
    // Emitted after executed results so the stream prefers real results first.
    const deferredErrorResults = [...undiscoveredLazyResults, ...skippedResults]

    if (executableToolCalls.length === 0) {
      yield* this.flushDeferredToolCallRunFinishedChunks()
      // All tool calls were undiscovered lazy tools and/or skipped by the
      // per-turn fan-out cap — errors emitted, continue loop (strategy may stop).
      if (deferredErrorResults.length > 0) {
        for (const chunk of this.buildToolResultChunks(
          deferredErrorResults,
          finishEvent,
        )) {
          yield* this.pipeThroughMiddleware(chunk)
        }
      }
      this.toolCallManager.clear()
      this.setToolPhase('continue')
      return
    }
    this.middlewareCtx.phase = 'beforeTools'

    const { approvals, clientToolResults } = this.collectClientState()

    const generator = executeToolCalls(
      executableToolCalls,
      this.resolveExecutableTools(executableToolCalls),
      approvals,
      clientToolResults,
      (eventName, data) => this.createCustomEventChunk(eventName, data),
      {
        onBeforeToolCall: async (toolCall, tool, args) => {
          this.logger.tools(`phase=before name=${toolCall.function.name}`, {
            name: toolCall.function.name,
            args,
          })
          const hookCtx = {
            toolCall,
            tool,
            args,
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
          }
          return this.middlewareRunner.runOnBeforeToolCall(
            this.middlewareCtx,
            hookCtx,
          )
        },
        onAfterToolCall: async (info) => {
          this.logger.tools(`phase=after name=${info.toolName}`, {
            name: info.toolName,
            result: info.result,
          })
          await this.middlewareRunner.runOnAfterToolCall(
            this.middlewareCtx,
            info,
          )
        },
      },
      this.middlewareCtx.context,
      this.toolAbortSignal,
      {
        deniedToolResults: this.resumeDeniedToolResults,
        cancelledToolCallIds: this.resumeCancelledToolCallIds,
      },
    )

    // Consume the async generator, yielding custom events and collecting the return value
    const executionResult = yield* this.drainToolCallGenerator(generator)

    this.middlewareCtx.phase = 'afterTools'

    // Check if middleware aborted during tool execution
    if (this.isMiddlewareAborted()) {
      this.setToolPhase('stop')
      return
    }

    // Executed results first, then deferred errors (fan-out skips / undiscovered)
    const allResults = [...executionResult.results, ...deferredErrorResults]

    // Notify middleware of tool phase completion (devtools emits aggregate events here)
    await this.middlewareRunner.runOnToolPhaseComplete(this.middlewareCtx, {
      toolCalls,
      results: allResults,
      needsApproval: executionResult.needsApproval,
      needsClientExecution: executionResult.needsClientExecution,
    })

    if (
      executionResult.needsApproval.length > 0 ||
      executionResult.needsClientExecution.length > 0
    ) {
      if (allResults.length > 0) {
        for (const chunk of this.buildToolResultChunks(
          allResults,
          finishEvent,
        )) {
          yield* this.pipeThroughMiddleware(chunk)
        }
      }

      const emitted = yield* this.emitActionableInterruptBoundary(
        finishEvent,
        executionResult.needsApproval,
        executionResult.needsClientExecution,
      )
      this.setToolPhase(emitted ? 'wait' : 'stop')
      return
    }

    yield* this.flushDeferredToolCallRunFinishedChunks()

    const toolResultChunks = this.buildToolResultChunks(allResults, finishEvent)

    for (const chunk of toolResultChunks) {
      yield* this.pipeThroughMiddleware(chunk)
    }

    // Refresh tools if lazy tools were discovered in this batch
    if (this.lazyToolManager.hasNewlyDiscoveredTools()) {
      this.tools = this.lazyToolManager.getActiveTools()
      this.toolCallManager = new ToolCallManager<
        ReadonlyArray<AnyTool>,
        TContext
      >(this.tools)
      this.setToolPhase('continue')
      return
    }

    this.toolCallManager.clear()

    this.setToolPhase('continue')
  }

  private shouldDeferToolCallRunFinished(chunk: StreamChunk): boolean {
    return (
      chunk.type === EventType.RUN_FINISHED &&
      this.finishedEvent?.finishReason === 'tool_calls' &&
      this.tools.length > 0 &&
      this.toolCallManager.hasToolCalls()
    )
  }

  private *flushDeferredToolCallRunFinishedChunks(): Generator<StreamChunk> {
    for (const chunk of this.deferredToolCallRunFinishedChunks) {
      this.logger.output(`type=${chunk.type}`, { chunk })
      yield chunk
      this.middlewareCtx.chunkIndex++
    }
    this.deferredToolCallRunFinishedChunks = []
  }

  private discardDeferredToolCallRunFinishedChunks(): void {
    this.deferredToolCallRunFinishedChunks = []
  }

  private shouldExecuteToolPhase(): boolean {
    return (
      this.finishedEvent?.finishReason === 'tool_calls' &&
      this.tools.length > 0 &&
      this.toolCallManager.hasToolCalls()
    )
  }

  private addAssistantToolCallMessage(toolCalls: Array<ToolCall>): void {
    this.finalizeCurrentThinkingStep()

    this.messages = [
      ...this.messages,
      {
        role: 'assistant',
        content: this.accumulatedContent || null,
        toolCalls,
        ...(this.accumulatedThinking.length > 0 && {
          thinking: this.accumulatedThinking,
        }),
      },
    ]
    this.middlewareCtx.messages = this.messages
  }

  /**
   * Extract client state (approvals and client tool results) from original messages.
   * This is called in the constructor BEFORE converting to ModelMessage format,
   * because the parts array (which contains approval state) is lost during conversion.
   */
  private extractClientStateFromOriginalMessages(
    originalMessages: Array<any>,
  ): {
    approvals: Map<string, ToolApprovalResolution>
    clientToolResults: Map<string, any>
  } {
    const approvals = new Map<string, ToolApprovalResolution>()
    const clientToolResults = new Map<string, any>()

    for (const message of originalMessages) {
      // Check for UIMessage format (parts array) - extract client tool results and approvals
      if (message.role === 'assistant' && message.parts) {
        for (const part of message.parts) {
          if (part.type === 'tool-call') {
            // Extract client tool results (tools without approval that have output)
            if (part.output !== undefined && !part.approval) {
              clientToolResults.set(part.id, part.output)
            }
            // Extract approval responses from UIMessage format parts
            if (
              part.approval?.id &&
              part.approval?.approved !== undefined &&
              part.state === 'approval-responded'
            ) {
              approvals.set(part.approval.id, part.approval.approved)
            }
          }
        }
      }
    }

    return { approvals, clientToolResults }
  }

  private collectClientState(): {
    approvals: Map<string, ToolApprovalResolution>
    clientToolResults: Map<string, any>
  } {
    // Start with the initial client state extracted from original messages
    const approvals = new Map(this.initialApprovals)
    const clientToolResults = new Map(this.initialClientToolResults)
    for (const [approvalId, approved] of this.resumeApprovals) {
      approvals.set(approvalId, approved)
    }
    for (const [toolCallId, result] of this.resumeClientToolResults) {
      clientToolResults.set(toolCallId, result)
    }

    // Also check current messages for any additional tool results (from server tools)
    for (const message of this.messages) {
      // Check for ModelMessage format (role: 'tool' messages contain tool results)
      // This handles results sent back from the client after executing client-side tools
      if (message.role === 'tool' && message.toolCallId) {
        // Parse content back to original output (was stringified by
        // uiMessageToModelMessages). Multimodal results carry an
        // Array<ContentPart> directly — pass it through without parsing.
        let output: unknown
        if (Array.isArray(message.content)) {
          output = message.content
        } else {
          try {
            output = JSON.parse(message.content as string)
          } catch {
            output = message.content
          }
        }
        // Skip approval response messages (they have pendingExecution marker)
        // These are NOT real client tool results — they are synthetic tool messages
        // created by uiMessageToModelMessages for approved-but-not-yet-executed tools.
        // Treating them as results would prevent the server from requesting actual
        // client-side execution after approval (see GitHub issue #225).
        if (
          output &&
          typeof output === 'object' &&
          (output as any).pendingExecution === true
        ) {
          continue
        }
        clientToolResults.set(message.toolCallId, output)
      }
    }

    return { approvals, clientToolResults }
  }

  private buildActionableInterrupts(
    approvals: Array<ApprovalRequest>,
    clientRequests: Array<ClientToolRequest>,
  ): Array<Interrupt> {
    const interrupts: Array<Interrupt> = []

    for (const approval of approvals) {
      const tool = this.tools.find(
        (candidate) => candidate.name === approval.toolName,
      ) as RuntimeToolWithApproval | undefined
      const normalized = normalizeApprovalSchema(
        tool?.approvalSchema,
        tool?.inputSchema,
      )
      interrupts.push({
        id: approval.approvalId,
        reason: 'tool_call',
        message: `Approval required to run ${approval.toolName}`,
        toolCallId: approval.toolCallId,
        responseSchema: normalized.responseSchema,
        metadata: {
          kind: 'approval',
          toolName: approval.toolName,
          input: approval.input,
          [interruptBindingMetadataKey]: {
            kind: 'tool-approval',
            interruptId: approval.approvalId,
            toolName: approval.toolName,
            toolCallId: approval.toolCallId,
            originalArgs: approval.input,
            inputSchemaHash: hashSchemaInput(tool?.inputSchema),
            approvalSchemaHash: normalized.approvalSchemaHash,
            responseSchemaHash: normalized.responseSchemaHash,
          },
        },
      })
    }

    for (const clientTool of clientRequests) {
      const tool = this.tools.find(
        (candidate) => candidate.name === clientTool.toolName,
      )
      const responseSchema = convertSchemaToJsonSchema(tool?.outputSchema) ?? {}
      interrupts.push({
        id: `client_tool_${clientTool.toolCallId}`,
        reason: 'tanstack:client_tool_execution',
        message: `Client tool ${clientTool.toolName} is ready to run`,
        toolCallId: clientTool.toolCallId,
        responseSchema,
        metadata: {
          kind: 'client_tool',
          toolName: clientTool.toolName,
          input: clientTool.input,
          [interruptBindingMetadataKey]: {
            kind: 'client-tool-execution',
            interruptId: `client_tool_${clientTool.toolCallId}`,
            toolName: clientTool.toolName,
            toolCallId: clientTool.toolCallId,
            outputSchemaHash: hashSchemaInput(tool?.outputSchema),
            responseSchemaHash: digestInterruptJson(
              canonicalInterruptJson(responseSchema),
            ),
          },
        },
      })
    }

    return interrupts
  }

  private buildInterruptFinishedChunk(
    finishEvent: RunFinishedEvent,
    approvals: Array<ApprovalRequest>,
    clientRequests: Array<ClientToolRequest>,
  ): StreamChunk {
    return {
      ...finishEvent,
      timestamp: Date.now(),
      outcome: {
        type: 'interrupt',
        interrupts: this.buildActionableInterrupts(approvals, clientRequests),
      },
    }
  }

  private buildMessagesSnapshotChunk(): StreamChunk {
    const messages: MessagesSnapshotEvent['messages'] = this.messages.map(
      (message, index) => {
        const content =
          typeof message.content === 'string'
            ? message.content
            : message.content === null
              ? undefined
              : JSON.stringify(message.content)
        return {
          id: `snapshot_${this.runIdOverride ?? this.requestId}_${index}`,
          role: message.role,
          ...(content !== undefined ? { content } : {}),
          ...('toolCalls' in message && message.toolCalls
            ? { toolCalls: message.toolCalls }
            : {}),
          ...('toolCallId' in message && message.toolCallId
            ? { toolCallId: message.toolCallId }
            : {}),
        } as MessagesSnapshotEvent['messages'][number]
      },
    )
    return {
      type: EventType.MESSAGES_SNAPSHOT,
      timestamp: Date.now(),
      model: this.params.model,
      messages,
    }
  }

  private publicInterruptTerminal(chunk: StreamChunk): StreamChunk {
    if (
      chunk.type !== EventType.RUN_FINISHED ||
      chunk.outcome?.type !== 'interrupt'
    ) {
      return chunk
    }
    return {
      ...chunk,
      outcome: {
        ...chunk.outcome,
        interrupts: chunk.outcome.interrupts.map((interrupt) => {
          if (
            !interrupt.metadata ||
            typeof interrupt.metadata !== 'object' ||
            Array.isArray(interrupt.metadata)
          ) {
            return interrupt
          }
          const metadata = { ...interrupt.metadata }
          const binding = normalizePublicInterruptBinding(
            metadata[interruptBindingMetadataKey],
            interrupt.id,
          )
          if (binding) {
            metadata[interruptBindingMetadataKey] = binding
          } else {
            delete metadata[interruptBindingMetadataKey]
          }
          return { ...interrupt, metadata }
        }),
      },
    }
  }

  private interruptFailure(error: unknown): {
    message: string
    code: string
    errors?: ReadonlyArray<InterruptSubmissionError>
    recovery?: InterruptRecoveryStateV1
  } {
    const structured = structuralInterruptFailure(error)
    if (structured) {
      return {
        message: structured.error.message,
        code: structured.errors[0]?.code ?? 'server',
        errors: structured.errors,
        ...(structured.recovery !== undefined
          ? { recovery: structured.recovery }
          : {}),
      }
    }
    if (error && typeof error === 'object' && 'errors' in error) {
      const errors = error.errors
      if (Array.isArray(errors)) {
        const first = errors[0]
        if (first && typeof first === 'object') {
          const message =
            'message' in first && typeof first.message === 'string'
              ? first.message
              : 'Interrupt persistence failed.'
          const code =
            'code' in first && typeof first.code === 'string'
              ? first.code
              : 'server'
          return { message, code }
        }
      }
    }
    return {
      message:
        error instanceof Error
          ? error.message
          : 'Interrupt persistence failed.',
      code: 'server',
    }
  }

  private buildInterruptRunErrorChunk(error: unknown): StreamChunk {
    const failure = this.interruptFailure(error)
    return {
      type: EventType.RUN_ERROR,
      timestamp: Date.now(),
      runId: this.runIdOverride ?? this.requestId,
      threadId: this.threadId,
      message: failure.message,
      code: failure.code,
      error: { message: failure.message, code: failure.code },
      ...(failure.errors !== undefined
        ? { 'tanstack:interruptErrors': failure.errors }
        : {}),
      ...(failure.recovery !== undefined
        ? { 'tanstack:interruptRecovery': failure.recovery }
        : {}),
    }
  }

  private async *emitInterruptRunError(
    error: unknown,
  ): AsyncGenerator<StreamChunk, void, void> {
    const failure = this.interruptFailure(error)
    this.finalizationError = {
      message: failure.message,
      code: failure.code,
      cause: error,
    }
    yield* this.pipeThroughMiddleware(this.buildInterruptRunErrorChunk(error))
  }

  private async *emitActionableInterruptBoundary(
    finishEvent: RunFinishedEvent,
    approvals: Array<ApprovalRequest>,
    clientRequests: Array<ClientToolRequest>,
  ): AsyncGenerator<StreamChunk, boolean, void> {
    let terminal = this.buildInterruptFinishedChunk(
      finishEvent,
      approvals,
      clientRequests,
    )
    if (!getInterruptPersistence(this.middlewareCtx, { optional: true })) {
      terminal = this.completeEphemeralInterruptBindings(terminal)
    }
    let terminalOutputs: Array<StreamChunk>
    try {
      terminalOutputs = await this.middlewareRunner.runOnChunk(
        this.middlewareCtx,
        terminal,
      )
    } catch (error) {
      yield* this.emitInterruptRunError(error)
      return false
    }

    yield* this.pipeThroughMiddleware(this.buildMessagesSnapshotChunk())
    if (this.params.state !== undefined) {
      yield* this.pipeThroughMiddleware({
        type: EventType.STATE_SNAPSHOT,
        timestamp: Date.now(),
        model: this.params.model,
        snapshot: this.params.state,
      })
    }
    for (const output of terminalOutputs) {
      yield this.publicInterruptTerminal(output)
      this.middlewareCtx.chunkIndex++
    }
    return true
  }

  private completeEphemeralInterruptBindings(chunk: StreamChunk): StreamChunk {
    if (
      chunk.type !== EventType.RUN_FINISHED ||
      chunk.outcome?.type !== 'interrupt'
    ) {
      return chunk
    }
    const interruptedRunId = this.runIdOverride ?? this.requestId
    return {
      ...chunk,
      outcome: {
        ...chunk.outcome,
        interrupts: chunk.outcome.interrupts.map((interrupt) => {
          if (
            !interrupt.metadata ||
            typeof interrupt.metadata !== 'object' ||
            Array.isArray(interrupt.metadata)
          ) {
            return interrupt
          }
          const metadata = { ...interrupt.metadata }
          const unopened = metadata[interruptBindingMetadataKey]
          if (
            unopened === null ||
            typeof unopened !== 'object' ||
            Array.isArray(unopened)
          ) {
            return interrupt
          }
          metadata[interruptBindingMetadataKey] = {
            ...unopened,
            interruptedRunId,
            generation: 0,
          }
          return { ...interrupt, metadata }
        }),
      },
    }
  }

  private buildToolResultChunks(
    results: Array<ToolResult>,
    finishEvent: RunFinishedEvent,
    argsMap?: Map<string, string>,
  ): Array<StreamChunk> {
    const chunks: Array<StreamChunk> = []

    for (const result of results) {
      // `content` is the canonical value for the tool `ModelMessage` — it may
      // be an `Array<ContentPart>` (multimodal) which the adapters convert to
      // structured provider output on the next iteration. `wireContent` is the
      // string form emitted on the AG-UI stream events (TOOL_CALL_END.result /
      // TOOL_CALL_RESULT.content are string-only per the AG-UI spec); the
      // multimodal array travels via the message itself, not the wire event.
      const content = normalizeToolResult(result.result)
      const wireContent =
        typeof content === 'string' ? content : JSON.stringify(content)

      // argsMap is set only on continuation re-executions, where the adapter
      // never streamed these calls. Otherwise it already emitted END, so a
      // second one here would be an orphan that fails verifyEvents (#519).
      if (argsMap) {
        chunks.push({
          type: 'TOOL_CALL_START',
          timestamp: Date.now(),
          model: finishEvent.model,
          toolCallId: result.toolCallId,
          toolCallName: result.toolName,
          toolName: result.toolName,
        } as StreamChunk)

        const args = argsMap.get(result.toolCallId) ?? '{}'
        chunks.push({
          type: 'TOOL_CALL_ARGS',
          timestamp: Date.now(),
          model: finishEvent.model,
          toolCallId: result.toolCallId,
          delta: args,
          args,
        } as StreamChunk)

        chunks.push({
          type: 'TOOL_CALL_END',
          timestamp: Date.now(),
          model: finishEvent.model,
          toolCallId: result.toolCallId,
          toolCallName: result.toolName,
          toolName: result.toolName,
          result: wireContent,
          ...(result.state !== undefined && { state: result.state }),
        } as StreamChunk)
      }

      // AG-UI spec TOOL_CALL_RESULT event (content is string-only per spec)
      chunks.push({
        type: 'TOOL_CALL_RESULT',
        timestamp: Date.now(),
        model: finishEvent.model,
        messageId: this.createId('tool-result'),
        toolCallId: result.toolCallId,
        content: wireContent,
        role: 'tool',
        ...(result.state !== undefined && { state: result.state }),
      } as StreamChunk)

      // If a placeholder tool message exists for this toolCallId (created by
      // uiMessageToModelMessages for an approval-responded part with no
      // output yet), replace it with the real result. Otherwise the LLM sees
      // both messages — and since the Anthropic adapter dedupes tool_result
      // blocks by tool_use_id keeping the first match, the placeholder wins
      // and the real result is dropped (see issue #532).
      const placeholderIdx = this.messages.findIndex((m) => {
        if (m.role !== 'tool' || m.toolCallId !== result.toolCallId) {
          return false
        }
        if (typeof m.content !== 'string') return false
        try {
          return JSON.parse(m.content)?.pendingExecution === true
        } catch {
          return false
        }
      })

      const newToolMessage: ModelMessage = {
        role: 'tool',
        content,
        toolCallId: result.toolCallId,
      }

      if (placeholderIdx >= 0) {
        this.messages = [
          ...this.messages.slice(0, placeholderIdx),
          newToolMessage,
          ...this.messages.slice(placeholderIdx + 1),
        ]
      } else {
        this.messages = [...this.messages, newToolMessage]
      }
      this.middlewareCtx.messages = this.messages
    }

    return chunks
  }

  private getPendingToolCallsFromMessages(): Array<ToolCall> {
    // Build a set of completed tool IDs, but exclude tools with pendingExecution marker
    // (these are approved tools that still need to execute)
    const completedToolIds = new Set<string>()

    for (const message of this.messages) {
      if (message.role === 'tool' && message.toolCallId) {
        // Check if this is an approval response with pendingExecution marker
        let hasPendingExecution = false
        if (typeof message.content === 'string') {
          try {
            const parsed = JSON.parse(message.content)
            if (parsed.pendingExecution === true) {
              hasPendingExecution = true
            }
          } catch {
            // Not JSON, treat as regular tool result
          }
        }

        // Only mark as complete if NOT pending execution
        if (!hasPendingExecution) {
          completedToolIds.add(message.toolCallId)
        }
      }
    }

    const pending: Array<ToolCall> = []

    for (const message of this.messages) {
      if (message.role === 'assistant' && message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          // Provider-executed tool calls (e.g. Anthropic `web_search`) were
          // already run by the provider; they carry no client result, so they
          // would otherwise look "pending" forever and the loop would try (and
          // fail) to execute them client-side. Skip them.
          if (isProviderExecutedToolCall(toolCall)) {
            continue
          }
          if (!completedToolIds.has(toolCall.id)) {
            pending.push(toolCall)
          }
        }
      }
    }

    return pending
  }

  private createSyntheticFinishedEvent(): RunFinishedEvent {
    return {
      type: 'RUN_FINISHED',
      runId: this.createId('pending'),
      threadId: this.threadId,
      model: this.params.model,
      timestamp: Date.now(),
      finishReason: 'tool_calls',
    } as RunFinishedEvent
  }

  private shouldContinue(): boolean {
    if (this.cyclePhase === 'executeToolCalls') {
      return true
    }

    return (
      this.loopStrategy({
        iterationCount: this.iterationCount,
        messages: this.messages,
        finishReason: this.lastFinishReason,
        toolCallCount: this.toolCallCount,
        lastTurnToolCallCount: this.lastTurnToolCallCount,
      }) && this.toolPhase === 'continue'
    )
  }

  /**
   * Record tool calls (deduped by id) and return the subset that should be
   * executed after applying `maxToolCallsPerTurn`. Excess calls get synthetic
   * error results so every tool_call still has a matching result.
   *
   * Used for both live model turns and pending/resume batches. IDs already
   * counted in this run (e.g. wait→resume after a live turn) are not
   * re-added to `toolCallCount`.
   */
  private applyToolCallBudget(toolCalls: Array<ToolCall>): {
    toExecute: Array<ToolCall>
    skippedResults: Array<ToolResult>
  } {
    this.lastTurnToolCallCount = toolCalls.length
    let newlyCounted = 0
    for (const tc of toolCalls) {
      if (!this.countedToolCallIds.has(tc.id)) {
        this.countedToolCallIds.add(tc.id)
        newlyCounted++
      }
    }
    this.toolCallCount += newlyCounted

    const cap = this.maxToolCallsPerTurn
    if (cap == null || toolCalls.length <= cap) {
      return { toExecute: toolCalls, skippedResults: [] }
    }

    this.logger.agentLoop(
      `maxToolCallsPerTurn=${cap} skipped=${toolCalls.length - cap}`,
      {
        maxToolCallsPerTurn: cap,
        emitted: toolCalls.length,
        skipped: toolCalls.length - cap,
      },
    )

    const toExecute = toolCalls.slice(0, cap)
    const skippedResults: Array<ToolResult> = toolCalls
      .slice(cap)
      .map((tc) => ({
        toolCallId: tc.id,
        toolName: tc.function.name,
        result: {
          error: `Skipped: exceeded maxToolCallsPerTurn (${cap})`,
        },
        state: 'output-error' as const,
      }))

    return { toExecute, skippedResults }
  }

  private isAborted(): boolean {
    return !!this.effectiveSignal?.aborted
  }

  private isMiddlewareAborted(): boolean {
    return !!this.middlewareAbortController?.signal.aborted
  }

  private isCancelled(): boolean {
    return this.isAborted() || this.isMiddlewareAborted()
  }

  /**
   * Run the final structured-output adapter call through the middleware
   * pipeline. Yields chunks to the caller only when
   * `this.finalStructuredOutput.yieldChunks` is true; otherwise consumes
   * silently while still piping through middleware.
   *
   * On success, populates this.structuredOutputResult.
   * On failure, populates this.finalizationError.
   */
  private async *runStructuredFinalization(): AsyncGenerator<StreamChunk> {
    if (!this.finalStructuredOutput) {
      throw new Error(
        'runStructuredFinalization called without finalStructuredOutput config',
      )
    }

    this.middlewareCtx.phase = 'structuredOutput'

    // Build the structured-output config view. `tools` is intentionally
    // excluded from the type because it isn't forwarded to the structured-
    // output adapter call — including it here would be misleading API.
    const baseConfig = this.buildMiddlewareConfig()
    const { tools: _omitTools, ...baseWithoutTools } = baseConfig
    let structuredConfig: StructuredOutputMiddlewareConfig = {
      ...baseWithoutTools,
      outputSchema: this.finalStructuredOutput.jsonSchema,
    }

    // 1) onStructuredOutputConfig — middleware can transform messages, options, outputSchema
    structuredConfig = await this.middlewareRunner.runOnStructuredOutputConfig(
      this.middlewareCtx,
      structuredConfig,
    )

    // 2) onConfig — phase-aware general-purpose middleware re-runs at the
    // boundary. Re-attach the engine's current tools so onConfig observers
    // see the live tool set (they still won't be forwarded to the structured
    // call — same constraint applies — but the view is consistent with the
    // ChatMiddlewareConfig shape).
    const { outputSchema: pinnedSchema, ...chatConfigSlice } = structuredConfig
    const postOnConfig = await this.middlewareRunner.runOnConfig(
      this.middlewareCtx,
      { ...chatConfigSlice, tools: baseConfig.tools },
    )

    // Apply merged config back to engine state
    this.applyMiddlewareConfig(postOnConfig)

    // Build the StructuredOutputOptions the adapter expects.
    // `this.adapter` is already `TAdapter extends AnyTextAdapter` per the
    // class generics — no cast needed.
    const structuredCallOptions = {
      chatOptions: {
        model: this.params.model,
        messages: this.messages,
        metadata: postOnConfig.metadata,
        modelOptions: postOnConfig.modelOptions,
        systemPrompts: postOnConfig.systemPrompts,
        logger: this.logger,
        threadId: this.threadId,
        runId: this.runIdOverride,
        parentRunId: this.parentRunIdOverride,
        ...(this.effectiveRequest ? { request: this.effectiveRequest } : {}),
      },
      outputSchema: pinnedSchema,
    }

    // Select the provider call: native streaming if available, else synthesized fallback.
    // The fallback path captures the original adapter error so the engine can
    // attach it as `finalizationError.cause` (the RUN_ERROR wire shape only
    // carries `message` and `code`, losing stack/cause/provider properties).
    let fallbackAdapterError: unknown = undefined
    const providerStream = this.adapter.structuredOutputStream
      ? this.adapter.structuredOutputStream(structuredCallOptions)
      : fallbackStructuredOutputStream(
          this.adapter,
          structuredCallOptions,
          (err) => {
            fallbackAdapterError = err
          },
        )

    // ============================================================
    // structured-output.start synthesis
    // ============================================================
    // The client-side StreamProcessor (PR #577) requires a CUSTOM
    // `structured-output.start` event BEFORE the JSON TEXT_MESSAGE_CONTENT
    // deltas — that's how it routes deltas into a `StructuredOutputPart`
    // rather than a plain `TextPart`. No adapter currently emits this,
    // so the engine synthesizes one (and tracks whether the adapter
    // emitted its own to avoid duplicating).
    //
    // Synthesis fires before the FIRST TEXT_MESSAGE_* event from the inner
    // stream, OR before a pre-delta RUN_ERROR (so the client can construct
    // an errored structured-output placeholder).
    let startEmitted = false
    let structuredMessageId: string | null = null

    const extractMessageId = (c: StreamChunk): string | null => {
      if (
        c.type === EventType.TEXT_MESSAGE_START ||
        c.type === EventType.TEXT_MESSAGE_CONTENT ||
        c.type === EventType.TEXT_MESSAGE_END
      ) {
        return typeof c.messageId === 'string' && c.messageId !== ''
          ? c.messageId
          : null
      }
      return null
    }

    const buildSynthesizedStart = (): StreamChunk => {
      const idForStart = structuredMessageId ?? generateMessageId()
      structuredMessageId = idForStart
      return {
        type: EventType.CUSTOM,
        name: 'structured-output.start',
        value: { messageId: idForStart },
        model: this.params.model,
        timestamp: Date.now(),
        threadId: this.threadId,
        ...(this.runIdOverride ? { runId: this.runIdOverride } : {}),
      }
    }

    const pipeThroughMiddleware = async (
      synthChunk: StreamChunk,
    ): Promise<Array<StreamChunk>> =>
      this.middlewareRunner.runOnChunk(this.middlewareCtx, synthChunk)

    // Track whether a RUN_ERROR has been yielded to streaming consumers so
    // we don't emit a duplicate synthetic one at the end.
    let runErrorYielded = false

    // Pipe chunks through middleware; yield to consumer only when yieldChunks=true
    for await (const chunk of providerStream) {
      // Honor cancellation between chunks (mirrors streamModelResponse).
      if (this.isCancelled()) {
        break
      }

      // Detect adapter-emitted structured-output.start so we don't duplicate
      if (
        !startEmitted &&
        chunk.type === EventType.CUSTOM &&
        chunk.name === 'structured-output.start'
      ) {
        startEmitted = true
      }

      // Capture the assistant messageId off any text-message event so the
      // synthesized start (when needed) uses the SAME id the deltas carry
      if (!structuredMessageId) {
        const extracted = extractMessageId(chunk)
        if (extracted) structuredMessageId = extracted
      }

      // Synthesis only matters for the streaming client path — the agentic
      // Promise path consumes chunks internally and returns a Promise, so
      // there's no client-side StreamProcessor to route deltas for.
      if (this.finalStructuredOutput.yieldChunks) {
        // Synthesize start before the FIRST TEXT_MESSAGE_* event
        if (
          !startEmitted &&
          (chunk.type === EventType.TEXT_MESSAGE_START ||
            chunk.type === EventType.TEXT_MESSAGE_CONTENT ||
            chunk.type === EventType.TEXT_MESSAGE_END)
        ) {
          startEmitted = true
          const synthStart = buildSynthesizedStart()
          const synthOutputs = await pipeThroughMiddleware(synthStart)
          for (const outputChunk of synthOutputs) {
            yield outputChunk
            this.middlewareCtx.chunkIndex++
          }
        }

        // Synthesize start before a pre-delta RUN_ERROR so the client can
        // construct an errored placeholder structured-output part instead
        // of a silent UI.
        if (!startEmitted && chunk.type === EventType.RUN_ERROR) {
          startEmitted = true
          const synthStart = buildSynthesizedStart()
          const synthOutputs = await pipeThroughMiddleware(synthStart)
          for (const outputChunk of synthOutputs) {
            yield outputChunk
            this.middlewareCtx.chunkIndex++
          }
        }
      }

      // 7a. Targeted state updates only.
      // We deliberately do NOT call `handleStreamChunk(chunk)` here — that
      // would mutate agent-loop state with finalization data:
      //  - TEXT_MESSAGE_CONTENT deltas would pollute `accumulatedContent`
      //    (raw JSON would leak into `info.content` on onFinish)
      //  - RUN_FINISHED would overwrite `finishedEvent` + `lastFinishReason`
      //    (finalization's 'stop' would overwrite the agent-loop's real
      //    finish reason)
      //  - STEP_FINISHED would pollute `currentThinkingContent`
      // Finalization is a separate phase from the agent loop; its state must
      // not cross-contaminate. The explicit branches below capture the only
      // bits we actually need from this stream.
      // All narrowing below is via the discriminated-union `chunk.type`
      // — no `as` casts.

      // The chunk forwarded to middleware/consumers. Replaced below only for
      // the structured-output.complete event, whose `object` we normalize
      // (un-widen) so streaming consumers see the same cleaned payload the
      // Promise<T> path validates and returns.
      let outboundChunk: StreamChunk = chunk

      if (
        chunk.type === EventType.CUSTOM &&
        chunk.name === 'structured-output.complete'
      ) {
        const parsed = readStructuredOutputCompleteValue(chunk.value)
        if (parsed) {
          const object = this.finalStructuredOutput.normalize
            ? this.finalStructuredOutput.normalize(parsed.object)
            : parsed.object
          this.structuredOutputResult = { data: object, rawText: parsed.raw }
          // Rewrite the outbound event so the yielded chunk carries the
          // normalized object (the original `chunk.value` still holds the
          // widened one). Preserve every other field — `raw`, `reasoning` —
          // by spreading the original value.
          const value = chunk.value
          if (object !== parsed.object && value && typeof value === 'object') {
            outboundChunk = { ...chunk, value: { ...value, object } }
          }
        }
      }

      if (chunk.type === EventType.RUN_FINISHED && chunk.usage) {
        // RunFinishedEvent already exposes `usage` after type narrowing.
        await this.middlewareRunner.runOnUsage(this.middlewareCtx, chunk.usage)
      }

      if (chunk.type === EventType.RUN_ERROR) {
        // RunErrorEvent already exposes `message` and `code` after narrowing.
        this.finalizationError = {
          message: chunk.message,
          ...(chunk.code ? { code: chunk.code } : {}),
          ...(fallbackAdapterError !== undefined
            ? { cause: fallbackAdapterError }
            : {}),
        }
      }

      // 7b. Pipe through middleware
      const outputChunks = await this.middlewareRunner.runOnChunk(
        this.middlewareCtx,
        outboundChunk,
      )

      // 7c. Decide consumer visibility — only yieldChunks=true callers get them.
      // We do NOT strip the finalization stream's RUN_STARTED/RUN_FINISHED:
      // they are the single outer lifecycle pair the consumer sees (the
      // agent-loop's pair was suppressed in streamModelResponse when
      // finalStructuredOutput.yieldChunks is true).
      if (this.finalStructuredOutput.yieldChunks) {
        for (const outputChunk of outputChunks) {
          if (outputChunk.type === EventType.RUN_ERROR) {
            runErrorYielded = true
          }
          yield outputChunk
          this.middlewareCtx.chunkIndex++
        }
      }

      // 7d. Terminate on error
      if (this.finalizationError) {
        break
      }
    }

    // Mid-finalization abort: don't attribute a missing-result error.
    // Let the engine's `finally` block in `run()` route to `onAbort` instead
    // of mis-routing through `onError`.
    if (this.isCancelled()) {
      return
    }

    // Empty stream / missing complete event
    if (!this.structuredOutputResult && !this.finalizationError) {
      this.finalizationError = {
        message: 'missing structured result',
        code: 'structured-output-missing-result',
      }
    }

    // Run schema validation INSIDE the engine — before the terminal hook
    // chooser runs. Per spec §7.3, validation failures must route through
    // `onError`, not `onFinish`. We do this by writing to `finalizationError`
    // so the chooser in `run()` picks `onError`.
    if (
      this.structuredOutputResult &&
      !this.finalizationError &&
      this.finalStructuredOutput.validate
    ) {
      try {
        const validated = this.finalStructuredOutput.validate(
          this.structuredOutputResult.data,
        )
        this.validatedStructuredOutput = validated
        this.hasValidatedStructuredOutput = true
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        this.finalizationError = {
          message,
          code: 'structured-output-validation-failed',
          cause: err,
        }
      }
    }

    // Streaming consumers must see a RUN_ERROR for finalization failures
    // (missing-result, validation-failed, or a finalizationError set after
    // a structured-output.complete already yielded). Without this synthetic
    // emission, the `for await` on the engine ends silently for the client.
    //
    // Skip when a RUN_ERROR was already yielded from the inner stream
    // (otherwise the consumer would see two error events for one failure).
    if (
      this.finalizationError &&
      this.finalStructuredOutput.yieldChunks &&
      !runErrorYielded
    ) {
      // Empty-stream case: no in-loop synthesis fired because no chunks
      // arrived. Synthesize `structured-output.start` here so the client-side
      // StreamProcessor can route the upcoming RUN_ERROR to a
      // `StructuredOutputPart` instead of dropping it as an orphan error.
      if (!startEmitted) {
        const synthStart = buildSynthesizedStart()
        const startOutputs = await pipeThroughMiddleware(synthStart)
        for (const outputChunk of startOutputs) {
          yield outputChunk
          this.middlewareCtx.chunkIndex++
        }
        startEmitted = true
      }

      const errChunk: StreamChunk = {
        type: EventType.RUN_ERROR,
        runId: this.runIdOverride ?? this.requestId,
        model: this.params.model,
        timestamp: Date.now(),
        threadId: this.threadId,
        message: this.finalizationError.message,
        ...(this.finalizationError.code
          ? { code: this.finalizationError.code }
          : {}),
        error: {
          message: this.finalizationError.message,
          ...(this.finalizationError.code
            ? { code: this.finalizationError.code }
            : {}),
        },
      }
      const outputChunks = await this.middlewareRunner.runOnChunk(
        this.middlewareCtx,
        errChunk,
      )
      for (const outputChunk of outputChunks) {
        yield outputChunk
        this.middlewareCtx.chunkIndex++
      }
    }
  }

  /**
   * Native combined mode: harvest the structured output from the agent
   * loop's accumulated final-turn text (no separate provider call).
   *
   * The adapter wired `outputSchema` into the regular `chatStream` request,
   * so the model's final-turn text is the schema-constrained JSON. We parse
   * `this.accumulatedContent`, populate `this.structuredOutputResult`, emit
   * a synthetic `structured-output.complete` (and a `structured-output.start`
   * if one wasn't emitted earlier — only happens on the streaming path when
   * the model returned no text at all), and run the validate callback when
   * present. Failures populate `this.finalizationError` so the engine's
   * terminal-hook chooser routes to `onError` (per spec §7.3).
   *
   * The `'structuredOutput'` middleware phase intentionally does NOT fire on
   * this path — middleware sees the run through `beforeModel` / `modelStream`
   * as usual. See PR #605 / issue #605 for the design rationale.
   */
  private async *harvestCombinedStructuredOutput(): AsyncGenerator<StreamChunk> {
    if (!this.finalStructuredOutput) {
      throw new Error(
        'harvestCombinedStructuredOutput called without finalStructuredOutput config',
      )
    }

    const yieldChunks = this.finalStructuredOutput.yieldChunks
    const rawText = this.accumulatedContent

    // Empty final-turn text means the agent loop terminated without the
    // model emitting any assistant content (e.g. early termination after
    // tool calls). Mirror the fallback path's "missing structured result"
    // error rather than silently returning undefined.
    if (rawText.length === 0) {
      this.finalizationError = {
        message: 'missing structured result',
        code: 'structured-output-missing-result',
      }
    } else {
      try {
        const parsed: unknown = JSON.parse(rawText)
        // Normalize (un-widen) before storing so the synthesized
        // structured-output.complete chunk and the Promise<T> result both
        // carry the cleaned payload. JSON.parse preserves provider nulls, so
        // this is where native-combined output gets its widening undone.
        const data = this.finalStructuredOutput.normalize
          ? this.finalStructuredOutput.normalize(parsed)
          : parsed
        this.structuredOutputResult = { data, rawText }
      } catch (err: unknown) {
        const detail =
          rawText.slice(0, 200) + (rawText.length > 200 ? '...' : '')
        this.finalizationError = {
          message: `Failed to parse structured output as JSON. Content: ${detail}`,
          code: 'structured-output-parse-failed',
          cause: err,
        }
      }
    }

    // Validate against the Standard Schema (when supplied). Validation
    // failures route through onError just like the fallback path.
    if (
      this.structuredOutputResult &&
      !this.finalizationError &&
      this.finalStructuredOutput.validate
    ) {
      try {
        const validated = this.finalStructuredOutput.validate(
          this.structuredOutputResult.data,
        )
        this.validatedStructuredOutput = validated
        this.hasValidatedStructuredOutput = true
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        this.finalizationError = {
          message,
          code: 'structured-output-validation-failed',
          cause: err,
        }
      }
    }

    if (!yieldChunks) {
      // Promise<T> path: state is populated, nothing to yield. The
      // activity-layer caller pulls `structuredOutputResult` /
      // `validatedStructuredOutput` directly.
      return
    }

    // Streaming path: emit a synthetic `structured-output.start` if the
    // model produced no text at all (so the client snaps an errored
    // StructuredOutputPart rather than nothing). The normal path already
    // emitted start before the first TEXT_MESSAGE_START in
    // `streamModelResponse`.
    if (!this.combinedStartEmitted) {
      this.combinedStartEmitted = true
      const messageId = this.combinedStructuredMessageId ?? generateMessageId()
      this.combinedStructuredMessageId = messageId
      const synthStart: StreamChunk = {
        type: EventType.CUSTOM,
        name: 'structured-output.start',
        value: { messageId },
        model: this.params.model,
        timestamp: Date.now(),
        threadId: this.threadId,
        ...(this.runIdOverride ? { runId: this.runIdOverride } : {}),
      }
      const startOutputs = await this.middlewareRunner.runOnChunk(
        this.middlewareCtx,
        synthStart,
      )
      for (const outputChunk of startOutputs) {
        yield outputChunk
        this.middlewareCtx.chunkIndex++
      }
    }

    // On success, emit the synthetic `structured-output.complete` carrying
    // the parsed object + raw text. Pin the messageId so the client-side
    // handler can target the right UIMessage even when the agent loop's
    // terminal RUN_FINISHED has already cleared `activeMessageIds` (the
    // complete event yields AFTER the loop ends, by which point
    // `getActiveAssistantMessageId()` returns null and would otherwise drop
    // the event silently).
    if (this.structuredOutputResult && !this.finalizationError) {
      const completeChunk: StreamChunk = {
        type: EventType.CUSTOM,
        name: 'structured-output.complete',
        value: {
          object: this.structuredOutputResult.data,
          raw: this.structuredOutputResult.rawText,
          ...(this.combinedStructuredMessageId
            ? { messageId: this.combinedStructuredMessageId }
            : {}),
        },
        model: this.params.model,
        timestamp: Date.now(),
        threadId: this.threadId,
        ...(this.runIdOverride ? { runId: this.runIdOverride } : {}),
      }
      const completeOutputs = await this.middlewareRunner.runOnChunk(
        this.middlewareCtx,
        completeChunk,
      )
      for (const outputChunk of completeOutputs) {
        yield outputChunk
        this.middlewareCtx.chunkIndex++
      }
    }

    // On failure, emit a synthetic RUN_ERROR so the streaming consumer's
    // `for await` doesn't end silently. Mirrors the fallback path.
    if (this.finalizationError) {
      const errChunk: StreamChunk = {
        type: EventType.RUN_ERROR,
        runId: this.runIdOverride ?? this.requestId,
        model: this.params.model,
        timestamp: Date.now(),
        threadId: this.threadId,
        message: this.finalizationError.message,
        ...(this.finalizationError.code
          ? { code: this.finalizationError.code }
          : {}),
        error: {
          message: this.finalizationError.message,
          ...(this.finalizationError.code
            ? { code: this.finalizationError.code }
            : {}),
        },
      }
      const errOutputs = await this.middlewareRunner.runOnChunk(
        this.middlewareCtx,
        errChunk,
      )
      for (const outputChunk of errOutputs) {
        yield outputChunk
        this.middlewareCtx.chunkIndex++
      }
    }
  }

  private buildMiddlewareConfig(): ChatMiddlewareConfig {
    return {
      messages: this.messages,
      systemPrompts: [...this.systemPrompts],
      tools: [...this.tools],
      resume: this.params.resume,
      resumeToolState: {
        approvals: this.resumeApprovals,
        clientToolResults: this.resumeClientToolResults,
        deniedToolResults: this.resumeDeniedToolResults,
        cancelledToolCallIds: this.resumeCancelledToolCallIds,
      },
      metadata: this.params.metadata,
      modelOptions: this.params.modelOptions,
    }
  }

  private async applyEphemeralInterruptResume(
    config: ChatMiddlewareConfig,
  ): Promise<void> {
    if (
      (config.resume?.length ?? 0) === 0 ||
      getInterruptPersistence(this.middlewareCtx, { optional: true })
    ) {
      return
    }

    const interruptedRunId = this.parentRunIdOverride
    if (!interruptedRunId) {
      throw new InterruptResumeValidationError([
        {
          scope: 'batch',
          threadId: this.threadId,
          interruptedRunId: this.runIdOverride ?? this.requestId,
          generation: 0,
          interruptIds: config.resume?.map((entry) => entry.interruptId) ?? [],
          code: 'stale',
          message:
            'Interrupt continuation requires parentRunId to identify the interrupted run.',
          source: 'server',
          retryable: false,
        },
      ])
    }

    const approvalRequests: Array<ApprovalRequest> = []
    const clientRequests: Array<ClientToolRequest> = []
    const pendingToolCalls = this.getPendingToolCallsFromMessages()
    const resumeInterruptIds = new Set(
      config.resume?.map((entry) => entry.interruptId),
    )
    const toolInputs = new Map<string, unknown>()
    const toolsByCallId = new Map<string, AnyRuntimeTool>()
    const clientExecutionCallIds = new Set<string>()

    for (const toolCall of pendingToolCalls) {
      const tool = this.tools.find(
        (candidate) => candidate.name === toolCall.function.name,
      )
      if (!tool) continue
      toolsByCallId.set(toolCall.id, tool)
      let input: unknown = {}
      try {
        const parsed = JSON.parse(toolCall.function.arguments.trim() || '{}')
        input = parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        input = {}
      }
      toolInputs.set(toolCall.id, input)
      if (
        !tool.execute &&
        resumeInterruptIds.has(`client_tool_${toolCall.id}`)
      ) {
        clientExecutionCallIds.add(toolCall.id)
      }
    }

    // Mirror executeToolCalls' scheduling boundary. Server execution remains
    // gated while any approval is outstanding, but plain client tools are
    // represented in the same interrupt batch because requesting their output
    // does not execute a server-side effect.
    for (const toolCall of pendingToolCalls) {
      const tool = toolsByCallId.get(toolCall.id)
      if (tool?.needsApproval && !clientExecutionCallIds.has(toolCall.id)) {
        approvalRequests.push({
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolInputs.get(toolCall.id) ?? {},
          approvalId: `approval_${toolCall.id}`,
        })
      }
    }

    for (const toolCall of pendingToolCalls) {
      const tool = toolsByCallId.get(toolCall.id)
      if (
        tool !== undefined &&
        !tool.execute &&
        (!tool.needsApproval || clientExecutionCallIds.has(toolCall.id))
      ) {
        clientRequests.push({
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolInputs.get(toolCall.id) ?? {},
        })
      }
    }

    const pending = this.buildActionableInterrupts(
      approvalRequests,
      clientRequests,
    ).flatMap((descriptor) => {
      const unopened = readUnopenedInterruptBinding(descriptor)
      return unopened
        ? [
            {
              interruptId: descriptor.id,
              payload: descriptor,
              binding: {
                ...unopened,
                interruptedRunId,
                generation: 0,
              } satisfies InterruptBinding,
            },
          ]
        : []
    })
    const validated = await validateInterruptResumeBatch({
      threadId: this.threadId,
      interruptedRunId,
      generation: 0,
      pending,
      resume: config.resume,
      tools: this.tools,
    })
    if (validated.errors.length > 0 || !validated.resumeToolState) {
      throw new InterruptResumeValidationError(validated.errors)
    }

    // A client-tool execution interrupt can only be emitted after an
    // approval-required client tool was approved in the preceding ephemeral
    // run. Reconstruct that phase marker from the trusted `client_tool_*`
    // continuation so executeToolCalls consumes the validated client output
    // instead of asking for approval again.
    const approvals = new Map(validated.resumeToolState.approvals)
    for (const request of clientRequests) {
      if (toolsByCallId.get(request.toolCallId)?.needsApproval) {
        approvals.set(request.toolCallId, true)
      }
    }
    this.applyResumeToolState({
      ...validated.resumeToolState,
      approvals,
    })
  }

  private applyResumeToolState(state: ChatResumeToolState | undefined): void {
    if (state?.approvals) {
      for (const [approvalId, resolution] of state.approvals) {
        this.resumeApprovals.set(approvalId, resolution)
      }
    }
    if (state?.clientToolResults) {
      for (const [toolCallId, result] of state.clientToolResults) {
        this.resumeClientToolResults.set(toolCallId, result)
      }
    }
    if (state?.deniedToolResults) {
      for (const [toolCallId, result] of state.deniedToolResults) {
        this.resumeDeniedToolResults.set(toolCallId, result)
      }
    }
    if (state?.cancelledToolCallIds) {
      for (const toolCallId of state.cancelledToolCallIds) {
        this.resumeCancelledToolCallIds.add(toolCallId)
      }
    }
  }

  private applyMiddlewareConfig(config: ChatMiddlewareConfig): void {
    this.applyResumeToolState(config.resumeToolState)
    this.messages = config.messages
    this.systemPrompts = config.systemPrompts
    this.tools = config.tools
    this.params = {
      ...this.params,
      metadata: config.metadata,
      modelOptions: config.modelOptions,
    }

    // Sync context fields that depend on config
    this.middlewareCtx.messages = this.messages
    this.middlewareCtx.systemPrompts = this.systemPrompts
    this.middlewareCtx.hasTools = this.tools.length > 0
    this.middlewareCtx.toolNames = this.tools.map((t) => t.name)
    this.middlewareCtx.modelOptions = config.modelOptions
  }

  private setToolPhase(phase: ToolPhaseResult): void {
    this.toolPhase = phase
  }

  /**
   * Pipe a single chunk through the middleware pipeline (strip-to-spec, devtools, etc.)
   * and yield all resulting output chunks.
   */
  private async *pipeThroughMiddleware(
    chunk: StreamChunk,
  ): AsyncGenerator<StreamChunk, void, void> {
    const outputChunks = await this.middlewareRunner.runOnChunk(
      this.middlewareCtx,
      chunk,
    )
    for (const outputChunk of outputChunks) {
      yield outputChunk
      this.middlewareCtx.chunkIndex++
    }
  }

  /**
   * Drain queued `sandbox.file` chunks (emitted via the SandboxRuntime sink)
   * through the middleware pipeline and into the public stream.
   */
  private async *drainSandboxFileQueue(): AsyncGenerator<StreamChunk> {
    while (this.sandboxFileQueue.length > 0) {
      const chunk = this.sandboxFileQueue.shift()
      if (chunk) yield* this.pipeThroughMiddleware(chunk)
    }
  }

  /**
   * Drain an executeToolCalls async generator, yielding any CustomEvent chunks
   * through the middleware pipeline and returning the final ExecuteToolCallsResult.
   */
  private async *drainToolCallGenerator(
    generator: AsyncGenerator<
      CustomEvent,
      {
        results: Array<ToolResult>
        needsApproval: Array<ApprovalRequest>
        needsClientExecution: Array<ClientToolRequest>
      },
      void
    >,
  ): AsyncGenerator<
    StreamChunk,
    {
      results: Array<ToolResult>
      needsApproval: Array<ApprovalRequest>
      needsClientExecution: Array<ClientToolRequest>
    },
    void
  > {
    let next = await generator.next()
    while (!next.done) {
      yield* this.pipeThroughMiddleware(next.value)
      next = await generator.next()
    }
    return next.value
  }

  private createCustomEventChunk(
    eventName: string,
    value: Record<string, any>,
  ): CustomEvent {
    return {
      type: 'CUSTOM',
      timestamp: Date.now(),
      model: this.params.model,
      name: eventName,
      value,
    } as CustomEvent
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Text activity - handles agentic text generation, one-shot text generation, and agentic structured output.
 *
 * This activity supports four modes:
 * 1. **Streaming agentic text**: Stream responses with automatic tool execution
 * 2. **Streaming one-shot text**: Simple streaming request/response without tools
 * 3. **Non-streaming text**: Returns collected text as a string (stream: false)
 * 4. **Agentic structured output**: Run tools, then return structured data
 *
 * @example Full agentic text (streaming with tools)
 * ```ts
 * import { chat } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * for await (const chunk of chat({
 *   adapter: openaiText('gpt-5.5'),
 *   messages: [{ role: 'user', content: 'What is the weather?' }],
 *   tools: [weatherTool]
 * })) {
 *   if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
 *     console.log(chunk.delta)
 *   }
 * }
 * ```
 *
 * @example One-shot text (streaming without tools)
 * ```ts
 * for await (const chunk of chat({
 *   adapter: openaiText('gpt-5.5'),
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * })) {
 *   console.log(chunk)
 * }
 * ```
 *
 * @example Non-streaming text (stream: false)
 * ```ts
 * const text = await chat({
 *   adapter: openaiText('gpt-5.5'),
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   stream: false
 * })
 * // text is a string with the full response
 * ```
 *
 * @example Agentic structured output (tools + structured response)
 * ```ts
 * import { z } from 'zod'
 *
 * const result = await chat({
 *   adapter: openaiText('gpt-5.5'),
 *   messages: [{ role: 'user', content: 'Research and summarize the topic' }],
 *   tools: [researchTool, analyzeTool],
 *   outputSchema: z.object({
 *     summary: z.string(),
 *     keyPoints: z.array(z.string())
 *   })
 * })
 * // result is { summary: string, keyPoints: string[] }
 * ```
 */
export function chat<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined = undefined,
  TStream extends boolean = boolean,
  const TTools extends TextActivityOptions<
    TAdapter,
    TSchema,
    TStream,
    any
  >['tools'] = TextActivityOptions<TAdapter, TSchema, TStream, any>['tools'],
  const TMiddleware extends TextActivityOptions<
    TAdapter,
    TSchema,
    TStream,
    any
  >['middleware'] = TextActivityOptions<
    TAdapter,
    TSchema,
    TStream,
    any
  >['middleware'],
>(
  options: TextActivityOptionsWithContext<
    TAdapter,
    TSchema,
    TStream,
    TTools,
    TMiddleware
  >,
): TextActivityResult<TSchema, TStream> {
  validateCapabilities(options.middleware ?? [], options.adapter)

  const { outputSchema, stream } = options

  // outputSchema + stream:true is the only branch that streams structured
  // output. Without an explicit `stream: true`, schema-bearing calls run the
  // agent loop and resolve to a typed Promise<InferSchemaType<TSchema>>.
  if (outputSchema && stream === true) {
    return runStreamingStructuredOutput({
      ...options,
      outputSchema,
      stream,
    }) as TextActivityResult<TSchema, TStream>
  }

  // If outputSchema is provided, run agentic structured output (Promise<T>)
  if (outputSchema) {
    return runAgenticStructuredOutput({
      ...options,
      outputSchema,
    }) as TextActivityResult<TSchema, TStream>
  }

  // If stream is explicitly false, run non-streaming text
  if (stream === false) {
    return runNonStreamingText({
      ...options,
      outputSchema: undefined,
      stream,
    }) as TextActivityResult<TSchema, TStream>
  }

  // Otherwise, run streaming text (default)
  return runStreamingText({
    ...options,
    outputSchema: undefined,
    stream,
  }) as TextActivityResult<TSchema, TStream>
}

/**
 * Run streaming text (agentic or one-shot depending on tools)
 */
async function* runStreamingText<TContext = unknown>(
  options: TextActivityOptions<AnyTextAdapter, undefined, true, TContext>,
): AsyncIterable<StreamChunk> {
  const { adapter, middleware, context, debug, mcp, ...textOptions } = options
  const model = adapter.model
  const logger = resolveDebugOption(debug)

  const mcpManager = MCPManager.from(mcp)
  const mcpTools = await mcpManager.discover()
  if (mcpTools.length > 0) {
    textOptions.tools = [...(textOptions.tools ?? []), ...mcpTools]
  }

  const engine = new TextEngine(
    {
      adapter,
      params: { ...textOptions, model, logger } as TextOptions<
        Record<string, any>,
        Record<string, any>,
        TContext
      >,
      middleware,
      context,
    },
    logger,
  )

  try {
    for await (const chunk of engine.run()) {
      yield chunk
    }
  } finally {
    await mcpManager.dispose()
  }
}

/**
 * Run non-streaming text - collects all content and returns as a string.
 * Runs the full agentic loop (if tools are provided) but returns collected text.
 */
function runNonStreamingText<TContext = unknown>(
  options: TextActivityOptions<AnyTextAdapter, undefined, false, TContext>,
): Promise<string> {
  // Run the streaming text and collect all text using streamToText.
  const stream = runStreamingText(
    // eslint-disable-next-line no-restricted-syntax -- generic-stream remap: caller is non-streaming (false), but runStreamingText is invoked internally to collect text; concrete `false`→`true` literals don't structurally overlap.
    options as unknown as TextActivityOptions<
      AnyTextAdapter,
      undefined,
      true,
      TContext
    >,
  )

  return streamToText(stream)
}

/**
 * Run agentic structured output:
 * 1. Execute the full agentic loop (with tools)
 * 2. Once complete, call adapter.structuredOutput with the conversation context
 * 3. Validate and return the structured result
 */
async function runAgenticStructuredOutput<
  TSchema extends SchemaInput,
  TContext = unknown,
>(
  options: TextActivityOptions<AnyTextAdapter, TSchema, boolean, TContext>,
): Promise<InferSchemaType<TSchema>> {
  const {
    adapter,
    outputSchema,
    middleware,
    context,
    debug,
    mcp,
    ...textOptions
  } = options
  const model = adapter.model
  const logger = resolveDebugOption(debug)

  if (!outputSchema) {
    throw new Error('outputSchema is required for structured output')
  }

  // Same strict-conversion as the streaming path (`forStructuredOutput: true`)
  // so the same Zod schema produces the same JSON Schema regardless of
  // stream mode — Promise<T> and stream:true must not diverge here. The same
  // pass also records a `nullWideningMap`: optional fields are widened to
  // `required` + nullable for the provider, which then returns `null` for an
  // absent optional — a `null` the original `.optional()` (`T | undefined`)
  // schema would otherwise reject. The map pinpoints exactly those synthesized
  // nulls so `undoNullWidening` can drop them while preserving the ones a
  // `.nullable()` field genuinely allows.
  const { jsonSchema, nullWideningMap } =
    convertSchemaForStructuredOutput(outputSchema)
  if (!jsonSchema) {
    throw new Error('Failed to convert output schema to JSON Schema')
  }

  // Un-widening runs in the engine the moment the structured output is
  // captured (`finalStructuredOutput.normalize`), so it applies uniformly to
  // every adapter and to both stream modes — the engine is the only layer
  // holding the schema's `nullWideningMap`. Validation then runs on the
  // already-normalized data, so `validate` is a plain Standard Schema parse.
  const normalize = (data: unknown): unknown =>
    undoNullWidening(data, nullWideningMap)

  // Validation runs INSIDE the engine (per spec §7.3) so validation failures
  // route through the engine's terminal-hook chooser as `onError`. We pass a
  // `validate` callback when the schema is a Standard Schema; otherwise we
  // pass through the (normalized) data and the engine returns it unchanged.
  const validate = isStandardSchema(outputSchema)
    ? (data: unknown): unknown =>
        parseWithStandardSchema<InferSchemaType<TSchema>>(outputSchema, data)
    : undefined

  // Per issue #605: same capability check as the streaming path. When the
  // adapter handles tools + schema natively, the engine skips the separate
  // structured-output finalization call and harvests the JSON from the
  // agent loop's accumulated final-turn text.
  const nativeCombined =
    adapter.supportsCombinedToolsAndSchema?.(options.modelOptions) === true

  const mcpManager = MCPManager.from(mcp)
  const mcpTools = await mcpManager.discover()
  if (mcpTools.length > 0) {
    textOptions.tools = [...(textOptions.tools ?? []), ...mcpTools]
  }

  const engine = new TextEngine(
    {
      adapter,
      params: { ...textOptions, model, logger } as TextOptions<
        Record<string, unknown>,
        Record<string, unknown>,
        TContext
      >,
      middleware,
      context,
      finalStructuredOutput: {
        jsonSchema,
        yieldChunks: false,
        normalize,
        ...(validate ? { validate } : {}),
        ...(nativeCombined ? { nativeCombined: true } : {}),
      },
    },
    logger,
  )

  try {
    // Consume the stream — chunks pipe through middleware but are not yielded externally
    for await (const _chunk of engine.run()) {
      // intentionally empty
    }
  } finally {
    await mcpManager.dispose()
  }

  const finalizationError = engine.getFinalizationError()
  if (finalizationError) {
    const err = new Error(
      finalizationError.message,
      finalizationError.cause !== undefined
        ? { cause: finalizationError.cause }
        : undefined,
    )
    if (finalizationError.code !== undefined) {
      Object.defineProperty(err, 'code', {
        value: finalizationError.code,
        enumerable: true,
      })
    }
    throw err
  }

  // If a validator ran, return the validated value (typed by InferSchemaType
  // via the callback closure). Otherwise return the raw data.
  const validated = engine.getValidatedStructuredOutput()
  if (validated) {
    return validated.value as InferSchemaType<TSchema>
  }

  const result = engine.getStructuredOutputResult()
  if (!result) {
    throw new Error('structured output finalization produced no result')
  }
  return result.data as InferSchemaType<TSchema>
}

/**
 * Parse the `value` payload of a `structured-output.complete` CUSTOM event
 * into a typed shape, returning `null` if the runtime payload doesn't match.
 *
 * Uses an `unknown`-input runtime check rather than `as` casts so the engine
 * stays cast-free in its hot path.
 */
function readStructuredOutputCompleteValue(
  value: unknown,
): { object: unknown; raw: string; reasoning?: string } | null {
  if (typeof value !== 'object' || value === null) return null
  if (!('object' in value) || !('raw' in value)) return null
  const raw = (value as { raw: unknown }).raw
  if (typeof raw !== 'string') return null
  const reasoningField = (value as { reasoning?: unknown }).reasoning
  const reasoning =
    typeof reasoningField === 'string' ? reasoningField : undefined
  return {
    object: (value as { object: unknown }).object,
    raw,
    ...(reasoning !== undefined ? { reasoning } : {}),
  }
}

/**
 * Synthesize a streaming structured-output stream by wrapping a non-streaming
 * `structuredOutput` call. Used when an adapter doesn't implement
 * `structuredOutputStream` natively.
 *
 * `onAdapterError`, when provided, is invoked with the raw error from
 * `adapter.structuredOutput` before the synthesized RUN_ERROR is yielded.
 * The engine uses this to preserve the original error (stack, cause, custom
 * properties like provider `status`/`code`) as `finalizationError.cause`,
 * because the RUN_ERROR wire shape only carries `message` and `code`.
 */
async function* fallbackStructuredOutputStream(
  adapter: AnyTextAdapter,
  options: StructuredOutputOptions<Record<string, unknown>>,
  onAdapterError?: (err: unknown) => void,
): AsyncIterable<StreamChunk> {
  const { chatOptions } = options
  // Synthesize run/thread/message IDs only when the caller didn't supply them.
  // Prefix `fallback-` (not `mock-`) because this is production fallback code
  // used by adapters without native `structuredOutputStream`, not test fixtures.
  const fallbackRand = Math.random().toString(36).slice(2)
  const runId = chatOptions.runId ?? `fallback-${Date.now()}-${fallbackRand}`
  const threadId =
    chatOptions.threadId ?? `fallback-${Date.now()}-${fallbackRand}`
  const messageId = `fallback-${Date.now()}-${fallbackRand}`
  const model = chatOptions.model
  const timestamp = Date.now()

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    model,
    timestamp,
  }

  let result: StructuredOutputResult<unknown>
  try {
    result = await adapter.structuredOutput(options)
  } catch (error) {
    onAdapterError?.(error)
    const message = error instanceof Error ? error.message : String(error)
    yield {
      type: EventType.RUN_ERROR,
      runId,
      threadId,
      model,
      timestamp,
      message,
      error: { message },
    }
    return
  }

  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: 'assistant',
    model,
    timestamp,
  }

  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: result.rawText,
    model,
    timestamp,
  }

  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    model,
    timestamp,
  }

  yield {
    type: EventType.CUSTOM,
    name: 'structured-output.complete',
    value: { object: result.data, raw: result.rawText },
    model,
    timestamp,
  }

  yield {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    model,
    timestamp,
    finishReason: 'stop',
    // Forward adapter-reported token usage so consumers reading
    // `RUN_FINISHED.usage` (and the engine's `runOnUsage` middleware hook) see
    // it on the fallback path, mirroring the native streaming path. The
    // conditional spread avoids emitting `usage: undefined` for adapters that
    // don't report it. See #758.
    ...(result.usage ? { usage: result.usage } : {}),
  }
}

/**
 * Run streaming structured output via the TextEngine, with the engine's
 * `finalStructuredOutput.yieldChunks: true` mode. The agent loop's
 * RUN_STARTED/RUN_FINISHED are suppressed; the structured-output finalization
 * step's pair brackets the run for the consumer.
 *
 * Standard Schema *validation* is intentionally NOT run on this path — it is
 * the consumer's responsibility. This is a deliberate asymmetry vs.
 * `runAgenticStructuredOutput` (Promise<T> path), which DOES validate inside
 * the engine and routes validation failures through `onError`. The reason:
 * streaming consumers typically render partial JSON progressively (via
 * `parsePartialJSON` or `useChat`'s `partial` slot) and validate downstream
 * after assembly. Running validation server-side would force a hard error
 * on partial-by-design payloads. See `docs/structured-outputs/overview.md`.
 *
 * Null-widening normalization, however, IS run on both paths: the
 * `structured-output.complete` CUSTOM event is forwarded with its `value.object`
 * already un-widened (synthesized strict-mode nulls dropped, genuine
 * `.nullable()` nulls kept), so a consumer validating the assembled object
 * against the original schema doesn't choke on a `null` for an `.optional()`
 * field. Same `convertSchemaForStructuredOutput` pass and same
 * `undoNullWidening` map as the Promise<T> path — the two must not diverge.
 *
 * Pre-flight validation (missing schema, unconvertible schema) throws
 * synchronously at call time rather than as a yielded RUN_ERROR mid-stream —
 * those are programmer errors, not runtime conditions.
 */
function runStreamingStructuredOutput<
  TSchema extends SchemaInput,
  TContext = unknown,
>(
  options: TextActivityOptions<AnyTextAdapter, TSchema, true, TContext>,
): StructuredOutputStream<InferSchemaType<TSchema>> {
  const { outputSchema } = options

  if (!outputSchema) {
    throw new Error('outputSchema is required for streaming structured output')
  }

  // forStructuredOutput strict-converts the schema once at the activity
  // boundary, capturing the null-widening map so the engine can un-widen the
  // provider's response before it reaches the consumer. Adapters can re-convert
  // if their wire format diverges, but the default flow hands them a
  // strict-ready schema.
  const { jsonSchema, nullWideningMap } =
    convertSchemaForStructuredOutput(outputSchema)
  if (!jsonSchema) {
    throw new Error('Failed to convert output schema to JSON Schema')
  }
  const normalize = (data: unknown): unknown =>
    undoNullWidening(data, nullWideningMap)

  // The implementation generator yields the broader internal type
  // (`StreamChunk | StructuredOutputCompleteEvent<T>`) so middleware and
  // tool-emitted CustomEvents can flow through. Core approval/client-tool
  // waits are represented by RUN_FINISHED interrupt outcomes, not by direct
  // CUSTOM wait events.
  // The contained cast keeps the public stream type focused on
  // structured-output completion.
  return runStreamingStructuredOutputImpl(
    options,
    jsonSchema,
    normalize,
  ) as StructuredOutputStream<InferSchemaType<TSchema>>
}

/**
 * Internal generator return type — broader than the public
 * `StructuredOutputStream<T>`. The structured-output completion event remains
 * the pinned public CUSTOM event for this stream; approval and client-tool
 * waits now surface as RUN_FINISHED interrupt outcomes. At runtime, tools can
 * still emit arbitrary user-defined `CustomEvent`s through the
 * `emitCustomEvent` context API; those flow
 * through this generator with `name: string` and are widened out at the
 * public boundary because keeping them would collapse the typed narrow back
 * to `any`. The cast inside `runStreamingStructuredOutput` is where that
 * widening happens.
 */
type StructuredOutputStreamInternal<T> = AsyncIterable<
  StreamChunk | StructuredOutputCompleteEvent<T>
>

async function* runStreamingStructuredOutputImpl<
  TSchema extends SchemaInput,
  TContext = unknown,
>(
  options: TextActivityOptions<AnyTextAdapter, TSchema, true, TContext>,
  jsonSchema: NonNullable<ReturnType<typeof convertSchemaToJsonSchema>>,
  normalize: (data: unknown) => unknown,
): StructuredOutputStreamInternal<InferSchemaType<TSchema>> {
  const {
    adapter,
    outputSchema,
    middleware,
    context,
    debug,
    mcp,
    ...textOptions
  } = options
  const model = adapter.model
  const logger = resolveDebugOption(debug)

  // Per issue #605: adapters that natively combine tools + schema-constrained
  // output in one streaming call (modern OpenAI, Anthropic 4.5+, Gemini 3+,
  // Grok 4+) opt in via `supportsCombinedToolsAndSchema()`. The engine then
  // forwards the schema into the regular `chatStream` call and harvests the
  // structured result from the agent loop's accumulated text — no separate
  // finalization round-trip, and the `'structuredOutput'` middleware phase
  // does not fire.
  const nativeCombined =
    adapter.supportsCombinedToolsAndSchema?.(options.modelOptions) === true

  const mcpManager = MCPManager.from(mcp)
  const mcpTools = await mcpManager.discover()
  if (mcpTools.length > 0) {
    textOptions.tools = [...(textOptions.tools ?? []), ...mcpTools]
  }

  // Inputs may be UIMessages (from useChat) or ModelMessages (from server-side
  // callers). TextEngine handles the conversion uniformly.
  const engine = new TextEngine(
    {
      adapter,
      params: { ...textOptions, model, logger } as TextOptions<
        Record<string, unknown>,
        Record<string, unknown>,
        TContext
      >,
      middleware,
      context,
      finalStructuredOutput: {
        jsonSchema,
        yieldChunks: true,
        normalize,
        ...(nativeCombined ? { nativeCombined: true } : {}),
      },
    },
    logger,
  )

  try {
    for await (const chunk of engine.run()) {
      yield chunk
    }
  } finally {
    await mcpManager.dispose()
  }

  // Standard Schema validation for the streaming variant remains the
  // consumer's responsibility — they read the CUSTOM 'structured-output.complete'
  // from the yielded stream. (Null-widening normalization, by contrast, already
  // ran inside the engine via `normalize`, so the object they read is un-widened.)
  void outputSchema
}

// Re-export adapter types
export type {
  TextAdapter,
  TextAdapterConfig,
  StructuredOutputOptions,
  StructuredOutputResult,
} from './adapter'
export { BaseTextAdapter } from './adapter'
