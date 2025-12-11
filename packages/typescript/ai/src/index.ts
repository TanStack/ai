// Main AI function - the one export to rule them all
export {
  ai,
  type AIAdapter,
  type AnyAdapter,
  type GenerateAdapter,
  type GenerateOptions,
  type ChatGenerateOptions,
  type EmbeddingGenerateOptions,
  type SummarizeGenerateOptions,
  type ImageGenerateOptions,
  type GenerateChatOptions,
  type GenerateEmbeddingOptions,
  type GenerateSummarizeOptions,
  type GenerateImageOptions,
} from './ai'

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
export { chatOptions } from './activities/chat/index'
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
