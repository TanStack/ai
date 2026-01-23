import { EventClient } from '@tanstack/devtools-event-client'
import type { MessagePart, ToolCall } from './types'

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
  'tanstack-ai-devtools:text:request:started': TextRequestStartedEvent
  'tanstack-ai-devtools:text:request:completed': TextRequestCompletedEvent
  'tanstack-ai-devtools:text:message:created': TextMessageCreatedEvent
  'tanstack-ai-devtools:text:message:user': TextMessageUserEvent
  'tanstack-ai-devtools:text:chunk:content': TextChunkContentEvent
  'tanstack-ai-devtools:text:chunk:tool-call': TextChunkToolCallEvent
  'tanstack-ai-devtools:text:chunk:tool-result': TextChunkToolResultEvent
  'tanstack-ai-devtools:text:chunk:thinking': TextChunkThinkingEvent
  'tanstack-ai-devtools:text:chunk:done': TextChunkDoneEvent
  'tanstack-ai-devtools:text:chunk:error': TextChunkErrorEvent
  'tanstack-ai-devtools:text:usage': TextUsageEvent

  // Tool events
  'tanstack-ai-devtools:tools:approval:requested': ToolsApprovalRequestedEvent
  'tanstack-ai-devtools:tools:approval:responded': ToolsApprovalRespondedEvent
  'tanstack-ai-devtools:tools:input:available': ToolsInputAvailableEvent
  'tanstack-ai-devtools:tools:call:completed': ToolsCallCompletedEvent
  'tanstack-ai-devtools:tools:result:added': ToolsResultAddedEvent
  'tanstack-ai-devtools:tools:call:updated': ToolsCallUpdatedEvent

  // Summarize events
  'tanstack-ai-devtools:summarize:request:started': SummarizeRequestStartedEvent
  'tanstack-ai-devtools:summarize:request:completed': SummarizeRequestCompletedEvent
  'tanstack-ai-devtools:summarize:usage': SummarizeUsageEvent

  // Image events
  'tanstack-ai-devtools:image:request:started': ImageRequestStartedEvent
  'tanstack-ai-devtools:image:request:completed': ImageRequestCompletedEvent
  'tanstack-ai-devtools:image:usage': ImageUsageEvent

  // Speech events
  'tanstack-ai-devtools:speech:request:started': SpeechRequestStartedEvent
  'tanstack-ai-devtools:speech:request:completed': SpeechRequestCompletedEvent
  'tanstack-ai-devtools:speech:usage': SpeechUsageEvent

  // Transcription events
  'tanstack-ai-devtools:transcription:request:started': TranscriptionRequestStartedEvent
  'tanstack-ai-devtools:transcription:request:completed': TranscriptionRequestCompletedEvent
  'tanstack-ai-devtools:transcription:usage': TranscriptionUsageEvent

  // Video events
  'tanstack-ai-devtools:video:request:started': VideoRequestStartedEvent
  'tanstack-ai-devtools:video:request:completed': VideoRequestCompletedEvent
  'tanstack-ai-devtools:video:usage': VideoUsageEvent

  // Client events
  'tanstack-ai-devtools:client:created': ClientCreatedEvent
  'tanstack-ai-devtools:client:loading:changed': ClientLoadingChangedEvent
  'tanstack-ai-devtools:client:error:changed': ClientErrorChangedEvent
  'tanstack-ai-devtools:client:messages:cleared': ClientMessagesClearedEvent
  'tanstack-ai-devtools:client:reloaded': ClientReloadedEvent
  'tanstack-ai-devtools:client:stopped': ClientStoppedEvent
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
