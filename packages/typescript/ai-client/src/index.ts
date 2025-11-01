export { ChatClient } from "./chat-client";
export type { ChatMessage, ChatClientOptions, ChatRequestBody } from "./types";
export {
  createResponseStreamSource,
  processStream,
  parseStreamChunk,
  type StreamSource,
  type StreamEvent,
  type StreamEventHandlers,
  type StreamResult,
  type ToolCall,
} from "./stream";
export {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
  type FetchConnectionOptions,
} from "./connection-adapters";
export {
  StreamProcessor,
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
  DebounceStrategy,
  type StreamChunk,
  type ProcessedEvent,
  type ChunkStrategy,
  type StreamParser,
  type StreamProcessorOptions,
  type StreamProcessorHandlers,
  type ToolCallState,
} from "./stream/index";
