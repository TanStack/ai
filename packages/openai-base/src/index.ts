export {
  makeStructuredOutputCompatible,
  makeStructuredOutputCompatibleWithMap,
  warnStrictFallback,
} from './utils/schema-converter'
export type { OpenAIBaseTextAdapterOptions } from './utils/schema-converter'
export {
  buildChatCompletionsUsage,
  buildResponsesUsage,
  buildImagesUsage,
} from './usage'
export * from './tools/index'
export { OpenAIBaseChatCompletionsTextAdapter } from './adapters/chat-completions-text'
export {
  convertFunctionToolToChatCompletionsFormat,
  convertToolsToChatCompletionsFormat,
  type ChatCompletionFunctionTool,
} from './adapters/chat-completions-tool-converter'
export {
  OpenAIBaseResponsesTextAdapter,
  type OpenAIResponsesToolCallMetadata,
} from './adapters/responses-text'
export {
  convertFunctionToolToResponsesFormat,
  convertToolsToResponsesFormat,
  type ResponsesFunctionTool,
} from './adapters/responses-tool-converter'
export {
  createAzureOpenAIClient,
  createOpenAIClient,
  type OpenAIClientLike,
} from './client/index'
/** The generated modelschemas request bodies that `OpenAIClientLike` takes. */
export type {
  OpenaiPostAudioSpeechBody,
  OpenaiPostAudioTranscriptionsBody,
  OpenaiPostEmbeddingsBody,
  OpenaiPostImagesEditsBody,
  OpenaiPostImagesGenerationsBody,
  OpenaiPostVideosBody,
} from './generated/client/types'
