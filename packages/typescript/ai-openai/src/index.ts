// ============================================================================
// New Tree-Shakeable Adapters (Recommended)
// ============================================================================

// Text (Chat) adapter - for chat/text completion
export {
  OpenAITextAdapter,
  createOpenaiChat,
  openaiText,
  // Deprecated exports
  createOpenaiText,
  openaiChat,
  type OpenAITextConfig,
  type OpenAITextProviderOptions,
} from './adapters/text'

// Embedding adapter - for text embeddings
export {
  OpenAIEmbedAdapter,
  createOpenaiEmbedding,
  openaiEmbedding,
  // Deprecated exports
  createOpenaiEmbed,
  openaiEmbed,
  type OpenAIEmbedConfig,
  type OpenAIEmbedProviderOptions,
} from './adapters/embed'

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
  OpenAIVideoDuration,
} from './video/video-provider-options'

// TTS adapter - for text-to-speech
export {
  OpenAITTSAdapter,
  createOpenaiSpeech,
  openaiSpeech,
  // Deprecated exports
  createOpenaiTTS,
  openaiTTS,
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
} from './model-meta'
export {
  OPENAI_IMAGE_MODELS,
  OPENAI_TTS_MODELS,
  OPENAI_TRANSCRIPTION_MODELS,
  OPENAI_VIDEO_MODELS,
} from './model-meta'
export type {
  OpenAITextMetadata,
  OpenAIImageMetadata,
  OpenAIAudioMetadata,
  OpenAIVideoMetadata,
  OpenAIDocumentMetadata,
  OpenAIMessageMetadataByModality,
} from './message-types'
