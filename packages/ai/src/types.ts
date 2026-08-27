import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'
import type { InternalLogger } from './logger/internal-logger'
import type { SystemPrompt } from './system-prompts'
import type { CapabilityContext } from './activities/chat/middleware/capabilities'
import type { InterruptSubmissionError } from './interrupts'
import type {
  BilledUsage,
  BillingUnit,
  CompletionTokensDetails,
  PromptTokensDetails,
  ProviderUsageDetails,
  TokenUsage,
  UsageCostBreakdown,
} from '@tanstack/ai-event-client'
import type {
  BaseEvent as AGUIBaseEvent,
  CustomEvent as AGUICustomEvent,
  Interrupt as AGUIInterrupt,
  MessagesSnapshotEvent as AGUIMessagesSnapshotEvent,
  ReasoningEncryptedValueEvent as AGUIReasoningEncryptedValueEvent,
  ReasoningEndEvent as AGUIReasoningEndEvent,
  ReasoningMessageContentEvent as AGUIReasoningMessageContentEvent,
  ReasoningMessageEndEvent as AGUIReasoningMessageEndEvent,
  ReasoningMessageStartEvent as AGUIReasoningMessageStartEvent,
  ReasoningStartEvent as AGUIReasoningStartEvent,
  ResumeEntry as AGUIResumeEntry,
  RunErrorEvent as AGUIRunErrorEvent,
  RunFinishedEvent as AGUIRunFinishedEvent,
  RunFinishedOutcome as AGUIRunFinishedOutcome,
  RunStartedEvent as AGUIRunStartedEvent,
  StateDeltaEvent as AGUIStateDeltaEvent,
  StateSnapshotEvent as AGUIStateSnapshotEvent,
  StepFinishedEvent as AGUIStepFinishedEvent,
  StepStartedEvent as AGUIStepStartedEvent,
  TextMessageContentEvent as AGUITextMessageContentEvent,
  TextMessageEndEvent as AGUITextMessageEndEvent,
  TextMessageStartEvent as AGUITextMessageStartEvent,
  ToolCallArgsEvent as AGUIToolCallArgsEvent,
  ToolCallEndEvent as AGUIToolCallEndEvent,
  ToolCallResultEvent as AGUIToolCallResultEvent,
  ToolCallStartEvent as AGUIToolCallStartEvent,
  EventType,
} from '@ag-ui/core'
import type {
  SpecTokenUsage,
  TokenUsageLeftover,
} from './utilities/ag-ui-usage'

export type { ProviderTool } from './tools/provider-tool'

export type ToolCallState =
  | 'awaiting-input'
  | 'input-streaming'
  | 'input-complete'
  | 'approval-requested'
  | 'approval-responded'
  | 'complete'
  | 'error'

export type ToolResultState = 'streaming' | 'complete' | 'error'

export type ToolOutputState = 'output-available' | 'output-error'

export interface JSONSchema {
  type?: string | Array<string>
  properties?: Record<string, JSONSchema>
  items?: JSONSchema | Array<JSONSchema>
  required?: Array<string>
  enum?: Array<unknown>
  const?: unknown
  description?: string
  default?: unknown
  $ref?: string
  $defs?: Record<string, JSONSchema>
  definitions?: Record<string, JSONSchema>
  allOf?: Array<JSONSchema>
  anyOf?: Array<JSONSchema>
  oneOf?: Array<JSONSchema>
  not?: JSONSchema
  if?: JSONSchema
  then?: JSONSchema
  else?: JSONSchema
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  additionalProperties?: boolean | JSONSchema
  additionalItems?: boolean | JSONSchema
  patternProperties?: Record<string, JSONSchema>
  propertyNames?: JSONSchema
  minProperties?: number
  maxProperties?: number
  title?: string
  examples?: Array<unknown>
  [key: string]: any // Allow additional properties for extensibility
}

export type SchemaInput =
  | StandardJSONSchemaV1<any, any>
  | StandardSchemaV1<any, any>
  | JSONSchema

export type InferSchemaType<T> =
  T extends StandardJSONSchemaV1<infer TInput, unknown>
    ? TInput
    : T extends StandardSchemaV1<infer TInput, unknown>
      ? TInput
      : unknown

export interface ToolCall<TMetadata = unknown> {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
  metadata?: TMetadata
}

export interface ProviderExecutedToolMetadata {
  providerExecuted?: boolean
  [key: string]: unknown
}

export type Modality = 'text' | 'image' | 'audio' | 'video' | 'document'

export interface ContentPartDataSource {
  type: 'data'
  value: string
  mimeType: string
}

export interface ContentPartUrlSource {
  type: 'url'
  value: string
  mimeType?: string
}

export type ContentPartSource = ContentPartDataSource | ContentPartUrlSource

export interface ImagePart<TMetadata = unknown> {
  type: 'image'
  /** Source of the image content */
  source: ContentPartSource
  /** Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high') */
  metadata?: TMetadata
}

export interface AudioPart<TMetadata = unknown> {
  type: 'audio'
  /** Source of the audio content */
  source: ContentPartSource
  /** Provider-specific metadata (e.g., format, sample rate) */
  metadata?: TMetadata
}

export interface VideoPart<TMetadata = unknown> {
  type: 'video'
  /** Source of the video content */
  source: ContentPartSource
  /** Provider-specific metadata (e.g., duration, resolution) */
  metadata?: TMetadata
}

export interface DocumentPart<TMetadata = unknown> {
  type: 'document'
  /** Source of the document content */
  source: ContentPartSource
  /** Provider-specific metadata (e.g., media_type for PDFs) */
  metadata?: TMetadata
}

export type ContentPart<
  TTextMeta = unknown,
  TImageMeta = unknown,
  TAudioMeta = unknown,
  TVideoMeta = unknown,
  TDocumentMeta = unknown,
> =
  | TextPart<TTextMeta>
  | ImagePart<TImageMeta>
  | AudioPart<TAudioMeta>
  | VideoPart<TVideoMeta>
  | DocumentPart<TDocumentMeta>

export type ContentPartForInputModalitiesTypes<
  TInputModalitiesTypes extends InputModalitiesTypes,
> = Extract<
  ContentPart<
    TInputModalitiesTypes['messageMetadataByModality']['text'],
    TInputModalitiesTypes['messageMetadataByModality']['image'],
    TInputModalitiesTypes['messageMetadataByModality']['audio'],
    TInputModalitiesTypes['messageMetadataByModality']['video'],
    TInputModalitiesTypes['messageMetadataByModality']['document']
  >,
  { type: TInputModalitiesTypes['inputModalities'][number] }
>

export type ModalitiesArrayToUnion<T extends ReadonlyArray<Modality>> =
  T[number]

export type ConstrainedContent<
  TInputModalitiesTypes extends InputModalitiesTypes,
> =
  | string
  | null
  | Array<ContentPartForInputModalitiesTypes<TInputModalitiesTypes>>

export interface ModelMessage<
  TContent extends string | null | Array<ContentPart> =
    | string
    | null
    | Array<ContentPart>,
> {
  role: 'user' | 'assistant' | 'tool'
  content: TContent
  name?: string
  toolCalls?: Array<ToolCall>
  toolCallId?: string
  thinking?: Array<{ content: string; signature?: string }>
  /** Error reported by an AG-UI tool message. */
  error?: string
  /** Optional AG-UI message metadata. TanStack-owned fields live under `tanstack`. */
  metadata?: Record<string, any>
  structuredOutput?: StructuredOutputPart
  id?: string
  createdAt?: Date
}

export interface TextPart<TMetadata = unknown> {
  type: 'text'
  content: string
  metadata?: TMetadata
}

export interface ToolCallPart<TMetadata = unknown> {
  type: 'tool-call'
  id: string
  name: string
  arguments: string // JSON string (may be incomplete)
  input?: unknown
  state: ToolCallState
  /** Approval metadata if tool requires user approval */
  approval?: {
    id: string
    needsApproval: boolean
    approved?: boolean
  }
  /** Tool execution output (for client tools or after approval) */
  output?: any
  metadata?: TMetadata
}

export interface ToolResultPart {
  type: 'tool-result'
  id?: string
  name?: string
  toolCallId: string
  content: string | Array<ContentPart>
  state: ToolResultState
  error?: string // Error message if state is "error"
  metadata?: Record<string, unknown>
  createdAt?: Date
}

export interface ThinkingPart {
  type: 'thinking'
  content: string
  stepId?: string
  signature?: string
}

export type DeepPartial<T> =
  T extends ReadonlyArray<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

export interface StructuredOutputPart<TData = unknown> {
  type: 'structured-output'
  status: 'streaming' | 'complete' | 'error'
  /** Progressive parse of `raw` via parsePartialJSON — populated while streaming and after complete. */
  partial?: DeepPartial<TData>
  /** Validated final object — only set when `status === 'complete'`. */
  data?: TData
  /** Accumulating JSON buffer. Source of truth for wire round-trip. */
  raw: string
  /** Optional chain-of-thought surfaced by reasoning models alongside the structured output. */
  reasoning?: string
  /** Populated when `status === 'error'`. */
  errorMessage?: string
}

export interface UIResourcePart {
  type: 'ui-resource'
  /** The ui:// resource object in MCP-native shape — fed straight to the renderer. */
  resource: { uri: string; mimeType: string; text?: string; blob?: string }
  /** Pool prefix / config key — routes interactive calls to the right MCP server. */
  serverId?: string
  /** Links the widget to the originating tool call — correlates it with the
   *  sibling ToolCallPart/ToolResultPart in the same message. */
  toolCallId: string
  /** Server-native (unprefixed) MCP tool name whose UI this resource renders.
   *  Required by the renderer (`@mcp-ui/client`'s `AppRenderer` `toolName` prop). */
  toolName: string
  /** Reserved for future passthrough of the resource/tool `_meta.ui` (e.g. frame-size hints).
   *  Currently always `undefined` — nothing populates this field yet. */
  meta?: Record<string, unknown>
}

export type MessagePart<TData = unknown> =
  | TextPart
  | ImagePart
  | AudioPart
  | VideoPart
  | DocumentPart
  | ToolCallPart
  | ToolResultPart
  | ThinkingPart
  | StructuredOutputPart<TData>
  | UIResourcePart

export interface TanStackMessageMetadata {
  createdAt?: string
  model?: string
  /** Thinking signature for a `role: 'reasoning'` fan-out message. */
  signature?: string
  /** Per-tool-call provider metadata keyed by tool call id (e.g. Gemini thoughtSignature). */
  toolCallMetadata?: Record<string, unknown>
  toolResult?: {
    id?: string
    createdAt?: string
    content?: Array<ContentPart>
  }
  structuredOutput?: {
    status?: 'streaming' | 'complete' | 'error'
    partial?: unknown
    data?: unknown
    raw?: string
    reasoning?: string
    errorMessage?: string
  }
  uiResources?: Array<UIResourcePart>
}

export interface TanStackRunMetadata {
  model?: string
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  /** TokenUsage fields that have no AG-UI `usage[]` equivalent. */
  usage?: TokenUsageLeftover
  interruptErrors?: ReadonlyArray<InterruptSubmissionError>
  threadId?: string
  runId?: string
  sessionId?: string
  index?: number
  state?: ToolOutputState
  /** Parsed `TOOL_CALL_END` input. Spec `TOOL_CALL_END` has no top-level `input`. */
  input?: unknown
}

export interface UIMessage<TData = unknown> {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: Array<MessagePart<TData>>
  createdAt?: Date
  /** Optional AG-UI sender name. Converters preserve it across wire and persist. */
  name?: string
  metadata?: Record<string, any>
}

export type InputModalitiesTypes = {
  inputModalities: ReadonlyArray<Modality>
  messageMetadataByModality: DefaultMessageMetadataByModality
}

export type ConstrainedModelMessage<
  TInputModalitiesTypes extends InputModalitiesTypes,
> = Omit<ModelMessage, 'content'> & {
  content: ConstrainedContent<TInputModalitiesTypes>
}

type IsUnknown<T> = unknown extends T
  ? [T] extends [unknown]
    ? true
    : false
  : false

type RuntimeContextField<TContext> =
  IsUnknown<TContext> extends true
    ? {
        context?: TContext
      }
    : {
        context: TContext
      }

export type ToolExecutionContext<TContext = unknown> =
  RuntimeContextField<TContext> & {
    /** The ID of the tool call being executed */
    toolCallId?: string
    abortSignal?: AbortSignal
    emitCustomEvent: (eventName: string, value: Record<string, any>) => void
  }

export type ToolExecuteFunction<
  TInput extends SchemaInput | undefined = SchemaInput,
  TOutput extends SchemaInput | undefined = SchemaInput,
  TContext = unknown,
> = undefined extends TContext
  ? (
      args: InferSchemaType<TInput>,
      context?: ToolExecutionContext<TContext>,
    ) => Promise<InferSchemaType<TOutput>> | InferSchemaType<TOutput>
  : (
      args: InferSchemaType<TInput>,
      context: ToolExecutionContext<TContext>,
    ) => Promise<InferSchemaType<TOutput>> | InferSchemaType<TOutput>

export interface Tool<
  TInput extends SchemaInput | undefined = SchemaInput,
  TOutput extends SchemaInput | undefined = SchemaInput,
  TName extends string = string,
  TContext = unknown,
> {
  name: TName

  description: string

  inputSchema?: TInput

  outputSchema?: TOutput

  execute?: ToolExecuteFunction<TInput, TOutput, TContext> | undefined

  /** If true, tool execution requires user approval before running. Works with both server and client tools. */
  needsApproval?: boolean

  /** If true, this tool is lazy and will only be sent to the LLM after being discovered via the lazy tool discovery mechanism. Works with both chat() (the synthetic discovery tool) and Code Mode (kept out of the system prompt and revealed via discover_tools). */
  lazy?: boolean

  /** Additional metadata for adapters or custom extensions */
  metadata?: Record<string, any> | undefined
}

export interface LazyToolsConfig {
  includeDescription?: 'full' | 'first-sentence' | 'none'
}

export type AnyTool = Omit<Tool<any, any, any, any>, 'execute'> & {
  execute?: ((args: any, context?: any) => any) | undefined
}

export interface ToolConfig {
  [key: string]: Tool
}

export interface ResponseFormat<TData = any> {
  type: 'json_object' | 'json_schema'

  json_schema?: {
    name: string

    description?: string

    schema: Record<string, any>

    strict?: boolean
  }

  __data?: TData
}

export interface AgentLoopState {
  /** Current iteration count (0-indexed). One iteration = one model turn. */
  iterationCount: number
  /** Current messages array */
  messages: Array<ModelMessage>
  /** Finish reason from the last response */
  finishReason: string | null
  toolCallCount: number
  lastTurnToolCallCount: number
}

export type AgentLoopStrategy = (state: AgentLoopState) => boolean

export interface TextOptions<
  TProviderOptionsSuperset extends Record<string, any> = Record<string, any>,
  TProviderOptionsForModel = TProviderOptionsSuperset,
  TContext = unknown,
> {
  model: string
  messages: Array<ModelMessage>
  tools?: Array<AnyTool> | undefined
  context?: TContext
  systemPrompts?: Array<SystemPrompt>
  agentLoopStrategy?: AgentLoopStrategy
  lazyToolsConfig?: LazyToolsConfig
  metadata?: Record<string, any> | undefined
  modelOptions?: TProviderOptionsForModel
  request?: Request | RequestInit

  outputSchema?: SchemaInput
  conversationId?: string
  abortController?: AbortController

  logger: InternalLogger

  threadId?: string
  runId?: string
  parentRunId?: string

  /** Application state mirrored in a STATE_SNAPSHOT before an interrupt terminal. */
  state?: unknown

  resume?: Array<RunAgentResumeItem>

  capabilities?: CapabilityContext

  approvals?: ReadonlyMap<string, boolean>
}

export { EventType } from '@ag-ui/core'

export type AGUIEventType = `${EventType}`

export type StreamChunkType = AGUIEventType

export interface BaseAGUIEvent extends AGUIBaseEvent {
  metadata?: Record<string, any>
}

export interface RunStartedEvent extends AGUIRunStartedEvent {}

// Re-export the canonical usage types (defined in `@tanstack/ai-event-client`)
// so `@tanstack/ai` consumers keep importing them from here unchanged.
export type {
  BilledUsage,
  BillingUnit,
  CompletionTokensDetails,
  PromptTokensDetails,
  ProviderUsageDetails,
  TokenUsage,
  UsageCostBreakdown,
}

export type UsageTotals = TokenUsage

export type Interrupt = AGUIInterrupt

export type RunFinishedOutcome = AGUIRunFinishedOutcome

export type RunAgentResumeItem = AGUIResumeEntry & {
  /** AG-UI resume metadata. First-party generic requests ride here. */
  metadata?: Record<string, unknown>
}

export interface RunFinishedEvent extends Pick<
  AGUIRunFinishedEvent,
  'threadId' | 'runId' | 'result' | 'outcome' | 'timestamp' | 'rawEvent'
> {
  type: EventType.RUN_FINISHED
  usage?: Array<SpecTokenUsage> | TokenUsage
  /** Restored on the client from `metadata.tanstack`. */
  model?: string
  /** Restored on the client from `metadata.tanstack`. */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  metadata?: { tanstack?: TanStackRunMetadata } & Record<string, any>
}

export interface RunErrorEvent extends Pick<
  AGUIRunErrorEvent,
  'message' | 'code' | 'timestamp' | 'rawEvent'
> {
  type: EventType.RUN_ERROR
  usage?: Array<SpecTokenUsage> | TokenUsage
  /** Restored on the client from `metadata.tanstack`. */
  threadId?: string
  /** Restored on the client from `metadata.tanstack`. */
  runId?: string
  /** Restored on the client from `metadata.tanstack`. */
  model?: string
  /** Nested payload kept for in-process / durability consumers. */
  error?: { message: string; code?: string }
  metadata?: { tanstack?: TanStackRunMetadata } & Record<string, any>
}

export interface TextMessageStartEvent extends AGUITextMessageStartEvent {}

export interface TextMessageContentEvent extends AGUITextMessageContentEvent {}

export interface TextMessageEndEvent extends AGUITextMessageEndEvent {}

export interface ToolCallStartEvent extends Pick<
  AGUIToolCallStartEvent,
  'toolCallId' | 'toolCallName' | 'parentMessageId' | 'timestamp' | 'rawEvent'
> {
  type: 'TOOL_CALL_START'
  /** Alias of `toolCallName`. Kept so existing stream readers still compile. */
  toolName?: string
  /** Provider-specific metadata to carry into the ToolCall. */
  metadata?: Record<string, any>
}

export interface ToolCallArgsEvent extends AGUIToolCallArgsEvent {}

export interface ToolCallEndEvent extends Pick<
  AGUIToolCallEndEvent,
  'toolCallId' | 'timestamp' | 'rawEvent'
> {
  type: 'TOOL_CALL_END'
  /** Parsed tool arguments when the adapter already parsed them. */
  input?: unknown
  metadata?: Record<string, any>
}

export interface ToolCallResultEvent extends AGUIToolCallResultEvent {}

export interface StepStartedEvent extends AGUIStepStartedEvent {}

export interface StepFinishedEvent extends AGUIStepFinishedEvent {}

export interface MessagesSnapshotEvent extends AGUIMessagesSnapshotEvent {}

export interface StateSnapshotEvent extends AGUIStateSnapshotEvent {}

export interface StateDeltaEvent extends AGUIStateDeltaEvent {}

export interface CustomEvent extends Pick<
  AGUICustomEvent,
  'name' | 'value' | 'timestamp' | 'rawEvent'
> {
  type: 'CUSTOM'
  metadata?: Record<string, any>
}

export interface StructuredOutputCompleteEvent<
  T = unknown,
> extends CustomEvent {
  name: 'structured-output.complete'
  value: { object: T; raw: string; reasoning?: string }
}

export interface StructuredOutputStartEvent extends CustomEvent {
  name: 'structured-output.start'
  value: { messageId: string }
}

export interface ApprovalRequestedEvent extends CustomEvent {
  name: 'approval-requested'
  value: {
    toolCallId: string
    toolName: string
    input: unknown
    approval: { id: string; needsApproval: true }
  }
}

export interface ToolInputAvailableEvent extends CustomEvent {
  name: 'tool-input-available'
  value: {
    toolCallId: string
    toolName: string
    input: unknown
  }
}

/** Emitted when an MCP tool returns a ui:// resource (MCP Apps). Reconciled into
 *  a UIResourcePart on the assistant UIMessage. Never enters model input. */
export interface UIResourceEvent extends CustomEvent {
  name: 'ui-resource'
  value: {
    resource: UIResourcePart['resource']
    serverId?: string
    toolCallId: string
    toolName: string
    meta?: Record<string, unknown>
  }
}

// ── Sandbox events ──────────────────────────────────────────────────────────
export interface SandboxFileCustomEvent extends CustomEvent {
  name: 'sandbox.file'
  value: {
    type: 'create' | 'change' | 'delete'
    path: string
    timestamp: number
  }
}
export interface SandboxFileDiffEvent extends CustomEvent {
  name: 'sandbox.file.diff'
  value: { path: string; diff: string }
}

// ── Harness events ──────────────────────────────────────────────────────────
export interface FileChangedEvent extends CustomEvent {
  name: 'file.changed'
  value: { path: string; diff: string }
}
export interface SessionIdEvent extends CustomEvent {
  name: `${string}.session-id`
  value: { sessionId: string }
}

// ── Code-mode events ────────────────────────────────────────────────────────
export interface CodeModeExecutionStartedEvent extends CustomEvent {
  name: 'code_mode:execution_started'
  value: { timestamp: number; codeLength: number }
}
export interface CodeModeConsoleEvent extends CustomEvent {
  name: 'code_mode:console'
  value: {
    level: 'log' | 'warn' | 'error' | 'info'
    message: string
    timestamp: number
  }
}
export interface CodeModeExternalCallEvent extends CustomEvent {
  name: 'code_mode:external_call'
  value: { function: string; args: unknown; timestamp: number }
}
export interface CodeModeExternalResultEvent extends CustomEvent {
  name: 'code_mode:external_result'
  value: { function: string; result: unknown; duration: number }
}
export interface CodeModeExternalErrorEvent extends CustomEvent {
  name: 'code_mode:external_error'
  value: { function: string; error: string; duration: number }
}
export interface CodeModeSnippetCallEvent extends CustomEvent {
  name: 'code_mode:snippet_call'
  value: { snippet: string; input: unknown; timestamp: number }
}
export interface CodeModeSnippetResultEvent extends CustomEvent {
  name: 'code_mode:snippet_result'
  value: {
    snippet: string
    result: unknown
    duration: number
    timestamp: number
  }
}
export interface CodeModeSnippetErrorEvent extends CustomEvent {
  name: 'code_mode:snippet_error'
  value: { snippet: string; error: string; duration: number; timestamp: number }
}
export interface SnippetRegisteredEvent extends CustomEvent {
  name: 'snippet:registered'
  value: { id: string; name: string; description: string; timestamp: number }
}

export type KnownCustomEvent =
  | SandboxFileCustomEvent
  | SandboxFileDiffEvent
  | FileChangedEvent
  | SessionIdEvent
  | CodeModeExecutionStartedEvent
  | CodeModeConsoleEvent
  | CodeModeExternalCallEvent
  | CodeModeExternalResultEvent
  | CodeModeExternalErrorEvent
  | CodeModeSnippetCallEvent
  | CodeModeSnippetResultEvent
  | CodeModeSnippetErrorEvent
  | SnippetRegisteredEvent
  | StructuredOutputStartEvent
  | StructuredOutputCompleteEvent
  | ApprovalRequestedEvent
  | ToolInputAvailableEvent
  | UIResourceEvent

export type ChatStream = AsyncIterable<
  Exclude<StreamChunk, CustomEvent> | KnownCustomEvent
>

export type StructuredOutputStream<T = unknown> = AsyncIterable<
  | Exclude<StreamChunk, CustomEvent>
  | StructuredOutputStartEvent
  | StructuredOutputCompleteEvent<T>
  | ApprovalRequestedEvent
  | ToolInputAvailableEvent
>

export interface ReasoningStartEvent extends AGUIReasoningStartEvent {}

export interface ReasoningMessageStartEvent extends AGUIReasoningMessageStartEvent {}

export interface ReasoningMessageContentEvent extends AGUIReasoningMessageContentEvent {}

export interface ReasoningMessageEndEvent extends AGUIReasoningMessageEndEvent {}

export interface ReasoningEndEvent extends AGUIReasoningEndEvent {}

export interface ReasoningEncryptedValueEvent extends AGUIReasoningEncryptedValueEvent {}

export type AGUIEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StepStartedEvent
  | StepFinishedEvent
  | MessagesSnapshotEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | CustomEvent
  | ReasoningStartEvent
  | ReasoningMessageStartEvent
  | ReasoningMessageContentEvent
  | ReasoningMessageEndEvent
  | ReasoningEndEvent
  | ReasoningEncryptedValueEvent

export type StreamChunk = AGUIEvent

export type TaggedCustomEvent<T = unknown> =
  | StructuredOutputStartEvent
  | StructuredOutputCompleteEvent<T>
  | ApprovalRequestedEvent
  | ToolInputAvailableEvent

// Simple streaming format for basic text completions
// Converted to StreamChunk format by convertTextCompletionStream()
export interface TextCompletionChunk {
  id: string
  model: string
  content: string
  role?: 'assistant'
  finishReason?: 'stop' | 'length' | 'content_filter' | null
  usage?: TokenUsage
}

export interface SummarizationOptions<
  TProviderOptions extends object = Record<string, unknown>,
> {
  model: string
  text: string
  maxLength?: number
  style?: 'bullet-points' | 'paragraph' | 'concise'
  focus?: Array<string>
  /** Provider-specific options forwarded by the summarize() activity. */
  modelOptions?: TProviderOptions
  runId?: string
  threadId?: string
  logger: InternalLogger
  abortSignal?: AbortSignal
}

export interface SummarizationResult {
  id: string
  model: string
  summary: string
  usage: TokenUsage
}

export interface RerankOptions<
  TProviderOptions extends object = Record<string, unknown>,
> {
  model: string
  /** The search query documents are scored against. */
  query: string
  /** Documents to rerank, pre-serialized to strings by the activity. */
  documents: Array<string>
  /** Return only the top N results. Passed through to the provider. */
  topN?: number
  /** Provider-specific options forwarded by the rerank() activity. */
  modelOptions?: TProviderOptions
  /** Forwarded to the provider request for cancellation. */
  abortSignal?: AbortSignal
  logger: InternalLogger
}

export interface RerankAdapterResult {
  id: string
  /** Scored results, highest relevance first, as indices into `documents`. */
  ranking: Array<{ index: number; score: number }>
  usage: TokenUsage
}

export interface RerankResult<TDocument = string> {
  id: string
  model: string
  /** Scored results, highest relevance first. */
  ranking: Array<{ index: number; score: number; document: TDocument }>
  /** The documents reordered by relevance — `ranking.map(r => r.document)`. */
  rerankedDocuments: Array<TDocument>
  usage: TokenUsage
}

export type MediaInputRole =
  | 'reference'
  | 'mask'
  | 'control'
  | 'start_frame'
  | 'end_frame'
  | 'character'

export interface MediaInputMetadata {
  /** Optional role hint disambiguating the part's intent for the adapter */
  role?: MediaInputRole
  tag?: string
}

export type MediaPromptPart =
  | TextPart
  | ImagePart<MediaInputMetadata>
  | VideoPart<MediaInputMetadata>
  | AudioPart<MediaInputMetadata>

export type MediaPrompt = string | Array<MediaPromptPart>

export type MediaPromptModality = 'image' | 'video' | 'audio'

/** Maps a prompt modality to its content-part type. @internal */
interface MediaPartByModality {
  image: ImagePart<MediaInputMetadata>
  video: VideoPart<MediaInputMetadata>
  audio: AudioPart<MediaInputMetadata>
}

export type MediaPromptFor<TModalities extends MediaPromptModality = never> =
  | string
  | Array<TextPart | MediaPartByModality[TModalities]>

export type ModelInputModalitiesByName = Record<
  string,
  ReadonlyArray<MediaPromptModality>
>

export interface ImageGenerationOptions<
  TProviderOptions extends object = object,
  TSize extends string | undefined = string,
> {
  /** The model to use for image generation */
  model: string
  prompt: MediaPrompt
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: TSize
  /** Model-specific options for image generation */
  modelOptions?: TProviderOptions
  logger: InternalLogger
  abortSignal?: AbortSignal
}

export type GeneratedMediaSource =
  | {
      /** URL to the generated asset (may be temporary) */
      url: string
      b64Json?: never
    }
  | {
      /** Base64-encoded asset data */
      b64Json: string
      url?: never
    }

export type PersistedArtifactRole = 'input' | 'output'

export type PersistedArtifactActivity =
  | 'image'
  | 'audio'
  | 'tts'
  | 'video'
  | 'transcription'

export interface PersistedArtifactRef {
  role: PersistedArtifactRole
  artifactId: string
  threadId: string
  runId: string
  name: string
  mimeType: string
  size: number
  createdAt: string
  sourceUrl?: string
  url?: string
  source: {
    activity: PersistedArtifactActivity
    path: string
    provider: string
    model: string
    mediaType?: 'image' | 'audio' | 'video' | 'document' | 'json'
    jobId?: string
    expiresAt?: string
  }
}

export type GeneratedImage = GeneratedMediaSource & {
  /** Revised prompt used by the model (if applicable) */
  revisedPrompt?: string
}

export interface ImageGenerationResult {
  /** Unique identifier for the generation */
  id: string
  /** Model used for generation */
  model: string
  /** Array of generated images */
  images: Array<GeneratedImage>
  /** Token usage information (if available) */
  usage?: TokenUsage
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
}

export interface AudioGenerationOptions<
  TProviderOptions extends object = object,
> {
  /** The model to use for audio generation */
  model: string
  /** Text description of the desired audio */
  prompt: string
  /** Desired duration in seconds */
  duration?: number
  /** Model-specific options for audio generation */
  modelOptions?: TProviderOptions
  logger: InternalLogger
  abortSignal?: AbortSignal
}

export type GeneratedAudio = GeneratedMediaSource & {
  /** Content type of the audio (e.g., 'audio/wav', 'audio/mp3') */
  contentType?: string
  /** Duration of the generated audio in seconds */
  duration?: number
}

export interface AudioGenerationResult {
  /** Unique identifier for the generation */
  id: string
  /** Model used for generation */
  model: string
  /** The generated audio */
  audio: GeneratedAudio
  /** Token usage information (if available) */
  usage?: TokenUsage
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
}

export interface VideoGenerationOptions<
  TProviderOptions extends object = object,
  TSize extends string | undefined = string,
  TDuration extends string | number | undefined = number,
> {
  /** The model to use for video generation */
  model: string
  prompt: MediaPrompt
  /** Video size — format depends on the provider (e.g., "16:9", "1280x720") */
  size?: TSize
  duration?: TDuration
  /** Model-specific options for video generation */
  modelOptions?: TProviderOptions
  logger: InternalLogger
  abortSignal?: AbortSignal
}

export interface VideoJobResult {
  /** Unique job identifier for polling status */
  jobId: string
  /** Model used for generation */
  model: string
  artifacts?: Array<PersistedArtifactRef>
}

export interface VideoStatusResult {
  /** Job identifier */
  jobId: string
  /** Current status of the job */
  status: 'pending' | 'processing' | 'completed' | 'failed'
  /** Progress percentage (0-100), if available */
  progress?: number
  /** Error message if status is 'failed' */
  error?: string
}

export interface VideoUrlResult {
  /** Job identifier */
  jobId: string
  /** URL to the generated video */
  url: string
  /** When the URL expires, if applicable */
  expiresAt?: Date
  usage?: TokenUsage
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
}

export interface TTSOptions<TProviderOptions extends object = object> {
  /** The model to use for TTS generation */
  model: string
  /** The text to convert to speech */
  text: string
  /** The voice to use for generation */
  voice?: string
  /** The output audio format */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  /** The speed of the generated audio (0.25 to 4.0) */
  speed?: number
  /** Model-specific options for TTS generation */
  modelOptions?: TProviderOptions
  logger: InternalLogger
  abortSignal?: AbortSignal
}

export interface TTSResult {
  /** Unique identifier for the generation */
  id: string
  /** Model used for generation */
  model: string
  /** Base64-encoded audio data */
  audio: string
  /** Audio format of the generated audio */
  format: string
  /** Duration of the audio in seconds, if available */
  duration?: number
  /** Content type of the audio (e.g., 'audio/mp3') */
  contentType?: string
  /** Token usage information (if provided by the adapter) */
  usage?: TokenUsage
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
}

export type TranscriptionResponseFormat =
  | 'json'
  | 'text'
  | 'srt'
  | 'verbose_json'
  | 'vtt'

export interface TranscriptionOptions<
  TProviderOptions extends object = object,
> {
  /** The model to use for transcription */
  model: string
  /** The audio data to transcribe - can be base64 string, File, Blob, or Buffer */
  audio: string | File | Blob | ArrayBuffer
  /** The language of the audio in ISO-639-1 format (e.g., 'en') */
  language?: string
  /** An optional prompt to guide the transcription */
  prompt?: string
  /** The format of the transcription output */
  responseFormat?: TranscriptionResponseFormat
  /** Model-specific options for transcription */
  modelOptions?: TProviderOptions
  logger: InternalLogger
  abortSignal?: AbortSignal
}

export interface TranscriptionSegment {
  /** Unique identifier for the segment */
  id: number
  /** Start time of the segment in seconds */
  start: number
  /** End time of the segment in seconds */
  end: number
  /** Transcribed text for this segment */
  text: string
  /** Confidence score (0-1), if available */
  confidence?: number
  /** Speaker identifier, if diarization is enabled */
  speaker?: string
}

export interface TranscriptionWord {
  /** The transcribed word */
  word: string
  /** Start time in seconds */
  start: number
  /** End time in seconds */
  end: number
}

export interface TranscriptionResult {
  /** Unique identifier for the transcription */
  id: string
  /** Model used for transcription */
  model: string
  /** The full transcribed text */
  text: string
  /** Language detected or specified */
  language?: string
  /** Duration of the audio in seconds */
  duration?: number
  /** Detailed segments with timing, if available */
  segments?: Array<TranscriptionSegment>
  /** Word-level timestamps, if available */
  words?: Array<TranscriptionWord>
  /** Token usage information (if provided by the adapter) */
  usage?: TokenUsage
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
}

export type EmbeddingModality = 'text' | 'image'

export type EmbeddingModelInputModalitiesByName = Record<
  string,
  ReadonlyArray<EmbeddingModality>
>

export type EmbeddingContentParts = Array<TextPart | ImagePart>

export type EmbeddingInputItem =
  | string
  | TextPart
  | ImagePart
  | EmbeddingContentParts

/** Maps an embedding modality to the item types it admits. @internal */
interface EmbeddingItemByModality {
  text: TextPart
  image: ImagePart | EmbeddingContentParts
}

export type EmbeddingInputItemFor<
  TModalities extends EmbeddingModality = EmbeddingModality,
> = string | TextPart | EmbeddingItemByModality[TModalities]

export interface EmbeddingOptions<TProviderOptions extends object = object> {
  /** The model to use for embedding generation */
  model: string
  /** The items to embed — one vector per item */
  input: Array<EmbeddingInputItem>
  dimensions?: number
  /** Model-specific options for embedding generation */
  modelOptions?: TProviderOptions
  logger: InternalLogger
}

export interface Embedding {
  /** The embedding vector */
  vector: Array<number>
  /** Position of the source item in the (normalized) input array */
  index: number
}

export interface EmbeddingResult {
  /** Unique identifier for the generation */
  id: string
  /** Model used for generation */
  model: string
  /** One embedding per input item, in input order */
  embeddings: Array<Embedding>
  /** Token usage information (if provided by the adapter) */
  usage?: TokenUsage
}

export interface DefaultMessageMetadataByModality {
  text: unknown
  image: unknown
  audio: unknown
  video: unknown
  document: unknown
}
