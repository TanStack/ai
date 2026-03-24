// ============================================================================
// New Tree-Shakeable Adapters (Recommended)
// ============================================================================

// Text (Chat) adapter - for chat/text completion
export {
  OpenAITextAdapter,
  createOpenaiChat,
  openaiText,
  type OpenAITextConfig,
  type OpenAITextProviderOptions,
} from './adapters/text'

// Summarize adapter - for text summarization
export {
  OpenAISummarizeAdapter,
  createOpenaiSummarize,
  openaiSummarize,
  type OpenAISummarizeConfig,
  type OpenAISummarizeProviderOptions,
} from './adapters/summarize'

// Image adapter - for image generation
export {
  OpenAIImageAdapter,
  createOpenaiImage,
  openaiImage,
  type OpenAIImageConfig,
} from './adapters/image'
export type {
  OpenAIImageProviderOptions,
} from './image/image-provider-options'

// Video adapter - for video generation (experimental)
/**
 * @experimental Video generation is an experimental feature and may change.
 */
export {
  OpenAIVideoAdapter,
  createOpenaiVideo,
  openaiVideo,
  type OpenAIVideoConfig,
} from './adapters/video'
export type {
  OpenAIVideoProviderOptions,
  OpenAIVideoSize,
} from './video/video-provider-options'

// TTS adapter - for text-to-speech
export {
  OpenAITTSAdapter,
  createOpenaiSpeech,
  openaiSpeech,
  type OpenAITTSConfig,
} from './adapters/tts'
export type {
  OpenAITTSProviderOptions,
  OpenAITTSVoice,
  OpenAITTSFormat,
} from './audio/tts-provider-options'

// Transcription adapter - for speech-to-text
export {
  OpenAITranscriptionAdapter,
  createOpenaiTranscription,
  openaiTranscription,
  type OpenAITranscriptionConfig,
} from './adapters/transcription'
export type { OpenAITranscriptionProviderOptions } from './audio/transcription-provider-options'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  OpenAIChatModelProviderOptionsByName,
  OpenAIModelInputModalitiesByName,
  OpenAIChatModel,
  OpenAIImageModel,
  OpenAIImageModelProviderOptionsByName,
  OpenAIImageModelSizeByName,
  OpenAIVideoModel,
  OpenAIVideoModelProviderOptionsByName,
  OpenAIVideoModelSizeByName,
  OpenAITTSModel,
  OpenAITranscriptionModel,
} from './model-meta'
export {
  OPENAI_IMAGE_MODELS,
  OPENAI_TTS_MODELS,
  OPENAI_TRANSCRIPTION_MODELS,
  OPENAI_VIDEO_MODELS,
  OPENAI_CHAT_MODELS,
  OPENAI_CURRENT_CHAT_MODELS,
  OPENAI_DEPRECATED_CHAT_MODELS,
  OPENAI_PREVIEW_CHAT_MODELS,
  OPENAI_CHAT_SNAPSHOT_MODELS,
  OPENAI_CURRENT_IMAGE_MODELS,
  OPENAI_IMAGE_SNAPSHOT_MODELS,
  OPENAI_CURRENT_TTS_MODELS,
  OPENAI_TTS_SNAPSHOT_MODELS,
  OPENAI_CURRENT_TRANSCRIPTION_MODELS,
  OPENAI_TRANSCRIPTION_SNAPSHOT_MODELS,
  OPENAI_CURRENT_VIDEO_MODELS,
} from './model-meta'
export { OPENAI_REALTIME_MODELS, OPENAI_REALTIME_SNAPSHOT_MODELS } from './meta/realtime'
export type {
  OpenAITextMetadata,
  OpenAIImageMetadata,
  OpenAIAudioMetadata,
  OpenAIVideoMetadata,
  OpenAIDocumentMetadata,
  OpenAIMessageMetadataByModality,
} from './message-types'
export type { OpenAIClientConfig } from './utils/client'

// ============================================================================
// Realtime (Voice) Adapters
// ============================================================================

export { openaiRealtimeToken, openaiRealtime } from './realtime/index'

export type {
  OpenAIRealtimeVoice,
  OpenAIRealtimeModel,
  OpenAIRealtimeTokenOptions,
  OpenAIRealtimeOptions,
  OpenAITurnDetection,
  OpenAISemanticVADConfig,
  OpenAIServerVADConfig,
} from './realtime/index'
