export { useChat } from './use-chat'
export { useRealtimeChat } from './use-realtime-chat'
export { useMcpAppBridge } from './use-mcp-app-bridge'
export type { UseMcpAppBridgeOptions } from './use-mcp-app-bridge'
export type {
  DeepPartial,
  UseChatOptions,
  UseChatReturn,
  UIMessage,
  ChatRequestBody,
  QueuedMessage,
  SendMessageOptions,
  WhenBusy,
  QueueConfig,
  QueueStrategy,
  QueueOption,
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

export { useAudioRecorder } from './use-audio-recorder'
export type {
  UseAudioRecorderOptions,
  UseAudioRecorderReturn,
} from './use-audio-recorder'

// Re-export from ai-client for convenience
export {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
  createChatClientOptions,
  createMcpAppBridge,
  type McpAppBridge,
  type CreateMcpAppBridgeOptions,
  type ChatFetcher,
  type ChatFetcherInput,
  type ChatFetcherOptions,
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
