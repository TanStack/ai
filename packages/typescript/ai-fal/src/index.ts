// ============================================================================
// Image Adapter
// ============================================================================

export { FalImageAdapter, falImage } from './adapters/image'

// ============================================================================
// Video Adapter (Experimental)
// ============================================================================

export { FalVideoAdapter, falVideo } from './adapters/video'

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
// Music Adapter
// ============================================================================

export { FalMusicAdapter, falMusic } from './adapters/music'

// ============================================================================
// Sound Effects Adapter
// ============================================================================

export {
  FalSoundEffectsAdapter,
  falSoundEffects,
} from './adapters/sound-effects'

// ============================================================================
// Model Types (from fal.ai's type system)
// ============================================================================

export {
  type FalImageProviderOptions,
  type FalVideoProviderOptions,
  type FalSpeechProviderOptions,
  type FalTranscriptionProviderOptions,
  type FalMusicProviderOptions,
  type FalSoundEffectsProviderOptions,
  type FalModel,
  type FalModelInput,
  type FalModelOutput,
  type FalModelImageSize,
  type FalModelVideoSize,
} from './model-meta'
// ============================================================================
// Utils
// ============================================================================

export {
  getFalApiKeyFromEnv,
  configureFalClient,
  generateId,
  type FalClientConfig,
} from './utils'
