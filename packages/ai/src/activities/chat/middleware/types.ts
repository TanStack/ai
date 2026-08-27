import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'
import type {
  AgentLoopState,
  JSONSchema,
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
  TokenUsage,
  Tool,
  ToolCall,
} from '../../../types'
import type { SystemPrompt } from '../../../system-prompts'
import type { ToolApprovalResolution } from '../../../interrupts'
import type {
  GenericInterruptRequest,
  InterruptDefinition,
} from '../../../interrupt-definition'
import type {
  Capability,
  CapabilityHandle,
  CapabilityRegistry,
} from './capabilities'

/** A file change observed inside a sandbox during a chat run. */
export interface SandboxFileEvent {
  type: 'create' | 'change' | 'delete'
  /** Absolute path inside the sandbox (under the workspace root). */
  path: string
  timestamp: number
}

export interface SandboxFileHookEvent extends SandboxFileEvent {
  /** Content at the session baseline (`''` for a new file or non-git workspace). */
  before: () => Promise<string>
  /** Current content (`''` when the event is a delete). */
  after: () => Promise<string>
  /** Unified patch vs the session baseline (synthesized add-patch when non-git). */
  diff: () => Promise<string>
}

export interface ChatSandboxHooks<TContext = unknown> {
  onFile?: (
    ctx: ChatMiddlewareContext<TContext>,
    e: SandboxFileHookEvent,
  ) => void | Promise<void>
  onFileCreate?: (
    ctx: ChatMiddlewareContext<TContext>,
    e: SandboxFileHookEvent,
  ) => void | Promise<void>
  onFileChange?: (
    ctx: ChatMiddlewareContext<TContext>,
    e: SandboxFileHookEvent,
  ) => void | Promise<void>
  onFileDelete?: (
    ctx: ChatMiddlewareContext<TContext>,
    e: SandboxFileHookEvent,
  ) => void | Promise<void>
}

export type ChatMiddlewarePhase =
  | 'init'
  | 'beforeModel'
  | 'afterModel'
  | 'modelStream'
  | 'beforeTools'
  | 'afterTools'
  | 'structuredOutput'

export const INTERRUPT_BOUNDARY_PHASES = [
  'beforeModel',
  'afterModel',
  'beforeTools',
  'afterTools',
] as const

export type InterruptBoundaryPhase = (typeof INTERRUPT_BOUNDARY_PHASES)[number]

export const INTERRUPT_TOOL_RESUMES = ['continue', 'cancel', 'stop'] as const

export type InterruptToolResume = (typeof INTERRUPT_TOOL_RESUMES)[number]

type AnyInterruptDefinition = InterruptDefinition<any, any, any, any>

type InterruptResponse<TDefinition> =
  TDefinition extends InterruptDefinition<any, any, infer TResponseSchema, any>
    ? TResponseSchema extends StandardSchemaV1<any, infer TResponse>
      ? TResponse
      : TResponseSchema extends StandardJSONSchemaV1<any, infer TResponse>
        ? TResponse
        : unknown
    : unknown

export type GenericInterruptResolution<
  TDefinition extends AnyInterruptDefinition,
> = TDefinition extends AnyInterruptDefinition
  ?
      | {
          readonly request: GenericInterruptRequest<TDefinition>
          readonly status: 'resolved'
          readonly response: InterruptResponse<TDefinition>
        }
      | {
          readonly request: GenericInterruptRequest<TDefinition>
          readonly status: 'cancelled'
          readonly response?: never
        }
  : never

export interface InterruptResolutionCollection<
  TDefinitions extends AnyInterruptDefinition = AnyInterruptDefinition,
> {
  for: <
    TDefinition extends ([TDefinitions] extends [never]
      ? AnyInterruptDefinition
      : TDefinitions),
  >(
    definition: TDefinition,
  ) => ReadonlyArray<GenericInterruptResolution<TDefinition>>
  all: {
    (): ReadonlyArray<GenericInterruptResolution<TDefinitions>>
    <const TSelected extends ReadonlyArray<TDefinitions>>(
      ...definitions: TSelected
    ): ReadonlyArray<GenericInterruptResolution<TSelected[number]>>
  }
}

type BivariantInterruptResolutionHook<
  TContext,
  TDefinitions extends AnyInterruptDefinition,
> = InterruptResolutionHookSignature<TContext, TDefinitions>['call']

declare abstract class InterruptResolutionHookSignature<
  TContext,
  TDefinitions extends AnyInterruptDefinition,
> {
  abstract call(
    ctx: ChatMiddlewareContext<TContext>,
    resolutions: InterruptResolutionCollection<TDefinitions>,
  ): InterruptResolutionResult | Promise<InterruptResolutionResult>
}

export type InterruptBoundaryResult<
  TDefinitions extends AnyInterruptDefinition = AnyInterruptDefinition,
> =
  | undefined
  | {
      readonly interrupts: ReadonlyArray<GenericInterruptRequest<TDefinitions>>
    }

export type InterruptResolutionResult = void | {
  readonly toolResume: InterruptToolResume
}

export interface ChatMiddlewareContext<TContext = unknown> {
  /** Unique identifier for this chat request */
  requestId: string
  /** Unique identifier for this stream */
  streamId: string
  /** AG-UI run identifier for correlating client and server events */
  runId: string
  /** Interrupted or parent run correlated with this continuation. */
  parentRunId?: string
  threadId: string
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
  /** Runtime context provided by chat() options */
  context: TContext
  defer: (promise: Promise<unknown>) => void

  // --- Provider / adapter info (immutable for the lifetime of the request) ---

  activity: 'chat'
  /** Provider name (e.g., 'openai', 'anthropic') */
  provider: string
  /** Model identifier (e.g., 'gpt-5.5') */
  model: string
  /** Source of the chat invocation — always 'server' for server-side chat */
  source: 'client' | 'server'
  /** Whether the chat is streaming */
  streaming: boolean

  // --- Config-derived info (may update per-iteration via onConfig) ---

  /** System prompts configured for this chat */
  systemPrompts: Array<SystemPrompt>
  /** Names of configured tools, if any */
  toolNames?: Array<string>
  /** Flattened generation options (metadata) */
  options?: Record<string, unknown> | undefined
  /** Provider-specific model options */
  modelOptions?: Record<string, unknown> | undefined

  // --- Computed info ---

  /** Number of messages at the start of the request */
  messageCount: number
  /** Whether tools are configured */
  hasTools: boolean

  // --- Mutable per-iteration state ---

  /** Current assistant message ID (changes per iteration) */
  currentMessageId: string | null
  /** Accumulated text content for the current iteration */
  accumulatedContent: string

  // --- References ---

  /** Current messages array (read-only view) */
  messages: ReadonlyArray<ModelMessage>
  /** Generate a unique ID with the given prefix */
  createId: (prefix: string) => string
  capabilities: CapabilityRegistry
  get: <TValue>(capability: Capability<TValue>) => TValue
  getOptional: <TValue>(capability: Capability<TValue>) => TValue | undefined
  provide: <TValue>(capability: Capability<TValue>, value: TValue) => void
}

export interface ChatMiddlewareConfig {
  messages: Array<ModelMessage>
  systemPrompts: Array<SystemPrompt>
  tools: Array<Tool>
  resume?: Array<RunAgentResumeItem> | undefined
  resumeToolState?: ChatResumeToolState | undefined
  metadata?: Record<string, unknown> | undefined
  modelOptions?: Record<string, unknown> | undefined
}

export interface ChatResumeToolState {
  approvals?: ReadonlyMap<string, ToolApprovalResolution> | undefined
  clientToolResults?: ReadonlyMap<string, unknown> | undefined
  genericInterrupts?:
    | ReadonlyMap<string, ChatResumeGenericResolution>
    | undefined
  /** Durable generic requests reconstructed by server middleware. */
  genericInterruptRequests?:
    | ReadonlyMap<
        string,
        GenericInterruptRequest<InterruptDefinition<any, any, any, any>>
      >
    | undefined
  deniedToolResults?: ReadonlyMap<string, unknown> | undefined
  cancelledToolCallIds?: ReadonlySet<string> | undefined
}

export type ChatResumeGenericResolution =
  | { interruptId: string; status: 'resolved'; payload: unknown }
  | { interruptId: string; status: 'cancelled'; payload?: never }

export interface StructuredOutputMiddlewareConfig extends Omit<
  ChatMiddlewareConfig,
  'tools'
> {
  /** JSON Schema being sent to the provider for structured output. */
  outputSchema: JSONSchema
}

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

export type BeforeToolCallDecision =
  | void
  | undefined
  | null
  | { type: 'transformArgs'; args: unknown }
  | { type: 'skip'; result: unknown }
  | { type: 'abort'; reason?: string }

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

export interface IterationInfo {
  /** 0-based iteration index */
  iteration: number
  /** The assistant message ID created for this iteration */
  messageId: string
}

export interface ToolPhaseCompleteInfo {
  /** Tool calls that were assigned to the assistant message */
  toolCalls: Array<ToolCall>
  /** Completed tool results */
  results: Array<{
    toolCallId: string
    toolName: string
    result: unknown
    duration?: number
  }>
  /** Tools that need user approval */
  needsApproval: Array<{
    toolCallId: string
    toolName: string
    input: unknown
    approvalId: string
  }>
  /** Tools that need client-side execution */
  needsClientExecution: Array<{
    toolCallId: string
    toolName: string
    input: unknown
  }>
}

export interface UsageInfo extends TokenUsage {}

export interface FinishInfo {
  /** The finish reason from the last model response */
  finishReason: string | null
  /** Total duration of the chat run in milliseconds */
  duration: number
  /** Final accumulated text content */
  content: string
  /** Final usage totals, if available (optionally including provider-reported cost) */
  usage?: TokenUsage | undefined
}

export interface AbortInfo {
  /** The reason for the abort, if provided */
  reason?: string
  /** Duration until abort in milliseconds */
  duration: number
  cancelRequested?: boolean
}

export interface ErrorInfo {
  /** The error that caused the failure */
  error: unknown
  /** Duration until error in milliseconds */
  duration: number
}

export interface ChatMiddleware<
  TContext = unknown,
  TInterruptDefinitions extends AnyInterruptDefinition = never,
> {
  /** Optional name for debugging and identification */
  name?: string

  onInterruptBoundary?: (
    ctx: ChatMiddlewareContext<TContext> & { phase: InterruptBoundaryPhase },
  ) =>
    | InterruptBoundaryResult<TInterruptDefinitions>
    | Promise<InterruptBoundaryResult<TInterruptDefinitions>>

  onInterruptResolution?: BivariantInterruptResolutionHook<
    TContext,
    TInterruptDefinitions
  >

  requires?: ReadonlyArray<CapabilityHandle>

  provides?: ReadonlyArray<CapabilityHandle>

  optionalRequires?: ReadonlyArray<CapabilityHandle>

  setup?: (ctx: ChatMiddlewareContext<TContext>) => void | Promise<void>

  onConfig?: (
    ctx: ChatMiddlewareContext<TContext>,
    config: ChatMiddlewareConfig,
  ) =>
    | void
    | null
    | Partial<ChatMiddlewareConfig>
    | Promise<void | null | Partial<ChatMiddlewareConfig>>

  onStructuredOutputConfig?: (
    ctx: ChatMiddlewareContext<TContext>,
    config: StructuredOutputMiddlewareConfig,
  ) =>
    | void
    | null
    | Partial<StructuredOutputMiddlewareConfig>
    | Promise<void | null | Partial<StructuredOutputMiddlewareConfig>>

  onStart?: (ctx: ChatMiddlewareContext<TContext>) => void | Promise<void>

  onIteration?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: IterationInfo,
  ) => void | Promise<void>

  onShouldContinue?: (
    ctx: ChatMiddlewareContext<TContext>,
    state: AgentLoopState,
  ) => boolean | void | Promise<boolean | void>

  onChunk?: (
    ctx: ChatMiddlewareContext<TContext>,
    chunk: StreamChunk,
  ) =>
    | void
    | StreamChunk
    | Array<StreamChunk>
    | null
    | Promise<void | StreamChunk | Array<StreamChunk> | null>

  onBeforeToolCall?: (
    ctx: ChatMiddlewareContext<TContext>,
    hookCtx: ToolCallHookContext,
  ) => BeforeToolCallDecision | Promise<BeforeToolCallDecision>

  onAfterToolCall?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: AfterToolCallInfo,
  ) => void | Promise<void>

  onToolPhaseComplete?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: ToolPhaseCompleteInfo,
  ) => void | Promise<void>

  onUsage?: (
    ctx: ChatMiddlewareContext<TContext>,
    usage: UsageInfo,
  ) => void | Promise<void>

  onFinish?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: FinishInfo,
  ) => void | Promise<void>

  onAbort?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: AbortInfo,
  ) => void | Promise<void>

  onError?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: ErrorInfo,
  ) => void | Promise<void>

  sandbox?: ChatSandboxHooks<TContext>
}

/** A `ChatMiddleware` with a permissive context — for use as a constraint. */
/** A permissive middleware constraint that retains the definition parameter. */
export type AnyChatMiddleware = ChatMiddleware<any, any>
