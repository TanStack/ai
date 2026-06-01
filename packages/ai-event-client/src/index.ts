import { EventClient } from '@tanstack/devtools-event-client'
import type {
  AIDevtoolsEventSource,
  AIDevtoolsEventVisibility,
} from './envelope.js'

export type {
  AIDevtoolsEventEnvelope,
  AIDevtoolsEventEnvelopeInput,
  AIDevtoolsEventSource,
  AIDevtoolsEventVisibility,
} from './envelope.js'
export {
  createAIDevtoolsEventEnvelope,
  getAIDevtoolsDedupeKey,
  getAIDevtoolsRuntimeId,
} from './envelope.js'

// ===========================
// Types (locally defined to avoid circular dependency with @tanstack/ai)
// These mirror the corresponding types in @tanstack/ai
// ===========================

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

export interface TextPart {
  type: 'text'
  content: string
  metadata?: unknown
}

export interface ImagePart {
  type: 'image'
  source: ContentPartSource
  metadata?: unknown
}

export interface AudioPart {
  type: 'audio'
  source: ContentPartSource
  metadata?: unknown
}

export interface VideoPart {
  type: 'video'
  source: ContentPartSource
  metadata?: unknown
}

export interface DocumentPart {
  type: 'document'
  source: ContentPartSource
  metadata?: unknown
}

export interface ToolCallPart<TMetadata = unknown> {
  type: 'tool-call'
  id: string
  name: string
  arguments: string
  state: ToolCallState
  approval?: {
    id: string
    needsApproval: boolean
    approved?: boolean
  }
  output?: any
  /** Provider-specific metadata that round-trips with the tool call.
   * Mirrors `ToolCallPart.metadata` in `@tanstack/ai`. */
  metadata?: TMetadata
}

export interface ToolResultPart {
  type: 'tool-result'
  toolCallId: string
  content: string
  state: ToolResultState
  error?: string
}

export interface ThinkingPart {
  type: 'thinking'
  content: string
}

export interface StructuredOutputPart {
  type: 'structured-output'
  status: 'streaming' | 'complete' | 'error'
  partial?: unknown
  data?: unknown
  raw: string
  reasoning?: string
  errorMessage?: string
}

export type MessagePart =
  | TextPart
  | ImagePart
  | AudioPart
  | VideoPart
  | DocumentPart
  | ToolCallPart
  | ToolResultPart
  | ThinkingPart
  | StructuredOutputPart

export interface ToolCall<TMetadata = unknown> {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
  /** Provider-specific metadata to carry through the tool call lifecycle.
   * Typed per-adapter via `TToolCallMetadata` (e.g. Gemini's
   * `{ thoughtSignature?: string }`). */
  metadata?: TMetadata
}

/**
 * Detailed breakdown of prompt/input token usage.
 * Fields are populated based on provider support.
 */
export interface PromptTokensDetails {
  /** Tokens read from cache */
  cachedTokens?: number
  /** Tokens written to cache */
  cacheWriteTokens?: number
  /** Audio input tokens */
  audioTokens?: number
  /** Video input tokens */
  videoTokens?: number
  /** Image input tokens */
  imageTokens?: number
  /** Text input tokens */
  textTokens?: number
  /** Document input tokens (e.g. PDF inputs on Gemini) */
  documentTokens?: number
}

/**
 * Detailed breakdown of completion/output token usage.
 * Fields are populated based on provider support.
 */
export interface CompletionTokensDetails {
  /** Reasoning/thinking tokens */
  reasoningTokens?: number
  /** Audio output tokens */
  audioTokens?: number
  /** Video output tokens */
  videoTokens?: number
  /** Image output tokens */
  imageTokens?: number
  /** Text output tokens */
  textTokens?: number
  /** Document output tokens */
  documentTokens?: number
}

/**
 * Provider-reported cost breakdown for a single request, normalized onto a
 * canonical shape so consumer code is portable across gateways. Each adapter's
 * extractor maps its provider-specific wire keys (e.g. OpenRouter's
 * `upstream_inference_prompt_cost`, `upstream_inference_input_cost`) onto these
 * fields at runtime.
 */
export interface UsageCostBreakdown {
  /** Total cost the gateway paid the upstream provider. */
  upstreamCost?: number
  /** Upstream cost for input (prompt) tokens. */
  upstreamInputCost?: number
  /** Upstream cost for output (completion) tokens. */
  upstreamOutputCost?: number
}

/**
 * Canonical token usage for a run, with optional detailed breakdowns and
 * provider-reported cost. This is the single source of truth re-exported by
 * `@tanstack/ai`.
 *
 * Core fields (`promptTokens`, `completionTokens`, `totalTokens`) are always
 * present. Detail fields are provider-dependent and absent when not reported,
 * so consumers must treat them as optional.
 *
 * `providerUsageDetails` is parameterized via `TProviderDetails` so adapters can
 * surface a strongly-typed bag (e.g. `TokenUsage<AnthropicProviderUsageDetails>`);
 * it defaults to an open record for generic consumers.
 */
export interface TokenUsage<TProviderDetails = Record<string, unknown>> {
  /** Total input/prompt tokens */
  promptTokens: number
  /** Total output/completion tokens */
  completionTokens: number
  /** Total tokens as reported by the provider; may exceed promptTokens +
   * completionTokens when reasoning/cache/tool tokens are billed separately. */
  totalTokens: number
  /** Detailed breakdown of prompt tokens by category */
  promptTokensDetails?: PromptTokensDetails
  /** Detailed breakdown of completion tokens by category */
  completionTokensDetails?: CompletionTokensDetails
  /** Duration in seconds for duration-based billing (e.g., Whisper transcription) */
  durationSeconds?: number
  /** Provider-specific usage details not covered by standard fields */
  providerUsageDetails?: TProviderDetails
  /** Provider-reported cost for the request, when available. */
  cost?: number
  /** Provider-reported cost breakdown, when available. */
  costDetails?: UsageCostBreakdown
}

/**
 * Tool call states - track the lifecycle of a tool call
 * Must match @tanstack/ai-client ToolCallState
 */
export type ToolCallState =
  | 'awaiting-input' // Received start but no arguments yet
  | 'input-streaming' // Partial arguments received
  | 'input-complete' // All arguments received
  | 'approval-requested' // Waiting for user approval
  | 'approval-responded' // User has approved/denied
  | 'complete' // Result is complete

/**
 * Tool result states - track the lifecycle of a tool result
 * Must match @tanstack/ai-client ToolResultState
 */
export type ToolResultState =
  | 'streaming' // Placeholder for future streamed output
  | 'complete' // Result is complete
  | 'error' // Error occurred

/**
 * @deprecated Image and audio usage now use the canonical {@link TokenUsage}
 * shape. Kept as an alias for backward compatibility; will be removed in a
 * future release.
 */
export type ImageUsage = TokenUsage

// All optional fields explicitly allow `| undefined` so that callers
// can spread shared-context builders (which set every field to a
// possibly-undefined value) without `exactOptionalPropertyTypes`
// rejecting the assignment.
interface BaseEventContext {
  timestamp: number
  eventId?: string
  requestId?: string
  streamId?: string
  hookId?: string
  threadId?: string
  runId?: string
  messageId?: string
  toolCallId?: string
  clientId?: string
  runtimeId?: string
  source?: AIDevtoolsEventSource
  visibility?: AIDevtoolsEventVisibility
  sequence?: number
  correlationId?: string
  relatedEventId?: string
  provider?: string
  model?: string
  systemPrompts?: Array<string>
  options?: Record<string, unknown> | undefined
  modelOptions?: Record<string, unknown> | undefined
  toolNames?: Array<string>
  messageCount?: number
  hasTools?: boolean
  streaming?: boolean
}

// ===========================
// Text Events
// ===========================

/** Emitted when a text request starts execution. */
export interface TextRequestStartedEvent extends BaseEventContext {
  requestId: string
  streamId: string
  provider: string
  model: string
  messageCount: number
  hasTools: boolean
  streaming: boolean
}

/** Emitted when a text request completes with final output. */
export interface TextRequestCompletedEvent extends BaseEventContext {
  requestId: string
  streamId: string
  provider: string
  model: string
  content: string
  finishReason?: string
  usage?: TokenUsage
  duration?: number
  streaming: boolean
  messageCount: number
  hasTools: boolean
}

/** Emitted when a message is created (user/assistant/system/tool). */
export interface TextMessageCreatedEvent extends BaseEventContext {
  requestId?: string
  streamId?: string
  messageId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  parts?: Array<MessagePart>
  toolCalls?: Array<ToolCall>
  messageIndex?: number
}

/** Emitted when a user message is created (full content). */
export interface TextMessageUserEvent extends TextMessageCreatedEvent {
  role: 'user'
}

/** Emitted for streaming text content chunks. */
export interface TextChunkContentEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId?: string
  content: string
  delta?: string
}

/** Emitted for streaming tool call chunks. */
export interface TextChunkToolCallEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId?: string
  toolCallId: string
  toolName: string
  index: number
  arguments: string
}

/** Emitted for streaming tool result chunks. */
export interface TextChunkToolResultEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId?: string
  toolCallId: string
  result: string
}

/** Emitted for streaming thinking chunks. */
export interface TextChunkThinkingEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId?: string
  content: string
  delta?: string
}

/** Emitted when a stream finishes. */
export interface TextChunkDoneEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId?: string
  finishReason: string | null
  usage?: TokenUsage
}

/** Emitted on stream errors. */
export interface TextChunkErrorEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId?: string
  error: string
}

/** Emitted when usage metrics are available for text. */
export interface TextUsageEvent extends BaseEventContext {
  requestId: string
  streamId: string
  messageId?: string
  model: string
  usage: TokenUsage
}

// ===========================
// Structured Output Events
// ===========================

export interface StructuredOutputStartedEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId: string
  status: 'streaming'
  raw?: string
}

export interface StructuredOutputUpdatedEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId: string
  status: 'streaming'
  raw: string
  partial?: unknown
  delta?: string
}

export interface StructuredOutputCompletedEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId: string
  status: 'complete'
  raw: string
  partial?: unknown
  data: unknown
  reasoning?: string
}

export interface StructuredOutputErroredEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId: string
  status: 'error'
  raw: string
  partial?: unknown
  errorMessage: string
}

// ===========================
// Iteration Events
// ===========================

/** Emitted when a new agent loop iteration begins, with a config snapshot. */
export interface TextIterationStartedEvent extends BaseEventContext {
  requestId: string
  streamId: string
  iteration: number
  messageId: string
  provider: string
  model: string
}

/** Emitted when an agent loop iteration completes. */
export interface TextIterationCompletedEvent extends BaseEventContext {
  requestId: string
  streamId: string
  iteration: number
  messageId?: string
  duration: number
  finishReason?: string
  usage?: TokenUsage
}

// ===========================
// Middleware Events
// ===========================

/** Emitted when a middleware hook completes execution. */
export interface MiddlewareHookExecutedEvent extends BaseEventContext {
  requestId: string
  streamId: string
  middlewareName: string
  hookName: string
  iteration: number
  duration: number
  hasTransform: boolean
}

/** Emitted when onConfig returns a non-void transform. */
export interface MiddlewareConfigTransformedEvent extends BaseEventContext {
  requestId: string
  streamId: string
  middlewareName: string
  iteration: number
  changes: Record<string, unknown>
}

/** Emitted when onChunk transforms, drops, or expands a chunk. */
export interface MiddlewareChunkTransformedEvent extends BaseEventContext {
  requestId: string
  streamId: string
  middlewareName: string
  originalChunkType: string
  resultCount: number
  wasDropped: boolean
}

// ===========================
// Tool Events
// ===========================

/** Emitted when tool approval is required. */
export interface ToolsApprovalRequestedEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId?: string
  toolCallId: string
  toolName: string
  input: unknown
  approvalId: string
}

/** Emitted when user responds to an approval request. */
export interface ToolsApprovalRespondedEvent extends BaseEventContext {
  toolCallId: string
  approvalId: string
  approved: boolean
}

/** Emitted when tool input is available for client execution. */
export interface ToolsInputAvailableEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId?: string
  toolCallId: string
  toolName: string
  input: unknown
}

/** Emitted when a tool call completes with a result. */
export interface ToolsCallCompletedEvent extends BaseEventContext {
  requestId?: string
  streamId: string
  messageId?: string
  toolCallId: string
  toolName: string
  result: unknown
  duration: number
}

/** Emitted when a client tool result is added. */
export interface ToolsResultAddedEvent extends BaseEventContext {
  toolCallId: string
  toolName: string
  output: unknown
  state: 'output-available' | 'output-error'
}

/** Emitted when tool call state changes on the client. */
export interface ToolsCallUpdatedEvent extends BaseEventContext {
  streamId: string
  messageId: string
  toolCallId: string
  toolName: string
  state: ToolCallState
  arguments: string
}

// ===========================
// Summarize Events
// ===========================

/** Emitted when summarize starts. */
export interface SummarizeRequestStartedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  inputLength: number
}

/** Emitted when summarize completes. */
export interface SummarizeRequestCompletedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  inputLength: number
  outputLength: number
  duration: number
}

/** Emitted when summarize usage metrics are available. */
export interface SummarizeUsageEvent extends BaseEventContext {
  requestId: string
  model: string
  usage: TokenUsage
}

// ===========================
// Image Events
// ===========================

/** Emitted when an image request starts. */
export interface ImageRequestStartedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  prompt: string
  numberOfImages?: number
  size?: string
}

/** Emitted when an image request completes. */
export interface ImageRequestCompletedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  images: Array<{ url?: string; b64Json?: string }>
  duration: number
}

/** Emitted when image usage metrics are available. */
export interface ImageUsageEvent extends BaseEventContext {
  requestId: string
  model: string
  usage: TokenUsage
}

// ===========================
// Speech Events
// ===========================

/** Emitted when a speech request starts. */
export interface SpeechRequestStartedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  text: string
  voice?: string
  format?: string
  speed?: number
}

/** Emitted when a speech request completes. */
export interface SpeechRequestCompletedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  audio: string
  format: string
  duration: number
  audioDuration?: number
  contentType?: string
}

/** Emitted when speech usage metrics are available. */
export interface SpeechUsageEvent extends BaseEventContext {
  requestId: string
  model: string
  usage: TokenUsage
}

// ===========================
// Transcription Events
// ===========================

/** Emitted when a transcription request starts. */
export interface TranscriptionRequestStartedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  language?: string
  prompt?: string
  responseFormat?: string
}

/** Emitted when a transcription request completes. */
export interface TranscriptionRequestCompletedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  text: string
  language?: string
  duration: number
}

/** Emitted when transcription usage metrics are available. */
export interface TranscriptionUsageEvent extends BaseEventContext {
  requestId: string
  model: string
  usage: TokenUsage
}

// ===========================
// Audio Events
// ===========================

/** Emitted when an audio generation request starts. */
export interface AudioRequestStartedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  prompt: string
  duration?: number
}

/**
 * Audio asset carried on completion events. Exactly one of `url` or `b64Json`
 * is present; this mirrors the `GeneratedAudio` contract from `@tanstack/ai`
 * and prevents consumers from reading both fields as present simultaneously.
 */
export type AudioRequestCompletedAudio =
  | {
      url: string
      b64Json?: never
      contentType?: string
      duration?: number
    }
  | {
      url?: never
      b64Json: string
      contentType?: string
      duration?: number
    }

/** Emitted when an audio generation request completes. */
export interface AudioRequestCompletedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  audio: AudioRequestCompletedAudio
  duration: number
}

/** Emitted when an audio generation request fails. */
export interface AudioRequestErrorEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  error: { message: string; name?: string }
  duration: number
}

/** Emitted when a speech generation request fails. */
export interface SpeechRequestErrorEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  error: { message: string; name?: string }
  duration: number
}

/** Emitted when a transcription request fails. */
export interface TranscriptionRequestErrorEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  error: { message: string; name?: string }
  duration: number
}

/** Emitted when audio usage metrics are available. */
export interface AudioUsageEvent extends BaseEventContext {
  requestId: string
  model: string
  usage: TokenUsage
}

// ===========================
// Video Events
// ===========================

/** Emitted when a video request starts. */
export interface VideoRequestStartedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  requestType: 'create' | 'status' | 'url'
  jobId?: string
  prompt?: string
  size?: string
  duration?: number
}

/** Emitted when a video request completes. */
export interface VideoRequestCompletedEvent extends BaseEventContext {
  requestId: string
  provider: string
  model: string
  requestType: 'create' | 'status' | 'url'
  jobId?: string
  status?: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  url?: string
  error?: string
  duration: number
}

/** Emitted when video usage metrics are available. */
export interface VideoUsageEvent extends BaseEventContext {
  requestId: string
  model: string
  usage: TokenUsage
}

// ===========================
// Client Events
// ===========================

/** Emitted when a client is created. */
export interface ClientCreatedEvent extends BaseEventContext {
  clientId: string
  initialMessageCount: number
}

/** Emitted when client loading state changes. */
export interface ClientLoadingChangedEvent extends BaseEventContext {
  clientId: string
  isLoading: boolean
}

/** Emitted when client error state changes. */
export interface ClientErrorChangedEvent extends BaseEventContext {
  clientId: string
  error: string | null
}

/** Emitted when client messages are cleared. */
export interface ClientMessagesClearedEvent extends BaseEventContext {
  clientId: string
}

/** Emitted when client is reloaded. */
export interface ClientReloadedEvent extends BaseEventContext {
  clientId: string
  fromMessageIndex: number
}

/** Emitted when client stops. */
export interface ClientStoppedEvent extends BaseEventContext {
  clientId: string
}

export interface DevtoolsOpenedEvent extends BaseEventContext {}

export interface DevtoolsClosedEvent extends BaseEventContext {}

export interface DevtoolsRequestStateEvent extends BaseEventContext {
  targetHookId?: string
}

export interface HookRegisteredEvent extends BaseEventContext {
  hookId: string
  hookName: string
  displayName?: string
  framework?: string
  outputKind?: 'chat' | 'text' | 'structured' | 'image' | 'video' | 'audio'
  lifecycle: 'mounted' | 'active' | 'streaming' | 'errored' | 'stale'
}

export interface HookUpdatedEvent extends HookRegisteredEvent {}

export interface HookUnregisteredEvent extends BaseEventContext {
  hookId: string
  hookName?: string
  displayName?: string
  framework?: string
  outputKind?: 'chat' | 'text' | 'structured' | 'image' | 'video' | 'audio'
  reason?: 'disposed' | 'unmounted'
}

export interface HookStateSnapshotEvent extends BaseEventContext {
  hookId: string
  hookName: string
  displayName?: string
  framework?: string
  outputKind?: 'chat' | 'text' | 'structured' | 'image' | 'video' | 'audio'
  state: Record<string, unknown>
}

export interface RunLifecycleEvent extends BaseEventContext {
  hookId?: string
  threadId?: string
  runId: string
  status:
    | 'created'
    | 'started'
    | 'updated'
    | 'completed'
    | 'errored'
    | 'cancelled'
  error?: string
}

export interface ToolsRegisteredEvent extends BaseEventContext {
  hookId: string
  hookName?: string
  displayName?: string
  framework?: string
  outputKind?: 'chat' | 'text' | 'structured' | 'image' | 'video' | 'audio'
  tools: Array<{
    name: string
    description?: string
    inputSchema?: unknown
    outputSchema?: unknown
    needsApproval?: boolean
    metadata?: unknown
  }>
}

export interface DevtoolsToolFixtureApplyEvent extends BaseEventContext {
  fixtureId?: string
  hookId?: string
  threadId?: string
  runId?: string
  toolName: string
  input: unknown
  output: unknown
  execute?: boolean
  message?: {
    id: string
    role: 'system' | 'user' | 'assistant'
    parts: Array<unknown>
    createdAt?: number | string
  }
  toolCallId?: string
  messageId?: string
  errorText?: string
}

export interface DevtoolsToolFixtureAppliedEvent extends DevtoolsToolFixtureApplyEvent {
  hookId: string
  messageId: string
  toolCallId: string
}

export interface AIDevtoolsEventMap {
  // Devtools lifecycle
  'devtools:opened': DevtoolsOpenedEvent
  'devtools:closed': DevtoolsClosedEvent
  'devtools:request-state': DevtoolsRequestStateEvent

  // Hook registry
  'hook:registered': HookRegisteredEvent
  'hook:updated': HookUpdatedEvent
  'hook:unregistered': HookUnregisteredEvent
  'hook:state-snapshot': HookStateSnapshotEvent

  // Run lifecycle
  'run:created': RunLifecycleEvent
  'run:started': RunLifecycleEvent
  'run:updated': RunLifecycleEvent
  'run:completed': RunLifecycleEvent
  'run:errored': RunLifecycleEvent
  'run:cancelled': RunLifecycleEvent

  // Text events
  'text:request:started': TextRequestStartedEvent
  'text:request:completed': TextRequestCompletedEvent
  'text:message:created': TextMessageCreatedEvent
  'text:message:user': TextMessageUserEvent
  'text:chunk:content': TextChunkContentEvent
  'text:chunk:tool-call': TextChunkToolCallEvent
  'text:chunk:tool-result': TextChunkToolResultEvent
  'text:chunk:thinking': TextChunkThinkingEvent
  'text:chunk:done': TextChunkDoneEvent
  'text:chunk:error': TextChunkErrorEvent
  'text:usage': TextUsageEvent

  // Structured output events
  'structured-output:started': StructuredOutputStartedEvent
  'structured-output:updated': StructuredOutputUpdatedEvent
  'structured-output:completed': StructuredOutputCompletedEvent
  'structured-output:errored': StructuredOutputErroredEvent

  // Iteration events
  'text:iteration:started': TextIterationStartedEvent
  'text:iteration:completed': TextIterationCompletedEvent

  // Middleware events
  'middleware:hook:executed': MiddlewareHookExecutedEvent
  'middleware:config:transformed': MiddlewareConfigTransformedEvent
  'middleware:chunk:transformed': MiddlewareChunkTransformedEvent

  // Tool events
  'tools:approval:requested': ToolsApprovalRequestedEvent
  'tools:approval:responded': ToolsApprovalRespondedEvent
  'tools:input:available': ToolsInputAvailableEvent
  'tools:call:completed': ToolsCallCompletedEvent
  'tools:result:added': ToolsResultAddedEvent
  'tools:call:updated': ToolsCallUpdatedEvent
  'tools:registered': ToolsRegisteredEvent
  'devtools:tool-fixture:apply': DevtoolsToolFixtureApplyEvent
  'devtools:tool-fixture:applied': DevtoolsToolFixtureAppliedEvent

  // Summarize events
  'summarize:request:started': SummarizeRequestStartedEvent
  'summarize:request:completed': SummarizeRequestCompletedEvent
  'summarize:usage': SummarizeUsageEvent

  // Image events
  'image:request:started': ImageRequestStartedEvent
  'image:request:completed': ImageRequestCompletedEvent
  'image:usage': ImageUsageEvent

  // Speech events
  'speech:request:started': SpeechRequestStartedEvent
  'speech:request:completed': SpeechRequestCompletedEvent
  'speech:request:error': SpeechRequestErrorEvent
  'speech:usage': SpeechUsageEvent

  // Transcription events
  'transcription:request:started': TranscriptionRequestStartedEvent
  'transcription:request:completed': TranscriptionRequestCompletedEvent
  'transcription:request:error': TranscriptionRequestErrorEvent
  'transcription:usage': TranscriptionUsageEvent

  // Audio events
  'audio:request:started': AudioRequestStartedEvent
  'audio:request:completed': AudioRequestCompletedEvent
  'audio:request:error': AudioRequestErrorEvent
  'audio:usage': AudioUsageEvent

  // Video events
  'video:request:started': VideoRequestStartedEvent
  'video:request:completed': VideoRequestCompletedEvent
  'video:usage': VideoUsageEvent

  // Client events
  'client:created': ClientCreatedEvent
  'client:loading:changed': ClientLoadingChangedEvent
  'client:error:changed': ClientErrorChangedEvent
  'client:messages:cleared': ClientMessagesClearedEvent
  'client:reloaded': ClientReloadedEvent
  'client:stopped': ClientStoppedEvent
}

class AiEventClient extends EventClient<AIDevtoolsEventMap> {
  constructor() {
    super({
      pluginId: 'tanstack-ai-devtools',
    })
  }
}

const aiEventClientKey = Symbol.for('tanstack.ai.devtools.eventClient')

function getAiEventClient(): AiEventClient {
  const global = globalThis as typeof globalThis & {
    [aiEventClientKey]?: AiEventClient
  }
  const existing = global[aiEventClientKey]
  if (existing) return existing

  const eventClient = new AiEventClient()
  global[aiEventClientKey] = eventClient
  return eventClient
}

const aiEventClient = getAiEventClient()

export { aiEventClient }

export function emitAIDevtoolsEvent<
  TEvent extends keyof AIDevtoolsEventMap & string,
>(eventName: TEvent, payload: AIDevtoolsEventMap[TEvent]): void {
  aiEventClient.emit(eventName, payload)
}

export function dispatchAIDevtoolsEvent<
  TEvent extends keyof AIDevtoolsEventMap & string,
>(eventName: TEvent, payload: AIDevtoolsEventMap[TEvent]): void {
  if (
    typeof window === 'undefined' ||
    typeof window.dispatchEvent !== 'function' ||
    typeof CustomEvent === 'undefined'
  ) {
    return
  }

  window.dispatchEvent(
    new CustomEvent('tanstack-dispatch-event', {
      detail: aiEventClient.createEventPayload(eventName, payload),
    }),
  )
}

// Devtools middleware
export {
  devtoolsMiddleware,
  type DevtoolsChatMiddleware,
} from './devtools-middleware.js'
