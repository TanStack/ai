export { createChat } from './create-chat.ts'
export { createByok } from './create-byok.ts'
export { createRealtimeChat } from './create-realtime-chat.ts'
export { createMcpAppBridge } from './create-mcp-app-bridge.ts'
export type { CreateMcpAppBridgeOptions } from './create-mcp-app-bridge.ts'
export type {
  DeepPartial,
  CreateChatOptions,
  CreateChatReturn,
  UIMessage,
  ChatRequestBody,
  QueuedMessage,
  SendMessageOptions,
  WhenBusy,
  QueueConfig,
  QueueStrategy,
  QueueOption,
} from './types.ts'
export type {
  CreateRealtimeChatOptions,
  CreateRealtimeChatReturn,
} from './realtime-types.ts'

export { createGeneration } from './create-generation.ts'
export type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.ts'
export { createGenerateImage } from './create-generate-image.ts'
export type {
  CreateGenerateImageOptions,
  CreateGenerateImageReturn,
} from './create-generate-image.ts'
export { createGenerateAudio } from './create-generate-audio.ts'
export type {
  CreateGenerateAudioOptions,
  CreateGenerateAudioReturn,
} from './create-generate-audio.ts'
export { createGenerateSpeech } from './create-generate-speech.ts'
export type {
  CreateGenerateSpeechOptions,
  CreateGenerateSpeechReturn,
} from './create-generate-speech.ts'
export { createTranscription } from './create-transcription.ts'
export type {
  CreateTranscriptionOptions,
  CreateTranscriptionReturn,
} from './create-transcription.ts'
export { createSummarize } from './create-summarize.ts'
export type {
  CreateSummarizeOptions,
  CreateSummarizeReturn,
} from './create-summarize.ts'
export { createGenerateVideo } from './create-generate-video.ts'
export type {
  CreateGenerateVideoOptions,
  CreateGenerateVideoReturn,
} from './create-generate-video.ts'
export { createAudioRecorder } from './create-audio-recorder.ts'
export type { CreateAudioRecorderOptions } from './create-audio-recorder.ts'

// Re-export from ai-client for convenience (mirror octane index.ts).
// createMcpAppBridge / CreateMcpAppBridgeOptions come from ./create-mcp-app-bridge.
export {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
  createChatClientOptions,
  type McpAppBridge,
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
