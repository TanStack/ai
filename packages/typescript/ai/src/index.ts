// Activity functions - individual exports for each activity
export {
  chat,
  summarize,
  generateImage,
  generateVideo,
  getVideoJobStatus,
  generateSpeech,
  generateTranscription,
} from './activities/index'

// Create options functions - for pre-defining typed configurations
export { createChatOptions } from './activities/chat/index'
export { createSummarizeOptions } from './activities/summarize/index'
export { createImageOptions } from './activities/generateImage/index'
export { createVideoOptions } from './activities/generateVideo/index'
export { createSpeechOptions } from './activities/generateSpeech/index'
export { createTranscriptionOptions } from './activities/generateTranscription/index'

// Re-export types
export type {
  AIAdapter,
  ImageAdapter,
  AnyImageAdapter,
  TextAdapter,
  AnyTextAdapter,
  AnySummarizeAdapter,
  SummarizeAdapter,
  AnyTTSAdapter,
  TTSAdapter,
  AnyTranscriptionAdapter,
  TranscriptionAdapter,
  AnyVideoAdapter,
  VideoAdapter,
} from './activities/index'

// Tool definition
export {
  toolDefinition,
  type ToolDefinition,
  type ToolDefinitionInstance,
  type ToolDefinitionConfig,
  type ServerTool,
  type ClientTool,
  type AnyClientTool,
  type InferToolName,
  type InferToolInput,
  type InferToolOutput,
} from './activities/chat/tools/tool-definition'

// Schema conversion (Standard JSON Schema compliant)
export { convertSchemaToJsonSchema } from './activities/chat/tools/schema-converter'

// Stream utilities
export {
  streamToText,
  toServerSentEventsStream,
  toServerSentEventsResponse,
  toHttpStream,
  toHttpResponse,
} from './stream-to-response'

// Tool call management
export { ToolCallManager } from './activities/chat/tools/tool-calls'

// Provider tool type
export type { ProviderTool } from './tools/provider-tool'

// Agent loop strategies
export {
  maxIterations,
  untilFinishReason,
  combineStrategies,
} from './activities/chat/agent-loop-strategies'

// Tool registry
export {
  createToolRegistry,
  createFrozenRegistry,
  type ToolRegistry,
} from './tool-registry'

// Chat middleware
export type {
  ChatMiddleware,
  ChatMiddlewareContext,
  ChatMiddlewarePhase,
  ChatMiddlewareConfig,
  ToolCallHookContext,
  BeforeToolCallDecision,
  AfterToolCallInfo,
  IterationInfo,
  ToolPhaseCompleteInfo,
  UsageInfo,
  FinishInfo,
  AbortInfo,
  ErrorInfo,
} from './activities/chat/middleware/index'

// All types
export * from './types'

// Utility functions
export { detectImageMimeType } from './utils'

// Realtime
export { realtimeToken } from './realtime/index'
export type {
  RealtimeToken,
  RealtimeTokenAdapter,
  RealtimeTokenOptions,
  RealtimeSessionConfig,
  VADConfig,
  RealtimeMessage,
  RealtimeMessagePart,
  RealtimeTextPart,
  RealtimeAudioPart,
  RealtimeToolCallPart,
  RealtimeToolResultPart,
  RealtimeImagePart,
  RealtimeStatus,
  RealtimeMode,
  AudioVisualization,
  RealtimeEvent,
  RealtimeEventPayloads,
  RealtimeEventHandler,
  RealtimeErrorCode,
  RealtimeError,
} from './realtime/index'

// Message converters
export {
  convertMessagesToModelMessages,
  generateMessageId,
  uiMessageToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
  normalizeToUIMessage,
} from './activities/chat/messages'

// Stream processing (unified for server and client)
export {
  StreamProcessor,
  createReplayStream,
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
  PartialJSONParser,
  defaultJSONParser,
  parsePartialJSON,
} from './activities/chat/stream/index'
export type {
  ChunkStrategy,
  ChunkRecording,
  InternalToolCallState,
  ProcessorResult,
  ProcessorState,
  StreamProcessorEvents,
  StreamProcessorOptions,
  ToolCallState,
  ToolResultState,
  JSONParser,
} from './activities/chat/stream/index'

// Adapter extension utilities
export { createModel, extendAdapter } from './extend-adapter'
export type { ExtendedModelDef } from './extend-adapter'

// Logger
export type {
  Logger,
  DebugCategories,
  DebugConfig,
  DebugOption,
} from './logger/types'
export { ConsoleLogger } from './logger/console-logger'
