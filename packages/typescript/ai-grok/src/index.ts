// ============================================================================
// New Tree-Shakeable Adapters (Recommended)
// ============================================================================

// Text (Chat) adapter - for chat/text completion
export {
  GrokTextAdapter,
  createGrokText,
  grokText,
  type GrokTextConfig,
  type GrokTextProviderOptions,
} from './adapters/text'

// Summarize adapter - for text summarization
export {
  GrokSummarizeAdapter,
  createGrokSummarize,
  grokSummarize,
  type GrokSummarizeConfig,
  type GrokSummarizeProviderOptions,
  type GrokSummarizeModel,
} from './adapters/summarize'

// Image adapter - for image generation
export {
  GrokImageAdapter,
  createGrokImage,
  grokImage,
  type GrokImageConfig,
} from './adapters/image'
export type {
  GrokImageProviderOptions,
  GrokImageModelProviderOptionsByName,
} from './image/image-provider-options'

// Speech (TTS) adapter - for text-to-speech
export {
  GrokSpeechAdapter,
  createGrokSpeech,
  grokSpeech,
  type GrokSpeechConfig,
} from './adapters/tts'
export type {
  GrokTTSProviderOptions,
  GrokTTSVoice,
  GrokTTSCodec,
} from './audio/tts-provider-options'

// Transcription adapter - for speech-to-text
export {
  GrokTranscriptionAdapter,
  createGrokTranscription,
  grokTranscription,
  type GrokTranscriptionConfig,
} from './adapters/transcription'
export type {
  GrokTranscriptionProviderOptions,
  GrokSTTAudioFormat,
} from './audio/transcription-provider-options'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  GrokChatModelProviderOptionsByName,
  GrokChatModelToolCapabilitiesByName,
  GrokModelInputModalitiesByName,
  ResolveProviderOptions,
  ResolveInputModalities,
  GrokChatModel,
  GrokImageModel,
  GrokTTSModel,
  GrokTranscriptionModel,
  GrokRealtimeModel,
} from './model-meta'
export {
  GROK_CHAT_MODELS,
  GROK_IMAGE_MODELS,
  GROK_TTS_MODELS,
  GROK_TRANSCRIPTION_MODELS,
  GROK_REALTIME_MODELS,
} from './model-meta'
export type {
  GrokTextMetadata,
  GrokImageMetadata,
  GrokAudioMetadata,
  GrokVideoMetadata,
  GrokDocumentMetadata,
  GrokMessageMetadataByModality,
} from './message-types'

// ============================================================================
// Realtime (Voice Agent) Adapters
// ============================================================================

export { grokRealtimeToken, grokRealtime } from './realtime/index'

export type {
  GrokRealtimeVoice,
  GrokRealtimeTokenOptions,
  GrokRealtimeOptions,
  GrokTurnDetection,
  GrokSemanticVADConfig,
  GrokServerVADConfig,
} from './realtime/index'
