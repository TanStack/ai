export { makeStructuredOutputCompatible } from './utils/schema-converter'
export * from './tools/index'
export { OpenAICompatibleChatCompletionsTextAdapter } from './adapters/chat-completions-text'
// Re-export the OpenAI SDK types subclasses need when implementing the
// `callChatCompletion*` hooks. Type-only — `openai` is an optional peer in
// this package, so consumers that use these types must declare `openai`
// in their own deps (or devDeps if they only need types).
export type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions'
export {
  convertFunctionToolToChatCompletionsFormat,
  convertToolsToChatCompletionsFormat,
  type ChatCompletionFunctionTool,
} from './adapters/chat-completions-tool-converter'
export { OpenAICompatibleResponsesTextAdapter } from './adapters/responses-text'
// Type-only re-exports for subclasses implementing the `callResponse*` hooks.
export type {
  Response as ResponsesResponse,
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseInputContent,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses'
export {
  convertFunctionToolToResponsesFormat,
  convertToolsToResponsesFormat,
  type ResponsesFunctionTool,
} from './adapters/responses-tool-converter'
