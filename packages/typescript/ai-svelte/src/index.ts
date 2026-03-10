export { createChat } from './create-chat.svelte'
export type {
  CreateChatOptions,
  CreateChatReturn,
  UIMessage,
  ChatRequestBody,
} from './types'

// Generation hooks
export { createGeneration } from './create-generation.svelte'
export type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.svelte'

export { createGenerateImage } from './create-generate-image.svelte'
export type {
  CreateGenerateImageOptions,
  CreateGenerateImageReturn,
} from './create-generate-image.svelte'

export { createGenerateSpeech } from './create-generate-speech.svelte'
export type {
  CreateGenerateSpeechOptions,
  CreateGenerateSpeechReturn,
} from './create-generate-speech.svelte'

export { createTranscription } from './create-transcription.svelte'
export type {
  CreateTranscriptionOptions,
  CreateTranscriptionReturn,
} from './create-transcription.svelte'

export { createSummarize } from './create-summarize.svelte'
export type {
  CreateSummarizeOptions,
  CreateSummarizeReturn,
} from './create-summarize.svelte'

export { createGenerateVideo } from './create-generate-video.svelte'
export type {
  CreateGenerateVideoOptions,
  CreateGenerateVideoReturn,
} from './create-generate-video.svelte'

// Re-export from ai-client for convenience
export {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  createChatClientOptions,
  clientTools,
  type ConnectionAdapter,
  type FetchConnectionOptions,
  type InferChatMessages,
  type GenerationClientState,
  type ImageGenerateInput,
  type SpeechGenerateInput,
  type TranscriptionGenerateInput,
  type SummarizeGenerateInput,
  type VideoGenerateInput,
  type VideoGenerateResult,
  type VideoStatusInfo,
} from '@tanstack/ai-client'
