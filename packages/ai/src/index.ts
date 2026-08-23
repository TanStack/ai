// Activity functions - individual exports for each activity
export {
  chat,
  summarize,
  rerank,
  generateImage,
  generateAudio,
  generateVideo,
  getVideoJobStatus,
  generateSpeech,
  generateTranscription,
  embed,
} from './activities/index'

// Create options functions - for pre-defining typed configurations
export { createChatOptions } from './activities/chat/index'
export { createSummarizeOptions } from './activities/summarize/index'
export { createRerankOptions } from './activities/rerank/index'
export { createImageOptions } from './activities/generateImage/index'
export { createAudioOptions } from './activities/generateAudio/index'
export { createVideoOptions } from './activities/generateVideo/index'
export { createSpeechOptions } from './activities/generateSpeech/index'
export { createTranscriptionOptions } from './activities/generateTranscription/index'
export { createEmbedOptions } from './activities/embed/index'

// Re-export types
export type {
  AIAdapter,
  ImageAdapter,
  AnyImageAdapter,
  TextAdapter,
  AnyTextAdapter,
  AnySummarizeAdapter,
  SummarizeAdapter,
  AnyAudioAdapter,
  AudioAdapter,
  AnyTTSAdapter,
  TTSAdapter,
  AnyTranscriptionAdapter,
  TranscriptionAdapter,
  AnyVideoAdapter,
  VideoAdapter,
  AnyEmbeddingAdapter,
  EmbeddingAdapter,
  AnyRerankAdapter,
  RerankAdapter,
} from './activities/index'

// Rerank adapter base + types
export { BaseRerankAdapter } from './activities/rerank/adapter'

// Tool definition
export {
  toolDefinition,
  type ToolDefinition,
  type ToolDefinitionInstance,
  type ToolDefinitionConfig,
  type ServerTool,
  type AnyServerTool,
  type ClientTool,
  type AnyClientTool,
  type InferToolName,
  type InferToolInput,
  type InferToolOutput,
  type ApprovalCapabilityOf,
  type ApprovalSchemaConfig,
  type ApprovalSchemaOf,
  type InputSchemaOf,
  type OutputSchemaOf,
  type NoSchema,
} from './activities/chat/tools/tool-definition'
export {
  hashSchemaInput,
  normalizeApprovalSchema,
  type NormalizedApprovalSchema,
  type NormalizedSchemaInput,
} from './activities/chat/tools/approval-schema'
export {
  canonicalInterruptJson,
  cloneAndDeepFreezeJson,
  digestInterruptJson,
} from './interrupt-serialization'
export {
  INTERRUPT_BINDING_METADATA_KEY,
  InterruptResumeValidationError,
  interruptItemError,
  readInterruptBinding,
  readUnopenedInterruptBinding,
  validateInterruptResumeBatch,
  withInterruptBinding,
  withoutInterruptBinding,
  type PendingInterruptResumeRecord,
  type ValidateInterruptResumeBatchInput,
  type ValidatedInterruptResumeBatch,
} from './interrupt-resume'

// MCP chat option types
export type {
  MCPToolSource,
  ChatMCPOptions,
  MCPConnectionPolicy,
} from './activities/chat/mcp/types'

// MCP error classes (value exports — usable with instanceof)
export { MCPDuplicateToolNameError } from './activities/chat/mcp/manager'
export { DuplicateToolNameError } from './activities/chat/tools/unique-tool-names'
export { SkillLimitError } from './utilities/errors'
export type { SkillLimitErrorInit } from './utilities/errors'

// Schema conversion (Standard JSON Schema compliant)
export {
  convertSchemaToJsonSchema,
  isStandardSchema,
  parseWithStandardSchema,
  validateWithStandardSchema,
  StandardSchemaValidationError,
} from './activities/chat/tools/schema-converter'

// Stream utilities
export {
  streamToText,
  toServerSentEventsStream,
  toServerSentEventsResponse,
  resumeServerSentEventsResponse,
  toHttpStream,
  toHttpResponse,
  resumeHttpResponse,
  resolveResumeRunId,
  RUN_ACCEPTED_EVENT,
} from './stream-to-response'
// `ResumeResponseOptions` is deliberately not exported (it is a local type
// alias), so the driver block reaches consumers as its own named type.
export type { RunDriverOptions } from './stream-to-response'

// Delivery durability (transport layer)
export { memoryStream, replayRunStream } from './stream-durability'
export type {
  MemoryStreamInit,
  MemoryStreamOptions,
  StreamDurability,
  UpsertableStreamDurability,
} from './stream-durability'

// WebSocket transport utilities
export {
  toWebSocketStream,
  toWebSocketResponse,
  resumeWebSocketStream,
  resumeWebSocketResponse,
  encodeWsFrame,
  decodeWsFrame,
} from './stream-to-websocket'
export type {
  WebSocketLike,
  WsRunContext,
  WebSocketStreamInit,
  InboundFrame,
} from './stream-to-websocket'

// Tool call management
export { ToolCallManager } from './activities/chat/tools/tool-calls'

// Lazy tool discovery (name of the synthetic discovery tool, for custom
// message-compaction logic that needs to reference it)
export { DISCOVERY_TOOL_NAME } from './activities/chat/tools/lazy-tool-manager'

// Provider tool type
export type { ProviderTool } from './tools/provider-tool'
export { brandProviderTool } from './tools/provider-tool'

// Agent loop strategies
export {
  maxIterations,
  untilFinishReason,
  combineStrategies,
} from './activities/chat/agent-loop-strategies'

// Tool registry
export {
  createToolRegistry,
  createFrozenRegistry,
  type ToolRegistry,
} from './tool-registry'

// Chat middleware
export type {
  ChatMiddleware,
  ChatMiddlewareContext,
  ChatMiddlewarePhase,
  ChatMiddlewareConfig,
  ChatResumeToolState,
  ChatResumeGenericResolution,
  StructuredOutputMiddlewareConfig,
  ToolCallHookContext,
  BeforeToolCallDecision,
  AfterToolCallInfo,
  IterationInfo,
  ToolPhaseCompleteInfo,
  UsageInfo,
  FinishInfo,
  AbortInfo,
  ErrorInfo,
  SandboxFileEvent,
  SandboxFileHookEvent,
  ChatSandboxHooks,
  InterruptBoundaryPhase,
  InterruptToolResume,
  InterruptResolutionCollection,
  GenericInterruptResolution,
  InterruptBoundaryResult,
  InterruptResolutionResult,
} from './activities/chat/middleware/index'

export {
  INTERRUPT_BOUNDARY_PHASES,
  INTERRUPT_TOOL_RESUMES,
} from './activities/chat/middleware/index'

// Interrupt protocol surface. Deliberately enumerated rather than
// `export *`: the interrupt object is the seam between AI-domain pauses and
// any future durable/workflow-owned approval model, so what we publish here is
// a commitment. Only the ephemeral contract this release actually implements
// is exported — no durable-recovery or persisted-state types, which would
// pre-decide a question the orchestration RFC still owns.
export {
  defineInterrupt,
  createInterruptBinding,
  INTERRUPT_PAYLOAD_METADATA_KEY,
} from './interrupt-definition'
export {
  INTERRUPT_CONTINUATION_METADATA_KEY,
  INTERRUPT_CONTINUATION_VERSION,
  genericInterruptContinuationFromDescriptor,
  readGenericInterruptContinuation,
  wrapGenericInterruptContinuation,
} from './generic-interrupt-continuation'
export type {
  GenericInterruptContinuation,
  GenericInterruptContinuationReadResult,
} from './generic-interrupt-continuation'
export type {
  InterruptDefinition,
  GenericInterruptRequest,
  InterruptDefinitionOptions,
  InterruptBindingDescriptor,
} from './interrupt-definition'

export {
  INTERRUPT_BINDING_VERSION,
  canonicalizeInterruptResolutions,
} from './interrupts'
export type {
  BatchInterruptError,
  BatchInterruptErrorCode,
  InterruptBinding,
  InterruptCorrelation,
  InterruptSubmissionError,
  ItemInterruptError,
  ItemInterruptErrorCode,
  ToolApprovalResolution,
  UnopenedInterruptBinding,
} from './interrupts'

// Base, activity-agnostic middleware. The observe-only superset that media
// activities accept via their `middleware` option; `ChatMiddleware` adds the
// chat-only hooks on top. Pure types only — the `otelMiddleware` value lives at
// `@tanstack/ai/middlewares/otel` so the root barrel never requires the
// optional `@opentelemetry/api` peer dependency.
export type {
  GenerationMiddleware,
  GenerationMiddlewareContext,
  GenerationActivity,
  GenerationUsageInfo,
  GenerationFinishInfo,
  GenerationAbortInfo,
  GenerationErrorInfo,
  AnyGenerationMiddleware,
  GenerationResultTransform,
  GenerationResultTransformContext,
} from './activities/middleware/index'
// Capability primitives + middleware builder
export {
  createCapability,
  defineChatMiddleware,
  createChatMiddleware,
} from './activities/chat/middleware/index'
export type {
  Capability,
  CapabilityHandle,
  CapabilityContext,
  CapabilityGetter,
  CapabilityProvider,
  DefinedChatMiddleware,
  AnyChatMiddleware,
} from './activities/chat/middleware/index'
// Locks are a distributed-mutex primitive — coordination, not chat state — and
// live behind their own subpath: `@tanstack/ai/locks` (see ./locks.ts).

// Run lifecycle types — shared by @tanstack/ai-persistence (the `runs` store)
// and @tanstack/ai-sandbox (the run driver), so one record describes one run.
export {
  isRunStatus,
  isTerminalRunStatus,
  defineRunStore,
  InMemoryRunStore,
} from './activities/chat/middleware/index'
export type {
  RunStatus,
  TerminalRunStatus,
  RunRecord,
  RunError,
  RunStore,
} from './activities/chat/middleware/index'
// The detachable-run marker is a coordination fact `@tanstack/ai-sandbox`
// provides and `@tanstack/ai-persistence` reads, so core owns it and neither
// consumer package has to depend on the other.
export {
  DetachableRunCapability,
  getDetachableRun,
  provideDetachableRun,
} from './activities/chat/middleware/run-store'
// Its past-tense counterpart: the abort-path verdict that this run WAS detached.
// `@tanstack/ai-sandbox`'s `onAbort` publishes it on its detach branch, and core's
// durable delivery sink reads it to keep a detached run's log open for takeover.
export {
  RunDetachedCapability,
  getRunDetached,
  provideRunDetached,
} from './activities/chat/middleware/run-store'
// Out-of-band run cancellation: intent is recorded (durable) or carried on the
// abort reason (in-process), never inferred from a disconnect.
export {
  RUN_CANCEL_REASON,
  isCancelRequestedReason,
  requestRunCancel,
  wasCancelRequested,
} from './activities/chat/cancel'

// Well-known AG-UI CUSTOM event catalog (agent activity rides on CUSTOM events)
export { CUSTOM_EVENT, isCustomEvent } from './custom-events'
export type {
  WellKnownCustomEventName,
  FileChangedPayload,
  ProcessOutputPayload,
  PortOpenedPayload,
  ApprovalRequestedPayload,
  ApprovalResolvedPayload,
  ArtifactCreatedPayload,
  SandboxLifecyclePayload,
} from './custom-events'

// All types
export * from './types'

// Shared identity/isolation scope for the persistence + memory subsystems
export type { Scope } from './scope'

export {
  firstSentence,
  renderLazyCatalogEntry,
} from './activities/chat/tools/lazy-tools'

// Usage utilities
export { buildBaseUsage, type BaseUsageInput } from './utilities/usage'

// Media-generation prompt resolution (used by image / video adapters)
export { resolveMediaPrompt } from './utilities/media-prompt'
export type { ResolvedMediaPrompt } from './utilities/media-prompt'

// Embedding input resolution (used by embedding adapters)
export {
  resolveEmbeddingInput,
  requireTextOnlyEmbeddingInput,
  countEmbeddingInputModalities,
} from './utilities/embedding-input'
export type { ResolvedEmbeddingItem } from './utilities/embedding-input'

// System prompts (type + normaliser used by adapters)
export type { SystemPrompt, NormalizedSystemPrompt } from './system-prompts'
export { normalizeSystemPrompts } from './system-prompts'

// Utility functions
export { detectImageMimeType } from './utils'

// Realtime
export { realtimeToken, createRealtimeEventEmitter } from './realtime/index'
export type {
  RealtimeToken,
  RealtimeTokenAdapter,
  RealtimeTokenOptions,
  RealtimeSessionConfig,
  RealtimeToolConfig,
  VADConfig,
  RealtimeMessage,
  RealtimeMessagePart,
  RealtimeTextPart,
  RealtimeAudioPart,
  RealtimeToolCallPart,
  RealtimeToolResultPart,
  RealtimeImagePart,
  RealtimeStatus,
  RealtimeMode,
  AudioVisualization,
  RealtimeEvent,
  RealtimeEventPayloads,
  RealtimeEventHandler,
  RealtimeErrorCode,
  RealtimeError,
  RealtimeAdapter,
  RealtimeConnection,
} from './realtime/index'

// Message converters
export {
  convertMessagesToModelMessages,
  generateMessageId,
  uiMessageToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
  normalizeToUIMessage,
} from './activities/chat/messages'

// Stream processing (unified for server and client)
export {
  StreamProcessor,
  createReplayStream,
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
  PartialJSONParser,
  defaultJSONParser,
  parsePartialJSON,
} from './activities/chat/stream/index'
export type {
  ChunkStrategy,
  ChunkRecording,
  InternalToolCallState,
  ProcessorResult,
  ProcessorState,
  StreamProcessorEvents,
  StreamProcessorOptions,
  ToolCallState,
  ToolResultState,
  JSONParser,
} from './activities/chat/stream/index'

// Chat utilities
export {
  chatParamsFromRequest,
  chatParamsFromRequestBody,
  mergeAgentTools,
} from './utilities/chat-params'
export type {
  ClientToolDeclaration,
  MergedAgentTools,
} from './utilities/chat-params'

export { generationParamsFromBody, generationParamsFromRequest } from './client'

// AG-UI wire serialization (used internally by @tanstack/ai-client)
export { uiMessagesToWire } from './utilities/ag-ui-wire'
export { mergeMetadata, withTanstackMetadata } from './utilities/merge-metadata'
export { fromSpecTokenUsage, toSpecTokenUsage } from './utilities/ag-ui-usage'
export type { SpecTokenUsage } from './utilities/ag-ui-usage'
export { normalizeStreamChunk } from './utilities/normalize-stream-chunk'
export type { AdapterYieldChunk } from './utilities/adapter-yield-chunk'
export { getChunkRunId, getChunkThreadId } from './utilities/chunk-ids'
export type { WireMessage } from './utilities/ag-ui-wire'
export {
  isContentPart,
  isContentPartArray,
  normalizeToolResult,
} from './utilities/tool-result'

export {
  getProviderExecutedMetadata,
  isProviderExecutedToolCall,
} from './utilities/provider-executed'

// Adapter extension utilities
export { createModel, extendAdapter } from './extend-adapter'
export type { ExtendedModelDef, ModelCapabilities } from './extend-adapter'

// Logger
export type {
  Logger,
  DebugCategories,
  DebugConfig,
  DebugOption,
} from './logger/types'
export { ConsoleLogger } from './logger/console-logger'
