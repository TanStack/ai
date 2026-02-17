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
  OpenAIImageModelProviderOptionsByName,
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
  OpenAIVideoModelProviderOptionsByName,
  OpenAIVideoSize,
  // OpenAIVideoDuration,
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
  OpenAIVideoModel,
  OpenAITTSModel,
  OpenAITranscriptionModel,
} from './model-meta'
export {
  OPENAI_IMAGE_MODELS,
  OPENAI_TTS_MODELS,
  OPENAI_TRANSCRIPTION_MODELS,
  OPENAI_VIDEO_MODELS,
  OPENAI_CHAT_MODELS,
} from './model-meta'
export type {
  OpenAITextMetadata,
  OpenAIImageMetadata,
  OpenAIAudioMetadata,
  OpenAIVideoMetadata,
  OpenAIDocumentMetadata,
  OpenAIMessageMetadataByModality,
} from './message-types'
export type { OpenAIClientConfig } from './utils/client'
