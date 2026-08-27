import { devtoolsMiddleware } from '@tanstack/ai-event-client'
import { undoNullWidening } from '@tanstack/ai-utils'
import { streamToText } from '../../stream-to-response.js'
import { resolveDebugOption } from '../../logger/resolve'
import { EventType } from '../../types'
import {
  INTERRUPT_BINDING_METADATA_KEY,
  InterruptResumeValidationError,
  readInterruptBinding,
  readUnopenedInterruptBinding,
  validateInterruptResumeBatch,
} from '../../interrupt-resume'
import { INTERRUPT_BINDING_VERSION } from '../../interrupts'
import {
  INTERRUPT_PAYLOAD_METADATA_KEY,
  createInterruptBinding,
  rehydrateInterruptRequest,
} from '../../interrupt-definition'
import { readGenericInterruptContinuation } from '../../generic-interrupt-continuation'
import type {
  GenericInterruptRequest,
  InterruptDefinition,
} from '../../interrupt-definition'
import {
  canonicalInterruptJson,
  digestInterruptJson,
} from '../../interrupt-serialization'
import { rebuildTokenUsage } from '../../utilities/ag-ui-usage'
import { uiMessagesToWire } from '../../utilities/ag-ui-wire'
import {
  tanstackMetadata,
  withTanstackMetadata,
} from '../../utilities/merge-metadata'
import { normalizeStreamChunk } from '../../utilities/normalize-stream-chunk'
import { restorePublicUsage } from '../../utilities/restore-inbound-chunk'
import type { AdapterYieldChunk } from '../../utilities/adapter-yield-chunk'
import { normalizeToolResult } from '../../utilities/tool-result'
import { isProviderExecutedToolCall } from '../../utilities/provider-executed'
import { LazyToolManager } from './tools/lazy-tool-manager'
import { assertUniqueToolNames } from './tools/unique-tool-names'
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
import { isCancelRequestedReason } from './cancel'
import {
  convertMessagesToModelMessages,
  generateMessageId,
  modelMessagesToUIMessages,
  safeJsonStringify,
} from './messages'
import { MiddlewareRunner } from './middleware/compose'
import { getRunDetached } from './middleware/run-store'
import { publishRunDetachedSignal } from '../../delivery-detach'
import { publishRunDisconnectHandler } from '../../delivery-disconnect'
import { provideSandboxRuntime } from './middleware/sandbox-runtime'
import { provideRunDisconnect } from './middleware/run-disconnect'
import { CapabilityRegistry } from './middleware/capabilities'
import { validateCapabilities } from './middleware/validate'
import { MCPManager } from './mcp/manager'
import type {
  InterruptBinding,
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
  ModelMessage,
  ProviderTool,
  RunFinishedEvent,
  SchemaInput,
  StreamChunk,
  StructuredOutputCompleteEvent,
  StructuredOutputPart,
  StructuredOutputStream,
  TextMessageContentEvent,
  TextOptions,
  ToolCall,
  ToolCallArgsEvent,
  ReasoningEncryptedValueEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
  UIMessage,
} from '../../types'
import type {
  AnyChatMiddleware,
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ChatResumeGenericResolution,
  ChatResumeToolState,
  InterruptResolutionCollection,
  SandboxFileHookEvent,
  StructuredOutputMiddlewareConfig,
} from './middleware/types'
import { provideGenericInterruptDefinitionRegistry } from './middleware/generic-interrupts'
import type { CheckCoverage } from './middleware/builder'
import type { SystemPrompt } from '../../system-prompts'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type {
  ContextFromMiddleware,
  ContextFromTool,
  DefinedContext,
  MergeContext,
  UnionToIntersection,
} from './runtime-context-types'
import type { ChatMCPOptions } from './mcp/types'

/** The adapter kind this activity handles */
export const kind = 'text' as const

type AnyRuntimeTool = AnyTool
type RuntimeToolWithApproval = AnyRuntimeTool & {
  approvalSchema?: ApprovalSchemaConfig
}
const interruptBindingMetadataKey = INTERRUPT_BINDING_METADATA_KEY

interface StructuralInterruptFailure {
  error: Error
  errors: ReadonlyArray<InterruptSubmissionError>
}

function hasInterruptErrorFields(value: object): boolean {
  const hasScope =
    !('scope' in value) ||
    !('code' in value) ||
    !('message' in value) ||
    !('source' in value) ||
    !('retryable' in value) ||
    !('threadId' in value) ||
    !('interruptedRunId' in value) ||
    !('generation' in value)
  if (hasScope) {
    return false
  }
  return (
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.retryable === 'boolean' &&
    typeof value.threadId === 'string' &&
    typeof value.interruptedRunId === 'string' &&
    typeof value.generation === 'number'
  )
}

function isItemInterruptSubmissionError(value: object): boolean {
  return (
    'scope' in value &&
    value.scope === 'item' &&
    'interruptId' in value &&
    typeof value.interruptId === 'string' &&
    'source' in value &&
    (value.source === 'client' || value.source === 'server')
  )
}

function isBatchInterruptSubmissionError(value: object): boolean {
  return (
    'scope' in value &&
    value.scope === 'batch' &&
    'interruptIds' in value &&
    Array.isArray(value.interruptIds) &&
    value.interruptIds.every((id) => typeof id === 'string') &&
    'source' in value &&
    (value.source === 'client' ||
      value.source === 'server' ||
      value.source === 'transport')
  )
}

function isInterruptSubmissionError(
  value: unknown,
): value is InterruptSubmissionError {
  const isInvalid =
    value === null || typeof value !== 'object' || Array.isArray(value)
  if (isInvalid) {
    return false
  }
  if (!hasInterruptErrorFields(value)) return false
  const hasScope = 'scope' in value && value.scope === 'item'
  if (hasScope) {
    return isItemInterruptSubmissionError(value)
  }
  return isBatchInterruptSubmissionError(value)
}

function parseEphemeralToolInput(toolCall: ToolCall): unknown {
  try {
    const parsed = JSON.parse(toolCall.function.arguments.trim() || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function structuralInterruptFailure(
  error: unknown,
): StructuralInterruptFailure | undefined {
  const isEmptyInterruptResumeValidationError =
    !(error instanceof Error) ||
    error.name !== 'InterruptResumeValidationError' ||
    !('errors' in error) ||
    !Array.isArray(error.errors) ||
    error.errors.length === 0 ||
    !error.errors.every(isInterruptSubmissionError)
  if (isEmptyInterruptResumeValidationError) {
    return undefined
  }
  return {
    error,
    errors: error.errors,
  }
}

function normalizePublicInterruptBinding(
  value: unknown,
  expectedInterruptId: string,
): InterruptBinding | undefined {
  return readInterruptBinding({
    id: expectedInterruptId,
    reason: '',
    metadata: { [INTERRUPT_BINDING_METADATA_KEY]: value },
  })
}

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

type RegistryInterrupt<
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
> = [TInterrupts[number]] extends [never] ? never : TInterrupts[number]

type DuplicateInterruptDefinitionId<
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
  TSeenIds extends string = never,
> = TInterrupts extends readonly [infer THead, ...infer TTail]
  ? THead extends InterruptDefinition<infer TId, any, any, any>
    ? string extends TId
      ? TTail extends ReadonlyArray<InterruptDefinition<any, any, any, any>>
        ? DuplicateInterruptDefinitionId<TTail, TSeenIds>
        : never
      : TId extends TSeenIds
        ? TId
        : TTail extends ReadonlyArray<InterruptDefinition<any, any, any, any>>
          ? DuplicateInterruptDefinitionId<TTail, TSeenIds | TId>
          : never
    : never
  : never

type CheckUniqueInterruptDefinitions<
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
> = [DuplicateInterruptDefinitionId<TInterrupts>] extends [never]
  ? unknown
  : {
      readonly '✖ Duplicate interrupt definition id in chat({ interrupts }).': never
    }

type InlineChatContext<TTools, TContext> = MergeContext<
  ContextFromArray<NonNullable<TTools>>,
  TContext
>

type RegistryChatMiddleware<
  TContext,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
> = ChatMiddleware<TContext, RegistryInterrupt<TInterrupts>>

type MiddlewareInterruptDefinitions<TMiddleware> =
  TMiddleware extends ReadonlyArray<infer TMiddlewareItem>
    ? TMiddlewareItem extends ChatMiddleware<any, infer TDefinitions>
      ? TDefinitions
      : never
    : never

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type CheckInterruptRegistry<
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
  TMiddleware,
> =
  IsAny<MiddlewareInterruptDefinitions<TMiddleware>> extends true
    ? unknown
    : [MiddlewareInterruptDefinitions<TMiddleware>] extends [never]
      ? unknown
      : [
            Exclude<
              MiddlewareInterruptDefinitions<TMiddleware>,
              RegistryInterrupt<TInterrupts>
            >,
          ] extends [never]
        ? unknown
        : {
            readonly '✖ Middleware emits an interrupt definition that is not registered in chat({ interrupts }).': never
          }

type RuntimeContextOption<TTools, TMiddleware, TContext> = [
  MergeContext<ContextFromInputs<TTools, TMiddleware>, TContext>,
] extends [never]
  ? { context?: TContext }
  : undefined extends MergeContext<
        ContextFromInputs<TTools, TMiddleware>,
        TContext
      >
    ? {
        context?: MergeContext<ContextFromInputs<TTools, TMiddleware>, TContext>
      }
    : {
        context: MergeContext<ContextFromInputs<TTools, TMiddleware>, TContext>
      }

type ExactMiddlewareOption<
  TTools,
  TContext,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
  TMiddleware extends Array<unknown> | undefined,
> = [TMiddleware] extends [undefined]
  ? Array<
      RegistryChatMiddleware<
        InlineChatContext<TTools, TContext>,
        NoInfer<TInterrupts>
      >
    >
  : TMiddleware &
      (TMiddleware extends Array<
        RegistryChatMiddleware<
          InlineChatContext<TTools, NoInfer<TContext>>,
          NoInfer<TInterrupts>
        >
      >
        ? Array<
            RegistryChatMiddleware<
              InlineChatContext<TTools, TContext>,
              NoInfer<TInterrupts>
            >
          >
        : CheckInterruptRegistry<TInterrupts, TMiddleware>) &
      CheckCoverage<Extract<TMiddleware, ReadonlyArray<AnyChatMiddleware>>>

type TextActivityOptionsWithContext<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined,
  TStream extends boolean,
  TTools extends TextActivityOptions<TAdapter, TSchema, TStream, any>['tools'],
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    [],
  TContext = unknown,
  TMiddleware extends Array<unknown> | undefined = undefined,
> = Omit<
  TextActivityOptions<TAdapter, TSchema, TStream, any>,
  'tools' | 'middleware' | 'context' | 'interrupts'
> & {
  tools?: TTools
  interrupts?: TInterrupts & CheckUniqueInterruptDefinitions<TInterrupts>
  middleware?: ExactMiddlewareOption<TTools, TContext, TInterrupts, TMiddleware>
} & RuntimeContextOption<TTools, TMiddleware, TContext>

export interface TextActivityOptions<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined,
  TStream extends boolean,
  TContext = unknown,
> {
  /** The text adapter to use (created by a provider function like openaiText('gpt-5.5')) */
  adapter: TAdapter
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
  systemPrompts?:
    | Array<SystemPrompt<TAdapter['~types']['systemPromptMetadata']>>
    | undefined
  tools?:
    | ReadonlyArray<
        | (AnyRuntimeTool & { readonly '~toolKind'?: never })
        | ProviderTool<string, TAdapter['~types']['toolCapabilities'][number]>
      >
    | undefined
  mcp?: ChatMCPOptions
  /** Additional metadata to attach to the request. */
  metadata?: TextOptions['metadata']
  /** Model-specific provider options (type comes from adapter) */
  modelOptions?: TAdapter['~types']['providerOptions']
  /** AbortController for cancellation */
  abortController?: TextOptions['abortController']
  /** Strategy for controlling the agent loop */
  agentLoopStrategy?: TextOptions['agentLoopStrategy']
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
  resume?: TextOptions['resume']
  outputSchema?: TSchema
  stream?: TStream
  middleware?: Array<ChatMiddleware<TContext>>
  interrupts?: ReadonlyArray<InterruptDefinition<any, any, any, any>>
  context?: TContext
  debug?: DebugOption
}

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
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = [],
  TContext = unknown,
  const TMiddleware extends Array<unknown> | undefined = undefined,
>(
  options: TextActivityOptionsWithContext<
    TAdapter,
    TSchema,
    TStream,
    TTools,
    TInterrupts,
    TContext,
    TMiddleware
  >,
): Omit<
  TextActivityOptions<
    TAdapter,
    TSchema,
    TStream,
    InferredContext<TTools, TMiddleware>
  >,
  'tools' | 'middleware' | 'interrupts'
> & {
  tools?: TTools
  interrupts?: TInterrupts
  middleware?: ExactMiddlewareOption<TTools, TContext, TInterrupts, TMiddleware>
} {
  return options
}

export type TextActivityResult<
  TSchema extends SchemaInput | undefined,
  TStream extends boolean = boolean,
  TTools = ReadonlyArray<AnyTool>,
> = TSchema extends SchemaInput
  ? [TStream] extends [true]
    ? StructuredOutputStream<InferSchemaType<TSchema>>
    : Promise<InferSchemaType<TSchema>>
  : [TStream] extends [false]
    ? Promise<string>
    : TTools extends infer _TTools
      ? ChatStream
      : ChatStream

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
  middleware?: Array<AnyChatMiddleware>
  context?: TContext
  finalStructuredOutput?: {
    jsonSchema: JSONSchema
    yieldChunks: boolean
    normalize?: (data: unknown) => unknown
    validate?: (data: unknown) => unknown
    nativeCombined?: boolean
    source?: 'text' | 'event'
  }
}

type ToolPhaseResult = 'continue' | 'stop' | 'wait'
type CyclePhase = 'processText' | 'executeToolCalls'

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
  private readonly interruptDefinitions: ReadonlyMap<
    string,
    InterruptDefinition<any, any, any, any>
  >
  private params: TParams
  private systemPrompts: Array<SystemPrompt>
  private tools: Array<AnyRuntimeTool>
  private readonly loopStrategy: AgentLoopStrategy
  private toolCallManager: ToolCallManager<ReadonlyArray<AnyTool>, TContext>
  private readonly lazyToolManager: LazyToolManager
  /** A public interruption terminal must always have this run's start event. */
  private hasPublicRunStarted = false
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
  private currentMessageCreatedAt: Date | null = null
  private streamIdentityCaptured = false
  private accumulatedContent = ''
  private accumulatedThinking: Array<{ content: string; signature?: string }> =
    []
  private currentThinkingContent = ''
  private currentThinkingSignature = ''
  private eventOptions?: Record<string, unknown> | undefined
  private eventToolNames?: Array<string>
  private finishedEvent: RunFinishedEvent | null = null
  private readonly streamedToolErrorResults = new Map<string, ToolResult>()
  private deferredToolCallRunFinishedChunks: Array<StreamChunk> = []
  /** The model terminal is held until afterModel can choose an interrupt. */
  private deferredModelRunFinishedChunks: Array<StreamChunk> = []

  private earlyTermination = false
  private toolPhase: ToolPhaseResult = 'continue'
  private cyclePhase: CyclePhase = 'processText'
  // Client state extracted from initial messages (before conversion to ModelMessage)
  private readonly initialApprovals: Map<string, ToolApprovalResolution>
  private readonly initialClientToolResults: Map<string, any>
  private readonly resumeApprovals = new Map<string, ToolApprovalResolution>()
  private readonly resumeClientToolResults = new Map<string, any>()
  private readonly resumeDeniedToolResults = new Map<string, unknown>()
  private readonly resumeCancelledToolCallIds = new Set<string>()
  private readonly resumeGenericInterrupts = new Map<
    string,
    ChatResumeGenericResolution
  >()
  private readonly resumeGenericInterruptRequests = new Map<
    string,
    GenericInterruptRequest<InterruptDefinition<any, any, any, any>>
  >()

  // AG-UI protocol IDs
  private readonly threadId: string
  private readonly runIdOverride?: string
  private readonly parentRunIdOverride?: string

  // Middleware support
  private readonly middlewareRunner: MiddlewareRunner<
    TContext,
    InterruptDefinition<any, any, any, any>
  >
  private readonly middlewareCtx: ChatMiddlewareContext<TContext>
  private readonly sandboxFileQueue: Array<StreamChunk> = []
  private readonly deferredPromises: Array<Promise<unknown>> = []
  private abortReason?: string
  private readonly middlewareAbortController?: AbortController
  // Combines the caller's signal with middleware abort() so running tools
  // observe both cancellation sources via ctx.abortSignal.
  private readonly toolAbortSignal?: AbortSignal
  private terminalHookCalled = false
  private disconnected = false
  private readonly disconnectListeners: Array<() => void | Promise<void>> = []

  private readonly logger: InternalLogger

  // Structured-output finalization state (populated by runStructuredFinalization)
  private structuredOutputResult: {
    data: unknown
    rawText: string
    reasoning?: string
  } | null = null
  private structuredOutputMessageId: string | null = null
  private structuredOutputMessageCreatedAt: Date | null = null
  private combinedStartEmitted = false
  private combinedStructuredMessageId: string | null = null
  private validatedStructuredOutput: unknown = undefined
  private hasValidatedStructuredOutput = false
  private finalizationError: {
    message: string
    code?: string
    cause?: unknown
  } | null = null
  private combinedCompleteEmitted = false
  private readonly finalStructuredOutput?: {
    jsonSchema: JSONSchema
    yieldChunks: boolean
    normalize?: (data: unknown) => unknown
    validate?: (data: unknown) => unknown
    nativeCombined?: boolean
    source?: 'text' | 'event'
  }

  constructor(
    config: TextEngineConfig<TAdapter, TContext, TParams>,
    logger: InternalLogger,
  ) {
    this.logger = logger
    this.adapter = config.adapter
    this.interruptDefinitions = new Map(
      (
        (
          config.params as TParams & {
            interrupts?: ReadonlyArray<InterruptDefinition<any, any, any, any>>
          }
        ).interrupts ?? []
      ).map((definition) => [definition.id, definition]),
    )
    this.finalStructuredOutput = config.finalStructuredOutput
    this.params = config.params
    this.systemPrompts = config.params.systemPrompts || []
    this.loopStrategy =
      config.params.agentLoopStrategy || maxIterationsStrategy(5)
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
    assertUniqueToolNames(config.params.tools || [])
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
    this.threadId =
      config.params.threadId ||
      config.params.conversationId ||
      this.createId('thread')
    this.runIdOverride = config.params.runId
    this.parentRunIdOverride = config.params.parentRunId

    const allMiddleware: Array<
      ChatMiddleware<TContext, InterruptDefinition<any, any, any, any>>
    > = [devtoolsMiddleware(), ...(config.middleware || [])]
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
      get: (capability) => capability[0](this.middlewareCtx),
      getOptional: (capability) =>
        capability[0](this.middlewareCtx, { optional: true }),
      provide: (capability, value) => capability[1](this.middlewareCtx, value),
    }

    provideRunDisconnect(this.middlewareCtx, {
      subscribe: (listener) => {
        this.disconnectListeners.push(listener)
        if (this.disconnected) this.runDisconnectListener(listener)
      },
    })

    provideGenericInterruptDefinitionRegistry(this.middlewareCtx, {
      definitions: this.interruptDefinitions,
    })

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
      yield* this.runPrepared()
    } catch (error: unknown) {
      yield* this.handleRunFailure(error)
    } finally {
      await this.cleanupRun()
    }
  }

  private async *runPrepared(): AsyncGenerator<StreamChunk> {
    await this.middlewareRunner.runSetup(this.middlewareCtx)
    this.middlewareCtx.phase = 'init'
    const initialConfig = this.buildMiddlewareConfig()
    const transformedConfig = await this.middlewareRunner.runOnConfig(
      this.middlewareCtx,
      initialConfig,
    )
    this.applyMiddlewareConfig(transformedConfig)
    await this.applyEphemeralInterruptResume(transformedConfig)
    await this.applyDurableGenericInterruptResolution()
    await this.middlewareRunner.runOnStart(this.middlewareCtx)

    if (this.earlyTermination) {
      yield* this.emitSuccessfulEarlyTermination()
      if (!this.terminalHookCalled) {
        this.terminalHookCalled = true
        await this.middlewareRunner.runOnFinish(this.middlewareCtx, {
          finishReason: this.lastFinishReason,
          duration: Date.now() - this.streamStartTime,
          content: this.accumulatedContent,
          usage: rebuildTokenUsage(
            this.finishedEvent?.usage,
            tanstackMetadata(this.finishedEvent ?? undefined)?.usage,
          ),
        })
      }
      return
    }

    const pendingPhase = yield* this.checkForPendingToolCalls()
    if (pendingPhase === 'wait') return

    const skipAgentLoop =
      !!this.finalStructuredOutput &&
      this.tools.length === 0 &&
      this.finalStructuredOutput.nativeCombined !== true
    if (!skipAgentLoop) {
      const loopOutcome = yield* this.runAgentLoop()
      if (loopOutcome === 'return') return
    }
    yield* this.runAfterAgentLoop()
  }

  private async *runAgentLoop(): AsyncGenerator<
    StreamChunk,
    'return' | 'continue'
  > {
    do {
      if (this.earlyTermination) break
      if (this.isCancelled()) return 'return'
      this.logger.agentLoop(`iteration=${this.middlewareCtx.iteration}`, {
        iteration: this.middlewareCtx.iteration,
      })
      await this.beginCycle()
      if (this.cyclePhase === 'processText') {
        const outcome = yield* this.runProcessTextCycle()
        if (outcome === 'wait') return 'return'
        if (outcome === 'stop') break
      } else {
        yield* this.processToolCalls()
      }
      this.endCycle()
    } while (await this.shouldContinue())
    return 'continue'
  }

  private async *runProcessTextCycle(): AsyncGenerator<
    StreamChunk,
    'wait' | 'stop' | 'continue'
  > {
    this.middlewareCtx.phase = 'beforeModel'
    this.middlewareCtx.iteration = this.iterationCount
    const iterConfig = this.buildMiddlewareConfig()
    const iterTransformedConfig = await this.middlewareRunner.runOnConfig(
      this.middlewareCtx,
      iterConfig,
    )
    this.applyMiddlewareConfig(iterTransformedConfig)
    if (
      yield* this.emitBoundaryInterrupts(
        'beforeModel',
        this.createSyntheticFinishedEvent(),
      )
    ) {
      this.setToolPhase('wait')
      return 'wait'
    }
    yield* this.streamModelResponse()
    if (this.earlyTermination) return 'stop'
    if (
      yield* this.emitBoundaryInterrupts(
        'afterModel',
        this.finishedEvent ?? this.createSyntheticFinishedEvent(),
      )
    ) {
      this.setToolPhase('wait')
      return 'wait'
    }
    if (this.shouldExecuteToolPhase()) {
      this.deferredToolCallRunFinishedChunks.push(
        ...this.deferredModelRunFinishedChunks,
      )
      this.deferredModelRunFinishedChunks = []
      return 'continue'
    }
    yield* this.flushDeferredModelRunFinishedChunks()
    return 'continue'
  }

  private async *runAfterAgentLoop(): AsyncGenerator<StreamChunk> {
    this.logger.agentLoop('run finished', {
      finishReason: this.lastFinishReason,
    })
    const hasFinalStructuredOutput =
      this.finalStructuredOutput &&
      this.toolPhase !== 'wait' &&
      !this.isCancelled() &&
      !this.finalizationError &&
      !this.earlyTermination
    if (hasFinalStructuredOutput) {
      if (this.finalStructuredOutput.nativeCombined === true) {
        yield* this.harvestCombinedStructuredOutput()
      } else {
        yield* this.runStructuredFinalization()
      }
    }
    const shouldSkipTerminalHookCalled =
      this.terminalHookCalled || this.toolPhase === 'wait' || this.isCancelled()
    if (shouldSkipTerminalHookCalled) {
      return
    }
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
      return
    }
    this.addTerminalAssistantMessages()
    this.terminalHookCalled = true
    await this.middlewareRunner.runOnFinish(this.middlewareCtx, {
      finishReason: this.lastFinishReason,
      duration: Date.now() - this.streamStartTime,
      content: this.accumulatedContent,
      usage: rebuildTokenUsage(
        this.finishedEvent?.usage,
        tanstackMetadata(this.finishedEvent ?? undefined)?.usage,
      ),
    })
  }

  private async *handleRunFailure(error: unknown): AsyncGenerator<StreamChunk> {
    const hasContinuationRunId =
      error instanceof Error &&
      error.name === 'InterruptReplaySignal' &&
      'continuationRunId' in error &&
      typeof error.continuationRunId === 'string'
    if (hasContinuationRunId) {
      this.terminalHookCalled = true
      yield* this.pipeThroughMiddleware({
        type: EventType.RUN_FINISHED,
        timestamp: Date.now(),
        threadId: this.threadId,
        runId: this.runIdOverride ?? this.requestId,
        outcome: { type: 'success' },
        result: {
          replayed: true,
          continuationRunId: error.continuationRunId,
        },
      })
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
        this.abortReason = error.message
        await this.middlewareRunner.runOnAbort(this.middlewareCtx, {
          reason: error.message,
          duration: Date.now() - this.streamStartTime,
          cancelRequested: isCancelRequestedReason(error.message),
        })
      } else {
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
    if (!(error instanceof MiddlewareAbortError)) {
      throw error
    }
  }

  private async cleanupRun(): Promise<void> {
    const hasTerminalHookCalled = !this.terminalHookCalled && this.isCancelled()
    if (hasTerminalHookCalled) {
      this.terminalHookCalled = true
      const reason = this.resolveAbortReason()
      await this.middlewareRunner.runOnAbort(this.middlewareCtx, {
        reason,
        duration: Date.now() - this.streamStartTime,
        cancelRequested: isCancelRequestedReason(reason),
      })
    }
    if (this.deferredPromises.length > 0) {
      await Promise.allSettled(this.deferredPromises)
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
    this.currentMessageCreatedAt = new Date()
    this.streamIdentityCaptured = false
    this.accumulatedContent = ''
    this.accumulatedThinking = []
    this.currentThinkingContent = ''
    this.currentThinkingSignature = ''

    this.finishedEvent = null
    this.streamedToolErrorResults.clear()

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

    const stream = this.adapter.chatStream({
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
      capabilities: this.middlewareCtx,
      approvals: adapterApprovals,
      ...(combinedSchema ? { outputSchema: combinedSchema } : {}),
    })
    for await (const raw of stream) {
      if (this.isCancelled()) break
      const shouldStop = yield* this.handleModelStreamChunk(raw)
      if (shouldStop) break
    }

    yield* this.drainSandboxFileQueue()
  }

  private noteCombinedStructuredStart(raw: AdapterYieldChunk): void {
    const shouldSkipRaw =
      raw.type !== EventType.CUSTOM || raw.name !== 'structured-output.start'
    if (shouldSkipRaw) {
      return
    }
    this.combinedStartEmitted = true
    const startValue = raw.value
    const hasMessageId =
      startValue &&
      typeof startValue === 'object' &&
      'messageId' in startValue &&
      typeof startValue.messageId === 'string'
    if (hasMessageId) {
      this.combinedStructuredMessageId = startValue.messageId
      this.captureStructuredOutputMessageIdentity(startValue.messageId)
    }
  }

  private applyEventSourcedComplete(raw: AdapterYieldChunk): AdapterYieldChunk {
    const shouldSkipFinalStructuredOutput =
      this.finalStructuredOutput?.source !== 'event' ||
      raw.type !== EventType.CUSTOM ||
      raw.name !== 'structured-output.complete'
    if (shouldSkipFinalStructuredOutput) {
      return raw
    }
    const parsed = readStructuredOutputCompleteValue(raw.value)
    const shouldSkipParsed = !parsed || !this.finalStructuredOutput
    if (shouldSkipParsed) return raw
    const object = this.finalStructuredOutput.normalize
      ? this.finalStructuredOutput.normalize(parsed.object)
      : parsed.object
    this.structuredOutputResult = { data: object, rawText: parsed.raw }
    this.combinedCompleteEmitted = true
    const value = raw.value
    const completeMessageId = readCustomEventMessageId(value)
    if (completeMessageId) {
      this.combinedStructuredMessageId = completeMessageId
      this.captureStructuredOutputMessageIdentity(completeMessageId)
    }
    const isInvalidParsed =
      object !== parsed.object && value && typeof value === 'object'
    if (isInvalidParsed) {
      return { ...raw, value: { ...value, object } }
    }
    return raw
  }

  private async *maybeSynthesizeCombinedStart(
    raw: AdapterYieldChunk,
  ): AsyncGenerator<StreamChunk> {
    const shouldSkipFinalStructuredOutput =
      this.finalStructuredOutput?.nativeCombined !== true ||
      !this.finalStructuredOutput.yieldChunks ||
      this.finalStructuredOutput.source === 'event' ||
      this.combinedStartEmitted ||
      raw.type !== EventType.TEXT_MESSAGE_START
    if (shouldSkipFinalStructuredOutput) {
      return
    }
    this.combinedStartEmitted = true
    const messageId =
      typeof raw.messageId === 'string' && raw.messageId !== ''
        ? raw.messageId
        : generateMessageId()
    this.combinedStructuredMessageId = messageId
    const synthStart: StreamChunk = {
      type: EventType.CUSTOM,
      name: 'structured-output.start',
      value: { messageId },
      timestamp: Date.now(),
    }
    const synthOutputs = await this.middlewareRunner.runOnChunk(
      this.middlewareCtx,
      synthStart,
    )
    yield* this.emitPublicChunks(synthOutputs)
  }

  private async *emitModelOutputChunks(
    outputChunks: Array<StreamChunk>,
  ): AsyncGenerator<StreamChunk> {
    const suppressAgentLifecycle =
      !!this.finalStructuredOutput &&
      this.finalStructuredOutput.yieldChunks &&
      this.finalStructuredOutput.nativeCombined !== true
    for (const outputChunk of outputChunks) {
      const chunks = normalizeStreamChunk(outputChunk as AdapterYieldChunk)
      for (const spec of chunks) {
        restorePublicUsage(spec)
        const isSuppressAgentLifecycle =
          suppressAgentLifecycle &&
          (spec.type === EventType.RUN_STARTED ||
            spec.type === EventType.RUN_FINISHED)
        if (isSuppressAgentLifecycle) {
          continue
        }
        if (spec.type === EventType.RUN_FINISHED) {
          this.deferredModelRunFinishedChunks.push(spec)
          continue
        }
        if (this.shouldDeferToolCallRunFinished(spec)) {
          this.deferredToolCallRunFinishedChunks.push(spec)
          continue
        }
        if (spec.type === EventType.RUN_STARTED) {
          this.hasPublicRunStarted = true
        }
        this.logger.output(`type=${spec.type}`, { chunk: spec })
        yield spec
        this.middlewareCtx.chunkIndex++
      }
    }
  }

  private async *handleModelStreamChunk(
    raw: AdapterYieldChunk,
  ): AsyncGenerator<StreamChunk, boolean> {
    this.totalChunkCount++
    this.handleStreamChunk(raw)
    this.noteCombinedStructuredStart(raw)
    const outboundChunk = this.applyEventSourcedComplete(raw)
    yield* this.maybeSynthesizeCombinedStart(raw)
    const outputChunks = await this.middlewareRunner.runOnChunk(
      this.middlewareCtx,
      outboundChunk,
    )
    yield* this.emitModelOutputChunks(outputChunks)
    if (raw.type === EventType.RUN_FINISHED) {
      await this.runOnUsageFromChunk(raw)
    }
    yield* this.drainSandboxFileQueue()
    return this.earlyTermination
  }

  private handleStreamChunk(chunk: AdapterYieldChunk): void {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- AG-UI EventType enum members vs string-literal case labels; default branch handles untraced events.
    switch (chunk.type) {
      // AG-UI Events
      case 'TEXT_MESSAGE_START': {
        const hasMessageId =
          typeof chunk.messageId === 'string' && chunk.messageId !== ''
        if (hasMessageId) {
          this.captureStreamMessageIdentity(chunk.messageId)
        }
        break
      }
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
      case 'TOOL_CALL_RESULT':
        this.handleToolCallResultEvent(chunk)
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

      case 'REASONING_MESSAGE_CONTENT':
        this.handleReasoningMessageContentEvent(chunk)
        break

      case 'REASONING_ENCRYPTED_VALUE':
        this.handleReasoningEncryptedValueEvent(chunk)
        break

      case 'REASONING_START':
      case 'REASONING_MESSAGE_START':
      case 'REASONING_MESSAGE_END':
      case 'REASONING_END':
        // No special handling needed
        break

      default:
        // RUN_STARTED, TEXT_MESSAGE_END, STATE_SNAPSHOT, STATE_DELTA, CUSTOM
        // - no special handling needed in chat activity
        break
    }
  }

  private handleTextMessageContentEvent(chunk: TextMessageContentEvent): void {
    const extra = chunk as AdapterYieldChunk
    const isInvalidExtra =
      typeof extra.content === 'string' && extra.content !== ''
    if (isInvalidExtra) {
      this.accumulatedContent = extra.content
    } else {
      this.accumulatedContent += chunk.delta
    }
    this.middlewareCtx.accumulatedContent = this.accumulatedContent
  }

  private captureStreamMessageIdentity(messageId: string): void {
    this.currentMessageId = messageId
    this.middlewareCtx.currentMessageId = messageId
    if (!this.streamIdentityCaptured) {
      this.currentMessageCreatedAt = new Date()
      this.streamIdentityCaptured = true
    }
  }

  private captureStructuredOutputMessageIdentity(messageId: string): void {
    this.structuredOutputMessageId = messageId
    this.structuredOutputMessageCreatedAt ??= new Date()
  }

  private handleToolCallStartEvent(chunk: ToolCallStartEvent): void {
    const isInvalidChunk =
      typeof chunk.parentMessageId === 'string' && chunk.parentMessageId !== ''
    if (isInvalidChunk) {
      this.captureStreamMessageIdentity(chunk.parentMessageId)
    }
    this.toolCallManager.addToolCallStartEvent(chunk)
    const metadata = chunk.metadata
    const thoughtSignature =
      metadata != null &&
      typeof metadata === 'object' &&
      'thoughtSignature' in metadata &&
      typeof metadata.thoughtSignature === 'string' &&
      metadata.thoughtSignature !== ''
        ? metadata.thoughtSignature
        : undefined
    if (thoughtSignature === undefined) return
    const call = this.toolCallManager
      .getToolCalls()
      .find((candidate) => candidate.id === chunk.toolCallId)
    if (!call) return
    call.metadata = {
      ...(call.metadata != null && typeof call.metadata === 'object'
        ? call.metadata
        : {}),
      thoughtSignature,
    }
  }

  private handleToolCallArgsEvent(chunk: ToolCallArgsEvent): void {
    this.toolCallManager.addToolCallArgsEvent(chunk)
  }

  private handleToolCallEndEvent(chunk: ToolCallEndEvent): void {
    this.toolCallManager.completeToolCall(chunk)
    const end = chunk as AdapterYieldChunk
    const state = end.state ?? tanstackMetadata(end)?.state
    const isIncompleteState =
      state !== 'output-error' || end.result === undefined
    if (isIncompleteState) return
    this.handleToolCallResultEvent({
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: chunk.toolCallId,
      content: Array.isArray(end.result)
        ? JSON.stringify(end.result)
        : end.result,
      messageId: chunk.toolCallId,
      metadata: { tanstack: { state: 'output-error' } },
    })
  }

  private handleToolCallResultEvent(chunk: ToolCallResultEvent): void {
    const isOutputError = tanstackMetadata(chunk)?.state === 'output-error'
    if (!isOutputError) return

    const toolCall = this.toolCallManager
      .getToolCalls()
      .find((candidate) => candidate.id === chunk.toolCallId)
    if (!toolCall) return

    this.streamedToolErrorResults.set(chunk.toolCallId, {
      toolCallId: chunk.toolCallId,
      toolName: toolCall.function.name,
      result: chunk.content,
      state: 'output-error',
    })
  }

  private handleRunFinishedEvent(chunk: AdapterYieldChunk): void {
    this.finishedEvent = chunk as RunFinishedEvent
    const raw = chunk
    const top = raw.finishReason
    this.lastFinishReason =
      top === 'stop' ||
      top === 'length' ||
      top === 'content_filter' ||
      top === 'tool_calls' ||
      top === null
        ? top
        : (tanstackMetadata(chunk)?.finishReason ?? null)
  }

  private async runOnUsageFromChunk(
    chunk: RunFinishedEvent | AdapterYieldChunk,
  ): Promise<void> {
    const rebuilt = rebuildTokenUsage(
      chunk.usage,
      tanstackMetadata(chunk)?.usage,
    )
    if (rebuilt) {
      await this.middlewareRunner.runOnUsage(this.middlewareCtx, rebuilt)
    }
  }

  private handleRunErrorEvent(
    chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): void {
    this.earlyTermination = true
    if (this.finalizationError === null) {
      const message = chunk.message || 'Run failed'
      this.finalizationError = {
        message,
        ...(chunk.code !== undefined ? { code: chunk.code } : {}),
      }
    }
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

  private handleStepFinishedEvent(chunk: AdapterYieldChunk): void {
    const isInvalidChunk =
      typeof chunk.signature === 'string' && chunk.signature !== ''
    if (isInvalidChunk) {
      this.currentThinkingSignature = chunk.signature
    }
  }

  private handleReasoningMessageContentEvent(
    chunk: Extract<StreamChunk, { type: 'REASONING_MESSAGE_CONTENT' }>,
  ): void {
    this.currentThinkingContent += chunk.delta
  }

  private handleReasoningEncryptedValueEvent(
    chunk: ReasoningEncryptedValueEvent,
  ): void {
    if (chunk.subtype === 'tool-call') {
      const call = this.messages
        .flatMap((message) => message.toolCalls ?? [])
        .find((toolCall) => toolCall.id === chunk.entityId)
      if (call) {
        call.metadata = {
          ...(call.metadata != null && typeof call.metadata === 'object'
            ? call.metadata
            : {}),
          thoughtSignature: chunk.encryptedValue,
        }
      }
      return
    }
    this.currentThinkingSignature = chunk.encryptedValue
  }

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

    // Count is deduped so wait→resume after a live turn does not double-count.
    // Per-turn execution caps are app middleware via onBeforeToolCall skip.
    this.recordToolCalls(pendingToolCalls)

    // Handle undiscovered lazy tool calls with self-correcting error messages
    const undiscoveredLazyResults: Array<ToolResult> = []
    const executablePendingCalls = pendingToolCalls.filter((tc) => {
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

    const deferredErrorResults = [...undiscoveredLazyResults]

    // Build args lookup so buildToolResultChunks can emit TOOL_CALL_START +
    // TOOL_CALL_ARGS before TOOL_CALL_END during continuation re-executions.
    const argsMap = new Map<string, string>()
    for (const tc of pendingToolCalls) {
      argsMap.set(tc.id, tc.function.arguments)
    }

    if (executablePendingCalls.length === 0) {
      if (deferredErrorResults.length > 0) {
        const chunks = this.buildToolResultChunks(
          deferredErrorResults,
          finishEvent,
          argsMap,
        )
        for (const chunk of chunks) {
          yield* this.pipeThroughMiddleware(chunk)
        }
      }
      return 'continue'
    }

    this.middlewareCtx.phase = 'beforeTools'
    if (
      yield* this.emitBoundaryInterrupts(
        'beforeTools',
        finishEvent,
        executablePendingCalls,
      )
    ) {
      this.setToolPhase('wait')
      return 'wait'
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

    const hasExecutionResult =
      executionResult.needsApproval.length > 0 ||
      executionResult.needsClientExecution.length > 0
    if (hasExecutionResult) {
      this.discardDeferredToolCallRunFinishedChunks()

      if (allResults.length > 0) {
        const chunks2 = this.buildToolResultChunks(allResults, finishEvent)
        for (const chunk of chunks2) {
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

    const toolResultChunks = this.buildToolResultChunks(allResults, finishEvent)

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

    const isEmptyFinishEvent = !finishEvent || toolCalls.length === 0
    if (isEmptyFinishEvent) {
      this.lastTurnToolCallCount = 0
      this.setToolPhase('stop')
      return
    }

    // Count every model-emitted tool call. Per-turn execution caps are app
    // middleware via onBeforeToolCall skip.
    this.recordToolCalls(toolCalls)

    this.addAssistantToolCallMessage(toolCalls)

    // Handle undiscovered lazy tool calls with self-correcting error messages
    const undiscoveredLazyResults: Array<ToolResult> = []
    const executableToolCalls = toolCalls.filter((tc) => {
      if (this.streamedToolErrorResults.has(tc.id)) {
        return false
      }
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

    // Non-executed outcomes. Per-turn skips come from middleware and appear in
    // execution results.
    const deferredErrorResults = [
      ...this.streamedToolErrorResults.values(),
      ...undiscoveredLazyResults,
    ]

    if (executableToolCalls.length === 0) {
      yield* this.flushDeferredToolCallRunFinishedChunks()
      // All tool calls already have error results — emit them, then continue
      // the loop (strategy / onShouldContinue may stop).
      if (deferredErrorResults.length > 0) {
        const chunks = this.buildToolResultChunks(
          deferredErrorResults,
          finishEvent,
        )
        for (const chunk of chunks) {
          yield* this.pipeThroughMiddleware(chunk)
        }
      }
      this.toolCallManager.clear()
      this.setToolPhase('continue')
      return
    }
    this.middlewareCtx.phase = 'beforeTools'

    if (
      yield* this.emitBoundaryInterrupts(
        'beforeTools',
        finishEvent,
        executableToolCalls,
      )
    ) {
      this.setToolPhase('wait')
      return
    }

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

    const afterToolBoundaryChunks = this.buildToolResultChunks(
      allResults,
      finishEvent,
    )
    const afterToolRequests =
      await this.middlewareRunner.runOnInterruptBoundary(
        this.middlewareCtx as ChatMiddlewareContext<TContext> & {
          phase: 'afterTools'
        },
      )
    if (afterToolRequests.length > 0) {
      for (const chunk of afterToolBoundaryChunks) {
        yield* this.pipeThroughMiddleware(chunk)
      }
      yield* this.emitBoundaryInterrupts(
        'afterTools',
        finishEvent,
        toolCalls,
        afterToolRequests,
      )
      this.setToolPhase('wait')
      return
    }

    const hasExecutionResult =
      executionResult.needsApproval.length > 0 ||
      executionResult.needsClientExecution.length > 0
    if (hasExecutionResult) {
      if (allResults.length > 0) {
        for (const chunk of afterToolBoundaryChunks) {
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

    const toolResultChunks = afterToolBoundaryChunks

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
      this.lastFinishReason === 'tool_calls' &&
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

  private *flushDeferredModelRunFinishedChunks(): Generator<StreamChunk> {
    for (const chunk of this.deferredModelRunFinishedChunks) {
      this.logger.output(`type=${chunk.type}`, { chunk })
      yield chunk
      this.middlewareCtx.chunkIndex++
    }
    this.deferredModelRunFinishedChunks = []
  }

  private async *emitSyntheticRunStarted(
    finishEvent: RunFinishedEvent,
  ): AsyncGenerator<StreamChunk, void, void> {
    if (this.hasPublicRunStarted) return
    yield* this.pipeThroughMiddleware({
      type: EventType.RUN_STARTED,
      runId: finishEvent.runId,
      threadId: finishEvent.threadId,
      timestamp: Date.now(),
    })
  }

  private async *emitSuccessfulEarlyTermination(): AsyncGenerator<
    StreamChunk,
    void,
    void
  > {
    // `stop` is a finished run, not another tool cycle. `tool_calls` here
    // makes the client auto-send after afterTools, so reject looks stuck.
    this.lastFinishReason = 'stop'
    const finishEvent = this.createSyntheticFinishedEvent('stop')
    yield* this.emitSyntheticRunStarted(finishEvent)
    yield* this.pipeThroughMiddleware({
      ...finishEvent,
      timestamp: Date.now(),
      outcome: { type: 'success' },
    })
  }

  private discardDeferredToolCallRunFinishedChunks(): void {
    this.deferredToolCallRunFinishedChunks = []
  }

  private shouldExecuteToolPhase(): boolean {
    return (
      this.lastFinishReason === 'tool_calls' &&
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
        id: this.currentMessageId ?? undefined,
        createdAt: this.currentMessageCreatedAt ?? undefined,
        ...(this.accumulatedThinking.length > 0 && {
          thinking: this.accumulatedThinking,
        }),
      },
    ]
    this.middlewareCtx.messages = this.messages
  }

  private addTerminalAssistantMessages(): void {
    this.finalizeCurrentThinkingStep()
    const structuredResult = this.structuredOutputResult
    const raw = structuredResult
      ? structuredResult.rawText || safeJsonStringify(structuredResult.data)
      : ''
    const structuredOutput = this.terminalStructuredOutputPart(
      structuredResult,
      raw,
    )
    const structuredId =
      this.structuredOutputMessageId ??
      this.combinedStructuredMessageId ??
      this.currentMessageId ??
      this.createId('msg')
    const nativeCombined = this.finalStructuredOutput?.nativeCombined === true
    const eventSourced = this.finalStructuredOutput?.source === 'event'
    const splitStructuredMessage =
      Boolean(structuredOutput) &&
      (!nativeCombined || eventSourced) &&
      this.currentMessageId != null &&
      structuredId !== this.currentMessageId
    const messages = [...this.middlewareCtx.messages]
    const startedLength = messages.length
    const existingStructuredIndex = this.mergeTerminalMessages(messages, {
      structuredOutput,
      raw,
      structuredId,
      splitStructuredMessage,
    })
    const hasMessages =
      messages.length === startedLength && existingStructuredIndex < 0
    if (hasMessages) {
      return
    }
    this.messages = messages
    this.middlewareCtx.messages = this.messages
  }

  private terminalStructuredOutputPart(
    structuredResult: {
      data: unknown
      rawText: string
      reasoning?: string
    } | null,
    raw: string,
  ): StructuredOutputPart | undefined {
    if (!structuredResult) return undefined
    return {
      type: 'structured-output',
      status: 'complete',
      data: structuredResult.data,
      partial: structuredResult.data,
      raw,
      ...(structuredResult.reasoning !== undefined
        ? { reasoning: structuredResult.reasoning }
        : {}),
    }
  }

  private mergeTerminalMessages(
    messages: Array<ModelMessage>,
    input: {
      structuredOutput: StructuredOutputPart | undefined
      raw: string
      structuredId: string
      splitStructuredMessage: boolean
    },
  ): number {
    const existingStructuredIndex = messages.findIndex(
      (message) =>
        message.role === 'assistant' && message.id === input.structuredId,
    )
    const currentTurnAlreadyRecorded = messages.some(
      (message) =>
        message.role === 'assistant' && message.id === this.currentMessageId,
    )
    const hasInput = input.structuredOutput && existingStructuredIndex >= 0
    if (hasInput) {
      this.patchExistingStructuredMessage(
        messages,
        existingStructuredIndex,
        input.raw,
        input.structuredOutput,
      )
      return existingStructuredIndex
    }
    const hasInput2 = input.structuredOutput && !input.splitStructuredMessage
    if (hasInput2) {
      this.appendCombinedStructuredMessage(
        messages,
        input,
        currentTurnAlreadyRecorded,
      )
      return existingStructuredIndex
    }
    this.appendSplitTerminalMessages(
      messages,
      input,
      currentTurnAlreadyRecorded,
    )
    return existingStructuredIndex
  }

  private patchExistingStructuredMessage(
    messages: Array<ModelMessage>,
    index: number,
    raw: string,
    structuredOutput: StructuredOutputPart,
  ): void {
    const existing = messages[index]
    if (!existing) return
    messages[index] = {
      ...existing,
      content: raw || existing.content,
      structuredOutput,
    }
  }

  private appendCombinedStructuredMessage(
    messages: Array<ModelMessage>,
    input: {
      structuredOutput: StructuredOutputPart
      raw: string
      structuredId: string
    },
    currentTurnAlreadyRecorded: boolean,
  ): void {
    if (currentTurnAlreadyRecorded) return
    const thinking =
      this.accumulatedThinking.length > 0 ? this.accumulatedThinking : undefined
    messages.push({
      role: 'assistant',
      content: this.accumulatedContent || input.raw || null,
      id: input.structuredId,
      createdAt:
        this.currentMessageCreatedAt ??
        this.structuredOutputMessageCreatedAt ??
        new Date(),
      structuredOutput: input.structuredOutput,
      ...(thinking ? { thinking } : {}),
    })
  }

  private appendSplitTerminalMessages(
    messages: Array<ModelMessage>,
    input: {
      structuredOutput: StructuredOutputPart | undefined
      raw: string
      structuredId: string
    },
    currentTurnAlreadyRecorded: boolean,
  ): void {
    const thinking =
      this.accumulatedThinking.length > 0 ? this.accumulatedThinking : undefined
    const hasCurrentTurnAlreadyRecorded =
      !currentTurnAlreadyRecorded &&
      (this.accumulatedContent !== '' || thinking)
    if (hasCurrentTurnAlreadyRecorded) {
      messages.push({
        role: 'assistant',
        content: this.accumulatedContent || null,
        id: this.currentMessageId ?? this.createId('msg'),
        createdAt: this.currentMessageCreatedAt ?? new Date(),
        ...(thinking ? { thinking } : {}),
      })
    }
    if (!input.structuredOutput) return
    messages.push({
      role: 'assistant',
      content: input.raw || null,
      id: input.structuredId,
      createdAt: this.structuredOutputMessageCreatedAt ?? new Date(),
      structuredOutput: input.structuredOutput,
    })
  }

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
      const isAssistant = message.role === 'assistant' && message.parts
      if (isAssistant) {
        for (const part of message.parts) {
          if (part.type === 'tool-call') {
            // Extract client tool results (tools without approval that have output)
            const hasPart = part.output !== undefined && !part.approval
            if (hasPart) {
              clientToolResults.set(part.id, part.output)
            }
            // Extract approval responses from UIMessage format parts
            const hasPart2 =
              part.approval?.id &&
              part.approval?.approved !== undefined &&
              part.state === 'approval-responded'
            if (hasPart2) {
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
      const isTool = message.role === 'tool' && message.toolCallId
      if (isTool) {
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
        const hasOutput =
          output &&
          typeof output === 'object' &&
          (output as any).pendingExecution === true
        if (hasOutput) {
          continue
        }
        clientToolResults.set(message.toolCallId, output)
      }
    }

    return { approvals, clientToolResults }
  }

  private genericInterruptId(): string {
    return this.createId('interrupt')
  }

  private approvalInterrupt(approval: ApprovalRequest): Interrupt {
    const tool = this.tools.find(
      (candidate) => candidate.name === approval.toolName,
    ) as RuntimeToolWithApproval | undefined
    const normalized = normalizeApprovalSchema(
      tool?.approvalSchema,
      tool?.inputSchema,
    )
    return {
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
          v: INTERRUPT_BINDING_VERSION,
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
    }
  }

  private clientToolInterrupt(clientTool: ClientToolRequest): Interrupt {
    const tool = this.tools.find(
      (candidate) => candidate.name === clientTool.toolName,
    )
    const responseSchema = convertSchemaToJsonSchema(tool?.outputSchema) ?? {}
    return {
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
          v: INTERRUPT_BINDING_VERSION,
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
    }
  }

  private genericActionableInterrupt(
    request: GenericInterruptRequest<InterruptDefinition<any, any, any, any>>,
    id: string,
    batchIndex: number,
  ): Interrupt {
    const preEmission = createInterruptBinding(request, { batchIndex })
    return {
      id,
      reason: request.reason,
      message: request.message,
      ...(preEmission.descriptor.responseSchemaCanonicalJson !== undefined
        ? {
            responseSchema: JSON.parse(
              preEmission.descriptor.responseSchemaCanonicalJson,
            ),
          }
        : {}),
      ...(request.expiresAt !== undefined
        ? { expiresAt: request.expiresAt }
        : {}),
      metadata: {
        [interruptBindingMetadataKey]: {
          v: INTERRUPT_BINDING_VERSION,
          kind: 'generic',
          interruptId: id,
          definitionId: preEmission.descriptor.definitionId,
          key: preEmission.descriptor.key,
          batchIndex,
          ...(request.expiresAt !== undefined
            ? { expiresAt: request.expiresAt }
            : {}),
          ...(preEmission.descriptor.payloadSchemaHash
            ? {
                payloadSchemaHash: preEmission.descriptor.payloadSchemaHash,
              }
            : {}),
          ...(preEmission.descriptor.responseSchemaHash !== undefined
            ? {
                responseSchemaHash: preEmission.descriptor.responseSchemaHash,
              }
            : {}),
        },
        ...(preEmission.payload !== undefined
          ? { [INTERRUPT_PAYLOAD_METADATA_KEY]: preEmission.payload }
          : {}),
      },
    }
  }

  private buildActionableInterrupts(
    approvals: Array<ApprovalRequest>,
    clientRequests: Array<ClientToolRequest>,
    genericRequests: ReadonlyArray<
      GenericInterruptRequest<InterruptDefinition<any, any, any, any>>
    > = [],
    genericInterruptIds: ReadonlyArray<string> = [],
  ): Array<Interrupt> {
    const interrupts: Array<Interrupt> = []
    for (const approval of approvals) {
      interrupts.push(this.approvalInterrupt(approval))
    }
    for (const clientTool of clientRequests) {
      interrupts.push(this.clientToolInterrupt(clientTool))
    }
    const genericRequestsEntries = genericRequests.entries()
    for (const [index, request] of genericRequestsEntries) {
      const id = genericInterruptIds[index]
      if (!id) throw new Error('Generic interrupt id is unavailable.')
      interrupts.push(
        this.genericActionableInterrupt(request, id, interrupts.length),
      )
    }
    const ids = new Set<string>()
    for (const interrupt of interrupts) {
      if (ids.has(interrupt.id)) {
        throw new Error(
          `Duplicate interrupt id in final batch: ${interrupt.id}`,
        )
      }
      ids.add(interrupt.id)
    }
    return interrupts
  }

  private buildInterruptFinishedChunk(
    finishEvent: RunFinishedEvent,
    approvals: Array<ApprovalRequest>,
    clientRequests: Array<ClientToolRequest>,
    genericRequests: ReadonlyArray<
      GenericInterruptRequest<InterruptDefinition<any, any, any, any>>
    > = [],
    genericInterruptIds?: ReadonlyArray<string>,
  ): StreamChunk {
    return {
      ...finishEvent,
      timestamp: Date.now(),
      outcome: {
        type: 'interrupt',
        interrupts: this.buildActionableInterrupts(
          approvals,
          clientRequests,
          genericRequests,
          genericInterruptIds,
        ),
      },
    }
  }

  private buildMessagesSnapshotChunk(): StreamChunk {
    const withIds = this.messages.map((message, index) => ({
      ...message,
      id:
        message.id ||
        `snapshot_${this.runIdOverride ?? this.requestId}_${index}`,
    }))
    return {
      type: EventType.MESSAGES_SNAPSHOT,
      timestamp: Date.now(),
      messages: uiMessagesToWire(modelMessagesToUIMessages(withIds), {
        includeSnapshotStructuredOutput: true,
      }),
    }
  }

  private publicInterruptTerminal(chunk: StreamChunk): StreamChunk {
    const shouldSkipChunk =
      chunk.type !== EventType.RUN_FINISHED ||
      chunk.outcome?.type !== 'interrupt'
    if (shouldSkipChunk) {
      return chunk
    }
    return {
      ...chunk,
      outcome: {
        ...chunk.outcome,
        interrupts: chunk.outcome.interrupts.map((interrupt) => {
          const isInvalidInterrupt =
            !interrupt.metadata ||
            typeof interrupt.metadata !== 'object' ||
            Array.isArray(interrupt.metadata)
          if (isInvalidInterrupt) {
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
  } {
    const structured = structuralInterruptFailure(error)
    if (structured) {
      return {
        message: structured.error.message,
        code: structured.errors[0]?.code ?? 'server',
        errors: structured.errors,
      }
    }
    const hasErrors = error && typeof error === 'object' && 'errors' in error
    if (hasErrors) {
      const errors = error.errors
      if (Array.isArray(errors)) {
        const first = errors[0]
        const hasFirst = first && typeof first === 'object'
        if (hasFirst) {
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
    return withTanstackMetadata(
      {
        type: EventType.RUN_ERROR,
        timestamp: Date.now(),
        message: failure.message,
        code: failure.code,
      },
      {
        runId: this.runIdOverride ?? this.requestId,
        threadId: this.threadId,
        ...(failure.errors !== undefined
          ? { interruptErrors: failure.errors }
          : {}),
      },
    ) as StreamChunk
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
    genericRequests: ReadonlyArray<
      GenericInterruptRequest<InterruptDefinition<any, any, any, any>>
    > = [],
  ): AsyncGenerator<StreamChunk, boolean, void> {
    yield* this.emitSyntheticRunStarted(finishEvent)
    const genericInterruptIds = genericRequests.map(() =>
      this.genericInterruptId(),
    )
    const terminal = this.completeEphemeralInterruptBindings(
      this.buildInterruptFinishedChunk(
        finishEvent,
        approvals,
        clientRequests,
        genericRequests,
        genericInterruptIds,
      ),
    )
    let terminalOutputs: Array<StreamChunk>
    try {
      terminalOutputs = [
        ...this.emitPublicChunks(
          await this.middlewareRunner.runOnChunk(this.middlewareCtx, terminal),
        ),
      ]
    } catch (error) {
      yield* this.emitInterruptRunError(error)
      return false
    }

    yield* this.pipeThroughMiddleware(this.buildMessagesSnapshotChunk())
    if (this.params.state !== undefined) {
      yield* this.pipeThroughMiddleware({
        type: EventType.STATE_SNAPSHOT,
        timestamp: Date.now(),
        snapshot: this.params.state,
      })
    }
    for (const output of terminalOutputs) {
      yield this.publicInterruptTerminal(output)
    }
    return true
  }

  private async *emitBoundaryInterrupts(
    phase: 'beforeModel' | 'afterModel' | 'beforeTools' | 'afterTools',
    finishEvent: RunFinishedEvent,
    toolCalls: ReadonlyArray<ToolCall> = [],
    requests?: ReadonlyArray<
      GenericInterruptRequest<InterruptDefinition<any, any, any, any>>
    >,
  ): AsyncGenerator<StreamChunk, boolean, void> {
    this.middlewareCtx.phase = phase
    const boundaryRequests =
      requests ??
      (await this.middlewareRunner.runOnInterruptBoundary(
        this.middlewareCtx as ChatMiddlewareContext<TContext> & {
          phase: typeof phase
        },
      ))
    if (boundaryRequests.length === 0) return false
    for (const request of boundaryRequests) {
      if (
        this.interruptDefinitions.get(request.definition.id) !==
        request.definition
      ) {
        throw new Error(
          `Generic interrupt definition ${request.definition.id} is not registered on this chat.`,
        )
      }
    }
    if (phase === 'afterModel') {
      if (this.toolCallManager.hasToolCalls()) {
        this.addAssistantToolCallMessage(this.toolCallManager.getToolCalls())
      } else {
        this.addAssistantTextMessageForInterrupt()
      }
    }
    const actionable = this.getBoundaryActionableToolRequests(toolCalls)
    yield* this.emitActionableInterruptBoundary(
      finishEvent,
      actionable.approvals,
      actionable.clientRequests,
      boundaryRequests,
    )
    return true
  }

  private addAssistantTextMessageForInterrupt(): void {
    if (this.accumulatedContent.length === 0) return
    this.messages = [
      ...this.messages,
      { role: 'assistant', content: this.accumulatedContent },
    ]
    this.middlewareCtx.messages = this.messages
  }

  private getBoundaryActionableToolRequests(
    toolCalls: ReadonlyArray<ToolCall>,
  ): {
    approvals: Array<ApprovalRequest>
    clientRequests: Array<ClientToolRequest>
  } {
    const { approvals, clientToolResults } = this.collectClientState()
    const approvalRequests: Array<ApprovalRequest> = []
    const clientRequests: Array<ClientToolRequest> = []
    for (const toolCall of toolCalls) {
      const tool = this.resolveExecutableTools([toolCall]).find(
        (candidate) => candidate.name === toolCall.function.name,
      ) as RuntimeToolWithApproval | undefined
      if (!tool) continue
      let input: unknown = {}
      try {
        const parsed = JSON.parse(toolCall.function.arguments.trim() || '{}')
        input = parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        input = {}
      }
      const approvalId = `approval_${toolCall.id}`
      const hasTool = tool.needsApproval && !approvals.has(approvalId)
      if (hasTool) {
        approvalRequests.push({
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input,
          approvalId,
        })
      } else {
        const hasTool2 =
          !tool.execute &&
          !clientToolResults.has(toolCall.id) &&
          !this.resumeCancelledToolCallIds.has(toolCall.id)
        if (hasTool2) {
          clientRequests.push({
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            input,
          })
        }
      }
    }
    return { approvals: approvalRequests, clientRequests }
  }

  private completeEphemeralInterruptBindings(chunk: StreamChunk): StreamChunk {
    const shouldSkipChunk =
      chunk.type !== EventType.RUN_FINISHED ||
      chunk.outcome?.type !== 'interrupt'
    if (shouldSkipChunk) {
      return chunk
    }
    const interruptedRunId = this.runIdOverride ?? this.requestId
    return {
      ...chunk,
      outcome: {
        ...chunk.outcome,
        interrupts: chunk.outcome.interrupts.map((interrupt) => {
          const isInvalidInterrupt =
            !interrupt.metadata ||
            typeof interrupt.metadata !== 'object' ||
            Array.isArray(interrupt.metadata)
          if (isInvalidInterrupt) {
            return interrupt
          }
          const metadata = { ...interrupt.metadata }
          const unopened = metadata[interruptBindingMetadataKey]
          const isInvalidUnopened =
            unopened === null ||
            typeof unopened !== 'object' ||
            Array.isArray(unopened)
          if (isInvalidUnopened) {
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
    _finishEvent: RunFinishedEvent,
    argsMap?: Map<string, string>,
  ): Array<AdapterYieldChunk> {
    const chunks: Array<AdapterYieldChunk> = []

    for (const result of results) {
      const content = normalizeToolResult(result.result)
      const wireContent =
        typeof content === 'string' ? content : JSON.stringify(content)

      if (argsMap) {
        chunks.push({
          type: EventType.TOOL_CALL_START,
          timestamp: Date.now(),
          toolCallId: result.toolCallId,
          toolCallName: result.toolName,
          toolName: result.toolName,
        })

        const args = argsMap.get(result.toolCallId) ?? '{}'
        chunks.push({
          type: EventType.TOOL_CALL_ARGS,
          timestamp: Date.now(),
          toolCallId: result.toolCallId,
          delta: args,
        })

        chunks.push({
          type: EventType.TOOL_CALL_END,
          timestamp: Date.now(),
          toolCallId: result.toolCallId,
        })
      }

      const parentMessageId = [...this.messages]
        .reverse()
        .find((message) => message.role === 'assistant')?.id
      const resultChunk = {
        type: EventType.TOOL_CALL_RESULT,
        timestamp: Date.now(),
        messageId: parentMessageId || result.toolCallId,
        toolCallId: result.toolCallId,
        content: wireContent,
        role: 'tool' as const,
      }
      chunks.push(
        (result.state === 'output-error'
          ? withTanstackMetadata(resultChunk, { state: result.state })
          : resultChunk) as StreamChunk,
      )

      const placeholderIdx = this.messages.findIndex((m) => {
        const shouldSkipM =
          m.role !== 'tool' || m.toolCallId !== result.toolCallId
        if (shouldSkipM) {
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
      const isTool = message.role === 'tool' && message.toolCallId
      if (isTool) {
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
      const isAssistant = message.role === 'assistant' && message.toolCalls
      if (isAssistant) {
        for (const toolCall of message.toolCalls) {
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

  private findToolCallInMessages(toolCallId: string): ToolCall | undefined {
    for (const message of this.messages) {
      const shouldSkipAssistant =
        message.role !== 'assistant' || !message.toolCalls
      if (shouldSkipAssistant) continue
      for (const toolCall of message.toolCalls) {
        if (toolCall.id === toolCallId) return toolCall
      }
    }
    return undefined
  }

  private getToolCallsForEphemeralResume(
    resume: ReadonlyArray<{ interruptId: string }> | undefined,
  ): Array<ToolCall> {
    const pending = this.getPendingToolCallsFromMessages()
    const byId = new Map(pending.map((toolCall) => [toolCall.id, toolCall]))
    for (const entry of resume ?? []) {
      let toolCallId: string | undefined
      if (entry.interruptId.startsWith('client_tool_')) {
        toolCallId = entry.interruptId.slice('client_tool_'.length)
      } else if (entry.interruptId.startsWith('approval_')) {
        toolCallId = entry.interruptId.slice('approval_'.length)
      }
      const isIncompleteToolCallId =
        toolCallId === undefined || byId.has(toolCallId)
      if (isIncompleteToolCallId) continue
      const toolCall = this.findToolCallInMessages(toolCallId)
      const hasToolCall = toolCall && !isProviderExecutedToolCall(toolCall)
      if (hasToolCall) {
        pending.push(toolCall)
        byId.set(toolCallId, toolCall)
      }
    }
    return pending
  }

  private createSyntheticFinishedEvent(
    finishReason: 'stop' | 'tool_calls' = 'tool_calls',
  ): RunFinishedEvent {
    return withTanstackMetadata(
      {
        type: EventType.RUN_FINISHED,
        runId: this.runIdOverride ?? this.requestId,
        threadId: this.threadId,
        timestamp: Date.now(),
      },
      { finishReason, model: this.params.model },
    ) as RunFinishedEvent
  }

  private async shouldContinue(): Promise<boolean> {
    // Always enter the tool-execution half-cycle after a model turn.
    if (this.cyclePhase === 'executeToolCalls') {
      return true
    }

    const state = {
      iterationCount: this.iterationCount,
      messages: this.messages,
      finishReason: this.lastFinishReason,
      toolCallCount: this.toolCallCount,
      lastTurnToolCallCount: this.lastTurnToolCallCount,
    }

    const strategyContinues = this.loopStrategy(state)
    const middlewareContinues = await this.middlewareRunner.runOnShouldContinue(
      this.middlewareCtx,
      state,
    )

    return (
      strategyContinues && middlewareContinues && this.toolPhase === 'continue'
    )
  }

  private recordToolCalls(toolCalls: Array<ToolCall>): void {
    this.lastTurnToolCallCount = toolCalls.length
    let newlyCounted = 0
    for (const tc of toolCalls) {
      if (!this.countedToolCallIds.has(tc.id)) {
        this.countedToolCallIds.add(tc.id)
        newlyCounted++
      }
    }
    this.toolCallCount += newlyCounted
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

  private resolveAbortReason(): string | undefined {
    if (this.abortReason !== undefined) return this.abortReason
    const signalReason: unknown = this.effectiveSignal?.reason
    return typeof signalReason === 'string' ? signalReason : undefined
  }

  wasDetached(): boolean {
    return getRunDetached(this.middlewareCtx, { optional: true }) === true
  }

  notifyDisconnected(): void {
    const shouldSkipDisconnected = this.disconnected || this.terminalHookCalled
    if (shouldSkipDisconnected) return
    this.disconnected = true
    for (const listener of this.disconnectListeners) {
      this.runDisconnectListener(listener)
    }
  }

  private runDisconnectListener(listener: () => void | Promise<void>): void {
    let result: void | Promise<void>
    try {
      result = listener()
    } catch (error) {
      this.logger.errors('run disconnect listener failed', { error })
      return
    }
    if (result === undefined) return
    this.deferredPromises.push(
      result.catch((error: unknown) => {
        this.logger.errors('run disconnect listener failed', { error })
      }),
    )
  }

  private async *runStructuredFinalization(): AsyncGenerator<StreamChunk> {
    if (!this.finalStructuredOutput) {
      throw new Error(
        'runStructuredFinalization called without finalStructuredOutput config',
      )
    }

    this.middlewareCtx.phase = 'structuredOutput'

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

    const { outputSchema: pinnedSchema, ...chatConfigSlice } = structuredConfig
    const postOnConfig = await this.middlewareRunner.runOnConfig(
      this.middlewareCtx,
      { ...chatConfigSlice, tools: baseConfig.tools },
    )

    // Apply merged config back to engine state
    this.applyMiddlewareConfig(postOnConfig)

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

    const state = {
      startEmitted: false,
      structuredMessageId: null as string | null,
      runErrorYielded: false,
    }

    const extractMessageId = (c: StreamChunk): string | null => {
      const shouldSkipC =
        c.type === EventType.TEXT_MESSAGE_START ||
        c.type === EventType.TEXT_MESSAGE_CONTENT ||
        c.type === EventType.TEXT_MESSAGE_END
      if (shouldSkipC) {
        return typeof c.messageId === 'string' && c.messageId !== ''
          ? c.messageId
          : null
      }
      return null
    }

    const buildSynthesizedStart = (timestamp = Date.now()): StreamChunk => {
      const idForStart = state.structuredMessageId ?? generateMessageId()
      state.structuredMessageId = idForStart
      this.captureStructuredOutputMessageIdentity(idForStart)
      return {
        type: EventType.CUSTOM,
        name: 'structured-output.start',
        value: { messageId: idForStart },
        timestamp,
      }
    }

    const runChunkMiddleware = (
      synthChunk: StreamChunk,
    ): Promise<Array<StreamChunk>> =>
      this.middlewareRunner.runOnChunk(this.middlewareCtx, synthChunk)

    const noteAdapterStart = (chunk: StreamChunk): void => {
      const isState =
        !state.startEmitted &&
        chunk.type === EventType.CUSTOM &&
        chunk.name === 'structured-output.start'
      if (isState) {
        state.startEmitted = true
      }
      if (state.structuredMessageId) return
      const extracted = extractMessageId(chunk)
      if (!extracted) return
      state.structuredMessageId = extracted
      this.captureStructuredOutputMessageIdentity(extracted)
    }

    const shouldSynthesizeStart = (chunk: StreamChunk): boolean => {
      const shouldSkipState =
        state.startEmitted || !this.finalStructuredOutput?.yieldChunks
      if (shouldSkipState) {
        return false
      }
      return (
        chunk.type === EventType.TEXT_MESSAGE_START ||
        chunk.type === EventType.TEXT_MESSAGE_CONTENT ||
        chunk.type === EventType.TEXT_MESSAGE_END ||
        chunk.type === EventType.RUN_ERROR
      )
    }

    const normalizeCompleteChunk = (chunk: StreamChunk): StreamChunk => {
      const shouldSkipChunk =
        chunk.type !== EventType.CUSTOM ||
        chunk.name !== 'structured-output.complete' ||
        !this.finalStructuredOutput
      if (shouldSkipChunk) {
        return chunk
      }
      const parsed = readStructuredOutputCompleteValue(chunk.value)
      if (!parsed) return chunk
      const object = this.finalStructuredOutput.normalize
        ? this.finalStructuredOutput.normalize(parsed.object)
        : parsed.object
      this.structuredOutputResult = {
        data: object,
        rawText: parsed.raw,
        ...(parsed.reasoning !== undefined
          ? { reasoning: parsed.reasoning }
          : {}),
      }
      const value = chunk.value
      const isInvalidParsed =
        object !== parsed.object && value && typeof value === 'object'
      if (isInvalidParsed) {
        return { ...chunk, value: { ...value, object } }
      }
      return chunk
    }

    const recordFinalizationError = (chunk: StreamChunk): void => {
      if (chunk.type !== EventType.RUN_ERROR) return
      this.finalizationError = {
        message: chunk.message,
        ...(chunk.code ? { code: chunk.code } : {}),
        ...(fallbackAdapterError !== undefined
          ? { cause: fallbackAdapterError }
          : {}),
      }
    }

    async function* processFinalizationChunk(
      this: TextEngine<TAdapter, TContext, TParams>,
      chunk: StreamChunk,
    ): AsyncGenerator<StreamChunk> {
      noteAdapterStart(chunk)
      if (shouldSynthesizeStart(chunk)) {
        state.startEmitted = true
        yield* this.emitPublicChunks(
          await runChunkMiddleware(buildSynthesizedStart(chunk.timestamp)),
        )
      }
      const outboundChunk = normalizeCompleteChunk(chunk)
      if (chunk.type === EventType.RUN_FINISHED) {
        await this.runOnUsageFromChunk(chunk)
      }
      recordFinalizationError(chunk)
      const outputChunks = await this.middlewareRunner.runOnChunk(
        this.middlewareCtx,
        outboundChunk,
      )
      if (!this.finalStructuredOutput?.yieldChunks) return
      const specs = this.emitPublicChunks(outputChunks)
      for (const spec of specs) {
        if (spec.type === EventType.RUN_ERROR) {
          state.runErrorYielded = true
        }
        yield spec
      }
    }

    for await (const raw of providerStream) {
      if (this.isCancelled()) break
      yield* processFinalizationChunk.call(this, raw)
      const shouldSkipIsCancelled = this.isCancelled() || this.finalizationError
      if (shouldSkipIsCancelled) break
    }

    if (this.isCancelled()) return
    yield* this.finishStructuredFinalization(state, {
      buildSynthesizedStart,
      runChunkMiddleware,
    })
  }

  private async *finishStructuredFinalization(
    state: {
      startEmitted: boolean
      structuredMessageId: string | null
      runErrorYielded: boolean
    },
    helpers: {
      buildSynthesizedStart: (timestamp?: number) => StreamChunk
      runChunkMiddleware: (chunk: StreamChunk) => Promise<Array<StreamChunk>>
    },
  ): AsyncGenerator<StreamChunk> {
    const hasStructuredOutputResult =
      !this.structuredOutputResult && !this.finalizationError
    if (hasStructuredOutputResult) {
      this.finalizationError = {
        message: 'missing structured result',
        code: 'structured-output-missing-result',
      }
    }
    const hasStructuredOutputResult2 =
      this.structuredOutputResult &&
      !this.finalizationError &&
      this.finalStructuredOutput?.validate
    if (hasStructuredOutputResult2) {
      try {
        this.validatedStructuredOutput = this.finalStructuredOutput.validate(
          this.structuredOutputResult.data,
        )
        this.hasValidatedStructuredOutput = true
      } catch (err: unknown) {
        this.finalizationError = {
          message: err instanceof Error ? err.message : String(err),
          code: 'structured-output-validation-failed',
          cause: err,
        }
      }
    }
    const shouldSkipFinalizationError =
      !this.finalizationError ||
      !this.finalStructuredOutput?.yieldChunks ||
      state.runErrorYielded
    if (shouldSkipFinalizationError) {
      return
    }
    if (!state.startEmitted) {
      state.startEmitted = true
      yield* this.emitPublicChunks(
        await helpers.runChunkMiddleware(helpers.buildSynthesizedStart()),
      )
    }
    const errChunk: StreamChunk = {
      type: EventType.RUN_ERROR,
      timestamp: Date.now(),
      message: this.finalizationError.message,
      ...(this.finalizationError.code
        ? { code: this.finalizationError.code }
        : {}),
    }
    yield* this.emitPublicChunks(
      await this.middlewareRunner.runOnChunk(this.middlewareCtx, errChunk),
    )
  }

  private captureCombinedStructuredOutput(): void {
    if (!this.finalStructuredOutput) return
    const source = this.finalStructuredOutput.source ?? 'text'
    if (source === 'event') {
      if (!this.structuredOutputResult) {
        this.finalizationError = {
          message: 'missing structured result',
          code: 'structured-output-missing-result',
        }
      }
    } else {
      this.parseCombinedStructuredText()
    }
    const shouldSkipStructuredOutputResult =
      !this.structuredOutputResult ||
      this.finalizationError ||
      !this.finalStructuredOutput.validate
    if (shouldSkipStructuredOutputResult) {
      return
    }
    try {
      this.validatedStructuredOutput = this.finalStructuredOutput.validate(
        this.structuredOutputResult.data,
      )
      this.hasValidatedStructuredOutput = true
    } catch (err: unknown) {
      this.finalizationError = {
        message: err instanceof Error ? err.message : String(err),
        code: 'structured-output-validation-failed',
        cause: err,
      }
    }
  }

  private parseCombinedStructuredText(): void {
    if (!this.finalStructuredOutput) return
    const rawText = this.accumulatedContent
    if (rawText.length === 0) {
      this.finalizationError = {
        message: 'missing structured result',
        code: 'structured-output-missing-result',
      }
      return
    }
    try {
      const parsed: unknown = JSON.parse(rawText)
      const data = this.finalStructuredOutput.normalize
        ? this.finalStructuredOutput.normalize(parsed)
        : parsed
      this.structuredOutputResult = { data, rawText }
    } catch (err: unknown) {
      const detail = rawText.slice(0, 200) + (rawText.length > 200 ? '...' : '')
      this.finalizationError = {
        message: `Failed to parse structured output as JSON. Content: ${detail}`,
        code: 'structured-output-parse-failed',
        cause: err,
      }
    }
  }

  private async *emitCombinedStructuredChunks(): AsyncGenerator<StreamChunk> {
    if (!this.combinedStartEmitted) {
      this.combinedStartEmitted = true
      const messageId = this.combinedStructuredMessageId ?? generateMessageId()
      this.combinedStructuredMessageId = messageId
      const synthStart: StreamChunk = {
        type: EventType.CUSTOM,
        name: 'structured-output.start',
        value: { messageId },
        timestamp: Date.now(),
      }
      yield* this.emitPublicChunks(
        await this.middlewareRunner.runOnChunk(this.middlewareCtx, synthStart),
      )
    }
    const hasStructuredOutputResult =
      this.structuredOutputResult &&
      !this.finalizationError &&
      !this.combinedCompleteEmitted
    if (hasStructuredOutputResult) {
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
        timestamp: Date.now(),
      }
      yield* this.emitPublicChunks(
        await this.middlewareRunner.runOnChunk(
          this.middlewareCtx,
          completeChunk,
        ),
      )
    }
    if (!this.finalizationError) return
    const errChunk: StreamChunk = {
      type: EventType.RUN_ERROR,
      timestamp: Date.now(),
      message: this.finalizationError.message,
      ...(this.finalizationError.code
        ? { code: this.finalizationError.code }
        : {}),
    }
    yield* this.emitPublicChunks(
      await this.middlewareRunner.runOnChunk(this.middlewareCtx, errChunk),
    )
  }

  private async *harvestCombinedStructuredOutput(): AsyncGenerator<StreamChunk> {
    if (!this.finalStructuredOutput) {
      throw new Error(
        'harvestCombinedStructuredOutput called without finalStructuredOutput config',
      )
    }
    this.captureCombinedStructuredOutput()
    if (!this.finalStructuredOutput.yieldChunks) return
    yield* this.emitCombinedStructuredChunks()
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
    if ((config.resume?.length ?? 0) === 0) {
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

    const pendingToolCalls = this.getToolCallsForEphemeralResume(config.resume)
    const { approvalRequests, clientRequests, toolsByCallId } =
      this.collectEphemeralResumeRequests(pendingToolCalls, config.resume)

    const genericPending = this.getGenericContinuationPending(interruptedRunId)
    const pending: Array<{
      interruptId: string
      payload: unknown
      binding: InterruptBinding
      genericRequest?: GenericInterruptRequest<
        InterruptDefinition<any, any, any, any>
      >
    }> = this.buildActionableInterrupts(
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
    pending.push(...genericPending)
    const validated = await validateInterruptResumeBatch({
      threadId: this.threadId,
      interruptedRunId,
      generation: 0,
      pending,
      resume: config.resume,
      tools: this.tools,
    })
    const hasValidated =
      validated.errors.length > 0 || !validated.resumeToolState
    if (hasValidated) {
      throw new InterruptResumeValidationError(validated.errors)
    }

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

    await this.applyEphemeralGenericResolutions(
      genericPending,
      validated.resumeToolState.genericInterrupts,
      pendingToolCalls,
    )
  }

  private collectEphemeralResumeRequests(
    pendingToolCalls: Array<ToolCall>,
    resume: ChatMiddlewareConfig['resume'],
  ): {
    approvalRequests: Array<ApprovalRequest>
    clientRequests: Array<ClientToolRequest>
    toolsByCallId: Map<string, AnyRuntimeTool>
  } {
    const approvalRequests: Array<ApprovalRequest> = []
    const clientRequests: Array<ClientToolRequest> = []
    const resumeInterruptIds = new Set(
      resume?.map((entry) => entry.interruptId),
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
      toolInputs.set(toolCall.id, parseEphemeralToolInput(toolCall))
      const hasTool =
        !tool.execute && resumeInterruptIds.has(`client_tool_${toolCall.id}`)
      if (hasTool) {
        clientExecutionCallIds.add(toolCall.id)
      }
    }
    for (const toolCall of pendingToolCalls) {
      const tool = toolsByCallId.get(toolCall.id)
      const hasTool2 =
        tool?.needsApproval && !clientExecutionCallIds.has(toolCall.id)
      if (hasTool2) {
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
      const hasTool3 =
        tool !== undefined &&
        !tool.execute &&
        (!tool.needsApproval || clientExecutionCallIds.has(toolCall.id))
      if (hasTool3) {
        clientRequests.push({
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolInputs.get(toolCall.id) ?? {},
        })
      }
    }
    return { approvalRequests, clientRequests, toolsByCallId }
  }

  private async applyEphemeralGenericResolutions(
    genericPending: Array<{
      interruptId: string
      payload: unknown
      binding: InterruptBinding
      genericRequest?: GenericInterruptRequest<
        InterruptDefinition<any, any, any, any>
      >
    }>,
    genericResolutions: ChatResumeToolState['genericInterrupts'] | undefined,
    pendingToolCalls: Array<ToolCall>,
  ): Promise<void> {
    const isEmptyGenericPending =
      genericPending.length === 0 || !genericResolutions
    if (isEmptyGenericPending) return
    const resolutions = genericPending
      .sort((left, right) => {
        const leftIndex =
          left.binding.kind === 'generic' ? (left.binding.batchIndex ?? 0) : 0
        const rightIndex =
          right.binding.kind === 'generic' ? (right.binding.batchIndex ?? 0) : 0
        return leftIndex - rightIndex
      })
      .flatMap((record) => {
        const resolution = genericResolutions.get(record.interruptId)
        const shouldSkipResolution = !resolution || !record.genericRequest
        if (shouldSkipResolution) return []
        return [
          resolution.status === 'resolved'
            ? {
                request: record.genericRequest,
                status: 'resolved' as const,
                response: resolution.payload,
              }
            : {
                request: record.genericRequest,
                status: 'cancelled' as const,
              },
        ]
      })
    const collection: InterruptResolutionCollection = {
      for: (definition) =>
        resolutions.filter(
          (resolution) => resolution.request.definition === definition,
        ) as never,
      all: (...definitions: Array<InterruptDefinition<any, any, any, any>>) =>
        definitions.length === 0
          ? resolutions
          : resolutions.filter((resolution) =>
              definitions.includes(resolution.request.definition),
            ),
    }
    const policy = await this.middlewareRunner.runOnInterruptResolution(
      this.middlewareCtx,
      collection,
    )
    if (policy.toolResume === 'stop') {
      this.earlyTermination = true
      return
    }
    if (policy.toolResume !== 'cancel') return
    for (const request of pendingToolCalls) {
      this.resumeCancelledToolCallIds.add(request.id)
    }
  }

  private getGenericContinuationPending(interruptedRunId: string): Array<{
    interruptId: string
    payload: unknown
    binding: InterruptBinding
    genericRequest: GenericInterruptRequest<
      InterruptDefinition<any, any, any, any>
    >
  }> {
    const fail = (message: string): never => {
      throw new InterruptResumeValidationError([
        {
          scope: 'batch',
          threadId: this.threadId,
          interruptedRunId,
          generation: 0,
          interruptIds: [],
          code: 'stale',
          message,
          source: 'server',
          retryable: false,
        },
      ])
    }
    const pending: Array<{
      interruptId: string
      payload: unknown
      binding: InterruptBinding
      genericRequest: GenericInterruptRequest<
        InterruptDefinition<any, any, any, any>
      >
    }> = []
    const ids = new Set<string>()
    const batchIndexes = new Set<number>()
    for (const resumeItem of this.params.resume ?? []) {
      const parsed = readGenericInterruptContinuation(resumeItem.metadata)
      if (parsed.status === 'absent') continue
      if (parsed.status === 'invalid') {
        return fail(parsed.message)
      }
      const entry = parsed.value
      const id = resumeItem.interruptId
      const definition = this.interruptDefinitions.get(entry.definitionId)
      if (!definition) {
        return fail(
          `Generic interrupt definition ${entry.definitionId} is unavailable.`,
        )
      }
      const shouldSkipIds = ids.has(id) || batchIndexes.has(entry.batchIndex)
      if (shouldSkipIds) {
        return fail(
          'Generic interrupt continuation contains duplicate entries.',
        )
      }
      ids.add(id)
      batchIndexes.add(entry.batchIndex)
      let request: GenericInterruptRequest<
        InterruptDefinition<any, any, any, any>
      >
      try {
        request = rehydrateInterruptRequest(definition, {
          key: entry.key,
          reason: entry.reason,
          message: entry.message,
          ...(typeof entry.expiresAt === 'string'
            ? { expiresAt: entry.expiresAt }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(entry, 'payload')
            ? { payload: entry.payload }
            : {}),
        })
      } catch (error) {
        return fail(
          `Generic interrupt continuation ${id} is invalid: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
      const emitted = createInterruptBinding(request, {
        batchIndex: entry.batchIndex,
      })
      const shouldSkipEntry =
        entry.responseSchemaHash !== emitted.descriptor.responseSchemaHash ||
        entry.payloadSchemaHash !== emitted.descriptor.payloadSchemaHash
      if (shouldSkipEntry) {
        return fail(
          `Generic interrupt continuation ${id} does not match its definition.`,
        )
      }
      pending.push({
        interruptId: id,
        payload: {
          id,
          ...(emitted.descriptor.responseSchemaCanonicalJson !== undefined
            ? {
                responseSchema: JSON.parse(
                  emitted.descriptor.responseSchemaCanonicalJson,
                ),
              }
            : {}),
        },
        binding: {
          v: INTERRUPT_BINDING_VERSION,
          kind: 'generic',
          interruptId: id,
          interruptedRunId,
          generation: 0,
          definitionId: entry.definitionId,
          key: entry.key,
          batchIndex: entry.batchIndex,
          ...(typeof entry.expiresAt === 'string'
            ? { expiresAt: entry.expiresAt }
            : {}),
          ...(emitted.descriptor.payloadSchemaHash
            ? { payloadSchemaHash: emitted.descriptor.payloadSchemaHash }
            : {}),
          ...(entry.responseSchemaHash !== undefined
            ? { responseSchemaHash: entry.responseSchemaHash }
            : {}),
        },
        genericRequest: request,
      })
    }
    return pending
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
    if (state?.genericInterrupts) {
      for (const [interruptId, resolution] of state.genericInterrupts) {
        this.resumeGenericInterrupts.set(interruptId, resolution)
      }
    }
    if (state?.genericInterruptRequests) {
      for (const [interruptId, request] of state.genericInterruptRequests) {
        this.resumeGenericInterruptRequests.set(interruptId, request)
      }
    }
  }

  private async applyDurableGenericInterruptResolution(): Promise<void> {
    if (this.resumeGenericInterruptRequests.size === 0) return
    const resolutions = [
      ...this.resumeGenericInterruptRequests.entries(),
    ].flatMap(([interruptId, request]) => {
      const resolution = this.resumeGenericInterrupts.get(interruptId)
      if (!resolution) return []
      return [
        resolution.status === 'resolved'
          ? {
              request,
              status: 'resolved' as const,
              response: resolution.payload,
            }
          : { request, status: 'cancelled' as const },
      ]
    })
    const collection: InterruptResolutionCollection = {
      for: (definition) =>
        resolutions.filter(
          (resolution) => resolution.request.definition === definition,
        ) as never,
      all: (...definitions: Array<InterruptDefinition<any, any, any, any>>) =>
        definitions.length === 0
          ? resolutions
          : resolutions.filter((resolution) =>
              definitions.includes(resolution.request.definition),
            ),
    }
    const policy = await this.middlewareRunner.runOnInterruptResolution(
      this.middlewareCtx,
      collection,
    )
    if (policy.toolResume === 'stop') {
      this.earlyTermination = true
    } else if (policy.toolResume === 'cancel') {
      const toolCalls = this.getPendingToolCallsFromMessages()
      for (const toolCall of toolCalls) {
        this.resumeCancelledToolCallIds.add(toolCall.id)
      }
    }
  }

  private applyMiddlewareConfig(config: ChatMiddlewareConfig): void {
    this.applyResumeToolState(config.resumeToolState)
    this.messages = config.messages
    this.systemPrompts = config.systemPrompts
    assertUniqueToolNames(config.tools)
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

  private *emitPublicChunks(
    outputs: Array<StreamChunk>,
  ): Generator<StreamChunk, void, void> {
    for (const output of outputs) {
      const chunks = normalizeStreamChunk(output as AdapterYieldChunk)
      for (const spec of chunks) {
        restorePublicUsage(spec)
        if (spec.type === EventType.RUN_STARTED) {
          this.hasPublicRunStarted = true
        }
        yield spec
        this.middlewareCtx.chunkIndex++
      }
    }
  }

  private async *pipeThroughMiddleware(
    chunk: AdapterYieldChunk,
  ): AsyncGenerator<StreamChunk, void, void> {
    const afterMw = await this.middlewareRunner.runOnChunk(
      this.middlewareCtx,
      chunk,
    )
    yield* this.emitPublicChunks(afterMw)
  }

  private async *drainSandboxFileQueue(): AsyncGenerator<StreamChunk> {
    while (this.sandboxFileQueue.length > 0) {
      const chunk = this.sandboxFileQueue.shift()
      if (chunk) yield* this.pipeThroughMiddleware(chunk)
    }
  }

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
      type: EventType.CUSTOM,
      timestamp: Date.now(),
      name: eventName,
      value,
    }
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

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
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = [],
  TContext = unknown,
  const TMiddleware extends Array<unknown> | undefined = undefined,
>(
  options: TextActivityOptionsWithContext<
    TAdapter,
    TSchema,
    TStream,
    TTools,
    TInterrupts,
    TContext,
    TMiddleware
  >,
): TextActivityResult<TSchema, TStream, TTools> {
  validateInterruptDefinitions(options.interrupts)
  validateCapabilities(
    readRuntimeMiddleware(options.middleware) ?? [],
    options.adapter,
  )
  if (options.tools) {
    assertUniqueToolNames(options.tools)
  }

  const { outputSchema, stream } = options

  const hasOutputSchema = outputSchema && stream === true
  if (hasOutputSchema) {
    return runStreamingStructuredOutput(
      toRuntimeTextActivityOptions(options, {
        outputSchema,
        stream: true,
      }),
    ) as TextActivityResult<TSchema, TStream, TTools>
  }

  if (outputSchema) {
    return runAgenticStructuredOutput(
      toRuntimeTextActivityOptions(options, {
        outputSchema,
        stream: false,
      }),
    ) as TextActivityResult<TSchema, TStream, TTools>
  }

  if (stream === false) {
    return runNonStreamingText(
      toRuntimeTextActivityOptions(options, {
        outputSchema: undefined,
        stream: false,
      }),
    ) as TextActivityResult<TSchema, TStream, TTools>
  }

  return runStreamingText(
    toRuntimeTextActivityOptions(options, {
      outputSchema: undefined,
      stream: true,
    }),
  ) as TextActivityResult<TSchema, TStream, TTools>
}

type RuntimeTextActivityOptions<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined,
  TStream extends boolean,
> = Omit<TextActivityOptions<TAdapter, TSchema, TStream, any>, 'middleware'> & {
  middleware?: Array<AnyChatMiddleware>
}

function readRuntimeMiddleware(
  middleware: unknown,
): Array<AnyChatMiddleware> | undefined {
  if (middleware === undefined) return undefined
  if (!Array.isArray(middleware)) {
    throw new TypeError('Chat middleware must be an array.')
  }
  return middleware
}

function toRuntimeTextActivityOptions<
  TAdapter extends AnyTextAdapter,
  TInputSchema extends SchemaInput | undefined,
  TInputStream extends boolean,
  TOutputSchema extends SchemaInput | undefined,
  TOutputStream extends boolean,
  TTools extends TextActivityOptions<
    TAdapter,
    TInputSchema,
    TInputStream,
    any
  >['tools'],
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
  TContext,
  TMiddleware extends Array<unknown> | undefined,
>(
  options: TextActivityOptionsWithContext<
    TAdapter,
    TInputSchema,
    TInputStream,
    TTools,
    TInterrupts,
    TContext,
    TMiddleware
  >,
  overrides: { outputSchema: TOutputSchema; stream: TOutputStream },
): RuntimeTextActivityOptions<TAdapter, TOutputSchema, TOutputStream> {
  const { middleware, ...rest } = options
  return {
    ...rest,
    ...overrides,
    ...(middleware === undefined
      ? {}
      : { middleware: readRuntimeMiddleware(middleware) }),
  }
}

function validateInterruptDefinitions(
  definitions:
    | ReadonlyArray<InterruptDefinition<any, any, any, any>>
    | undefined,
): void {
  if (!definitions) return
  const seen = new Set<string>()
  for (const definition of definitions) {
    if (seen.has(definition.id)) {
      throw new Error(`Duplicate interrupt definition id: ${definition.id}`)
    }
    seen.add(definition.id)
  }
}

interface DeliveryEngineRef {
  current?: {
    wasDetached: () => boolean
    notifyDisconnected: () => void
  }
}

function publishDeliverySeams(
  stream: object,
  engineRef: DeliveryEngineRef,
): void {
  // A thunk, evaluated on the sink's teardown path: the engine does not exist
  // yet, and the verdict it will report is only written during `onAbort`.
  publishRunDetachedSignal(
    stream,
    () => engineRef.current?.wasDetached() === true,
  )
  publishRunDisconnectHandler(stream, () => {
    engineRef.current?.notifyDisconnected()
  })
}

function runStreamingText(
  options: RuntimeTextActivityOptions<AnyTextAdapter, undefined, boolean>,
): AsyncIterable<StreamChunk> {
  const engineRef: DeliveryEngineRef = {}
  const stream = streamTextChunks(options, engineRef)
  publishDeliverySeams(stream, engineRef)
  return stream
}

async function* streamTextChunks(
  options: RuntimeTextActivityOptions<AnyTextAdapter, undefined, boolean>,
  engineRef: DeliveryEngineRef,
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
        any
      >,
      middleware,
      context,
    },
    logger,
  )
  engineRef.current = engine

  try {
    const runChunks = engine.run()
    for await (const chunk of runChunks) {
      yield chunk
    }
  } finally {
    await mcpManager.dispose()
  }
}

function runNonStreamingText(
  options: RuntimeTextActivityOptions<AnyTextAdapter, undefined, false>,
): Promise<string> {
  const stream = runStreamingText({
    ...options,
    stream: true,
  })

  return streamToText(stream)
}

async function runAgenticStructuredOutput<TSchema extends SchemaInput>(
  options: RuntimeTextActivityOptions<AnyTextAdapter, TSchema, boolean>,
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

  const { jsonSchema, nullWideningMap } =
    convertSchemaForStructuredOutput(outputSchema)
  if (!jsonSchema) {
    throw new Error('Failed to convert output schema to JSON Schema')
  }

  const normalize = (data: unknown): unknown =>
    undoNullWidening(data, nullWideningMap)

  const validate = isStandardSchema(outputSchema)
    ? (data: unknown): unknown =>
        parseWithStandardSchema<InferSchemaType<TSchema>>(outputSchema, data)
    : undefined

  const nativeCombined =
    adapter.supportsCombinedToolsAndSchema?.(options.modelOptions) === true
  const source =
    adapter.combinedStructuredOutputSource?.(options.modelOptions) ?? 'text'

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
        any
      >,
      middleware,
      context,
      finalStructuredOutput: {
        jsonSchema,
        yieldChunks: false,
        normalize,
        ...(validate ? { validate } : {}),
        ...(nativeCombined ? { nativeCombined: true } : {}),
        source,
      },
    },
    logger,
  )

  try {
    // Consume the stream — chunks pipe through middleware but are not yielded externally
    const runChunks = engine.run()
    for await (const _chunk of runChunks) {
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

function readCustomEventMessageId(value: unknown): string | undefined {
  const isInvalid = typeof value !== 'object' || value === null
  if (isInvalid) return undefined
  if (!('messageId' in value)) return undefined
  const messageId = value.messageId
  return typeof messageId === 'string' && messageId !== ''
    ? messageId
    : undefined
}

function readStructuredOutputCompleteValue(
  value: unknown,
): { object: unknown; raw: string; reasoning?: string } | null {
  const isInvalid = typeof value !== 'object' || value === null
  if (isInvalid) return null
  const hasObject = !('object' in value) || !('raw' in value)
  if (hasObject) return null
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

async function* fallbackStructuredOutputStream(
  adapter: AnyTextAdapter,
  options: StructuredOutputOptions<Record<string, unknown>>,
  onAdapterError?: (err: unknown) => void,
): AsyncIterable<AdapterYieldChunk> {
  const { chatOptions } = options
  const fallbackRand = Math.random().toString(36).slice(2)
  const runId = chatOptions.runId ?? `fallback-${Date.now()}-${fallbackRand}`
  const threadId =
    chatOptions.threadId ?? `fallback-${Date.now()}-${fallbackRand}`
  const messageId = `fallback-${Date.now()}-${fallbackRand}`
  const model = chatOptions.model
  const startedAt = Date.now()

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    model,
    timestamp: startedAt,
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
      timestamp: Date.now(),
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
    timestamp: Date.now(),
  }

  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: result.rawText,
    model,
    timestamp: Date.now(),
  }

  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    model,
    timestamp: Date.now(),
  }

  yield {
    type: EventType.CUSTOM,
    name: 'structured-output.complete',
    value: { object: result.data, raw: result.rawText },
    model,
    timestamp: Date.now(),
  }

  yield {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    model,
    timestamp: Date.now(),
    finishReason: 'stop',
    ...(result.usage ? { usage: result.usage } : {}),
  }
}

function runStreamingStructuredOutput<TSchema extends SchemaInput>(
  options: RuntimeTextActivityOptions<AnyTextAdapter, TSchema, true>,
): StructuredOutputStream<InferSchemaType<TSchema>> {
  const { outputSchema } = options

  if (!outputSchema) {
    throw new Error('outputSchema is required for streaming structured output')
  }

  const { jsonSchema, nullWideningMap } =
    convertSchemaForStructuredOutput(outputSchema)
  if (!jsonSchema) {
    throw new Error('Failed to convert output schema to JSON Schema')
  }
  const normalize = (data: unknown): unknown =>
    undoNullWidening(data, nullWideningMap)

  const engineRef: DeliveryEngineRef = {}
  const stream = runStreamingStructuredOutputImpl(
    options,
    jsonSchema,
    normalize,
    engineRef,
  )
  publishDeliverySeams(stream, engineRef)
  return stream as StructuredOutputStream<InferSchemaType<TSchema>>
}

type StructuredOutputStreamInternal<T> = AsyncIterable<
  StreamChunk | StructuredOutputCompleteEvent<T>
>

async function* runStreamingStructuredOutputImpl<TSchema extends SchemaInput>(
  options: RuntimeTextActivityOptions<AnyTextAdapter, TSchema, true>,
  jsonSchema: NonNullable<ReturnType<typeof convertSchemaToJsonSchema>>,
  normalize: (data: unknown) => unknown,
  engineRef: DeliveryEngineRef,
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

  const nativeCombined =
    adapter.supportsCombinedToolsAndSchema?.(options.modelOptions) === true
  const source =
    adapter.combinedStructuredOutputSource?.(options.modelOptions) ?? 'text'

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
        any
      >,
      middleware,
      context,
      finalStructuredOutput: {
        jsonSchema,
        yieldChunks: true,
        normalize,
        ...(nativeCombined ? { nativeCombined: true } : {}),
        source,
      },
    },
    logger,
  )
  engineRef.current = engine

  try {
    const runChunks = engine.run()
    for await (const chunk of runChunks) {
      yield chunk
    }
  } finally {
    await mcpManager.dispose()
  }

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
