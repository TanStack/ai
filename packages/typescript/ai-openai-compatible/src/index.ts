export { makeStructuredOutputCompatible } from './utils/schema-converter'
export * from './tools/index'
export { OpenAICompatibleChatCompletionsTextAdapter } from './adapters/chat-completions-text'
// Wire-format types for subclasses implementing the `callChatCompletion*`
// hooks. Locally defined (see ./types/chat-completions) so this package's
// emitted .d.ts has zero `from 'openai'` references — downstream adapters
// (e.g. ai-openrouter) can implement the contract without installing the
// openai SDK.
export type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from './types/chat-completions'
export {
  convertFunctionToolToChatCompletionsFormat,
  convertToolsToChatCompletionsFormat,
  type ChatCompletionFunctionTool,
} from './adapters/chat-completions-tool-converter'
export { OpenAICompatibleResponsesTextAdapter } from './adapters/responses-text'
// Wire-format types for subclasses implementing the `callResponse*` hooks.
export type {
  Response as ResponsesResponse,
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseInput,
  ResponseInputContent,
  ResponseStreamEvent,
} from './types/responses'
export {
  convertFunctionToolToResponsesFormat,
  convertToolsToResponsesFormat,
  type ResponsesFunctionTool,
} from './adapters/responses-tool-converter'
