export { useChat } from './use-chat'
export { useRealtimeChat } from './use-realtime-chat'
export type {
  UseChatOptions,
  UseChatReturn,
  UIMessage,
  ChatRequestBody,
} from './types'
export type {
  UseRealtimeChatOptions,
  UseRealtimeChatReturn,
} from './realtime-types'

// Generation hooks
export { useGeneration } from './use-generation'
export type {
  UseGenerationOptions,
  UseGenerationReturn,
} from './use-generation'

export { useGenerateImage } from './use-generate-image'
export type {
  UseGenerateImageOptions,
  UseGenerateImageReturn,
} from './use-generate-image'

export { useGenerateAudio } from './use-generate-audio'
export type {
  UseGenerateAudioOptions,
  UseGenerateAudioReturn,
} from './use-generate-audio'

export { useGenerateSpeech } from './use-generate-speech'
export type {
  UseGenerateSpeechOptions,
  UseGenerateSpeechReturn,
} from './use-generate-speech'

export { useTranscription } from './use-transcription'
export type {
  UseTranscriptionOptions,
  UseTranscriptionReturn,
} from './use-transcription'

export { useSummarize } from './use-summarize'
export type { UseSummarizeOptions, UseSummarizeReturn } from './use-summarize'

export { useGenerateVideo } from './use-generate-video'
export type {
  UseGenerateVideoOptions,
  UseGenerateVideoReturn,
} from './use-generate-video'

// Re-export from ai-client for convenience
export {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  createChatClientOptions,
  type ConnectionAdapter,
  type FetchConnectionOptions,
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
