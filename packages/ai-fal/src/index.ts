// ============================================================================
// Image Adapter
// ============================================================================

export { FalImageAdapter, falImage } from './adapters/image'

// ============================================================================
// Video Adapter (Experimental)
// ============================================================================

export { FalVideoAdapter, falVideo } from './adapters/video'

// ============================================================================
// Live Adapter (Experimental)
// ============================================================================

export {
  FalLiveVideoAdapter,
  falLiveVideo,
  createFalLiveVideo,
  FAL_LIVE_VIDEO_APP,
  FAL_LIVE_VIDEO_MODELS,
  isFalLiveVideoModel,
  allowedFalLiveVideoProxyTarget,
} from './adapters/live'
export type {
  FalLiveVideoModel,
  FalLiveVideoProviderOptions,
  FalLiveVideoModelProviderOptionsByName,
} from './adapters/live'

// ============================================================================
// Speech Adapter (TTS)
// ============================================================================

export { FalSpeechAdapter, falSpeech } from './adapters/speech'

// ============================================================================
// Transcription Adapter (STT)
// ============================================================================

export {
  FalTranscriptionAdapter,
  falTranscription,
} from './adapters/transcription'

// ============================================================================
// Audio Adapter (Music/Sound Generation)
// ============================================================================

export { FalAudioAdapter, falAudio } from './adapters/audio'

// ============================================================================
// Model Types (from fal.ai's type system)
// ============================================================================

export {
  type FalImageProviderOptions,
  type FalVideoProviderOptions,
  type FalSpeechProviderOptions,
  type FalTranscriptionProviderOptions,
  type FalAudioProviderOptions,
  type FalModel,
  type FalModelInput,
  type FalModelOutput,
  type FalModelImageSize,
  type FalModelVideoSize,
  type FalModelVideoDuration,
} from './model-meta'
// ============================================================================
// Utils
// ============================================================================

export {
  getFalApiKeyFromEnv,
  configureFalClient,
  generateId,
  type FalClientConfig,
} from './utils/client'
