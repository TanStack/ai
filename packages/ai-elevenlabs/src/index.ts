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
  type ElevenLabsSpeechProviderOptions,
  type ElevenLabsVoiceSettings,
} from './adapters/speech'

// ============================================================================
// Audio (Music + Sound Effects) Adapter
// ============================================================================

export {
  ElevenLabsAudioAdapter,
  createElevenLabsAudio,
  elevenlabsAudio,
  type ElevenLabsAudioProviderOptions,
  type ElevenLabsMusicProviderOptions,
  type ElevenLabsSoundEffectsProviderOptions,
  type ElevenLabsMusicCompositionPlan,
} from './adapters/audio'

// ============================================================================
// Transcription (Speech-to-Text) Adapter
// ============================================================================

export {
  ElevenLabsTranscriptionAdapter,
  createElevenLabsTranscription,
  elevenlabsTranscription,
  type ElevenLabsTranscriptionProviderOptions,
} from './adapters/transcription'

// ============================================================================
// Model Metadata
// ============================================================================

export {
  ELEVENLABS_TTS_MODELS,
  ELEVENLABS_AUDIO_MODELS,
  ELEVENLABS_TRANSCRIPTION_MODELS,
  isElevenLabsMusicModel,
  isElevenLabsSoundEffectsModel,
  type ElevenLabsTTSModel,
  type ElevenLabsAudioModel,
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
} from './utils/index'
