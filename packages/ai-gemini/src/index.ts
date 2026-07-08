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

// Summarize - thin factory functions over @tanstack/ai's ChatStreamSummarizeAdapter
export {
  createGeminiSummarize,
  geminiSummarize,
  type GeminiSummarizeConfig,
  type GeminiSummarizeModel,
} from './adapters/summarize'

// Files adapter - upload media to the Gemini Files API and reference by file URI
export {
  GeminiFilesAdapter,
  createGeminiFiles,
  geminiFiles,
  type GeminiFilesConfig,
} from './adapters/files'

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

// Video generation adapter — Veo + Gemini Omni Flash (experimental)
/**
 * @experimental Video generation is an experimental feature and may change.
 */
export {
  GeminiVideoAdapter,
  createGeminiVideo,
  geminiVideo,
  type GeminiVideoConfig,
} from './adapters/video'
export {
  GEMINI_VIDEO_DURATIONS,
  getGeminiVideoDurationOptions,
  isInteractionsVideoModel,
} from './video/video-provider-options'
export type {
  GeminiInteractionsVideoModel,
  GeminiOmniVideoProviderOptions,
  GeminiVideoModel,
  GeminiVideoModelDurationByName,
  GeminiVideoModelInputModalitiesByName,
  GeminiVideoModelProviderOptionsByName,
  GeminiVideoModelSizeByName,
  GeminiVideoProviderOptions,
  GeminiVideoSize,
} from './video/video-provider-options'

// Re-export models from model-meta for convenience
export {
  GEMINI_MODELS,
  GEMINI_COMBINED_TOOLS_AND_SCHEMA_MODELS,
} from './model-meta'
export { GEMINI_MODELS as GeminiTextModels } from './model-meta'
export { GEMINI_IMAGE_MODELS as GeminiImageModels } from './model-meta'
export { GEMINI_TTS_MODELS as GeminiTTSModels } from './model-meta'
export { GEMINI_TTS_VOICES as GeminiTTSVoices } from './model-meta'
export { GEMINI_AUDIO_MODELS as GeminiAudioModels } from './model-meta'
export { GEMINI_VIDEO_MODELS as GeminiVideoModels } from './model-meta'
export { GEMINI_INTERACTIONS_VIDEO_MODELS as GeminiInteractionsVideoModels } from './model-meta'
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

// Export provider usage types
export type { GeminiProviderUsageDetails } from './usage'

// ============================================================================
// Realtime (Voice) Adapters
// ============================================================================

export { geminiRealtime, geminiRealtimeToken } from './realtime/index'

export type {
  GeminiRealtimeModel,
  GeminiRealtimeOptions,
  GeminiRealtimeProviderOptions,
  GeminiRealtimeTokenOptions,
  GeminiRealtimeVoice,
} from './realtime/index'
