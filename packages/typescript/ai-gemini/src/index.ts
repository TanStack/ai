export { GeminiAdapter, createGemini, gemini } from './gemini-adapter'
export type { GeminiAdapterConfig } from './gemini-adapter'
export {
  GEMINI_MODELS,
  GEMINI_EMBEDDING_MODELS,
  GEMINI_TRANSCRIPTION_MODELS,
} from './model-meta'
export type {
  GeminiChatModelProviderOptionsByName,
  GeminiModelInputModalitiesByName,
} from './model-meta'
export type { GeminiTranscriptionProviderOptions } from './audio/transcribe-provider-options'
export type {
  GeminiStructuredOutputOptions,
  GeminiThinkingOptions,
} from './text/text-provider-options'
export type { GoogleGeminiTool } from './tools/index'
export type {
  GeminiTextMetadata,
  GeminiImageMetadata,
  GeminiAudioMetadata,
  GeminiVideoMetadata,
  GeminiDocumentMetadata,
  GeminiImageMimeType,
  GeminiAudioMimeType,
  GeminiVideoMimeType,
  GeminiDocumentMimeType,
  GeminiMessageMetadataByModality,
} from './message-types'
