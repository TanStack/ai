import type { CommonOptions } from './core/chat-common-options'
import type { z } from 'zod'
import type { ToolCallState, ToolResultState } from './stream/types'

/**
 * JSON Schema type for defining tool input/output schemas as raw JSON Schema objects.
 * This allows tools to be defined without Zod when you have JSON Schema definitions available.
 */
export interface JSONSchema {
  type?: string | Array<string>
  properties?: Record<string, JSONSchema>
  items?: JSONSchema | Array<JSONSchema>
  required?: Array<string>
  enum?: Array<any>
  const?: any
  description?: string
  default?: any
  $ref?: string
  $defs?: Record<string, JSONSchema>
  definitions?: Record<string, JSONSchema>
  allOf?: Array<JSONSchema>
  anyOf?: Array<JSONSchema>
  oneOf?: Array<JSONSchema>
  not?: JSONSchema
  if?: JSONSchema
  then?: JSONSchema
  else?: JSONSchema
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  additionalProperties?: boolean | JSONSchema
  additionalItems?: boolean | JSONSchema
  patternProperties?: Record<string, JSONSchema>
  propertyNames?: JSONSchema
  minProperties?: number
  maxProperties?: number
  title?: string
  examples?: Array<any>
  [key: string]: any // Allow additional properties for extensibility
}

/**
 * Union type for schema input - can be either a Zod schema or a JSONSchema object.
 */
export type SchemaInput = z.ZodType | JSONSchema

/**
 * Infer the TypeScript type from a schema.
 * For Zod schemas, uses z.infer to get the proper type.
 * For JSONSchema, returns `any` since we can't infer types from JSON Schema at compile time.
 */
export type InferSchemaType<T> = T extends z.ZodType ? z.infer<T> : any

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

// ============================================================================
// Multimodal Content Types
// ============================================================================

/**
 * Supported input modality types for multimodal content.
 * - 'text': Plain text content
 * - 'image': Image content (base64 or URL)
 * - 'audio': Audio content (base64 or URL)
 * - 'video': Video content (base64 or URL)
 * - 'document': Document content like PDFs (base64 or URL)
 */
export type Modality = 'text' | 'image' | 'audio' | 'video' | 'document'

/**
 * Source specification for multimodal content.
 * Supports both inline data (base64) and URL-based content.
 */
export interface ContentPartSource {
  /**
   * The type of source:
   * - 'data': Inline data (typically base64 encoded)
   * - 'url': URL reference to the content
   */
  type: 'data' | 'url'
  /**
   * The actual content value:
   * - For 'data': base64-encoded string
   * - For 'url': HTTP(S) URL or data URI
   */
  value: string
}

/**
 * Image content part for multimodal messages.
 * @template TMetadata - Provider-specific metadata type (e.g., OpenAI's detail level)
 */
export interface ImagePart<TMetadata = unknown> {
  type: 'image'
  /** Source of the image content */
  source: ContentPartSource
  /** Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high') */
  metadata?: TMetadata
}

/**
 * Audio content part for multimodal messages.
 * @template TMetadata - Provider-specific metadata type
 */
export interface AudioPart<TMetadata = unknown> {
  type: 'audio'
  /** Source of the audio content */
  source: ContentPartSource
  /** Provider-specific metadata (e.g., format, sample rate) */
  metadata?: TMetadata
}

/**
 * Video content part for multimodal messages.
 * @template TMetadata - Provider-specific metadata type
 */
export interface VideoPart<TMetadata = unknown> {
  type: 'video'
  /** Source of the video content */
  source: ContentPartSource
  /** Provider-specific metadata (e.g., duration, resolution) */
  metadata?: TMetadata
}

/**
 * Document content part for multimodal messages (e.g., PDFs).
 * @template TMetadata - Provider-specific metadata type (e.g., Anthropic's media_type)
 */
export interface DocumentPart<TMetadata = unknown> {
  type: 'document'
  /** Source of the document content */
  source: ContentPartSource
  /** Provider-specific metadata (e.g., media_type for PDFs) */
  metadata?: TMetadata
}

/**
 * Union type for all multimodal content parts.
 * @template TImageMeta - Provider-specific image metadata type
 * @template TAudioMeta - Provider-specific audio metadata type
 * @template TVideoMeta - Provider-specific video metadata type
 * @template TDocumentMeta - Provider-specific document metadata type
 */
export type ContentPart<
  TImageMeta = unknown,
  TAudioMeta = unknown,
  TVideoMeta = unknown,
  TDocumentMeta = unknown,
  TTextMeta = unknown,
> =
  | TextPart<TTextMeta>
  | ImagePart<TImageMeta>
  | AudioPart<TAudioMeta>
  | VideoPart<TVideoMeta>
  | DocumentPart<TDocumentMeta>

/**
 * Helper type to filter ContentPart union to only include specific modalities.
 * Used to constrain message content based on model capabilities.
 */
export type ContentPartForModalities<
  TModalities extends Modality,
  TImageMeta = unknown,
  TAudioMeta = unknown,
  TVideoMeta = unknown,
  TDocumentMeta = unknown,
  TTextMeta = unknown,
> = Extract<
  ContentPart<TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta, TTextMeta>,
  { type: TModalities }
>

/**
 * Helper type to convert a readonly array of modalities to a union type.
 * e.g., readonly ['text', 'image'] -> 'text' | 'image'
 */
export type ModalitiesArrayToUnion<T extends ReadonlyArray<Modality>> =
  T[number]

/**
 * Type for message content constrained by supported modalities.
 * When modalities is ['text', 'image'], only TextPart and ImagePart are allowed in the array.
 */
export type ConstrainedContent<
  TModalities extends ReadonlyArray<Modality>,
  TImageMeta = unknown,
  TAudioMeta = unknown,
  TVideoMeta = unknown,
  TDocumentMeta = unknown,
  TTextMeta = unknown,
> =
  | string
  | null
  | Array<
      ContentPartForModalities<
        ModalitiesArrayToUnion<TModalities>,
        TImageMeta,
        TAudioMeta,
        TVideoMeta,
        TDocumentMeta,
        TTextMeta
      >
    >

export interface ModelMessage<
  TContent extends string | null | Array<ContentPart> =
    | string
    | null
    | Array<ContentPart>,
> {
  role: 'user' | 'assistant' | 'tool'
  content: TContent
  name?: string
  toolCalls?: Array<ToolCall>
  toolCallId?: string
}

/**
 * Message parts - building blocks of UIMessage
 */
export interface TextPart<TMetadata = unknown> {
  type: 'text'
  content: string
  metadata?: TMetadata
}

export interface ToolCallPart {
  type: 'tool-call'
  id: string
  name: string
  arguments: string // JSON string (may be incomplete)
  state: ToolCallState
  /** Approval metadata if tool requires user approval */
  approval?: {
    id: string // Unique approval ID
    needsApproval: boolean // Always true if present
    approved?: boolean // User's decision (undefined until responded)
  }
  /** Tool execution output (for client tools or after approval) */
  output?: any
}

export interface ToolResultPart {
  type: 'tool-result'
  toolCallId: string
  content: string
  state: ToolResultState
  error?: string // Error message if state is "error"
}

export interface ThinkingPart {
  type: 'thinking'
  content: string
}

export type MessagePart =
  | TextPart
  | ToolCallPart
  | ToolResultPart
  | ThinkingPart

/**
 * UIMessage - Domain-specific message format optimized for building chat UIs
 * Contains parts that can be text, tool calls, or tool results
 */
export interface UIMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: Array<MessagePart>
  createdAt?: Date
}
/**
 * A ModelMessage with content constrained to only allow content parts
 * matching the specified input modalities.
 */
export type ConstrainedModelMessage<
  TModalities extends ReadonlyArray<Modality>,
  TImageMeta = unknown,
  TAudioMeta = unknown,
  TVideoMeta = unknown,
  TDocumentMeta = unknown,
  TTextMeta = unknown,
> = Omit<ModelMessage, 'content'> & {
  content: ConstrainedContent<
    TModalities,
    TImageMeta,
    TAudioMeta,
    TVideoMeta,
    TDocumentMeta,
    TTextMeta
  >
}

/**
 * Tool/Function definition for function calling.
 *
 * Tools allow the model to interact with external systems, APIs, or perform computations.
 * The model will decide when to call tools based on the user's request and the tool descriptions.
 *
 * Tools can use either Zod schemas or JSON Schema objects for runtime validation and type safety.
 *
 * @see https://platform.openai.com/docs/guides/function-calling
 * @see https://docs.anthropic.com/claude/docs/tool-use
 */
export interface Tool<
  TInput extends SchemaInput = z.ZodType,
  TOutput extends SchemaInput = z.ZodType,
  TName extends string = string,
> {
  /**
   * Unique name of the tool (used by the model to call it).
   *
   * Should be descriptive and follow naming conventions (e.g., snake_case or camelCase).
   * Must be unique within the tools array.
   *
   * @example "get_weather", "search_database", "sendEmail"
   */
  name: TName

  /**
   * Clear description of what the tool does.
   *
   * This is crucial - the model uses this to decide when to call the tool.
   * Be specific about what the tool does, what parameters it needs, and what it returns.
   *
   * @example "Get the current weather in a given location. Returns temperature, conditions, and forecast."
   */
  description: string

  /**
   * Schema describing the tool's input parameters.
   *
   * Can be either a Zod schema or a JSON Schema object.
   * Defines the structure and types of arguments the tool accepts.
   * The model will generate arguments matching this schema.
   * Zod schemas are converted to JSON Schema for LLM providers.
   *
   * @see https://zod.dev/
   * @see https://json-schema.org/
   *
   * @example
   * // Using Zod schema
   * import { z } from 'zod';
   * z.object({
   *   location: z.string().describe("City name or coordinates"),
   *   unit: z.enum(["celsius", "fahrenheit"]).optional()
   * })
   *
   * @example
   * // Using JSON Schema
   * {
   *   type: 'object',
   *   properties: {
   *     location: { type: 'string', description: 'City name or coordinates' },
   *     unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
   *   },
   *   required: ['location']
   * }
   */
  inputSchema?: TInput

  /**
   * Optional schema for validating tool output.
   *
   * Can be either a Zod schema or a JSON Schema object.
   * If provided with a Zod schema, tool results will be validated against this schema before
   * being sent back to the model. This catches bugs in tool implementations
   * and ensures consistent output formatting.
   *
   * Note: This is client-side validation only - not sent to LLM providers.
   * Note: JSON Schema output validation is not performed at runtime.
   *
   * @example
   * z.object({
   *   temperature: z.number(),
   *   conditions: z.string(),
   *   forecast: z.array(z.string()).optional()
   * })
   */
  outputSchema?: TOutput

  /**
   * Optional function to execute when the model calls this tool.
   *
   * If provided, the SDK will automatically execute the function with the model's arguments
   * and feed the result back to the model. This enables autonomous tool use loops.
   *
   * Can return any value - will be automatically stringified if needed.
   *
   * @param args - The arguments parsed from the model's tool call (validated against inputSchema)
   * @returns Result to send back to the model (validated against outputSchema if provided)
   *
   * @example
   * execute: async (args) => {
   *   const weather = await fetchWeather(args.location);
   *   return weather; // Can return object or string
   * }
   */
  execute?: (args: any) => Promise<any> | any

  /** If true, tool execution requires user approval before running. Works with both server and client tools. */
  needsApproval?: boolean

  /** Additional metadata for adapters or custom extensions */
  metadata?: Record<string, any>
}

export interface ToolConfig {
  [key: string]: Tool
}

/**
 * Structured output format specification.
 *
 * Constrains the model's output to match a specific JSON structure.
 * Useful for extracting structured data, form filling, or ensuring consistent response formats.
 *
 * @see https://platform.openai.com/docs/guides/structured-outputs
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/structured-outputs
 *
 * @template TData - TypeScript type of the expected data structure (for type safety)
 */
export interface ResponseFormat<TData = any> {
  /**
   * Type of structured output.
   *
   * - "json_object": Forces the model to output valid JSON (any structure)
   * - "json_schema": Validates output against a provided JSON Schema (strict structure)
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-response_format
   */
  type: 'json_object' | 'json_schema'

  /**
   * JSON schema specification (required when type is "json_schema").
   *
   * Defines the exact structure the model's output must conform to.
   * OpenAI's structured outputs will guarantee the output matches this schema.
   */
  json_schema?: {
    /**
     * Unique name for the schema.
     *
     * Used to identify the schema in logs and debugging.
     * Should be descriptive (e.g., "user_profile", "search_results").
     */
    name: string

    /**
     * Optional description of what the schema represents.
     *
     * Helps document the purpose of this structured output.
     *
     * @example "User profile information including name, email, and preferences"
     */
    description?: string

    /**
     * JSON Schema definition for the expected output structure.
     *
     * Must be a valid JSON Schema (draft 2020-12 or compatible).
     * The model's output will be validated against this schema.
     *
     * @see https://json-schema.org/
     *
     * @example
     * {
     *   type: "object",
     *   properties: {
     *     name: { type: "string" },
     *     age: { type: "number" },
     *     email: { type: "string", format: "email" }
     *   },
     *   required: ["name", "email"],
     *   additionalProperties: false
     * }
     */
    schema: Record<string, any>

    /**
     * Whether to enforce strict schema validation.
     *
     * When true (recommended), the model guarantees output will match the schema exactly.
     * When false, the model will "best effort" match the schema.
     *
     * Default: true (for providers that support it)
     *
     * @see https://platform.openai.com/docs/guides/structured-outputs#strict-mode
     */
    strict?: boolean
  }

  /**
   * Type-only property to carry the inferred data type.
   *
   * This is never set at runtime - it only exists for TypeScript type inference.
   * Allows the SDK to know what type to expect when parsing the response.
   *
   * @internal
   */
  __data?: TData
}

/**
 * State passed to agent loop strategy for determining whether to continue
 */
export interface AgentLoopState {
  /** Current iteration count (0-indexed) */
  iterationCount: number
  /** Current messages array */
  messages: Array<ModelMessage>
  /** Finish reason from the last response */
  finishReason: string | null
}

/**
 * Strategy function that determines whether the agent loop should continue
 *
 * @param state - Current state of the agent loop
 * @returns true to continue looping, false to stop
 *
 * @example
 * ```typescript
 * // Continue for up to 5 iterations
 * const strategy: AgentLoopStrategy = ({ iterationCount }) => iterationCount < 5;
 * ```
 */
export type AgentLoopStrategy = (state: AgentLoopState) => boolean

/**
 * Options passed into the SDK and further piped to the AI provider.
 */
export interface ChatOptions<
  TModel extends string = string,
  TProviderOptionsSuperset extends Record<string, any> = Record<string, any>,
  TOutput extends ResponseFormat<any> | undefined = undefined,
  TProviderOptionsForModel = TProviderOptionsSuperset,
> {
  model: TModel
  messages: Array<ModelMessage>
  tools?: Array<Tool<any, any, any>>
  systemPrompts?: Array<string>
  agentLoopStrategy?: AgentLoopStrategy
  options?: CommonOptions
  providerOptions?: TProviderOptionsForModel
  request?: Request | RequestInit
  output?: TOutput
  /**
   * Conversation ID for correlating client and server-side devtools events.
   * When provided, server-side events will be linked to the client conversation in devtools.
   */
  conversationId?: string
  /**
   * AbortController for request cancellation.
   *
   * Allows you to cancel an in-progress request using an AbortController.
   * Useful for implementing timeouts or user-initiated cancellations.
   *
   * @example
   * const abortController = new AbortController();
   * setTimeout(() => abortController.abort(), 5000); // Cancel after 5 seconds
   * await chat({ ..., abortController });
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/AbortController
   */
  abortController?: AbortController
}

// ============================================================================
// AG-UI Protocol Event Types
// ============================================================================

/**
 * AG-UI Protocol event types.
 * Based on the AG-UI specification for agent-user interaction.
 * @see https://docs.ag-ui.com/concepts/events
 *
 * Includes legacy type aliases for backward compatibility during migration.
 */
export type EventType =
  // AG-UI Standard Events
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'RUN_ERROR'
  | 'TEXT_MESSAGE_START'
  | 'TEXT_MESSAGE_CONTENT'
  | 'TEXT_MESSAGE_END'
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_ARGS'
  | 'TOOL_CALL_END'
  | 'STEP_STARTED'
  | 'STEP_FINISHED'
  | 'STATE_SNAPSHOT'
  | 'STATE_DELTA'
  | 'CUSTOM'
  // Legacy types (deprecated, for backward compatibility)
  | 'content'
  | 'done'
  | 'error'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'approval-requested'
  | 'tool-input-available'

/**
 * Base structure for all AG-UI events.
 * Extends AG-UI spec with TanStack AI additions (model field).
 */
export interface BaseEvent {
  type: EventType
  timestamp: number
  /** TanStack AI addition: Model identifier for multi-model support */
  model?: string
  /** Original provider event for debugging/advanced use cases */
  rawEvent?: unknown
}

/**
 * Emitted when a run starts.
 */
export interface RunStartedEvent extends BaseEvent {
  type: 'RUN_STARTED'
  runId: string
  threadId?: string
}

/**
 * Emitted when a run completes successfully.
 */
export interface RunFinishedEvent extends BaseEvent {
  type: 'RUN_FINISHED'
  runId: string
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Emitted when an error occurs during a run.
 */
export interface RunErrorEvent extends BaseEvent {
  type: 'RUN_ERROR'
  runId?: string
  error: {
    message: string
    code?: string
  }
}

/**
 * Emitted when a text message starts.
 */
export interface TextMessageStartEvent extends BaseEvent {
  type: 'TEXT_MESSAGE_START'
  messageId: string
  role: 'assistant'
}

/**
 * Emitted when text content is generated (streaming tokens).
 */
export interface TextMessageContentEvent extends BaseEvent {
  type: 'TEXT_MESSAGE_CONTENT'
  messageId: string
  delta: string
  /** TanStack AI addition: Full accumulated content so far */
  content?: string
}

/**
 * Emitted when a text message completes.
 */
export interface TextMessageEndEvent extends BaseEvent {
  type: 'TEXT_MESSAGE_END'
  messageId: string
}

/**
 * Emitted when a tool call starts.
 */
export interface ToolCallStartEvent extends BaseEvent {
  type: 'TOOL_CALL_START'
  toolCallId: string
  toolName: string
  /** Index for parallel tool calls */
  index?: number
  /** Approval metadata if tool requires user approval */
  approval?: {
    id: string
    needsApproval: true
  }
}

/**
 * Emitted when tool call arguments are streaming.
 */
export interface ToolCallArgsEvent extends BaseEvent {
  type: 'TOOL_CALL_ARGS'
  toolCallId: string
  /** Incremental JSON arguments delta */
  delta: string
  /** Full accumulated arguments so far */
  args?: string
}

/**
 * Emitted when a tool call completes (with optional result).
 */
export interface ToolCallEndEvent extends BaseEvent {
  type: 'TOOL_CALL_END'
  toolCallId: string
  toolName: string
  /** Final parsed input arguments */
  input?: unknown
  /** Tool execution result (present when tool has executed) */
  result?: unknown
}

/**
 * Emitted when a reasoning/thinking step starts.
 */
export interface StepStartedEvent extends BaseEvent {
  type: 'STEP_STARTED'
  stepId: string
  stepType: 'thinking' | 'reasoning' | 'planning'
}

/**
 * Emitted when a reasoning/thinking step completes or streams content.
 */
export interface StepFinishedEvent extends BaseEvent {
  type: 'STEP_FINISHED'
  stepId: string
  /** Incremental thinking token */
  delta?: string
  /** Full accumulated thinking content */
  content: string
}

/**
 * Emitted for full state synchronization.
 */
export interface StateSnapshotEvent extends BaseEvent {
  type: 'STATE_SNAPSHOT'
  state: Record<string, unknown>
}

/**
 * Emitted for incremental state updates.
 */
export interface StateDeltaEvent extends BaseEvent {
  type: 'STATE_DELTA'
  delta: Array<{
    op: 'add' | 'remove' | 'replace'
    path: string
    value?: unknown
  }>
}

/**
 * Custom event for extensibility.
 * Used for features not covered by standard AG-UI events (e.g., approval flows).
 */
export interface CustomEvent extends BaseEvent {
  type: 'CUSTOM'
  name: string
  value: unknown
}

/**
 * Union type for all AG-UI events.
 * This is the primary type for streaming chat completions.
 * Includes legacy types for backward compatibility.
 */
export type StreamChunk =
  // AG-UI Standard Events
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | StepStartedEvent
  | StepFinishedEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | CustomEvent
  // Legacy types (deprecated)
  | ContentStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | ThinkingStreamChunk
  | ApprovalRequestedStreamChunk
  | ToolInputAvailableStreamChunk

// Legacy type aliases for transition (can be removed in future version)
export type StreamChunkType = EventType

// ============================================================================
// Legacy Chunk Type Aliases (Deprecated - for backward compatibility)
// ============================================================================
// These types provide backward compatibility during the transition to AG-UI.
// They map old chunk type names to the new AG-UI event types.
// These will be removed in a future major version.

/**
 * @deprecated Use TextMessageContentEvent instead
 */
export interface ContentStreamChunk {
  type: 'content'
  id: string
  model: string
  timestamp: number
  /** Incremental text delta */
  delta: string
  /** Full accumulated content so far */
  content: string
  /** Role of the message */
  role?: 'assistant'
}

/**
 * @deprecated Use RunFinishedEvent instead
 */
export interface DoneStreamChunk {
  type: 'done'
  id: string
  model: string
  timestamp: number
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * @deprecated Use RunErrorEvent instead
 */
export interface ErrorStreamChunk {
  type: 'error'
  id: string
  model: string
  timestamp: number
  error: string | { message: string; code?: string }
  code?: string
}

/**
 * @deprecated Use ToolCallStartEvent and ToolCallArgsEvent instead
 */
export interface ToolCallStreamChunk {
  type: 'tool_call'
  id: string
  model: string
  timestamp: number
  toolCall: ToolCall
  index: number
  approval?: {
    id: string
    needsApproval: true
  }
}

/**
 * @deprecated Use ToolCallEndEvent instead
 */
export interface ToolResultStreamChunk {
  type: 'tool_result'
  id: string
  model: string
  timestamp: number
  toolCallId: string
  content: string
}

/**
 * @deprecated Use StepStartedEvent/StepFinishedEvent instead
 */
export interface ThinkingStreamChunk {
  type: 'thinking'
  id: string
  model: string
  timestamp: number
  delta?: string
  content: string
}

/**
 * @deprecated Use CustomEvent with name='approval-requested' instead
 */
export interface ApprovalRequestedStreamChunk {
  type: 'approval-requested'
  id: string
  model: string
  timestamp: number
  toolCallId: string
  toolName: string
  input: Record<string, any>
  approval?: {
    id: string
    needsApproval: true
  }
}

/**
 * @deprecated Use CustomEvent with name='tool-input-available' instead
 */
export interface ToolInputAvailableStreamChunk {
  type: 'tool-input-available'
  id: string
  model: string
  timestamp: number
  toolCallId: string
  toolName: string
  input: Record<string, any>
}

// Simple streaming format for basic chat completions
// Converted to StreamChunk format by convertChatCompletionStream()
export interface ChatCompletionChunk {
  id: string
  model: string
  content: string
  role?: 'assistant'
  finishReason?: 'stop' | 'length' | 'content_filter' | null
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface SummarizationOptions {
  model: string
  text: string
  maxLength?: number
  style?: 'bullet-points' | 'paragraph' | 'concise'
  focus?: Array<string>
}

export interface SummarizationResult {
  id: string
  model: string
  summary: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface EmbeddingOptions {
  model: string
  input: string | Array<string>
  dimensions?: number
}

export interface EmbeddingResult {
  id: string
  model: string
  embeddings: Array<Array<number>>
  usage: {
    promptTokens: number
    totalTokens: number
  }
}

/**
 * Default metadata type for adapters that don't define custom metadata.
 * Uses unknown for all modalities.
 */
export interface DefaultMessageMetadataByModality {
  text: unknown
  image: unknown
  audio: unknown
  video: unknown
  document: unknown
}

/**
 * AI adapter interface with support for endpoint-specific models and provider options.
 *
 * Generic parameters:
 * - TChatModels: Models that support chat/text completion
 * - TEmbeddingModels: Models that support embeddings
 * - TChatProviderOptions: Provider-specific options for chat endpoint
 * - TEmbeddingProviderOptions: Provider-specific options for embedding endpoint
 * - TModelProviderOptionsByName: Map from model name to its specific provider options
 * - TModelInputModalitiesByName: Map from model name to its supported input modalities
 * - TMessageMetadataByModality: Map from modality type to adapter-specific metadata types
 */
export interface AIAdapter<
  TChatModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TEmbeddingModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TChatProviderOptions extends Record<string, any> = Record<string, any>,
  TEmbeddingProviderOptions extends Record<string, any> = Record<string, any>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelInputModalitiesByName extends Record<string, ReadonlyArray<Modality>> =
    Record<string, ReadonlyArray<Modality>>,
  TMessageMetadataByModality extends {
    text: unknown
    image: unknown
    audio: unknown
    video: unknown
    document: unknown
  } = DefaultMessageMetadataByModality,
> {
  name: string
  /** Models that support chat/text completion */
  models: TChatModels

  /** Models that support embeddings */
  embeddingModels?: TEmbeddingModels

  // Type-only properties for provider options inference
  _providerOptions?: TChatProviderOptions // Alias for _chatProviderOptions
  _chatProviderOptions?: TChatProviderOptions
  _embeddingProviderOptions?: TEmbeddingProviderOptions
  /**
   * Type-only map from model name to its specific provider options.
   * Used by the core AI types to narrow providerOptions based on the selected model.
   * Must be provided by all adapters.
   */
  _modelProviderOptionsByName: TModelProviderOptionsByName
  /**
   * Type-only map from model name to its supported input modalities.
   * Used by the core AI types to narrow ContentPart types based on the selected model.
   * Must be provided by all adapters.
   */
  _modelInputModalitiesByName?: TModelInputModalitiesByName
  /**
   * Type-only map from modality type to adapter-specific metadata types.
   * Used to provide type-safe autocomplete for metadata on content parts.
   */
  _messageMetadataByModality?: TMessageMetadataByModality

  // Structured streaming with JSON chunks (supports tool calls and rich content)
  chatStream: (
    options: ChatOptions<string, TChatProviderOptions>,
  ) => AsyncIterable<StreamChunk>

  // Summarization
  summarize: (options: SummarizationOptions) => Promise<SummarizationResult>

  // Embeddings
  createEmbeddings: (options: EmbeddingOptions) => Promise<EmbeddingResult>
}

export interface AIAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

export type ChatStreamOptionsUnion<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any>,
> =
  TAdapter extends AIAdapter<
    infer Models,
    any,
    any,
    any,
    infer ModelProviderOptions,
    infer ModelInputModalities,
    infer MessageMetadata
  >
    ? Models[number] extends infer TModel
      ? TModel extends string
        ? Omit<
            ChatOptions,
            'model' | 'providerOptions' | 'responseFormat' | 'messages'
          > & {
            adapter: TAdapter
            model: TModel
            providerOptions?: TModel extends keyof ModelProviderOptions
              ? ModelProviderOptions[TModel]
              : never
            /**
             * Messages array with content constrained to the model's supported input modalities.
             * For example, if a model only supports ['text', 'image'], you cannot pass audio or video content.
             * Metadata types are also constrained based on the adapter's metadata type definitions.
             */
            messages: TModel extends keyof ModelInputModalities
              ? ModelInputModalities[TModel] extends ReadonlyArray<Modality>
                ? MessageMetadata extends {
                    text: infer TTextMeta
                    image: infer TImageMeta
                    audio: infer TAudioMeta
                    video: infer TVideoMeta
                    document: infer TDocumentMeta
                  }
                  ? Array<
                      ConstrainedModelMessage<
                        ModelInputModalities[TModel],
                        TImageMeta,
                        TAudioMeta,
                        TVideoMeta,
                        TDocumentMeta,
                        TTextMeta
                      >
                    >
                  : Array<ConstrainedModelMessage<ModelInputModalities[TModel]>>
                : Array<ModelMessage>
              : Array<ModelMessage>
          }
        : never
      : never
    : never

/**
 * Chat options constrained by a specific model's capabilities.
 * Unlike ChatStreamOptionsUnion which creates a union over all models,
 * this type takes a specific model and constrains messages accordingly.
 */
export type ChatStreamOptionsForModel<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any>,
  TModel extends string,
> =
  TAdapter extends AIAdapter<
    any,
    any,
    any,
    any,
    infer ModelProviderOptions,
    infer ModelInputModalities,
    infer MessageMetadata
  >
    ? Omit<
        ChatOptions,
        'model' | 'providerOptions' | 'responseFormat' | 'messages'
      > & {
        adapter: TAdapter
        model: TModel
        providerOptions?: TModel extends keyof ModelProviderOptions
          ? ModelProviderOptions[TModel]
          : never
        /**
         * Messages array with content constrained to the model's supported input modalities.
         * For example, if a model only supports ['text', 'image'], you cannot pass audio or video content.
         * Metadata types are also constrained based on the adapter's metadata type definitions.
         */
        messages: TModel extends keyof ModelInputModalities
          ? ModelInputModalities[TModel] extends ReadonlyArray<Modality>
            ? MessageMetadata extends {
                text: infer TTextMeta
                image: infer TImageMeta
                audio: infer TAudioMeta
                video: infer TVideoMeta
                document: infer TDocumentMeta
              }
              ? Array<
                  ConstrainedModelMessage<
                    ModelInputModalities[TModel],
                    TImageMeta,
                    TAudioMeta,
                    TVideoMeta,
                    TDocumentMeta,
                    TTextMeta
                  >
                >
              : Array<ConstrainedModelMessage<ModelInputModalities[TModel]>>
            : Array<ModelMessage>
          : Array<ModelMessage>
      }
    : never

// Extract types from adapter (updated to 6 generics)
export type ExtractModelsFromAdapter<T> =
  T extends AIAdapter<infer M, any, any, any, any, any> ? M[number] : never

/**
 * Extract the supported input modalities for a specific model from an adapter.
 */
export type ExtractModalitiesForModel<
  TAdapter extends AIAdapter<any, any, any, any, any, any>,
  TModel extends string,
> =
  TAdapter extends AIAdapter<
    any,
    any,
    any,
    any,
    any,
    infer ModelInputModalities
  >
    ? TModel extends keyof ModelInputModalities
      ? ModelInputModalities[TModel]
      : ReadonlyArray<Modality>
    : ReadonlyArray<Modality>
