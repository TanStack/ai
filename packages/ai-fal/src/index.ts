export { FalImageAdapter, falImage } from './adapters/image'

export { FalVideoAdapter, falVideo } from './adapters/video'

export { FalSpeechAdapter, falSpeech } from './adapters/speech'

export {
  FalTranscriptionAdapter,
  falTranscription,
} from './adapters/transcription'

export { FalAudioAdapter, falAudio } from './adapters/audio'

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

export {
  getFalApiKeyFromEnv,
  configureFalClient,
  generateId,
  type FalClientConfig,
} from './utils/client'
