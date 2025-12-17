// ===========================
// New tree-shakeable adapters
// ===========================

// Text/Chat adapter
export {
  GeminiTextAdapter,
  createGeminiChat,
  geminiText,
  // Deprecated exports
  createGeminiText,
  geminiChat,
  type GeminiTextConfig,
  type GeminiTextProviderOptions,
} from './adapters/text'

// Embedding adapter
export {
  GeminiEmbedAdapter,
  GeminiEmbeddingModels,
  createGeminiEmbedding,
  geminiEmbedding,
  // Deprecated exports
  createGeminiEmbed,
  geminiEmbed,
  type GeminiEmbedAdapterOptions,
  type GeminiEmbeddingModel,
  type GeminiEmbedProviderOptions,
} from './adapters/embed'

// Summarize adapter
export {
  GeminiSummarizeAdapter,
  GeminiSummarizeModels,
  createGeminiSummarize,
  geminiSummarize,
  type GeminiSummarizeAdapterOptions,
  type GeminiSummarizeModel,
  type GeminiSummarizeProviderOptions,
} from './adapters/summarize'

// Image adapter
export {
  GeminiImageAdapter,
  createGeminiImage,
  geminiImage,
  type GeminiImageConfig,
} from './adapters/image'
export type {
  GeminiImageProviderOptions,
  GeminiImageModelProviderOptionsByName,
  GeminiAspectRatio,
  // Re-export SDK types for convenience
  PersonGeneration,
  SafetyFilterLevel,
  ImagePromptLanguage,
} from './image/image-provider-options'

// TTS adapter (experimental)
/**
 * @experimental Gemini TTS is an experimental feature and may change.
 */
export {
  GeminiTTSAdapter,
  createGeminiSpeech,
  geminiSpeech,
  // Deprecated exports
  createGeminiTTS,
  geminiTTS,
  type GeminiTTSConfig,
  type GeminiTTSProviderOptions,
} from './adapters/tts'

// Re-export models from model-meta for convenience
export { GEMINI_MODELS as GeminiTextModels } from './model-meta'
export { GEMINI_IMAGE_MODELS as GeminiImageModels } from './model-meta'
export { GEMINI_TTS_MODELS as GeminiTTSModels } from './model-meta'
export { GEMINI_TTS_VOICES as GeminiTTSVoices } from './model-meta'
export type { GeminiModels as GeminiTextModel } from './model-meta'
export type { GeminiImageModels as GeminiImageModel } from './model-meta'
export type { GeminiTTSVoice } from './model-meta'

// ===========================
// Type Exports
// ===========================

export type {
  GeminiChatModelProviderOptionsByName,
  GeminiModelInputModalitiesByName,
} from './model-meta'
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
