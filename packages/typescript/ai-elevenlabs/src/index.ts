// ============================================================================
// ElevenLabs Realtime (Voice) Adapters
// ============================================================================

export { elevenlabsRealtimeToken, elevenlabsRealtime } from './realtime/index'

export type {
  ElevenLabsRealtimeTokenOptions,
  ElevenLabsRealtimeOptions,
  ElevenLabsConversationMode,
  ElevenLabsVADConfig,
  ElevenLabsClientTool,
} from './realtime/index'

// ============================================================================
// Speech (Text-to-Speech) Adapter
// ============================================================================

export {
  ElevenLabsSpeechAdapter,
  createElevenLabsSpeech,
  elevenlabsSpeech,
  type ElevenLabsSpeechConfig,
  type ElevenLabsSpeechProviderOptions,
  type ElevenLabsVoiceSettings,
} from './adapters/speech'

// ============================================================================
// Music Adapter
// ============================================================================

export {
  ElevenLabsMusicAdapter,
  createElevenLabsMusic,
  elevenlabsMusic,
  type ElevenLabsMusicConfig,
  type ElevenLabsMusicProviderOptions,
  type ElevenLabsMusicCompositionPlan,
} from './adapters/music'

// ============================================================================
// Sound Effects Adapter
// ============================================================================

export {
  ElevenLabsSoundEffectsAdapter,
  createElevenLabsSoundEffects,
  elevenlabsSoundEffects,
  type ElevenLabsSoundEffectsConfig,
  type ElevenLabsSoundEffectsProviderOptions,
} from './adapters/sound-effects'

// ============================================================================
// Transcription Adapter
// ============================================================================

export {
  ElevenLabsTranscriptionAdapter,
  createElevenLabsTranscription,
  elevenlabsTranscription,
  type ElevenLabsTranscriptionConfig,
  type ElevenLabsTranscriptionProviderOptions,
} from './adapters/transcription'

// ============================================================================
// Model Types
// ============================================================================

export {
  ELEVENLABS_TTS_MODELS,
  ELEVENLABS_MUSIC_MODELS,
  ELEVENLABS_SOUND_EFFECTS_MODELS,
  ELEVENLABS_TRANSCRIPTION_MODELS,
  type ElevenLabsTTSModel,
  type ElevenLabsMusicModel,
  type ElevenLabsSoundEffectsModel,
  type ElevenLabsTranscriptionModel,
  type ElevenLabsOutputFormat,
} from './model-meta'

// ============================================================================
// Utilities
// ============================================================================

export {
  getElevenLabsApiKeyFromEnv,
  type ElevenLabsClientConfig,
} from './utils'
