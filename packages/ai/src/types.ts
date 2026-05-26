import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'
import type { InternalLogger } from './logger/internal-logger'
import type { SystemPrompt } from './system-prompts'
import type { ProviderTool } from './tools/provider-tool'
import type {
  CustomEvent as AGUICustomEvent,
  MessagesSnapshotEvent as AGUIMessagesSnapshotEvent,
  ReasoningEncryptedValueEvent as AGUIReasoningEncryptedValueEvent,
  ReasoningEndEvent as AGUIReasoningEndEvent,
  ReasoningMessageContentEvent as AGUIReasoningMessageContentEvent,
  ReasoningMessageEndEvent as AGUIReasoningMessageEndEvent,
  ReasoningMessageStartEvent as AGUIReasoningMessageStartEvent,
  ReasoningStartEvent as AGUIReasoningStartEvent,
  RunErrorEvent as AGUIRunErrorEvent,
  RunFinishedEvent as AGUIRunFinishedEvent,
  RunStartedEvent as AGUIRunStartedEvent,
  StateDeltaEvent as AGUIStateDeltaEvent,
  StateSnapshotEvent as AGUIStateSnapshotEvent,
  StepFinishedEvent as AGUIStepFinishedEvent,
  StepStartedEvent as AGUIStepStartedEvent,
  TextMessageContentEvent as AGUITextMessageContentEvent,
  TextMessageEndEvent as AGUITextMessageEndEvent,
  TextMessageStartEvent as AGUITextMessageStartEvent,
  ToolCallArgsEvent as AGUIToolCallArgsEvent,
  ToolCallEndEvent as AGUIToolCallEndEvent,
  ToolCallResultEvent as AGUIToolCallResultEvent,
  ToolCallStartEvent as AGUIToolCallStartEvent,
  EventType,
} from '@ag-ui/core'

// Re-export ProviderTool so the type is reachable from `@tanstack/ai`'s root
// entry via `export * from './types'` without forcing the subpath import.
// The canonical declaration lives in `./tools/provider-tool` alongside its
// runtime helper `brandProviderTool`.
export type { ProviderTool } from './tools/provider-tool'

/**
 * Tool call states - track the lifecycle of a tool call
 */
export type ToolCallState =
  | 'awaiting-input' // Received start but no arguments yet
  | 'input-streaming' // Partial arguments received
  | 'input-complete' // All arguments received
  | 'approval-requested' // Waiting for user approval
  | 'approval-responded' // User has approved/denied
  | 'complete' // Result is complete

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
 * Union type for schema input - can be any Standard Schema compliant validator,
 * any Standard JSON Schema compliant schema, or a plain JSONSchema object.
 *
 * Standard JSON Schema compliant libraries (carry the JSON-schema converter):
 * - Zod v4.2+ (natively supports StandardJSONSchemaV1)
 * - ArkType v2.1.28+ (natively supports StandardJSONSchemaV1)
 * - Valibot v1.2+ (via `toStandardJsonSchema()` from `@valibot/to-json-schema`)
 *
 * StandardSchemaV1 covers libraries whose published types only expose the
 * validator surface — Zod's core `$ZodType['~standard']` is currently typed
 * as `StandardSchemaV1.Props` even though the runtime attaches the
 * `jsonSchema` converter, so this branch is what makes `InferSchemaType`
 * recover the inferred type for callers using `z.ZodType<T>`.
 *
 * @see https://standardschema.dev/json-schema
 */

export type SchemaInput =
  | StandardJSONSchemaV1<any, any>
  | StandardSchemaV1<any, any>
  | JSONSchema

/**
 * Infer the TypeScript type from a schema.
 * For Standard JSON Schema compliant schemas, extracts the input type.
 * For Standard Schema validators (e.g. Zod's `~standard` surface), extracts
 * the input type from the `StandardSchemaV1` shape.
 * For plain JSONSchema, returns `unknown` since we can't infer types from
 * JSON Schema at compile time.
 */
export type InferSchemaType<T> =
  T extends StandardJSONSchemaV1<infer TInput, unknown>
    ? TInput
    : T extends StandardSchemaV1<infer TInput, unknown>
      ? TInput
      : unknown

export interface ToolCall<TMetadata = unknown> {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
  /** Provider-specific metadata to carry through the tool call lifecycle.
   * Typed per-adapter via `TToolCallMetadata`. For example,
   * `@tanstack/ai-gemini` sets this to `{ thoughtSignature?: string }`. */
  metadata?: TMetadata
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
 * Source specification for inline data content (base64).
 * Requires a mimeType to ensure providers receive proper content type information.
 */
export interface ContentPartDataSource {
  /**
   * Indicates this is inline data content.
   */
  type: 'data'
  /**
   * The base64-encoded content value.
   */
  value: string
  /**
   * The MIME type of the content (e.g., 'image/png', 'audio/wav').
   * Required for data sources to ensure proper handling by providers.
   */
  mimeType: string
}

/**
 * Source specification for URL-based content.
 * mimeType is optional as it can often be inferred from the URL or response headers.
 */
export interface ContentPartUrlSource {
  /**
   * Indicates this is URL-referenced content.
   */
  type: 'url'
  /**
   * HTTP(S) URL or data URI pointing to the content.
   */
  value: string
  /**
   * Optional MIME type hint for cases where providers can't infer it from the URL.
   */
  mimeType?: string
}

/**
 * Source specification for multimodal content.
 * Discriminated union supporting both inline data (base64) and URL-based content.
 * - For 'data' sources: mimeType is required
 * - For 'url' sources: mimeType is optional
 */
export type ContentPartSource = ContentPartDataSource | ContentPartUrlSource

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
  thinking?: Array<{ content: string; signature?: string }>
}

/**
 * Message parts - building blocks of UIMessage
 */
export interface TextPart<TMetadata = unknown> {
  type: 'text'
  content: string
  metadata?: TMetadata
}

export interface ToolCallPart<TMetadata = unknown> {
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
  /** Provider-specific metadata that round-trips with the tool call.
   * Typed per-adapter via `TToolCallMetadata`. */
  metadata?: TMetadata
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
  stepId?: string
  signature?: string
}

/**
 * Recursive `Partial` — every nested field becomes optional. Used as the
 * `partial` type on a streaming structured-output part since the progressive
 * JSON parse hands back objects whose fields are only filled in as bytes
 * arrive. Defaulted in `DeepPartial<unknown>` → `unknown` so untyped parts
 * keep their existing shape.
 */
export type DeepPartial<T> =
  T extends ReadonlyArray<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

/**
 * StructuredOutputPart — a typed structured response attached to the assistant
 * message that produced it. Generic over the schema-inferred data type so
 * consumers can thread `useChat({ outputSchema })`'s schema all the way down
 * to `messages[i].parts[j].data`. Defaults to `unknown` so untyped consumers
 * (e.g. internal codepaths that don't know about TSchema) keep working.
 */
export interface StructuredOutputPart<TData = unknown> {
  type: 'structured-output'
  status: 'streaming' | 'complete' | 'error'
  /** Progressive parse of `raw` via parsePartialJSON — populated while streaming and after complete. */
  partial?: DeepPartial<TData>
  /** Validated final object — only set when `status === 'complete'`. */
  data?: TData
  /** Accumulating JSON buffer. Source of truth for wire round-trip. */
  raw: string
  /** Optional chain-of-thought surfaced by reasoning models alongside the structured output. */
  reasoning?: string
  /** Populated when `status === 'error'`. */
  errorMessage?: string
}

export type MessagePart<TData = unknown> =
  | TextPart
  | ImagePart
  | AudioPart
  | VideoPart
  | DocumentPart
  | ToolCallPart
  | ToolResultPart
  | ThinkingPart
  | StructuredOutputPart<TData>

/**
 * UIMessage - Domain-specific message format optimized for building chat UIs
 * Contains parts that can be text, tool calls, or tool results. Generic over
 * the structured-output data type so `useChat({ outputSchema })`'s schema
 * narrows `parts.find(p => p.type === 'structured-output').data` on the
 * consumer side without manual casts.
 */
export interface UIMessage<TData = unknown> {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: Array<MessagePart<TData>>
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
 * Context passed to tool execute functions, providing capabilities like
 * emitting custom events during execution.
 */
export interface ToolExecutionContext {
  /** The ID of the tool call being executed */
  toolCallId?: string
  /**
   * Emit a custom event during tool execution.
   * Events are streamed to the client in real-time as AG-UI CUSTOM events.
   *
   * @param eventName - Name of the custom event
   * @param value - Event payload value
   *
   * @example
   * ```ts
   * const tool = toolDefinition({ ... }).server(async (args, context) => {
   *   context?.emitCustomEvent('progress', { step: 1, total: 3 })
   *   // ... do work ...
   *   context?.emitCustomEvent('progress', { step: 2, total: 3 })
   *   // ... do more work ...
   *   return result
   * })
   * ```
   */
  emitCustomEvent: (eventName: string, value: Record<string, any>) => void
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
  execute?:
    | ((args: any, context?: ToolExecutionContext) => Promise<any> | any)
    | undefined

  /** If true, tool execution requires user approval before running. Works with both server and client tools. */
  needsApproval?: boolean

  /** If true, this tool is lazy and will only be sent to the LLM after being discovered via the lazy tool discovery mechanism. Only meaningful when used with chat(). */
  lazy?: boolean

  /** Additional metadata for adapters or custom extensions */
  metadata?: Record<string, any> | undefined
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
  tools?: Array<Tool<any, any, any>> | undefined
  /**
   * System prompts to include with the request.
   *
   * Accepts plain strings (the common case) or `{ content, metadata }`
   * objects that let providers attach typed metadata (e.g. Anthropic
   * `cache_control` for prompt caching) per prompt. At the chat call site
   * the adapter narrows `metadata`'s type via `~types['systemPromptMetadata']`
   * — providers that don't declare one default to `never`, which makes the
   * field carry no meaningful value (TypeScript will only accept
   * `undefined` there). Provider-foreign metadata that reaches an adapter
   * via JS / `as any` is silently dropped, never written to the wire.
   *
   * @see SystemPrompt
   */
  systemPrompts?: Array<SystemPrompt>
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
  metadata?: Record<string, any> | undefined
  modelOptions?: TProviderOptionsForModel
  request?: Request | RequestInit

  /**
   * Schema for structured output.
   *
   * **Two distinct use sites:**
   *
   * 1. **User-facing (activity layer):** accepts any
   *    {@link SchemaInput} — Zod, ArkType, Valibot, or a raw JSON Schema.
   *    The activity layer converts to JSON Schema before handing off.
   *
   * 2. **Adapter-facing (`chatStream` call):** the engine populates this with
   *    a pre-converted JSON Schema **only** when the adapter declared
   *    `supportsCombinedToolsAndSchema(modelOptions) === true`. The adapter
   *    should then wire the schema into the upstream request (e.g.
   *    `response_format: { type: 'json_schema', ... }`, `text.format`,
   *    `output_format`) alongside any `tools`. The model's natural final
   *    turn carries the schema-constrained JSON text and the engine
   *    harvests it from the agent loop without a separate finalization
   *    round-trip.
   *
   *    Adapters that did NOT declare the capability never see this field
   *    populated — the engine instead invokes `structuredOutput` /
   *    `structuredOutputStream` after the agent loop.
   */
  outputSchema?: SchemaInput
  /**
   * @deprecated Use `threadId` instead. `conversationId` is the legacy
   * pre-AG-UI name for the same concept (a stable per-conversation
   * identifier used to correlate client/server devtools events). When
   * `conversationId` is omitted, the runtime falls back to `threadId`
   * automatically, so most callers can simply pass `threadId` (or rely
   * on `chatParamsFromRequest`, which surfaces it on `params`).
   *
   * Will be removed in a future major release.
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

  /**
   * Internal logger threaded from the chat entry point. Adapter implementations
   * must call `logger.request()` before SDK calls, `logger.provider()` for each
   * chunk received, and `logger.errors()` in catch blocks.
   */
  logger: InternalLogger

  /**
   * Thread ID for AG-UI protocol run correlation.
   * When provided, this will be used in RunStartedEvent and RunFinishedEvent.
   */
  threadId?: string
  /**
   * Run ID for AG-UI protocol run correlation.
   * When provided, this will be used in RunStartedEvent and RunFinishedEvent.
   * If not provided, a unique ID will be generated.
   */
  runId?: string
  /**
   * Parent run ID for AG-UI protocol nested run correlation.
   * Surfaced for observability/middleware; not consumed by the LLM call.
   */
  parentRunId?: string
}

// ============================================================================
// AG-UI Protocol Event Types
// ============================================================================

/**
 * Re-export EventType enum from @ag-ui/core for use in event creation.
 * Use `EventType.RUN_STARTED` etc. when constructing event objects.
 */
export { EventType } from '@ag-ui/core'

/**
 * AG-UI Protocol event types.
 * @deprecated Use `EventType` enum from `@ag-ui/core` instead. This type alias
 * is kept for backward compatibility but will be removed in a future version.
 * @see https://docs.ag-ui.com/concepts/events
 */
export type AGUIEventType = `${EventType}`

/**
 * Stream chunk/event types (AG-UI protocol).
 * @deprecated Use `EventType` enum instead.
 */
export type StreamChunkType = AGUIEventType

/**
 * Base structure for TanStack AI events.
 *
 * We deliberately do NOT `extends AGUIBaseEvent` here. @ag-ui/core's
 * schemas use Zod's `.passthrough()` mode, which leaks an index
 * signature into every `z.infer<typeof Schema>` event type. That index
 * signature pollutes discriminated-union narrowing — `chunk.foo` would
 * succeed on every variant regardless of which event it is — and
 * collapses IntelliSense back to "every property from every variant".
 *
 * Instead, each event below uses `Pick<AGUI*Event, [explicit fields]>`
 * to pull in the AGUI-spec'd fields without inheriting the index
 * signature, then declares `type` as a plain string literal
 * (e.g. `'RUN_STARTED'`). This is the form TypeScript's IntelliSense
 * uses when offering suggestions after `chunk.type === "`, so the
 * common discriminator narrow autocompletes. Comparing against the
 * `EventType` enum still works because each enum member's runtime
 * value IS that same string — `EventType.RUN_STARTED` is assignable
 * to `'RUN_STARTED'`:
 *
 *     if (chunk.type === 'RUN_STARTED') { ... }           // string (autocompletes)
 *     if (chunk.type === EventType.RUN_STARTED) { ... }   // enum (also narrows)
 *
 * The per-event drift guards below fail to compile if @ag-ui/core ever
 * changes the shape of a field we mirror — they catch field-type drift
 * but NOT new fields, so when upgrading @ag-ui/core, re-check that the
 * `Pick<>` field lists still match the AGUI schema.
 *
 * @ag-ui/core provides: `type`, `timestamp?`, `rawEvent?`
 * TanStack AI adds: `model?`
 */
export interface BaseAGUIEvent {
  /** Discriminator carried by every event variant. */
  type: AGUIEventType
  /** Optional event timestamp (ms since epoch). */
  timestamp?: number
  /** Optional opaque provider payload. */
  rawEvent?: unknown
  /** Model identifier for multi-model support */
  model?: string
}

/**
 * Compile-time drift guard. Errors with a descriptive type if the
 * TanStack event's fields are not assignable to the corresponding
 * AGUI event's `Pick`'d shape. Used to catch breaking changes when
 * @ag-ui/core releases a new version.
 * @internal
 */
type AssertSatisfiesAGUI<TanStack, AGUIShape> = TanStack extends AGUIShape
  ? true
  : [
      'DRIFT: TanStack event no longer satisfies AGUI shape',
      TanStack,
      AGUIShape,
    ]

// ============================================================================
// AG-UI Event Interfaces
// ============================================================================

/**
 * Emitted when a run starts.
 * This is the first event in any streaming response.
 *
 * @ag-ui/core provides: `threadId`, `runId`, `parentRunId?`, `input?`
 * TanStack AI adds: `model?`
 */
export interface RunStartedEvent extends Pick<
  AGUIRunStartedEvent,
  'threadId' | 'runId' | 'parentRunId' | 'input' | 'timestamp' | 'rawEvent'
> {
  type: 'RUN_STARTED'
  /** Model identifier for multi-model support */
  model?: string
}
type _RunStartedDriftCheck = AssertSatisfiesAGUI<
  Omit<RunStartedEvent, 'type' | 'model'>,
  Pick<
    AGUIRunStartedEvent,
    'threadId' | 'runId' | 'parentRunId' | 'input' | 'timestamp' | 'rawEvent'
  >
>
const _runStartedDriftCheck: _RunStartedDriftCheck = true
void _runStartedDriftCheck

/**
 * Emitted when a run completes successfully.
 *
 * @ag-ui/core provides: `threadId`, `runId`, `result?`
 * TanStack AI adds: `model?`, `finishReason?`, `usage?`
 */
export interface RunFinishedEvent extends Pick<
  AGUIRunFinishedEvent,
  'threadId' | 'runId' | 'result' | 'timestamp' | 'rawEvent'
> {
  type: 'RUN_FINISHED'
  /** Model identifier for multi-model support */
  model?: string
  /** Why the generation stopped */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  /** Token usage statistics */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}
type _RunFinishedDriftCheck = AssertSatisfiesAGUI<
  Omit<RunFinishedEvent, 'type' | 'model' | 'finishReason' | 'usage'>,
  Pick<
    AGUIRunFinishedEvent,
    'threadId' | 'runId' | 'result' | 'timestamp' | 'rawEvent'
  >
>
const _runFinishedDriftCheck: _RunFinishedDriftCheck = true
void _runFinishedDriftCheck

/**
 * Emitted when an error occurs during a run.
 *
 * @ag-ui/core provides: `message`, `code?`
 * TanStack AI adds: `model?`, `error?` (deprecated nested form)
 */
export interface RunErrorEvent extends Pick<
  AGUIRunErrorEvent,
  'message' | 'code' | 'timestamp' | 'rawEvent'
> {
  type: 'RUN_ERROR'
  /** Model identifier for multi-model support */
  model?: string
  /**
   * Routing metadata the TanStack engine attaches when emitting error
   * events. Stripped by `strip-to-spec-middleware` before going on the
   * wire so the AG-UI consumer never sees them.
   */
  threadId?: string
  runId?: string
  /**
   * @deprecated Use top-level `message` and `code` fields instead.
   * Kept for backward compatibility.
   */
  error?:
    | {
        message: string
        code?: string | undefined
      }
    | undefined
}
type _RunErrorDriftCheck = AssertSatisfiesAGUI<
  Omit<RunErrorEvent, 'type' | 'model' | 'threadId' | 'runId' | 'error'>,
  Pick<AGUIRunErrorEvent, 'message' | 'code' | 'timestamp' | 'rawEvent'>
>
const _runErrorDriftCheck: _RunErrorDriftCheck = true
void _runErrorDriftCheck

/**
 * Emitted when a text message starts.
 *
 * @ag-ui/core provides: `messageId`, `role?`, `name?`
 * TanStack AI adds: `model?`
 */
export interface TextMessageStartEvent extends Pick<
  AGUITextMessageStartEvent,
  'messageId' | 'role' | 'name' | 'timestamp' | 'rawEvent'
> {
  type: 'TEXT_MESSAGE_START'
  /** Model identifier for multi-model support */
  model?: string
}
type _TextMessageStartDriftCheck = AssertSatisfiesAGUI<
  Omit<TextMessageStartEvent, 'type' | 'model'>,
  Pick<
    AGUITextMessageStartEvent,
    'messageId' | 'role' | 'name' | 'timestamp' | 'rawEvent'
  >
>
const _textMessageStartDriftCheck: _TextMessageStartDriftCheck = true
void _textMessageStartDriftCheck

/**
 * Emitted when text content is generated (streaming tokens).
 *
 * @ag-ui/core provides: `messageId`, `delta`
 * TanStack AI adds: `model?`, `content?` (accumulated)
 */
export interface TextMessageContentEvent extends Pick<
  AGUITextMessageContentEvent,
  'messageId' | 'delta' | 'timestamp' | 'rawEvent'
> {
  type: 'TEXT_MESSAGE_CONTENT'
  /** Model identifier for multi-model support */
  model?: string
  /** Full accumulated content so far (TanStack AI internal, for debugging) */
  content?: string
}
type _TextMessageContentDriftCheck = AssertSatisfiesAGUI<
  Omit<TextMessageContentEvent, 'type' | 'model' | 'content'>,
  Pick<
    AGUITextMessageContentEvent,
    'messageId' | 'delta' | 'timestamp' | 'rawEvent'
  >
>
const _textMessageContentDriftCheck: _TextMessageContentDriftCheck = true
void _textMessageContentDriftCheck

/**
 * Emitted when a text message completes.
 *
 * @ag-ui/core provides: `messageId`
 * TanStack AI adds: `model?`
 */
export interface TextMessageEndEvent extends Pick<
  AGUITextMessageEndEvent,
  'messageId' | 'timestamp' | 'rawEvent'
> {
  type: 'TEXT_MESSAGE_END'
  /** Model identifier for multi-model support */
  model?: string
}
type _TextMessageEndDriftCheck = AssertSatisfiesAGUI<
  Omit<TextMessageEndEvent, 'type' | 'model'>,
  Pick<AGUITextMessageEndEvent, 'messageId' | 'timestamp' | 'rawEvent'>
>
const _textMessageEndDriftCheck: _TextMessageEndDriftCheck = true
void _textMessageEndDriftCheck

/**
 * Emitted when a tool call starts.
 *
 * @ag-ui/core provides: `toolCallId`, `toolCallName`, `parentMessageId?`
 * TanStack AI adds: `model?`, `toolName` (deprecated alias), `index?`, `metadata?`
 *
 * @typeParam TToolName - Constrained tool name type. Defaults to `string` (untyped).
 *   When the stream is returned from `chat()` with typed tools, this narrows to
 *   the union of tool name literals on both `toolCallName` and the deprecated
 *   `toolName` alias via the `DistributedToolCallStart` intersection — the base
 *   interface intentionally keeps `toolCallName` at `string` so the
 *   `AGUIToolCallStartEvent` parent (which uses a passthrough index signature)
 *   remains a compatible supertype without triggering `Omit`-induced
 *   discriminant collapse.
 *
 * Note: `TToolName` is preserved on the `toolName` (TanStack-only) field and
 * appears as a literal in the discriminated `DistributedToolCallStart`
 * variants of `TypedStreamChunk`. Consumers narrowing through
 * `TypedStreamChunk` get the literal. Consumers reading a bare
 * `ToolCallStartEvent<'x'>['toolCallName']` get `string` — use the
 * distributed variant (via `TypedStreamChunk`) for discriminated narrowing.
 */
export interface ToolCallStartEvent<
  TToolName extends string = string,
> extends Pick<
  AGUIToolCallStartEvent,
  'toolCallId' | 'toolCallName' | 'parentMessageId' | 'timestamp' | 'rawEvent'
> {
  type: 'TOOL_CALL_START'
  /** Model identifier for multi-model support */
  model?: string
  /**
   * @deprecated Use `toolCallName` instead (from @ag-ui/core spec).
   * Kept for backward compatibility.
   *
   * This field carries the `TToolName` literal in typed streams. For
   * `toolCallName` narrowing, use `TypedStreamChunk` — its
   * `DistributedToolCallStart` variants intersect an override in.
   */
  toolName: TToolName
  /** Index for parallel tool calls */
  index?: number
  /** Provider-specific metadata to carry into the ToolCall.
   * Untyped at the event layer because events flow through a discriminated
   * union that does not survive generics; adapters cast it to their typed
   * `TToolCallMetadata` shape when emitting. */
  metadata?: Record<string, unknown>
}
type _ToolCallStartDriftCheck = AssertSatisfiesAGUI<
  Omit<
    ToolCallStartEvent,
    'type' | 'model' | 'toolName' | 'index' | 'metadata'
  >,
  Pick<
    AGUIToolCallStartEvent,
    'toolCallId' | 'toolCallName' | 'parentMessageId' | 'timestamp' | 'rawEvent'
  >
>
const _toolCallStartDriftCheck: _ToolCallStartDriftCheck = true
void _toolCallStartDriftCheck

/**
 * Emitted when tool call arguments are streaming.
 *
 * @ag-ui/core provides: `toolCallId`, `delta`
 * TanStack AI adds: `model?`, `args?` (accumulated)
 */
export interface ToolCallArgsEvent extends Pick<
  AGUIToolCallArgsEvent,
  'toolCallId' | 'delta' | 'timestamp' | 'rawEvent'
> {
  type: 'TOOL_CALL_ARGS'
  /** Model identifier for multi-model support */
  model?: string
  /** Full accumulated arguments so far (TanStack AI internal) */
  args?: string
}
type _ToolCallArgsDriftCheck = AssertSatisfiesAGUI<
  Omit<ToolCallArgsEvent, 'type' | 'model' | 'args'>,
  Pick<AGUIToolCallArgsEvent, 'toolCallId' | 'delta' | 'timestamp' | 'rawEvent'>
>
const _toolCallArgsDriftCheck: _ToolCallArgsDriftCheck = true
void _toolCallArgsDriftCheck

/**
 * Emitted when a tool call completes.
 *
 * @ag-ui/core provides: `toolCallId`
 * TanStack AI adds: `model?`, `toolCallName?`, `toolName?` (deprecated), `input?`, `output?`, `result?`
 *
 * @typeParam TToolName - Constrained tool name type. Defaults to `string` (untyped).
 * @typeParam TInput - Constrained input arguments type. Defaults to `unknown` (untyped).
 * @typeParam TOutput - Constrained output type, inferred from the tool's
 *   `outputSchema`. Defaults to `unknown` (untyped).
 *   When the stream is returned from `chat()` with typed tools, these narrow to
 *   the union of tool name literals, input types, and output types respectively.
 */
export interface ToolCallEndEvent<
  TToolName extends string = string,
  TInput = unknown,
  TOutput = unknown,
> extends Pick<AGUIToolCallEndEvent, 'toolCallId' | 'timestamp' | 'rawEvent'> {
  type: 'TOOL_CALL_END'
  /** Model identifier for multi-model support */
  model?: string
  /**
   * Name of the tool that completed (from @ag-ui/core spec).
   *
   * `AGUIToolCallEndEvent` does not declare `toolCallName`, so re-declaring
   * it here as optional is safe — it extends the base shape rather than
   * narrowing an existing field. `DistributedToolCallEnd` intersects an
   * override to make it required and narrowed to the tool's literal name
   * in `TypedStreamChunk`.
   */
  toolCallName?: TToolName
  /**
   * @deprecated Use `toolCallName` instead.
   * Kept for backward compatibility. Required so that consumers who rely on
   * the TanStack surface (pre-ag-ui-merge) can continue to read `toolName`
   * without an `undefined` check — every adapter populates this field.
   */
  toolName: TToolName
  /** Final parsed input arguments (TanStack AI internal) */
  input?: TInput
  /**
   * Tool execution output, validated against the tool's `outputSchema` when
   * one is declared. Set by the engine before JSON-stringifying into
   * `result`. Undefined for tools without a `.server(...)` implementation
   * (pure client tools — their results arrive via the chat client's tool
   * approval path instead).
   */
  output?: TOutput
  /**
   * Wire-level JSON-stringified result. The AG-UI spec carries the result
   * as text; consumers that need the typed object should read `output`
   * instead (it carries the parsed value before serialization).
   */
  result?: string
}
type _ToolCallEndDriftCheck = AssertSatisfiesAGUI<
  Omit<
    ToolCallEndEvent,
    | 'type'
    | 'model'
    | 'toolCallName'
    | 'toolName'
    | 'input'
    | 'output'
    | 'result'
  >,
  Pick<AGUIToolCallEndEvent, 'toolCallId' | 'timestamp' | 'rawEvent'>
>
const _toolCallEndDriftCheck: _ToolCallEndDriftCheck = true
void _toolCallEndDriftCheck

/**
 * Emitted when a tool call result is available.
 *
 * @ag-ui/core provides: `messageId`, `toolCallId`, `content`, `role?`
 * TanStack AI adds: `model?`
 */
export interface ToolCallResultEvent extends Pick<
  AGUIToolCallResultEvent,
  'messageId' | 'toolCallId' | 'content' | 'role' | 'timestamp' | 'rawEvent'
> {
  type: 'TOOL_CALL_RESULT'
  /** Model identifier for multi-model support */
  model?: string
}
type _ToolCallResultDriftCheck = AssertSatisfiesAGUI<
  Omit<ToolCallResultEvent, 'type' | 'model'>,
  Pick<
    AGUIToolCallResultEvent,
    'messageId' | 'toolCallId' | 'content' | 'role' | 'timestamp' | 'rawEvent'
  >
>
const _toolCallResultDriftCheck: _ToolCallResultDriftCheck = true
void _toolCallResultDriftCheck

/**
 * Emitted when a thinking/reasoning step starts.
 *
 * @ag-ui/core provides: `stepName`
 * TanStack AI adds: `model?`, `stepId?` (deprecated alias), `stepType?`
 */
export interface StepStartedEvent extends Pick<
  AGUIStepStartedEvent,
  'stepName' | 'timestamp' | 'rawEvent'
> {
  type: 'STEP_STARTED'
  /** Model identifier for multi-model support */
  model?: string
  /**
   * @deprecated Use `stepName` instead (from @ag-ui/core spec).
   * Kept for backward compatibility.
   */
  stepId?: string
  /** Type of step (e.g., 'thinking', 'planning') */
  stepType?: string
}
type _StepStartedDriftCheck = AssertSatisfiesAGUI<
  Omit<StepStartedEvent, 'type' | 'model' | 'stepId' | 'stepType'>,
  Pick<AGUIStepStartedEvent, 'stepName' | 'timestamp' | 'rawEvent'>
>
const _stepStartedDriftCheck: _StepStartedDriftCheck = true
void _stepStartedDriftCheck

/**
 * Emitted when a thinking/reasoning step finishes.
 *
 * @ag-ui/core provides: `stepName`
 * TanStack AI adds: `model?`, `stepId?` (deprecated alias), `delta?`, `content?`
 */
export interface StepFinishedEvent extends Pick<
  AGUIStepFinishedEvent,
  'stepName' | 'timestamp' | 'rawEvent'
> {
  type: 'STEP_FINISHED'
  /** Model identifier for multi-model support */
  model?: string
  /**
   * @deprecated Use `stepName` instead (from @ag-ui/core spec).
   * Kept for backward compatibility.
   */
  stepId?: string
  /** Incremental thinking content (TanStack AI internal) */
  delta?: string
  /** Full accumulated thinking content (TanStack AI internal) */
  content?: string
  /** Provider signature for the thinking block */
  signature?: string
}
type _StepFinishedDriftCheck = AssertSatisfiesAGUI<
  Omit<
    StepFinishedEvent,
    'type' | 'model' | 'stepId' | 'delta' | 'content' | 'signature'
  >,
  Pick<AGUIStepFinishedEvent, 'stepName' | 'timestamp' | 'rawEvent'>
>
const _stepFinishedDriftCheck: _StepFinishedDriftCheck = true
void _stepFinishedDriftCheck

/**
 * Emitted to provide a snapshot of all messages in a conversation.
 *
 * Unlike StateSnapshot (which carries arbitrary application state),
 * MessagesSnapshot specifically delivers the conversation transcript.
 *
 * @ag-ui/core provides: `messages` (as @ag-ui/core Message[])
 * TanStack AI adds: `model?`
 *
 * Note: The `messages` field uses the @ag-ui/core Message type.
 * Use converters to transform to/from TanStack UIMessage format.
 */
export interface MessagesSnapshotEvent extends Pick<
  AGUIMessagesSnapshotEvent,
  'messages' | 'timestamp' | 'rawEvent'
> {
  type: 'MESSAGES_SNAPSHOT'
  /** Model identifier for multi-model support */
  model?: string
}
type _MessagesSnapshotDriftCheck = AssertSatisfiesAGUI<
  Omit<MessagesSnapshotEvent, 'type' | 'model'>,
  Pick<AGUIMessagesSnapshotEvent, 'messages' | 'timestamp' | 'rawEvent'>
>
const _messagesSnapshotDriftCheck: _MessagesSnapshotDriftCheck = true
void _messagesSnapshotDriftCheck

/**
 * Emitted to provide a full state snapshot.
 *
 * @ag-ui/core provides: `snapshot` (any)
 * TanStack AI adds: `model?`, `state?` (deprecated alias for snapshot)
 */
export interface StateSnapshotEvent extends Pick<
  AGUIStateSnapshotEvent,
  'snapshot' | 'timestamp' | 'rawEvent'
> {
  type: 'STATE_SNAPSHOT'
  /** Model identifier for multi-model support */
  model?: string
  /**
   * @deprecated Use `snapshot` instead (from @ag-ui/core spec).
   * Kept for backward compatibility.
   */
  state?: Record<string, unknown>
}
type _StateSnapshotDriftCheck = AssertSatisfiesAGUI<
  Omit<StateSnapshotEvent, 'type' | 'model' | 'state'>,
  Pick<AGUIStateSnapshotEvent, 'snapshot' | 'timestamp' | 'rawEvent'>
>
const _stateSnapshotDriftCheck: _StateSnapshotDriftCheck = true
void _stateSnapshotDriftCheck

/**
 * Emitted to provide an incremental state update.
 *
 * @ag-ui/core provides: `delta` (any[] - JSON Patch RFC 6902)
 * TanStack AI adds: `model?`
 */
export interface StateDeltaEvent extends Pick<
  AGUIStateDeltaEvent,
  'delta' | 'timestamp' | 'rawEvent'
> {
  type: 'STATE_DELTA'
  /** Model identifier for multi-model support */
  model?: string
}
type _StateDeltaDriftCheck = AssertSatisfiesAGUI<
  Omit<StateDeltaEvent, 'type' | 'model'>,
  Pick<AGUIStateDeltaEvent, 'delta' | 'timestamp' | 'rawEvent'>
>
const _stateDeltaDriftCheck: _StateDeltaDriftCheck = true
void _stateDeltaDriftCheck

/**
 * Custom event for extensibility.
 *
 * @ag-ui/core provides: `name`, `value`
 * TanStack AI adds: `model?`
 */
export interface CustomEvent extends Pick<
  AGUICustomEvent,
  'name' | 'value' | 'timestamp' | 'rawEvent'
> {
  type: 'CUSTOM'
  /** Model identifier for multi-model support */
  model?: string
  /**
   * Routing metadata the TanStack engine attaches when emitting CUSTOM
   * events that need to be correlated with a specific thread/run.
   * Stripped by `strip-to-spec-middleware` before going on the wire so
   * the AG-UI consumer never sees them.
   */
  threadId?: string
  runId?: string
}
type _CustomDriftCheck = AssertSatisfiesAGUI<
  Omit<CustomEvent, 'type' | 'model' | 'threadId' | 'runId'>,
  Pick<AGUICustomEvent, 'name' | 'value' | 'timestamp' | 'rawEvent'>
>
const _customDriftCheck: _CustomDriftCheck = true
void _customDriftCheck

/**
 * Final event of a streaming structured-output run. Carries the validated
 * `object` (typed as `T` after the orchestrator runs Standard Schema parsing),
 * the `raw` JSON text that produced it, and — for thinking/reasoning models —
 * the accumulated reasoning text. Adapters emit this with `T = unknown`; the
 * chat orchestrator narrows to the schema's inferred type after validation.
 *
 * `reasoning` is `undefined` when the model produced none (most non-thinking
 * models) and when the underlying adapter doesn't expose reasoning streams.
 *
 * `name` is a string literal so consumers can narrow directly:
 *
 * ```ts
 * if (chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete') {
 *   chunk.value.object // typed as T
 * }
 * ```
 */
export interface StructuredOutputCompleteEvent<
  T = unknown,
> extends CustomEvent {
  name: 'structured-output.complete'
  value: { object: T; raw: string; reasoning?: string }
}

/**
 * Emitted at the start of a streaming structured-output run, before the JSON
 * deltas. Tells consumers that the upcoming `TEXT_MESSAGE_CONTENT` deltas
 * belong to a structured response so they can route those bytes into a
 * `StructuredOutputPart` instead of building a `TextPart`. Carries the
 * `messageId` the deltas will be tagged with so the routing decision can be
 * made per-message rather than globally.
 */
export interface StructuredOutputStartEvent extends CustomEvent {
  name: 'structured-output.start'
  value: { messageId: string }
}

/**
 * Emitted when a server tool requires approval before execution. The agent
 * loop yields this and pauses — `structured-output.complete` will not fire
 * for that run. The shape is fixed by the orchestrator's tool-approval flow
 * (the agent-loop branch of `runStreamingStructuredOutputImpl` in
 * `activities/chat/index.ts` forwards CUSTOM events from `TextEngine.run()`).
 */
export interface ApprovalRequestedEvent extends CustomEvent {
  name: 'approval-requested'
  value: {
    toolCallId: string
    toolName: string
    input: unknown
    approval: { id: string; needsApproval: true }
  }
}

/**
 * Emitted when a client tool is invoked. The agent loop yields this and
 * pauses to let the caller run the tool client-side — `structured-output.complete`
 * will not fire for that run. Shape fixed by the agent-loop forwarding in
 * `runStreamingStructuredOutputImpl` in `activities/chat/index.ts`.
 */
export interface ToolInputAvailableEvent extends CustomEvent {
  name: 'tool-input-available'
  value: {
    toolCallId: string
    toolName: string
    input: unknown
  }
}

/**
 * Public type for streams returned by `chat({ outputSchema, stream: true })`.
 *
 * Yields all standard `StreamChunk` lifecycle events plus the three tagged
 * `CUSTOM` events the orchestrator can emit through this path:
 * - `structured-output.complete` — terminal event with typed `value.object: T`
 * - `approval-requested` — server tool needs approval (pauses the run)
 * - `tool-input-available` — client tool invocation (pauses the run)
 *
 * Each variant has a literal `name`, so a single discriminated narrow gives
 * you a typed `value` with no helper or cast:
 *
 * ```ts
 * for await (const chunk of stream) {
 *   if (chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete') {
 *     chunk.value.object // typed as T
 *   } else if (chunk.type === 'CUSTOM' && chunk.name === 'approval-requested') {
 *     chunk.value.toolCallId // typed as string
 *   }
 * }
 * ```
 *
 * Caveat: tools can emit arbitrary user-defined custom events via the
 * `emitCustomEvent(name, value)` context API. Those flow through this stream
 * at runtime but are intentionally absent from this type — including a bare
 * `CustomEvent` (whose `value: any` would poison the union) would collapse
 * `chunk.value` back to `any` after the narrow. If you rely on
 * `emitCustomEvent` plus `outputSchema + stream: true`, branch on `CUSTOM`
 * outside the literal-`name` narrows or cast explicitly.
 */
export type StructuredOutputStream<T = unknown> = AsyncIterable<
  Exclude<StreamChunk, CustomEvent> | TaggedCustomEvent<T>
>

// ============================================================================
// AG-UI Reasoning Event Interfaces
// ============================================================================

/**
 * Emitted when reasoning starts for a message.
 *
 * @ag-ui/core provides: `messageId`
 * TanStack AI adds: `model?`
 */
export interface ReasoningStartEvent extends Pick<
  AGUIReasoningStartEvent,
  'messageId' | 'timestamp' | 'rawEvent'
> {
  type: 'REASONING_START'
  /** Model identifier for multi-model support */
  model?: string
}
type _ReasoningStartDriftCheck = AssertSatisfiesAGUI<
  Omit<ReasoningStartEvent, 'type' | 'model'>,
  Pick<AGUIReasoningStartEvent, 'messageId' | 'timestamp' | 'rawEvent'>
>
const _reasoningStartDriftCheck: _ReasoningStartDriftCheck = true
void _reasoningStartDriftCheck

/**
 * Emitted when a reasoning message starts.
 *
 * @ag-ui/core provides: `messageId`, `role` ("reasoning")
 * TanStack AI adds: `model?`
 */
export interface ReasoningMessageStartEvent extends Pick<
  AGUIReasoningMessageStartEvent,
  'messageId' | 'role' | 'timestamp' | 'rawEvent'
> {
  type: 'REASONING_MESSAGE_START'
  /** Model identifier for multi-model support */
  model?: string
}
type _ReasoningMessageStartDriftCheck = AssertSatisfiesAGUI<
  Omit<ReasoningMessageStartEvent, 'type' | 'model'>,
  Pick<
    AGUIReasoningMessageStartEvent,
    'messageId' | 'role' | 'timestamp' | 'rawEvent'
  >
>
const _reasoningMessageStartDriftCheck: _ReasoningMessageStartDriftCheck = true
void _reasoningMessageStartDriftCheck

/**
 * Emitted when reasoning message content is generated.
 *
 * @ag-ui/core provides: `messageId`, `delta`
 * TanStack AI adds: `model?`
 */
export interface ReasoningMessageContentEvent extends Pick<
  AGUIReasoningMessageContentEvent,
  'messageId' | 'delta' | 'timestamp' | 'rawEvent'
> {
  type: 'REASONING_MESSAGE_CONTENT'
  /** Model identifier for multi-model support */
  model?: string
}
type _ReasoningMessageContentDriftCheck = AssertSatisfiesAGUI<
  Omit<ReasoningMessageContentEvent, 'type' | 'model'>,
  Pick<
    AGUIReasoningMessageContentEvent,
    'messageId' | 'delta' | 'timestamp' | 'rawEvent'
  >
>
const _reasoningMessageContentDriftCheck: _ReasoningMessageContentDriftCheck = true
void _reasoningMessageContentDriftCheck

/**
 * Emitted when a reasoning message ends.
 *
 * @ag-ui/core provides: `messageId`
 * TanStack AI adds: `model?`
 */
export interface ReasoningMessageEndEvent extends Pick<
  AGUIReasoningMessageEndEvent,
  'messageId' | 'timestamp' | 'rawEvent'
> {
  type: 'REASONING_MESSAGE_END'
  /** Model identifier for multi-model support */
  model?: string
}
type _ReasoningMessageEndDriftCheck = AssertSatisfiesAGUI<
  Omit<ReasoningMessageEndEvent, 'type' | 'model'>,
  Pick<AGUIReasoningMessageEndEvent, 'messageId' | 'timestamp' | 'rawEvent'>
>
const _reasoningMessageEndDriftCheck: _ReasoningMessageEndDriftCheck = true
void _reasoningMessageEndDriftCheck

/**
 * Emitted when reasoning ends for a message.
 *
 * @ag-ui/core provides: `messageId`
 * TanStack AI adds: `model?`
 */
export interface ReasoningEndEvent extends Pick<
  AGUIReasoningEndEvent,
  'messageId' | 'timestamp' | 'rawEvent'
> {
  type: 'REASONING_END'
  /** Model identifier for multi-model support */
  model?: string
}
type _ReasoningEndDriftCheck = AssertSatisfiesAGUI<
  Omit<ReasoningEndEvent, 'type' | 'model'>,
  Pick<AGUIReasoningEndEvent, 'messageId' | 'timestamp' | 'rawEvent'>
>
const _reasoningEndDriftCheck: _ReasoningEndDriftCheck = true
void _reasoningEndDriftCheck

/**
 * Emitted for encrypted reasoning values.
 *
 * @ag-ui/core provides: `subtype`, `entityId`, `encryptedValue`
 * TanStack AI adds: `model?`
 */
export interface ReasoningEncryptedValueEvent extends Pick<
  AGUIReasoningEncryptedValueEvent,
  'subtype' | 'entityId' | 'encryptedValue' | 'timestamp' | 'rawEvent'
> {
  type: 'REASONING_ENCRYPTED_VALUE'
  /** Model identifier for multi-model support */
  model?: string
}
type _ReasoningEncryptedValueDriftCheck = AssertSatisfiesAGUI<
  Omit<ReasoningEncryptedValueEvent, 'type' | 'model'>,
  Pick<
    AGUIReasoningEncryptedValueEvent,
    'subtype' | 'entityId' | 'encryptedValue' | 'timestamp' | 'rawEvent'
  >
>
const _reasoningEncryptedValueDriftCheck: _ReasoningEncryptedValueDriftCheck = true
void _reasoningEncryptedValueDriftCheck

// ============================================================================
// AG-UI Event Union
// ============================================================================

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
  | ToolCallResultEvent
  | StepStartedEvent
  | StepFinishedEvent
  | MessagesSnapshotEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | CustomEvent
  | ReasoningStartEvent
  | ReasoningMessageStartEvent
  | ReasoningMessageContentEvent
  | ReasoningMessageEndEvent
  | ReasoningEndEvent
  | ReasoningEncryptedValueEvent

/**
 * Chunk returned by the SDK during streaming chat completions.
 * Uses the AG-UI protocol event format.
 */
export type StreamChunk = AGUIEvent

// ============================================================================
// Typed Stream Chunks (tool-aware)
// ============================================================================

/**
 * Detect the `any` type. Returns `true` for `any`, `false` for everything else.
 * @internal
 */
type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Partition out provider-specific tools from a tools array. `ProviderTool`
 * carries opaque provider metadata (e.g. `webSearchTool` from
 * `@tanstack/ai-anthropic`) and intentionally has a generic `string` name —
 * if we included it in the discriminated union, it would widen `toolName`
 * back to `string` and defeat the entire typing exercise.
 *
 * @internal
 */
type NonProviderTools<TTools extends ReadonlyArray<Tool<any, any, any>>> =
  Exclude<TTools[number], ProviderTool<string, string>>

/**
 * Check whether the tools array carries typed tool definitions.
 * Returns `false` for empty arrays or arrays whose only entries are
 * `ProviderTool`s (which have generic `string` names).
 *
 * The partitioning step matters: a user who passes
 * `[webSearchTool, myTypedTool]` should still get typed narrowing for
 * `myTypedTool`. Evaluating `string extends TTools[number]['name']` without
 * filtering provider tools first would always return `false` (because
 * `ProviderTool`'s `name` is `string`) and silently fall through to the
 * untyped branch.
 *
 * @internal
 */
type HasTypedTools<TTools extends ReadonlyArray<Tool<any, any, any>>> = [
  NonProviderTools<TTools>,
] extends [never]
  ? false
  : string extends NonProviderTools<TTools>['name']
    ? false
    : true

/**
 * Safely infer input type for a single tool, guarding against `any` leaks.
 * Returns `unknown` when the tool has no inputSchema or when InferSchemaType
 * produces `any` (e.g. for plain JSON Schema tools).
 * @internal
 */
type SafeToolInput<T> = T extends {
  inputSchema?: infer TInput
}
  ? IsAny<InferSchemaType<NonNullable<TInput>>> extends true
    ? unknown
    : InferSchemaType<NonNullable<TInput>>
  : unknown

/**
 * Safely infer output type for a single tool. Mirrors `SafeToolInput`,
 * picking `outputSchema` instead. Returns `unknown` when the tool has no
 * `outputSchema` declared or when `InferSchemaType` produces `any`.
 * @internal
 */
type SafeToolOutput<T> = T extends {
  outputSchema?: infer TOutput
}
  ? IsAny<InferSchemaType<NonNullable<TOutput>>> extends true
    ? unknown
    : InferSchemaType<NonNullable<TOutput>>
  : unknown

/**
 * Distribute over each non-provider tool to create a per-tool
 * `ToolCallStartEvent`.
 *
 * This produces a discriminated union — one variant per tool name literal.
 * We distribute over `NonProviderTools<TTools>` (not `TTools[number]`) so
 * that provider tools with generic `string` names do not leak into the
 * union and widen `toolCallName` / `toolName` back to `string`.
 *
 * The trailing `& { toolCallName: TName; toolName: TName }` intersection
 * narrows the base `AGUIToolCallStartEvent['toolCallName']` (declared as
 * `string`) to the literal name — TypeScript intersects `string & TName`
 * down to `TName` for literal `TName`.
 *
 * The `name` parameter constraint on the inner `extends` picks up any
 * tool-like shape — including `ServerTool`, `ClientTool`, and the bare
 * `Tool` definition — because all three expose `name: TName`.
 * @internal
 */
type DistributedToolCallStart<
  TTools extends ReadonlyArray<Tool<any, any, any>>,
> =
  NonProviderTools<TTools> extends infer T
    ? T extends { name: infer TName extends string }
      ? ToolCallStartEvent<TName> & { toolCallName: TName; toolName: TName }
      : never
    : never

/**
 * Distribute over each non-provider tool to create a per-tool
 * `ToolCallEndEvent`.
 *
 * Each variant pairs the tool's name literal with its specific input type,
 * enabling discriminated narrowing: checking `toolName === 'x'` narrows
 * `input`.
 *
 * `toolName`/`toolCallName` are intersected as required in the distributed
 * variants so that `Extract<..., { toolName: 'x' }>` works for consumers
 * relying on the discriminated-union pattern, even though the base
 * interface keeps them optional for compatibility with the broader AG-UI
 * surface.
 *
 * Distribution happens over `NonProviderTools<TTools>` for the same
 * reason as in `DistributedToolCallStart`.
 * @internal
 */
type DistributedToolCallEnd<TTools extends ReadonlyArray<Tool<any, any, any>>> =
  NonProviderTools<TTools> extends infer T
    ? T extends { name: infer TName extends string }
      ? ToolCallEndEvent<TName, SafeToolInput<T>, SafeToolOutput<T>> & {
          toolCallName: TName
          toolName: TName
        }
      : never
    : never

/**
 * Discriminated union of the orchestrator-tagged `CUSTOM` events. Each variant
 * has a literal `name`, so a single narrow on `chunk.name` yields a typed
 * `value` with no helper or cast:
 *
 * ```ts
 * if (chunk.type === 'CUSTOM' && chunk.name === 'approval-requested') {
 *   chunk.value.toolCallId // typed as string
 * }
 * ```
 *
 * The `StructuredOutputCompleteEvent` value is parameterized by `T`, which
 * the chat orchestrator narrows to the schema's inferred type after Standard
 * Schema validation. Adapters always emit it with `T = unknown`.
 *
 * Caveat: tools can emit arbitrary user-defined custom events via the
 * `emitCustomEvent(name, value)` context API. Those flow through the stream
 * at runtime but are intentionally absent from this union — including a bare
 * `CustomEvent` (whose `value: any` would poison the union) would collapse
 * `chunk.value` back to `any` after the narrow. If you rely on
 * `emitCustomEvent`, branch on `CUSTOM` outside the literal-`name` narrows
 * or cast the chunk to `StreamChunk` to recover the wider shape.
 */
export type TaggedCustomEvent<T = unknown> =
  | StructuredOutputStartEvent
  | StructuredOutputCompleteEvent<T>
  | ApprovalRequestedEvent
  | ToolInputAvailableEvent

/**
 * Stream chunk type parameterized by the tools array for type-safe tool call events.
 *
 * When specific tool types are provided (e.g. from `chat({ tools: [myTool] })`):
 * - `TOOL_CALL_START` and `TOOL_CALL_END` events form a **discriminated union**
 *   over tool names — checking `toolName === 'x'` narrows `input` to that tool's type.
 * - `TOOL_CALL_END` events have `input` typed per-tool via Standard Schema inference.
 *
 * `CUSTOM` events are narrowed to the discriminated `TaggedCustomEvent`
 * union — `structured-output.start/complete`, `approval-requested`, and
 * `tool-input-available` all carry typed `value` payloads. Free-form
 * user-emitted custom events (via `emitCustomEvent`) still flow at runtime
 * but are excluded from the type to avoid `any` poisoning the union; cast to
 * `StreamChunk` if you need to read those.
 *
 * When tools are untyped or absent, the tool-call events stay as plain
 * `ToolCallStartEvent` / `ToolCallEndEvent` (no per-tool name narrowing),
 * but `CUSTOM` events still narrow to `TaggedCustomEvent` — the tagged
 * shapes the engine emits (`structured-output.start/complete`,
 * `approval-requested`, `tool-input-available`) don't depend on the
 * tools array, so they're available in every variant of the union.
 *
 * Free-form user-emitted custom events (via `emitCustomEvent`) still
 * flow at runtime but are excluded from the type to avoid `any`
 * poisoning the union; cast to `StreamChunk` if you need to read those.
 */
export type TypedStreamChunk<
  TTools extends ReadonlyArray<Tool<any, any, any>> = ReadonlyArray<
    Tool<any, any, any>
  >,
> =
  HasTypedTools<TTools> extends true
    ?
        | Exclude<
            StreamChunk,
            | { type: 'TOOL_CALL_START' }
            | { type: 'TOOL_CALL_END' }
            | { type: 'CUSTOM' }
          >
        | DistributedToolCallStart<TTools>
        | DistributedToolCallEnd<TTools>
        | TaggedCustomEvent
    : Exclude<StreamChunk, { type: 'CUSTOM' }> | TaggedCustomEvent

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

export interface SummarizationOptions<
  TProviderOptions extends object = Record<string, unknown>,
> {
  model: string
  text: string
  maxLength?: number
  style?: 'bullet-points' | 'paragraph' | 'concise'
  focus?: Array<string>
  /** Provider-specific options forwarded by the summarize() activity. */
  modelOptions?: TProviderOptions
  /**
   * Internal logger threaded from the summarize() entry point. Adapters must
   * call logger.request() before the SDK call and logger.errors() in catch blocks.
   */
  logger: InternalLogger
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
  TSize extends string | undefined = string,
> {
  /** The model to use for image generation */
  model: string
  /** Text description of the desired image(s) */
  prompt: string
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: TSize
  /** Model-specific options for image generation */
  modelOptions?: TProviderOptions
  /**
   * Internal logger threaded from the generateImage() entry point. Adapters must
   * call logger.request() before the SDK call and logger.errors() in catch blocks.
   */
  logger: InternalLogger
}

/**
 * Source of a generated media asset. Exactly one of `url` or `b64Json` is
 * present; the other is absent. Modeled as a mutually-exclusive union so the
 * type rejects `{}` and `{ url, b64Json }` together at compile time while
 * preserving the flat `.url` / `.b64Json` access patterns.
 */
export type GeneratedMediaSource =
  | {
      /** URL to the generated asset (may be temporary) */
      url: string
      b64Json?: never
    }
  | {
      /** Base64-encoded asset data */
      b64Json: string
      url?: never
    }

/**
 * A single generated image
 */
export type GeneratedImage = GeneratedMediaSource & {
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
// Audio Generation Types
// ============================================================================

/**
 * Options for audio generation (music, sound effects, etc.).
 * These are the common options supported across providers.
 */
export interface AudioGenerationOptions<
  TProviderOptions extends object = object,
> {
  /** The model to use for audio generation */
  model: string
  /** Text description of the desired audio */
  prompt: string
  /** Desired duration in seconds */
  duration?: number
  /** Model-specific options for audio generation */
  modelOptions?: TProviderOptions
  /**
   * Internal logger threaded from the generateAudio() entry point. Adapters
   * must call logger.request() before the SDK call and logger.errors() in
   * catch blocks.
   */
  logger: InternalLogger
}

/**
 * A single generated audio output
 */
export type GeneratedAudio = GeneratedMediaSource & {
  /** Content type of the audio (e.g., 'audio/wav', 'audio/mp3') */
  contentType?: string
  /** Duration of the generated audio in seconds */
  duration?: number
}

/**
 * Result of audio generation
 */
export interface AudioGenerationResult {
  /** Unique identifier for the generation */
  id: string
  /** Model used for generation */
  model: string
  /** The generated audio */
  audio: GeneratedAudio
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
  TSize extends string | undefined = string,
> {
  /** The model to use for video generation */
  model: string
  /** Text description of the desired video */
  prompt: string
  /** Video size — format depends on the provider (e.g., "16:9", "1280x720") */
  size?: TSize
  /** Video duration in seconds */
  duration?: number
  /** Model-specific options for video generation */
  modelOptions?: TProviderOptions
  /**
   * Internal logger threaded from the generateVideo() entry point. Adapters must
   * call logger.request() before the SDK call and logger.errors() in catch blocks.
   */
  logger: InternalLogger
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
  /**
   * Internal logger threaded from the generateSpeech() entry point. Adapters
   * must call logger.request() before the SDK call and logger.errors() in
   * catch blocks.
   */
  logger: InternalLogger
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
  /**
   * Internal logger threaded from the generateTranscription() entry point.
   * Adapters must call logger.request() before the SDK call and logger.errors()
   * in catch blocks.
   */
  logger: InternalLogger
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
