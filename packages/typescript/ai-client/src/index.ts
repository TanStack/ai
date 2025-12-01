export { ChatClient } from './chat-client'
export type {
  // Core message types
  UIMessage,
  MessagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  // Client configuration types
  ChatClientOptions,
  ChatRequestBody,
} from './types'
export {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  rpcStream,
  type ConnectionAdapter,
  type FetchConnectionOptions,
} from './connection-adapters'
export {
  uiMessageToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
} from './message-converters'

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
  type InternalToolCallState,
  type ToolCallState,
  type ToolResultState,
  type JSONParser,
  type ChunkRecording,
  type ProcessorResult,
  type ProcessorState,
} from '@tanstack/ai'
