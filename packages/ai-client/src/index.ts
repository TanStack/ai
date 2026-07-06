export { AudioRecorder } from './audio-recorder'
export type {
  AudioRecorderOptions,
  AudioRecorderState,
  AudioRecording,
  InferAudioRecordingOutput,
} from './audio-recorder'
export { ChatClient } from './chat-client'
export { createMcpAppBridge } from './mcp-app-bridge'
export type { McpAppBridge, CreateMcpAppBridgeOptions } from './mcp-app-bridge'
export { RealtimeClient } from './realtime-client'
export { GenerationClient } from './generation-client'
export { VideoGenerationClient } from './video-generation-client'
export type {
  // Core message types (re-exported from @tanstack/ai via types.ts)
  UIMessage,
  MessagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ThinkingPart,
  StructuredOutputPart,
  // Client configuration types
  ChatClientPersistence,
  ChatClientOptions,
  ClientContextOptionFromTools,
  ChatRequestBody,
  InferChatMessages,
  InferredClientContext,
  ChatClientState,
  ConnectionStatus,
  ChatFetcher,
  ChatFetcherInput,
  ChatFetcherOptions,
  ChatTransport,
  DistributedOmit,
  MultimodalContent,
  QueuedMessage,
  WhenBusy,
  QueueConfig,
  QueueStrategy,
  QueueOption,
  SendMessageOptions,
} from './types'
// Generation client types
export type {
  InferGenerationOutput,
  InferGenerationOutputFromReturn,
  GenerationClientState,
  GenerationClientOptions,
  GenerationFetcher,
  GenerationFetcherOptions,
  GenerationTransport,
  VideoGenerationClientOptions,
  VideoStatusInfo,
  VideoGenerateResult,
  ImageGenerateInput,
  AudioGenerateInput,
  SpeechGenerateInput,
  TranscriptionGenerateInput,
  SummarizeGenerateInput,
  VideoGenerateInput,
} from './generation-types'
export { GENERATION_EVENTS } from './generation-types'
export { UnsupportedResponseStreamError } from './response-stream'
export { clientTools, createChatClientOptions } from './types'
export {
  createAIDevtoolsGenerationPreview,
  type AIDevtoolsClientMetadata,
  type AIDevtoolsDisplayOptions,
  type AIDevtoolsGenerationMediaItem,
  type AIDevtoolsGenerationPreview,
  type AIDevtoolsGenerationProgress,
  type AIDevtoolsGenerationVideoJob,
} from './devtools'
export type {
  ExtractToolNames,
  ExtractToolInput,
  ExtractToolOutput,
} from './tool-types'
export type { AnyClientTool } from '@tanstack/ai/client'
export type {
  RealtimeAdapter,
  RealtimeConnection,
  RealtimeClientOptions,
  RealtimeClientState,
  RealtimeStateChangeCallback,
} from './realtime-types'
export {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
  StreamTruncatedError,
  type ConnectConnectionAdapter,
  type ConnectionAdapter,
  type FetchConnectionOptions,
  type RunAgentInputContext,
  type SubscribeConnectionAdapter,
  type XhrConnectionOptions,
} from './connection-adapters'

// Re-export message converters from @tanstack/ai
export {
  uiMessageToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
  convertMessagesToModelMessages,
  normalizeToUIMessage,
  generateMessageId,
} from '@tanstack/ai/client'

// Re-export stream processing from @tanstack/ai (shared implementation)
export {
  StreamProcessor,
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
  parsePartialJSON,
  PartialJSONParser,
  defaultJSONParser,
  type ChunkStrategy,
  type StreamProcessorOptions,
  type StreamProcessorEvents,
  type InternalToolCallState,
  type ToolCallState,
  type ToolResultState,
  type JSONParser,
  type ChunkRecording,
  type ProcessorResult,
  type ProcessorState,
} from '@tanstack/ai/client'
