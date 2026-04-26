import { EventClient } from '@tanstack/devtools-event-client'

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

export interface ToolCallPart {
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

export type MessagePart =
  | TextPart
  | ImagePart
  | AudioPart
  | VideoPart
  | DocumentPart
  | ToolCallPart
  | ToolResultPart
  | ThinkingPart

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
  /** Provider-specific metadata to carry through the tool call lifecycle */
  providerMetadata?: Record<string, unknown>
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

/**
 * Tool result states - track the lifecycle of a tool result
 * Must match @tanstack/ai-client ToolResultState
 */
export type ToolResultState =
  | 'streaming' // Placeholder for future streamed output
  | 'complete' // Result is complete
  | 'error' // Error occurred

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ImageUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

interface BaseEventContext {
  timestamp: number
  requestId?: string
  streamId?: string
  messageId?: string
  clientId?: string
  source?: 'client' | 'server'
  provider?: string
  model?: string
  systemPrompts?: Array<string>
  options?: Record<string, unknown>
  modelOptions?: Record<string, unknown>
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
  usage: ImageUsage
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
  usage: ImageUsage
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
export interface ClientCreatedEvent {
  clientId: string
  initialMessageCount: number
  timestamp: number
}

/** Emitted when client loading state changes. */
export interface ClientLoadingChangedEvent {
  clientId: string
  isLoading: boolean
  timestamp: number
}

/** Emitted when client error state changes. */
export interface ClientErrorChangedEvent {
  clientId: string
  error: string | null
  timestamp: number
}

/** Emitted when client messages are cleared. */
export interface ClientMessagesClearedEvent {
  clientId: string
  timestamp: number
}

/** Emitted when client is reloaded. */
export interface ClientReloadedEvent {
  clientId: string
  fromMessageIndex: number
  timestamp: number
}

/** Emitted when client stops. */
export interface ClientStoppedEvent {
  clientId: string
  timestamp: number
}

export interface AIDevtoolsEventMap {
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

const aiEventClient = new AiEventClient()

export { aiEventClient }

// Devtools middleware
export {
  devtoolsMiddleware,
  type DevtoolsChatMiddleware,
} from './devtools-middleware.js'
