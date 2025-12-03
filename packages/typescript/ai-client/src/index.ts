export { ChatClient } from './chat-client'
export type {
  // Core message types (re-exported from @tanstack/ai via types.ts)
  UIMessage,
  MessagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ThinkingPart,
  // Client configuration types
  ChatClientOptions,
  ChatRequestBody,
  InferChatMessages,
} from './types'
export { clientTools, createChatClientOptions } from './types'
export type {
  ExtractToolNames,
  ExtractToolInput,
  ExtractToolOutput,
} from './tool-types'
export type { AnyClientTool } from '@tanstack/ai'
export {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  rpcStream,
  type ConnectionAdapter,
  type FetchConnectionOptions,
} from './connection-adapters'

// Re-export message converters from @tanstack/ai
export {
  uiMessageToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
  convertMessagesToModelMessages,
  normalizeToUIMessage,
  generateMessageId,
} from '@tanstack/ai'

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
  type StreamProcessorHandlers,
  type StreamProcessorEvents,
  type InternalToolCallState,
  type ToolCallState,
  type ToolResultState,
  type JSONParser,
  type ChunkRecording,
  type ProcessorResult,
  type ProcessorState,
} from '@tanstack/ai'
