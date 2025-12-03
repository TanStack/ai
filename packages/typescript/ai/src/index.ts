export { chat } from './core/chat'
export { summarize } from './core/summarize'
export { embedding } from './core/embedding'
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
} from './tools/tool-definition'
export { convertZodToJsonSchema } from './tools/zod-converter'
export {
  toServerSentEventsStream,
  toStreamResponse,
} from './utilities/stream-to-response'
export { BaseAdapter } from './base-adapter'
export { ToolCallManager } from './tools/tool-calls'
export {
  maxIterations,
  untilFinishReason,
  combineStrategies,
} from './utilities/agent-loop-strategies'
export * from './types'
export { chatOptions } from './utilities/chat-options'
export { messages } from './utilities/messages'
export { aiEventClient } from './event-client'

// Message converters
export {
  convertMessagesToModelMessages,
  uiMessageToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
  normalizeToUIMessage,
  generateMessageId,
} from './message-converters'

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
} from './stream'
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
} from './stream'
