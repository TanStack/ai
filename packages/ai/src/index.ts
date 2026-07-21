// Activity functions - individual exports for each activity
export {
  chat,
  summarize,
  generateImage,
  generateAudio,
  generateVideo,
  getVideoJobStatus,
  generateSpeech,
  generateTranscription,
} from './activities/index'

// Create options functions - for pre-defining typed configurations
export { createChatOptions } from './activities/chat/index'
export { createSummarizeOptions } from './activities/summarize/index'
export { createImageOptions } from './activities/generateImage/index'
export { createAudioOptions } from './activities/generateAudio/index'
export { createVideoOptions } from './activities/generateVideo/index'
export { createSpeechOptions } from './activities/generateSpeech/index'
export { createTranscriptionOptions } from './activities/generateTranscription/index'

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
} from './activities/index'

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
  InterruptResumeValidationError,
  interruptItemError,
  readUnopenedInterruptBinding,
  validateInterruptResumeBatch,
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

// Schema conversion (Standard JSON Schema compliant)
export {
  convertSchemaToJsonSchema,
  isStandardSchema,
  parseWithStandardSchema,
  validateWithStandardSchema,
  StandardSchemaValidationError,
} from './activities/chat/tools/schema-converter'
export {
  JsonSchemaCompilationError,
  compileJsonSchema202012,
  type JsonSchemaValidationIssue,
} from './activities/chat/tools/json-schema-validator'

// Stream utilities
export {
  streamToText,
  toServerSentEventsStream,
  toServerSentEventsResponse,
  resumeServerSentEventsResponse,
  toHttpStream,
  toHttpResponse,
  resumeHttpResponse,
} from './stream-to-response'

// Delivery durability (transport layer)
export { memoryStream } from './stream-durability'
export type { MemoryStreamOptions, StreamDurability } from './stream-durability'

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
  maxToolCalls,
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
} from './activities/chat/middleware/index'

export * from './interrupts'

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

export {
  firstSentence,
  renderLazyCatalogEntry,
} from './activities/chat/tools/lazy-tools'

// Usage utilities
export { buildBaseUsage, type BaseUsageInput } from './utilities/usage'

// Media-generation prompt resolution (used by image / video adapters)
export { resolveMediaPrompt } from './utilities/media-prompt'
export type { ResolvedMediaPrompt } from './utilities/media-prompt'

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
