// Chat
export { injectChat } from './inject-chat'
export { injectByok } from './inject-byok'

// WebMCP Tools
export {
  injectPageWebMCPTools,
  injectRegisterWebMCPTools,
  injectWebMCPTools,
} from './inject-web-mcp-tools'
export type {
  InjectPageWebMCPToolsOptions,
  InjectRegisterWebMCPToolsOptions,
  InjectWebMCPToolsOptions,
} from './inject-web-mcp-tools'

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
export type {
  InjectAudioRecorderOptions,
  InjectAudioRecorderResult,
} from './inject-audio-recorder'

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
  QueueConfig,
  QueuedMessage,
  QueueOption,
  QueueStrategy,
  SendMessageOptions,
  WhenBusy,
  ReactiveOption,
} from './types'

// Re-export from @tanstack/ai-client for convenience
export {
  AudioRecorder,
  ChatClient,
  InterruptManager,
  RealtimeClient,
  GenerationClient,
  VideoGenerationClient,
  GENERATION_EVENTS,
  reconstructImageResult,
  reconstructAudioResult,
  reconstructSpeechResult,
  reconstructTranscriptionResult,
  reconstructSummarizeResult,
  UnsupportedResponseStreamError,
  createAIDevtoolsGenerationPreview,
  StreamTruncatedError,
  DurableStreamIncompleteError,
  StreamReconnectLimitError,
  uiMessageToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
  convertMessagesToModelMessages,
  normalizeToUIMessage,
  generateMessageId,
  StreamProcessor,
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
  parsePartialJSON,
  PartialJSONParser,
  defaultJSONParser,
  registerWebMCPTools,
  getWebMCPTools,
  subscribeWebMCPTools,
  type GetWebMCPToolsOptions,
  type SubscribeWebMCPToolsOptions,
  type WebMCPPageTool,
  clientTools,
  createMcpAppBridge,
  type McpAppBridge,
  type CreateMcpAppBridgeOptions,
  fetchServerSentEvents,
  localStoragePersistence,
  sessionStoragePersistence,
  indexedDBPersistence,
  StorageUnavailableError,
  type ChatClientPersistence,
  type ChatPersistedState,
  type ChatPersistenceOption,
  type ChatStorageAdapter,
  type WebStoragePersistenceOptions,
  type IndexedDBPersistenceOptions,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
  webSocket,
  createChatClientOptions,
  type ConnectionAdapter,
  type ConnectConnectionAdapter,
  type SubscribeConnectionAdapter,
  type RunAgentInputContext,
  type FetchConnectionOptions,
  type XhrConnectionOptions,
  type WebSocketConnectionOptions,
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
