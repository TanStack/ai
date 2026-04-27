// ===========================
// New tree-shakeable adapters
// ===========================

// Text/Chat adapter
export {
  GeminiTextAdapter,
  createGeminiChat,
  geminiText,
  type GeminiTextConfig,
  type GeminiTextProviderOptions,
} from './adapters/text'

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
  type GeminiTTSConfig,
  type GeminiTTSProviderOptions,
} from './adapters/tts'

// Audio / Lyria music generation adapter (experimental)
/**
 * @experimental Gemini Lyria music generation is an experimental feature and may change.
 */
export {
  GeminiAudioAdapter,
  createGeminiAudio,
  geminiAudio,
  type GeminiAudioConfig,
  type GeminiAudioModel,
  type GeminiAudioProviderOptions,
} from './adapters/audio'

// Re-export models from model-meta for convenience
export { GEMINI_MODELS } from './model-meta'
export { GEMINI_MODELS as GeminiTextModels } from './model-meta'
export { GEMINI_IMAGE_MODELS as GeminiImageModels } from './model-meta'
export { GEMINI_TTS_MODELS as GeminiTTSModels } from './model-meta'
export { GEMINI_TTS_VOICES as GeminiTTSVoices } from './model-meta'
export { GEMINI_AUDIO_MODELS as GeminiAudioModels } from './model-meta'
export type { GeminiModels as GeminiTextModel } from './model-meta'
export type { GeminiImageModels as GeminiImageModel } from './model-meta'
export type { GeminiTTSVoice } from './model-meta'

// ===========================
// Type Exports
// ===========================

export type {
  GeminiChatModelProviderOptionsByName,
  GeminiChatModelToolCapabilitiesByName,
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
  GeminiMessageMetadataByModality,
} from './message-types'
