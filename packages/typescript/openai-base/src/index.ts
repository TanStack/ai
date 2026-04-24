export { makeStructuredOutputCompatible } from './utils/schema-converter'
export { createOpenAICompatibleClient } from './utils/client'
export type { OpenAICompatibleClientConfig } from './types/config'
export * from './tools/index'
export * from './types/message-metadata'
export * from './types/provider-options'
export { OpenAICompatibleChatCompletionsTextAdapter } from './adapters/chat-completions-text'
export {
  convertFunctionToolToChatCompletionsFormat,
  convertToolsToChatCompletionsFormat,
  type ChatCompletionFunctionTool,
} from './adapters/chat-completions-tool-converter'
export { OpenAICompatibleResponsesTextAdapter } from './adapters/responses-text'
export {
  convertFunctionToolToResponsesFormat,
  convertToolsToResponsesFormat,
  type ResponsesFunctionTool,
} from './adapters/responses-tool-converter'
export { OpenAICompatibleImageAdapter } from './adapters/image'
export {
  OpenAICompatibleSummarizeAdapter,
  type ChatStreamCapable,
} from './adapters/summarize'
export { OpenAICompatibleTranscriptionAdapter } from './adapters/transcription'
export { OpenAICompatibleTTSAdapter } from './adapters/tts'
export { OpenAICompatibleVideoAdapter } from './adapters/video'
