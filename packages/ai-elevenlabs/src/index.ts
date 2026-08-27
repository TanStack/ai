export { elevenlabsRealtimeToken, elevenlabsRealtime } from './realtime/index'

export type {
  ElevenLabsRealtimeTokenOptions,
  ElevenLabsRealtimeOptions,
  ElevenLabsConversationMode,
  ElevenLabsVADConfig,
  ElevenLabsClientTool,
} from './realtime/index'

export {
  ElevenLabsSpeechAdapter,
  createElevenLabsSpeech,
  elevenlabsSpeech,
  type ElevenLabsSpeechProviderOptions,
  type ElevenLabsVoiceSettings,
} from './adapters/speech'

export {
  ElevenLabsAudioAdapter,
  createElevenLabsAudio,
  elevenlabsAudio,
  type ElevenLabsAudioProviderOptions,
  type ElevenLabsMusicProviderOptions,
  type ElevenLabsSoundEffectsProviderOptions,
  type ElevenLabsMusicCompositionPlan,
} from './adapters/audio'

export {
  ElevenLabsTranscriptionAdapter,
  createElevenLabsTranscription,
  elevenlabsTranscription,
  type ElevenLabsTranscriptionProviderOptions,
} from './adapters/transcription'

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

export {
  getElevenLabsApiKeyFromEnv,
  type ElevenLabsClientConfig,
} from './utils/index'
