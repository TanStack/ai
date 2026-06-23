// Chat
export { injectChat } from './inject-chat'

// Generation
export { injectGeneration } from './inject-generation'
export type {
  InjectGenerationOptions,
  InjectGenerationResult,
} from './inject-generation'

// Generate Image
export { injectGenerateImage } from './inject-generate-image'
export type {
  InjectGenerateImageOptions,
  InjectGenerateImageResult,
} from './inject-generate-image'

// Generate Audio
export { injectGenerateAudio } from './inject-generate-audio'
export type {
  InjectGenerateAudioOptions,
  InjectGenerateAudioResult,
} from './inject-generate-audio'

// Generate Speech
export { injectGenerateSpeech } from './inject-generate-speech'
export type {
  InjectGenerateSpeechOptions,
  InjectGenerateSpeechResult,
} from './inject-generate-speech'

// Transcription
export { injectTranscription } from './inject-transcription'
export type {
  InjectTranscriptionOptions,
  InjectTranscriptionResult,
} from './inject-transcription'

// Audio Recorder
export { injectAudioRecorder } from './inject-audio-recorder'
export type { InjectAudioRecorderResult } from './inject-audio-recorder'

// Summarize
export { injectSummarize } from './inject-summarize'
export type {
  InjectSummarizeOptions,
  InjectSummarizeResult,
} from './inject-summarize'

// Generate Video
export { injectGenerateVideo } from './inject-generate-video'
export type {
  InjectGenerateVideoOptions,
  InjectGenerateVideoResult,
} from './inject-generate-video'

// Types from ./types
export type {
  DeepPartial,
  InjectChatOptions,
  InjectChatResult,
  UIMessage,
  ChatRequestBody,
  MultimodalContent,
  ReactiveOption,
} from './types'

// Re-export from @tanstack/ai-client for convenience
export {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
  createChatClientOptions,
  type ConnectionAdapter,
  type ConnectConnectionAdapter,
  type SubscribeConnectionAdapter,
  type RunAgentInputContext,
  type FetchConnectionOptions,
  type XhrConnectionOptions,
  type InferChatMessages,
  type GenerationClientState,
  type ImageGenerateInput,
  type AudioGenerateInput,
  type SpeechGenerateInput,
  type TranscriptionGenerateInput,
  type SummarizeGenerateInput,
  type VideoGenerateInput,
  type VideoGenerateResult,
  type VideoStatusInfo,
} from '@tanstack/ai-client'
