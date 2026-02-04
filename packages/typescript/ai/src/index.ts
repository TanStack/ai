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

// Agent loop strategies
export {
  maxIterations,
  untilFinishReason,
  combineStrategies,
} from './activities/chat/agent-loop-strategies'

// All types
export * from './types'

// Event client + event types
export * from './event-client'

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
