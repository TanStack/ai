import type { StandardJSONSchemaV1 } from '@standard-schema/spec'

/**
 * Tool call states - track the lifecycle of a tool call
 */
export type ToolCallState =
  | 'awaiting-input' // Received start but no arguments yet
  | 'input-streaming' // Partial arguments received
  | 'input-complete' // All arguments received
  | 'approval-requested' // Waiting for user approval
  | 'approval-responded' // User has approved/denied

/**
 * Tool result states - track the lifecycle of a tool result
 */
export type ToolResultState =
  | 'streaming' // Placeholder for future streamed output
  | 'complete' // Result is complete
  | 'error' // Error occurred

/**
 * JSON Schema type for defining tool input/output schemas as raw JSON Schema objects.
 * This allows tools to be defined without schema libraries when you have JSON Schema definitions available.
 */
export interface JSONSchema {
  type?: string | Array<string>
  properties?: Record<string, JSONSchema>
  items?: JSONSchema | Array<JSONSchema>
  required?: Array<string>
  enum?: Array<unknown>
  const?: unknown
  description?: string
  default?: unknown
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
  examples?: Array<unknown>
  [key: string]: any // Allow additional properties for extensibility
}

/**
 * Union type for schema input - can be any Standard JSON Schema compliant schema or a plain JSONSchema object.
 *
 * Standard JSON Schema compliant libraries include:
 * - Zod v4.2+ (natively supports StandardJSONSchemaV1)
 * - ArkType v2.1.28+ (natively supports StandardJSONSchemaV1)
 * - Valibot v1.2+ (via `toStandardJsonSchema()` from `@valibot/to-json-schema`)
 *
 * @see https://standardschema.dev/json-schema
 */

export type SchemaInput = StandardJSONSchemaV1<any, any> | JSONSchema

/**
 * Infer the TypeScript type from a schema.
 * For Standard JSON Schema compliant schemas, extracts the input type.
 * For plain JSONSchema, returns `any` since we can't infer types from JSON Schema at compile time.
 */
export type InferSchemaType<T> =
  T extends StandardJSONSchemaV1<infer TInput, unknown> ? TInput : unknown

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
  TTextMeta = unknown,
  TImageMeta = unknown,
  TAudioMeta = unknown,
  TVideoMeta = unknown,
  TDocumentMeta = unknown,
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
export type ContentPartForInputModalitiesTypes<
  TInputModalitiesTypes extends InputModalitiesTypes,
> = Extract<
  ContentPart<
    TInputModalitiesTypes['messageMetadataByModality']['text'],
    TInputModalitiesTypes['messageMetadataByModality']['image'],
    TInputModalitiesTypes['messageMetadataByModality']['audio'],
    TInputModalitiesTypes['messageMetadataByModality']['video'],
    TInputModalitiesTypes['messageMetadataByModality']['document']
  >,
  { type: TInputModalitiesTypes['inputModalities'][number] }
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
  TInputModalitiesTypes extends InputModalitiesTypes,
> =
  | string
  | null
  | Array<ContentPartForInputModalitiesTypes<TInputModalitiesTypes>>

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

export type InputModalitiesTypes = {
  inputModalities: ReadonlyArray<Modality>
  messageMetadataByModality: DefaultMessageMetadataByModality
}

/**
 * A ModelMessage with content constrained to only allow content parts
 * matching the specified input modalities.
 */
export type ConstrainedModelMessage<
  TInputModalitiesTypes extends InputModalitiesTypes,
> = Omit<ModelMessage, 'content'> & {
  content: ConstrainedContent<TInputModalitiesTypes>
}

/**
 * Tool/Function definition for function calling.
 *
 * Tools allow the model to interact with external systems, APIs, or perform computations.
 * The model will decide when to call tools based on the user's request and the tool descriptions.
 *
 * Tools can use any Standard JSON Schema compliant library (Zod, ArkType, Valibot, etc.)
 * or plain JSON Schema objects for runtime validation and type safety.
 *
 * @see https://platform.openai.com/docs/guides/function-calling
 * @see https://docs.anthropic.com/claude/docs/tool-use
 * @see https://standardschema.dev/json-schema
 */
export interface Tool<
  TInput extends SchemaInput = SchemaInput,
  TOutput extends SchemaInput = SchemaInput,
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
   * Can be any Standard JSON Schema compliant schema (Zod, ArkType, Valibot, etc.) or a plain JSON Schema object.
   * Defines the structure and types of arguments the tool accepts.
   * The model will generate arguments matching this schema.
   * Standard JSON Schema compliant schemas are converted to JSON Schema for LLM providers.
   *
   * @see https://standardschema.dev/json-schema
   * @see https://json-schema.org/
   *
   * @example
   * // Using Zod v4+ schema (natively supports Standard JSON Schema)
   * import { z } from 'zod';
   * z.object({
   *   location: z.string().describe("City name or coordinates"),
   *   unit: z.enum(["celsius", "fahrenheit"]).optional()
   * })
   *
   * @example
   * // Using ArkType (natively supports Standard JSON Schema)
   * import { type } from 'arktype';
   * type({
   *   location: 'string',
   *   unit: "'celsius' | 'fahrenheit'"
   * })
   *
   * @example
   * // Using plain JSON Schema
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
   * Can be any Standard JSON Schema compliant schema or a plain JSON Schema object.
   * If provided with a Standard Schema compliant schema, tool results will be validated
   * against this schema before being sent back to the model. This catches bugs in tool
   * implementations and ensures consistent output formatting.
   *
   * Note: This is client-side validation only - not sent to LLM providers.
   * Note: Plain JSON Schema output validation is not performed at runtime.
   *
   * @example
   * // Using Zod
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
export interface TextOptions<
  TProviderOptionsSuperset extends Record<string, any> = Record<string, any>,
  TProviderOptionsForModel = TProviderOptionsSuperset,
> {
  model: string
  messages: Array<ModelMessage>
  tools?: Array<Tool<any, any, any>>
  systemPrompts?: Array<string>
  agentLoopStrategy?: AgentLoopStrategy
  /**
   * Controls the randomness of the output.
   * Higher values (e.g., 0.8) make output more random, lower values (e.g., 0.2) make it more focused and deterministic.
   * Range: [0.0, 2.0]
   *
   * Note: Generally recommended to use either temperature or topP, but not both.
   *
   * Provider usage:
   * - OpenAI: `temperature` (number) - in text.top_p field
   * - Anthropic: `temperature` (number) - ranges from 0.0 to 1.0, default 1.0
   * - Gemini: `generationConfig.temperature` (number) - ranges from 0.0 to 2.0
   */
  temperature?: number
  /**
   * Nucleus sampling parameter. An alternative to temperature sampling.
   * The model considers the results of tokens with topP probability mass.
   * For example, 0.1 means only tokens comprising the top 10% probability mass are considered.
   *
   * Note: Generally recommended to use either temperature or topP, but not both.
   *
   * Provider usage:
   * - OpenAI: `text.top_p` (number)
   * - Anthropic: `top_p` (number | null)
   * - Gemini: `generationConfig.topP` (number)
   */
  topP?: number
  /**
   * The maximum number of tokens to generate in the response.
   *
   * Provider usage:
   * - OpenAI: `max_output_tokens` (number) - includes visible output and reasoning tokens
   * - Anthropic: `max_tokens` (number, required) - range x >= 1
   * - Gemini: `generationConfig.maxOutputTokens` (number)
   */
  maxTokens?: number
  /**
   * Additional metadata to attach to the request.
   * Can be used for tracking, debugging, or passing custom information.
   * Structure and constraints vary by provider.
   *
   * Provider usage:
   * - OpenAI: `metadata` (Record<string, string>) - max 16 key-value pairs, keys max 64 chars, values max 512 chars
   * - Anthropic: `metadata` (Record<string, any>) - includes optional user_id (max 256 chars)
   * - Gemini: Not directly available in TextProviderOptions
   */
  metadata?: Record<string, any>
  modelOptions?: TProviderOptionsForModel
  request?: Request | RequestInit

  /**
   * Schema for structured output.
   * When provided, the adapter should use the provider's native structured output API
   * to ensure the response conforms to this schema.
   * The schema will be converted to JSON Schema format before being sent to the provider.
   * Supports any Standard JSON Schema compliant library (Zod, ArkType, Valibot, etc.).
   */
  outputSchema?: SchemaInput
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
 */
export type AGUIEventType =
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

/**
 * Stream chunk/event types (AG-UI protocol).
 */
export type StreamChunkType = AGUIEventType

/**
 * Base structure for AG-UI events.
 * Extends AG-UI spec with TanStack AI additions (model field).
 */
export interface BaseAGUIEvent {
  type: AGUIEventType
  timestamp: number
  /** Model identifier for multi-model support */
  model?: string
  /** Original provider event for debugging/advanced use cases */
  rawEvent?: unknown
}

// ============================================================================
// AG-UI Event Interfaces
// ============================================================================

/**
 * Emitted when a run starts.
 * This is the first event in any streaming response.
 */
export interface RunStartedEvent extends BaseAGUIEvent {
  type: 'RUN_STARTED'
  /** Unique identifier for this run */
  runId: string
  /** Optional thread/conversation ID */
  threadId?: string
}

/**
 * Emitted when a run completes successfully.
 */
export interface RunFinishedEvent extends BaseAGUIEvent {
  type: 'RUN_FINISHED'
  /** Run identifier */
  runId: string
  /** Why the generation stopped */
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  /** Token usage statistics */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Emitted when an error occurs during a run.
 */
export interface RunErrorEvent extends BaseAGUIEvent {
  type: 'RUN_ERROR'
  /** Run identifier (if available) */
  runId?: string
  /** Error details */
  error: {
    message: string
    code?: string
  }
}

/**
 * Emitted when a text message starts.
 */
export interface TextMessageStartEvent extends BaseAGUIEvent {
  type: 'TEXT_MESSAGE_START'
  /** Unique identifier for this message */
  messageId: string
  /** Role is always assistant for generated messages */
  role: 'assistant'
}

/**
 * Emitted when text content is generated (streaming tokens).
 */
export interface TextMessageContentEvent extends BaseAGUIEvent {
  type: 'TEXT_MESSAGE_CONTENT'
  /** Message identifier */
  messageId: string
  /** The incremental content token */
  delta: string
  /** Full accumulated content so far */
  content?: string
}

/**
 * Emitted when a text message completes.
 */
export interface TextMessageEndEvent extends BaseAGUIEvent {
  type: 'TEXT_MESSAGE_END'
  /** Message identifier */
  messageId: string
}

/**
 * Emitted when a tool call starts.
 */
export interface ToolCallStartEvent extends BaseAGUIEvent {
  type: 'TOOL_CALL_START'
  /** Unique identifier for this tool call */
  toolCallId: string
  /** Name of the tool being called */
  toolName: string
  /** Index for parallel tool calls */
  index?: number
}

/**
 * Emitted when tool call arguments are streaming.
 */
export interface ToolCallArgsEvent extends BaseAGUIEvent {
  type: 'TOOL_CALL_ARGS'
  /** Tool call identifier */
  toolCallId: string
  /** Incremental JSON arguments delta */
  delta: string
  /** Full accumulated arguments so far */
  args?: string
}

/**
 * Emitted when a tool call completes.
 */
export interface ToolCallEndEvent extends BaseAGUIEvent {
  type: 'TOOL_CALL_END'
  /** Tool call identifier */
  toolCallId: string
  /** Name of the tool */
  toolName: string
  /** Final parsed input arguments */
  input?: unknown
  /** Tool execution result (if executed) */
  result?: string
}

/**
 * Emitted when a thinking/reasoning step starts.
 */
export interface StepStartedEvent extends BaseAGUIEvent {
  type: 'STEP_STARTED'
  /** Unique identifier for this step */
  stepId: string
  /** Type of step (e.g., 'thinking', 'planning') */
  stepType?: string
}

/**
 * Emitted when a thinking/reasoning step finishes.
 */
export interface StepFinishedEvent extends BaseAGUIEvent {
  type: 'STEP_FINISHED'
  /** Step identifier */
  stepId: string
  /** Incremental thinking content */
  delta?: string
  /** Full accumulated thinking content */
  content?: string
}

/**
 * Emitted to provide a full state snapshot.
 */
export interface StateSnapshotEvent extends BaseAGUIEvent {
  type: 'STATE_SNAPSHOT'
  /** The complete state object */
  state: Record<string, unknown>
}

/**
 * Emitted to provide an incremental state update.
 */
export interface StateDeltaEvent extends BaseAGUIEvent {
  type: 'STATE_DELTA'
  /** The state changes to apply */
  delta: Record<string, unknown>
}

/**
 * Custom event for extensibility.
 */
export interface CustomEvent extends BaseAGUIEvent {
  type: 'CUSTOM'
  /** Custom event name */
  name: string
  /** Custom event data */
  data?: unknown
}

/**
 * Union of all AG-UI events.
 */
export type AGUIEvent =
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

/**
 * Chunk returned by the SDK during streaming chat completions.
 * Uses the AG-UI protocol event format.
 */
export type StreamChunk = AGUIEvent

// Simple streaming format for basic text completions
// Converted to StreamChunk format by convertTextCompletionStream()
export interface TextCompletionChunk {
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

// ============================================================================
// Image Generation Types
// ============================================================================

/**
 * Options for image generation.
 * These are the common options supported across providers.
 */
export interface ImageGenerationOptions<
  TProviderOptions extends object = object,
> {
  /** The model to use for image generation */
  model: string
  /** Text description of the desired image(s) */
  prompt: string
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: string
  /** Model-specific options for image generation */
  modelOptions?: TProviderOptions
}

/**
 * A single generated image
 */
export interface GeneratedImage {
  /** Base64-encoded image data */
  b64Json?: string
  /** URL to the generated image (may be temporary) */
  url?: string
  /** Revised prompt used by the model (if applicable) */
  revisedPrompt?: string
}

/**
 * Result of image generation
 */
export interface ImageGenerationResult {
  /** Unique identifier for the generation */
  id: string
  /** Model used for generation */
  model: string
  /** Array of generated images */
  images: Array<GeneratedImage>
  /** Token usage information (if available) */
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

// ============================================================================
// Video Generation Types (Experimental)
// ============================================================================

/**
 * Options for video generation.
 * These are the common options supported across providers.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoGenerationOptions<
  TProviderOptions extends object = object,
> {
  /** The model to use for video generation */
  model: string
  /** Text description of the desired video */
  prompt: string
  /** Video size in WIDTHxHEIGHT format (e.g., "1280x720") */
  size?: string
  /** Video duration in seconds */
  duration?: number
  /** Model-specific options for video generation */
  modelOptions?: TProviderOptions
}

/**
 * Result of creating a video generation job.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoJobResult {
  /** Unique job identifier for polling status */
  jobId: string
  /** Model used for generation */
  model: string
}

/**
 * Status of a video generation job.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoStatusResult {
  /** Job identifier */
  jobId: string
  /** Current status of the job */
  status: 'pending' | 'processing' | 'completed' | 'failed'
  /** Progress percentage (0-100), if available */
  progress?: number
  /** Error message if status is 'failed' */
  error?: string
}

/**
 * Result containing the URL to a generated video.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoUrlResult {
  /** Job identifier */
  jobId: string
  /** URL to the generated video */
  url: string
  /** When the URL expires, if applicable */
  expiresAt?: Date
}

// ============================================================================
// Text-to-Speech (TTS) Types
// ============================================================================

/**
 * Options for text-to-speech generation.
 * These are the common options supported across providers.
 */
export interface TTSOptions<TProviderOptions extends object = object> {
  /** The model to use for TTS generation */
  model: string
  /** The text to convert to speech */
  text: string
  /** The voice to use for generation */
  voice?: string
  /** The output audio format */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  /** The speed of the generated audio (0.25 to 4.0) */
  speed?: number
  /** Model-specific options for TTS generation */
  modelOptions?: TProviderOptions
}

/**
 * Result of text-to-speech generation.
 */
export interface TTSResult {
  /** Unique identifier for the generation */
  id: string
  /** Model used for generation */
  model: string
  /** Base64-encoded audio data */
  audio: string
  /** Audio format of the generated audio */
  format: string
  /** Duration of the audio in seconds, if available */
  duration?: number
  /** Content type of the audio (e.g., 'audio/mp3') */
  contentType?: string
}

// ============================================================================
// Transcription (Speech-to-Text) Types
// ============================================================================

/**
 * Options for audio transcription.
 * These are the common options supported across providers.
 */
export interface TranscriptionOptions<
  TProviderOptions extends object = object,
> {
  /** The model to use for transcription */
  model: string
  /** The audio data to transcribe - can be base64 string, File, Blob, or Buffer */
  audio: string | File | Blob | ArrayBuffer
  /** The language of the audio in ISO-639-1 format (e.g., 'en') */
  language?: string
  /** An optional prompt to guide the transcription */
  prompt?: string
  /** The format of the transcription output */
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
  /** Model-specific options for transcription */
  modelOptions?: TProviderOptions
}

/**
 * A single segment of transcribed audio with timing information.
 */
export interface TranscriptionSegment {
  /** Unique identifier for the segment */
  id: number
  /** Start time of the segment in seconds */
  start: number
  /** End time of the segment in seconds */
  end: number
  /** Transcribed text for this segment */
  text: string
  /** Confidence score (0-1), if available */
  confidence?: number
  /** Speaker identifier, if diarization is enabled */
  speaker?: string
}

/**
 * A single word with timing information.
 */
export interface TranscriptionWord {
  /** The transcribed word */
  word: string
  /** Start time in seconds */
  start: number
  /** End time in seconds */
  end: number
}

/**
 * Result of audio transcription.
 */
export interface TranscriptionResult {
  /** Unique identifier for the transcription */
  id: string
  /** Model used for transcription */
  model: string
  /** The full transcribed text */
  text: string
  /** Language detected or specified */
  language?: string
  /** Duration of the audio in seconds */
  duration?: number
  /** Detailed segments with timing, if available */
  segments?: Array<TranscriptionSegment>
  /** Word-level timestamps, if available */
  words?: Array<TranscriptionWord>
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
