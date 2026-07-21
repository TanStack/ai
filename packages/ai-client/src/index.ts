export { AudioRecorder } from './audio-recorder'
export type {
  AudioRecorderOptions,
  AudioRecorderState,
  AudioRecording,
  InferAudioRecordingOutput,
} from './audio-recorder'
export { ChatClient } from './chat-client'
export { InterruptManager } from './interrupt-manager'
export type {
  InterruptManagerHydration,
  InterruptManagerOptions,
  InterruptManagerSubmission,
} from './interrupt-manager'
export { createMcpAppBridge } from './mcp-app-bridge'
export type { McpAppBridge, CreateMcpAppBridgeOptions } from './mcp-app-bridge'
export { RealtimeClient } from './realtime-client'
export { GenerationClient } from './generation-client'
export { VideoGenerationClient } from './video-generation-client'
export type {
  // Core message types (re-exported from @tanstack/ai via types.ts)
  UIMessage,
  MessagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ThinkingPart,
  StructuredOutputPart,
  // Client configuration types
  ChatStorageAdapter,
  ChatClientPersistence,
  ChatServerPersistence,
  ChatPersistenceOptions,
  ChatClientOptions,
  ChatPendingInterrupt,
  BoundInterruptBase,
  BoundInterrupts,
  ChatInterrupt,
  ChatInterruptState,
  GenericAGUIInterrupt,
  InterruptItemStatus,
  ToolApprovalInterrupt,
  ClientContextOptionFromTools,
  ChatResumeState,
  ChatResumeSnapshot,
  ChatResumeSnapshotV1,
  ChatResumeSnapshotV2,
  ChatRequestBody,
  InferChatMessages,
  InferredClientContext,
  ChatClientState,
  ConnectionStatus,
  ChatFetcher,
  ChatFetcherInput,
  ChatFetcherOptions,
  ChatTransport,
  DistributedOmit,
  MultimodalContent,
  QueuedMessage,
  WhenBusy,
  QueueBusyReason,
  QueueConfig,
  QueueStrategy,
  QueueOption,
  SendMessageOptions,
} from './types'
export {
  StorageUnavailableError,
  indexedDBPersistence,
  localStoragePersistence,
  sessionStoragePersistence,
} from './storage-adapters'
export type {
  IndexedDBPersistenceOptions,
  JsonPrimitive,
  JsonValue,
  StorageCodec,
  WebStoragePersistenceOptions,
} from './storage-adapters'
// Generation client types
export type {
  InferGenerationOutput,
  InferGenerationOutputFromReturn,
  GenerationClientState,
  GenerationResumeState,
  GenerationResumeStatus,
  GenerationResumeSnapshot,
  GenerationPendingArtifact,
  GenerationResultSnapshot,
  GenerationErrorSnapshot,
  GenerationEventSnapshot,
  GenerationServerPersistence,
  GenerationPersistenceOptions,
  GenerationClientOptions,
  GenerationFetcher,
  GenerationFetcherOptions,
  GenerationTransport,
  VideoGenerationClientOptions,
  VideoStatusInfo,
  VideoGenerateResult,
  ImageGenerateInput,
  AudioGenerateInput,
  SpeechGenerateInput,
  TranscriptionGenerateInput,
  SummarizeGenerateInput,
  VideoGenerateInput,
} from './generation-types'
export {
  GENERATION_EVENTS,
  updateGenerationResumeSnapshot,
} from './generation-types'
export { UnsupportedResponseStreamError } from './response-stream'
export { clientTools, createChatClientOptions } from './types'
export {
  createAIDevtoolsGenerationPreview,
  type AIDevtoolsClientMetadata,
  type AIDevtoolsDisplayOptions,
  type AIDevtoolsGenerationMediaItem,
  type AIDevtoolsGenerationPreview,
  type AIDevtoolsGenerationProgress,
  type AIDevtoolsGenerationVideoJob,
} from './devtools'
export type {
  ExtractToolNames,
  ExtractToolInput,
  ExtractToolOutput,
} from './tool-types'
export type {
  AnyClientTool,
  Interrupt,
  PersistedArtifactActivity,
  PersistedArtifactRef,
  PersistedArtifactRole,
  RunAgentResumeItem,
  RunFinishedOutcome,
} from '@tanstack/ai/client'
export type {
  RealtimeAdapter,
  RealtimeConnection,
  RealtimeClientOptions,
  RealtimeClientState,
  RealtimeStateChangeCallback,
} from './realtime-types'
export {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
  StreamTruncatedError,
  DurableStreamIncompleteError,
  StreamReconnectLimitError,
  type ConnectConnectionAdapter,
  type ConnectionAdapter,
  type FetchConnectionOptions,
  type ReconnectOptions,
  type ResumableConnectConnectionAdapter,
  type RunAgentInputContext,
  type SubscribeConnectionAdapter,
  type XhrConnectionOptions,
} from './connection-adapters'

// Re-export message converters from @tanstack/ai
export {
  uiMessageToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
  convertMessagesToModelMessages,
  normalizeToUIMessage,
  generateMessageId,
} from '@tanstack/ai/client'

// Re-export stream processing from @tanstack/ai (shared implementation)
export {
  StreamProcessor,
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
  parsePartialJSON,
  PartialJSONParser,
  defaultJSONParser,
  type ChunkStrategy,
  type StreamProcessorOptions,
  type StreamProcessorEvents,
  type InternalToolCallState,
  type ToolCallState,
  type ToolResultState,
  type JSONParser,
  type ChunkRecording,
  type ProcessorResult,
  type ProcessorState,
} from '@tanstack/ai/client'
