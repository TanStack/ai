// Activity functions - individual exports for each activity
export {
  chat,
  experimental_text,
  toText,
  embedding,
  summarize,
  generateImage,
  generateVideo,
  getVideoJobStatus,
  generateSpeech,
  generateTranscription,
} from './activities'

// Agent loop (experimental)
export {
  agentLoop as experimental_agentLoop,
  type AgentLoopOptions,
  type AgentLoopBaseOptions,
  type AgentLoopStreamOptions,
  type AgentLoopStructuredOptions,
  type TextCreator,
  type TextCreatorOptions,
} from './agent'

// Create options functions - for pre-defining typed configurations
export {
  createChatOptions,
  createEmbeddingOptions,
  createSummarizeOptions,
  createImageOptions,
  createVideoOptions,
  createSpeechOptions,
  createTranscriptionOptions,
} from './activity-options'

// Re-export types
export type {
  AIAdapter,
  AnyAdapter,
  GenerateAdapter,
  GenerateOptions,
  TextGenerateOptions,
  EmbeddingGenerateOptions,
  SummarizeGenerateOptions,
  ImageGenerateOptions,
  GenerateTextOptions,
  GenerateEmbeddingOptions,
  GenerateSummarizeOptions,
  GenerateImageOptions,
  VideoGenerateOptions,
  GenerateVideoOptions,
} from './activities'

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
export { convertZodToJsonSchema } from './activities/chat/tools/zod-converter'

// Stream utilities
export {
  streamToText,
  toServerSentEventsStream,
  toStreamResponse,
} from './stream-to-response'

// Base adapter
export { BaseAdapter } from './base-adapter'

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

// Utility builders
export { textOptions } from './activities/chat/index'
export { messages } from './activities/chat/messages'

// Event client
export { aiEventClient } from './event-client'

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
} from './activities/chat/stream'
export type {
  ChunkStrategy,
  ChunkRecording,
  InternalToolCallState,
  ProcessorResult,
  ProcessorState,
  StreamProcessorEvents,
  StreamProcessorHandlers,
  StreamProcessorOptions,
  ToolCallState,
  ToolResultState,
  JSONParser,
} from './activities/chat/stream'
