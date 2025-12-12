// Main AI function - the one export to rule them all  
export {
  ai,
  type AIAdapter,
  type AnyAdapter,
  type GenerateAdapter,
  type GenerateOptions,
  type TextGenerateOptions,
  type EmbeddingGenerateOptions,
  type SummarizeGenerateOptions,
  type ImageGenerateOptions,
  type GenerateTextOptions,
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
} from './activities/text/tools/tool-definition'
export { convertZodToJsonSchema } from './activities/text/tools/zod-converter'

// Stream utilities
export {
  streamToText,
  toServerSentEventsStream,
  toStreamResponse,
} from './stream-to-response'

// Base adapter
export { BaseAdapter } from './base-adapter'

// Tool call management
export { ToolCallManager } from './activities/text/tools/tool-calls'

// Agent loop strategies
export {
  maxIterations,
  untilFinishReason,
  combineStrategies,
} from './activities/text/agent-loop-strategies'

// All types
export * from './types'

// Utility builders
export { textOptions } from './activities/text/index'
export { messages } from './activities/text/messages'

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
} from './activities/text/messages'

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
} from './activities/text/stream'
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
} from './activities/text/stream'
