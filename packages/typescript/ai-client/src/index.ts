export { ChatClient } from "./chat-client";
export type {
  // Core message types
  UIMessage,
  MessagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ToolCallState,
  ToolResultState,
  // Client configuration types
  ChatClientOptions,
  ChatRequestBody,
} from "./types";
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
  type InternalToolCallState,
} from "./stream/index";
export {
  uiMessageToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
} from "./message-converters";
export {
  parsePartialJSON,
  PartialJSONParser,
  defaultJSONParser,
  type JSONParser,
} from "./loose-json-parser";
