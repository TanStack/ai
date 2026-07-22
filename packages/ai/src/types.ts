import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'
import type { InternalLogger } from './logger/internal-logger'
import type { SystemPrompt } from './system-prompts'
import type { CapabilityContext } from './activities/chat/middleware/capabilities'
import type { InterruptSubmissionError } from './interrupts'
import type { ProviderTool } from './tools/provider-tool'
// The canonical usage types live in the leaf `@tanstack/ai-event-client`
// package (which `@tanstack/ai` already depends on) so there is a single source
// of truth without a dependency cycle. They are re-exported below.
import type {
  CompletionTokensDetails,
  PromptTokensDetails,
  ProviderUsageDetails,
  TokenUsage,
  UsageCostBreakdown,
} from '@tanstack/ai-event-client'
import type {
  BaseEvent as AGUIBaseEvent,
  CustomEvent as AGUICustomEvent,
  Interrupt as AGUIInterrupt,
  MessagesSnapshotEvent as AGUIMessagesSnapshotEvent,
  ReasoningEncryptedValueEvent as AGUIReasoningEncryptedValueEvent,
  ReasoningEndEvent as AGUIReasoningEndEvent,
  ReasoningMessageContentEvent as AGUIReasoningMessageContentEvent,
  ReasoningMessageEndEvent as AGUIReasoningMessageEndEvent,
  ReasoningMessageStartEvent as AGUIReasoningMessageStartEvent,
  ReasoningStartEvent as AGUIReasoningStartEvent,
  ResumeEntry as AGUIResumeEntry,
  RunErrorEvent as AGUIRunErrorEvent,
  RunFinishedEvent as AGUIRunFinishedEvent,
  RunFinishedOutcome as AGUIRunFinishedOutcome,
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
  | 'error' // Tool execution failed (terminal)

/**
 * Tool result states - track the lifecycle of a tool result
 */
export type ToolResultState =
  | 'streaming' // Placeholder for future streamed output
  | 'complete' // Result is complete
  | 'error' // Error occurred

export type ToolOutputState = 'output-available' | 'output-error'

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

/**
 * Convention for tool-call `metadata` that marks a call as **provider-executed**
 * — run by the provider's own infrastructure (e.g. Anthropic `web_search` /
 * `web_fetch` server tools) rather than by the agent loop. Adapters set
 * `providerExecuted: true` so that:
 *
 * 1. The agent loop never tries to execute the call client-side (see
 *    {@link isProviderExecutedToolCall} usage in the chat engine), and
 * 2. The adapter can stash the raw provider result alongside it so the call —
 *    and its evidence — round-trips into the next turn's request.
 *
 * Provider-specific payloads live under a namespaced key (e.g. `anthropic`),
 * keeping this convention opaque to the framework core. The index signature
 * preserves those per-adapter fields.
 */
export interface ProviderExecutedToolMetadata {
  providerExecuted?: boolean
  [key: string]: unknown
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
  /**
   * Parsed tool input. Set from the parsed arguments once they are complete
   * (`state: 'input-complete'` and later). `undefined` while the raw
   * `arguments` string is still streaming, and may stay `undefined` for a call
   * that terminates in an error state — the raw `arguments` string is always
   * available as a fallback. Typed per-tool on the client `ToolCallPart` (see
   * `@tanstack/ai-client`); `unknown` on this base type.
   */
  input?: unknown
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
   * Typed per-adapter via `TToolCallMetadata`. May follow the
   * {@link ProviderExecutedToolMetadata} convention to mark provider-executed
   * server tools (e.g. Anthropic `web_search`). */
  metadata?: TMetadata
}

export interface ToolResultPart {
  type: 'tool-result'
  toolCallId: string
  content: string | Array<ContentPart>
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

export interface UIResourcePart {
  type: 'ui-resource'
  /** The ui:// resource object in MCP-native shape — fed straight to the renderer. */
  resource: { uri: string; mimeType: string; text?: string; blob?: string }
  /** Pool prefix / config key — routes interactive calls to the right MCP server. */
  serverId?: string
  /** Links the widget to the originating tool call — correlates it with the
   *  sibling ToolCallPart/ToolResultPart in the same message. */
  toolCallId: string
  /** Server-native (unprefixed) MCP tool name whose UI this resource renders.
   *  Required by the renderer (`@mcp-ui/client`'s `AppRenderer` `toolName` prop). */
  toolName: string
  /** Reserved for future passthrough of the resource/tool `_meta.ui` (e.g. frame-size hints).
   *  Currently always `undefined` — nothing populates this field yet. */
  meta?: Record<string, unknown>
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
  | UIResourcePart

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

type IsUnknown<T> = unknown extends T
  ? [T] extends [unknown]
    ? true
    : false
  : false

type RuntimeContextField<TContext> =
  IsUnknown<TContext> extends true
    ? {
        /**
         * Runtime context provided by the caller.
         *
         * This is request-local application state for tool and middleware
         * implementations, not the AG-UI `Context[]` protocol field.
         */
        context?: TContext
      }
    : {
        /**
         * Runtime context provided by the caller.
         *
         * This is request-local application state for tool and middleware
         * implementations, not the AG-UI `Context[]` protocol field.
         */
        context: TContext
      }

/**
 * Context passed to tool execute functions, providing capabilities like
 * emitting custom events during execution.
 */
export type ToolExecutionContext<TContext = unknown> =
  RuntimeContextField<TContext> & {
    /** The ID of the tool call being executed */
    toolCallId?: string
    /**
     * Abort signal for the current chat run. Aborts when the run's
     * `abortController` fires (or middleware aborts). Long-running tools —
     * e.g. MCP `callTool` — should forward this to cancel in-flight work.
     */
    abortSignal?: AbortSignal
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

export type ToolExecuteFunction<
  TInput extends SchemaInput | undefined = SchemaInput,
  TOutput extends SchemaInput | undefined = SchemaInput,
  TContext = unknown,
> = undefined extends TContext
  ? (
      args: InferSchemaType<TInput>,
      context?: ToolExecutionContext<TContext>,
    ) => Promise<InferSchemaType<TOutput>> | InferSchemaType<TOutput>
  : (
      args: InferSchemaType<TInput>,
      context: ToolExecutionContext<TContext>,
    ) => Promise<InferSchemaType<TOutput>> | InferSchemaType<TOutput>

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
  TInput extends SchemaInput | undefined = SchemaInput,
  TOutput extends SchemaInput | undefined = SchemaInput,
  TName extends string = string,
  TContext = unknown,
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
  execute?: ToolExecuteFunction<TInput, TOutput, TContext> | undefined

  /** If true, tool execution requires user approval before running. Works with both server and client tools. */
  needsApproval?: boolean

  /** If true, this tool is lazy and will only be sent to the LLM after being discovered via the lazy tool discovery mechanism. Works with both chat() (the synthetic discovery tool) and Code Mode (kept out of the system prompt and revealed via discover_tools). */
  lazy?: boolean

  /** Additional metadata for adapters or custom extensions */
  metadata?: Record<string, any> | undefined
}

/**
 * Configuration for the lazy-tool discovery catalog, shared by chat() and
 * Code Mode. Optional in both — lazy behavior is triggered purely by tools
 * marked `lazy: true`; this only tunes how much of each lazy tool's
 * description appears in the pre-discovery catalog. The post-discovery payload
 * always returns the full description + schema.
 */
export interface LazyToolsConfig {
  /**
   * How much of each lazy tool's description appears in the pre-discovery
   * catalog (the names list shown before the model discovers the tool).
   * @default 'none'
   */
  includeDescription?: 'full' | 'first-sentence' | 'none'
}

export type AnyTool = Omit<Tool<any, any, any, any>, 'execute'> & {
  execute?: ((args: any, context?: any) => any) | undefined
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
  /** Current iteration count (0-indexed). One iteration = one model turn. */
  iterationCount: number
  /** Current messages array */
  messages: Array<ModelMessage>
  /** Finish reason from the last response */
  finishReason: string | null
  /**
   * Cumulative tool calls counted so far in this run (model-emitted during the
   * agent loop, including ones skipped by `maxToolCallsPerTurn`, and pending
   * tools from the inbound message list when resumed). Not a recount of full
   * message history; not model turns.
   */
  toolCallCount: number
  /**
   * Tool calls in the most recent budgeted batch — a live model turn or a
   * pending/resume batch (0 when the last phase produced no tool calls).
   */
  lastTurnToolCallCount: number
}

/**
 * Strategy function that determines whether the agent loop should continue
 *
 * @param state - Current state of the agent loop
 * @returns true to continue looping, false to stop
 *
 * @example
 * ```typescript
 * // Continue for up to 5 iterations (model turns, not tool calls)
 * const strategy: AgentLoopStrategy = ({ iterationCount }) => iterationCount < 5;
 * // Cap total tool calls across the run
 * const byTools: AgentLoopStrategy = ({ toolCallCount }) => toolCallCount < 20;
 * ```
 */
export type AgentLoopStrategy = (state: AgentLoopState) => boolean

/**
 * Options passed into the SDK and further piped to the AI provider.
 */
export interface TextOptions<
  TProviderOptionsSuperset extends Record<string, any> = Record<string, any>,
  TProviderOptionsForModel = TProviderOptionsSuperset,
  TContext = unknown,
> {
  model: string
  messages: Array<ModelMessage>
  tools?: Array<AnyTool> | undefined
  /**
   * Runtime context provided by the caller and passed to middleware and
   * server-side tool implementations.
   */
  context?: TContext
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
   * Maximum number of tool calls to **execute** from a single model turn (or
   * pending/resume batch). `0` skips all execution for that batch.
   *
   * Models can emit many parallel tool calls in one turn. `agentLoopStrategy`
   * (including `maxIterations` / `maxToolCalls`) is only evaluated between
   * turns, so without this cap a single runaway turn can still execute an
   * unbounded fan-out.
   *
   * When set, only the first `maxToolCallsPerTurn` calls are executed; the
   * remainder receive error tool results so the message history stays
   * consistent. Unset means no per-turn execution cap. Must be a non-negative
   * finite number when set.
   *
   * Pair with the `maxToolCalls(n)` strategy for a cumulative **emitted**-call
   * budget across the run (skipped calls still count toward that budget).
   */
  maxToolCallsPerTurn?: number
  /**
   * Optional configuration for lazy-tool discovery (tools marked `lazy: true`).
   * Tunes how much of each lazy tool's description appears in the discovery
   * catalog. Optional — defaults to `{ includeDescription: 'none' }`.
   */
  lazyToolsConfig?: LazyToolsConfig
  /**
   * Observability metadata attached to this call. Surfaced to middleware,
   * devtools, and the event client; values may be arbitrarily structured
   * (objects, arrays). Adapters never forward this field onto the provider
   * wire request.
   *
   * To send provider-side request metadata, use the provider's
   * `modelOptions` field instead, where the provider supports one (e.g.
   * OpenAI's and OpenRouter's `metadata` are both Record<string, string>).
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

  /** Application state mirrored in a STATE_SNAPSHOT before an interrupt terminal. */
  state?: unknown

  /**
   * AG-UI interrupt resume responses supplied by the client on a follow-up run.
   * Threaded through request parsing now so later runtime behavior can resolve
   * upstream-native interrupts.
   */
  resume?: Array<RunAgentResumeItem>

  /**
   * Middleware capability context for this run. The engine populates it with
   * the live middleware context so harness adapters that declare
   * `requires: [SomeCapability]` can read provided capabilities from inside
   * `chatStream` — e.g. `getSandbox(options.capabilities)`. Capabilities are
   * provisioned by middleware `setup` before the adapter runs. Undefined for
   * direct adapter usage outside the chat engine.
   */
  capabilities?: CapabilityContext

  /**
   * Client approval decisions for this run, keyed by approval id. The engine
   * populates this from approvals carried on the incoming messages. Harness
   * adapters consult it to resolve `ask`-policy permission requests (the agent
   * pauses on a risky action; the client re-runs with a decision recorded
   * here). Undefined for direct adapter usage outside the chat engine.
   */
  approvals?: ReadonlyMap<string, boolean>
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
 * Base structure for AG-UI events.
 * Extends @ag-ui/core BaseEvent with TanStack AI additions.
 *
 * @ag-ui/core provides: `type`, `timestamp?`, `rawEvent?`
 * TanStack AI adds: `model?`
 */
export interface BaseAGUIEvent extends AGUIBaseEvent {
  /** Model identifier for multi-model support */
  model?: string
}

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
export interface RunStartedEvent extends AGUIRunStartedEvent {
  /** Model identifier for multi-model support */
  model?: string
}

// Re-export the canonical usage types (defined in `@tanstack/ai-event-client`)
// so `@tanstack/ai` consumers keep importing them from here unchanged.
export type {
  CompletionTokensDetails,
  PromptTokensDetails,
  ProviderUsageDetails,
  TokenUsage,
  UsageCostBreakdown,
}

/**
 * @deprecated Renamed to {@link TokenUsage}. Kept as an alias for backward
 * compatibility with `@tanstack/ai@0.23` and earlier; will be removed in a
 * future release.
 */
export type UsageTotals = TokenUsage

export type Interrupt = AGUIInterrupt

export type RunFinishedOutcome = AGUIRunFinishedOutcome

export type RunAgentResumeItem = AGUIResumeEntry

/**
 * Emitted when a run completes successfully.
 *
 * @ag-ui/core provides: `threadId`, `runId`, `result?`
 * TanStack AI adds: `model?`, `finishReason?`, `usage?`
 */
export interface RunFinishedEvent extends AGUIRunFinishedEvent {
  /** Model identifier for multi-model support */
  model?: string
  /** Why the generation stopped */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  /** Token usage statistics with optional detailed breakdowns and provider-reported cost. */
  usage?: TokenUsage
}

/**
 * Emitted when an error occurs during a run.
 *
 * @ag-ui/core provides: `message`, `code?`
 * TanStack AI adds: `model?`, `error?` (deprecated nested form)
 */
export interface RunErrorEvent extends AGUIRunErrorEvent {
  /** Model identifier for multi-model support */
  model?: string
  /** Exhaustive TanStack interrupt submission failures for this run. */
  'tanstack:interruptErrors'?: ReadonlyArray<InterruptSubmissionError>
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

/**
 * Emitted when a text message starts.
 *
 * @ag-ui/core provides: `messageId`, `role?`, `name?`
 * TanStack AI adds: `model?`
 */
export interface TextMessageStartEvent extends AGUITextMessageStartEvent {
  /** Model identifier for multi-model support */
  model?: string
}

/**
 * Emitted when text content is generated (streaming tokens).
 *
 * @ag-ui/core provides: `messageId`, `delta`
 * TanStack AI adds: `model?`, `content?` (accumulated)
 */
export interface TextMessageContentEvent extends AGUITextMessageContentEvent {
  /** Model identifier for multi-model support */
  model?: string
  /** Full accumulated content so far (TanStack AI internal, for debugging) */
  content?: string
}

/**
 * Emitted when a text message completes.
 *
 * @ag-ui/core provides: `messageId`
 * TanStack AI adds: `model?`
 */
export interface TextMessageEndEvent extends AGUITextMessageEndEvent {
  /** Model identifier for multi-model support */
  model?: string
}

/**
 * Emitted when a tool call starts.
 *
 * @ag-ui/core provides: `toolCallId`, `toolCallName`, `parentMessageId?`
 * TanStack AI adds: `model?`, `toolName` (deprecated alias), `index?`, `metadata?`
 *
 * Field shapes are taken from AG-UI via `Pick` (not `extends`) so Zod
 * `.passthrough()` index signatures do not pollute the StreamChunk
 * discriminated union — required for {@link TypedStreamChunk} narrowing.
 *
 * @typeParam TToolName - Constrained tool name type. Defaults to `string` (untyped).
 *   When the stream is returned from `chat()` with typed tools, `TypedStreamChunk`
 *   intersects a literal onto `toolCallName` and `toolName` for discrimination.
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
   * Carries `TToolName` on the base interface; for `toolCallName` narrowing use
   * {@link TypedStreamChunk} (distributed variants intersect the AG-UI field).
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

/**
 * Emitted when tool call arguments are streaming.
 *
 * @ag-ui/core provides: `toolCallId`, `delta`
 * TanStack AI adds: `model?`, `args?` (accumulated)
 */
export interface ToolCallArgsEvent extends AGUIToolCallArgsEvent {
  /** Model identifier for multi-model support */
  model?: string
  /** Full accumulated arguments so far (TanStack AI internal) */
  args?: string
}

/**
 * Emitted when a tool call completes.
 *
 * @ag-ui/core provides: `toolCallId`
 * TanStack AI adds: `model?`, `toolCallName?`, `toolName?` (deprecated), `input?`, `output?`, `result?`
 *
 * Same `Pick` (not `extends`) rationale as {@link ToolCallStartEvent}.
 *
 * @typeParam TToolName - Constrained tool name type. Defaults to `string` (untyped).
 * @typeParam TInput - Constrained input arguments type. Defaults to `unknown`.
 * @typeParam TOutput - Constrained output type from the tool's `outputSchema`. Defaults to `unknown`.
 */
export interface ToolCallEndEvent<
  TToolName extends string = string,
  TInput = unknown,
  TOutput = unknown,
> extends Pick<AGUIToolCallEndEvent, 'toolCallId' | 'timestamp' | 'rawEvent'> {
  type: 'TOOL_CALL_END'
  /** Model identifier for multi-model support */
  model?: string
  /** Name of the tool that completed (AG-UI-compatible optional field) */
  toolCallName?: TToolName
  /**
   * @deprecated Use `toolCallName` instead.
   * Kept for backward compatibility.
   */
  toolName?: TToolName
  /** Final parsed input arguments (TanStack AI internal) */
  input?: TInput
  /**
   * Tool execution output, validated against the tool's `outputSchema` when
   * one is declared. Prefer this over parsing `result` when present.
   * Undefined for tools without execute, client tools pending approval, or
   * when execution throws.
   */
  output?: TOutput
  /** Tool execution result (TanStack AI internal / wire form) */
  result?: string | Array<ContentPart>
  /** Tool execution output state (TanStack AI internal) */
  state?: ToolOutputState
}

/**
 * Emitted when a tool call result is available.
 *
 * @ag-ui/core provides: `messageId`, `toolCallId`, `content`, `role?`
 * TanStack AI adds: `model?`
 */
export interface ToolCallResultEvent extends AGUIToolCallResultEvent {
  /** Model identifier for multi-model support */
  model?: string
  /** Tool execution output state (TanStack AI internal) */
  state?: ToolOutputState
}

/**
 * Emitted when a thinking/reasoning step starts.
 *
 * @ag-ui/core provides: `stepName`
 * TanStack AI adds: `model?`, `stepId?` (deprecated alias), `stepType?`
 */
export interface StepStartedEvent extends AGUIStepStartedEvent {
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

/**
 * Emitted when a thinking/reasoning step finishes.
 *
 * @ag-ui/core provides: `stepName`
 * TanStack AI adds: `model?`, `stepId?` (deprecated alias), `delta?`, `content?`
 */
export interface StepFinishedEvent extends AGUIStepFinishedEvent {
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
export interface MessagesSnapshotEvent extends AGUIMessagesSnapshotEvent {
  /** Model identifier for multi-model support */
  model?: string
}

/**
 * Emitted to provide a full state snapshot.
 *
 * @ag-ui/core provides: `snapshot` (any)
 * TanStack AI adds: `model?`, `state?` (deprecated alias for snapshot)
 */
export interface StateSnapshotEvent extends AGUIStateSnapshotEvent {
  /** Model identifier for multi-model support */
  model?: string
  /**
   * @deprecated Use `snapshot` instead (from @ag-ui/core spec).
   * Kept for backward compatibility.
   */
  state?: Record<string, unknown>
}

/**
 * Emitted to provide an incremental state update.
 *
 * @ag-ui/core provides: `delta` (any[] - JSON Patch RFC 6902)
 * TanStack AI adds: `model?`
 */
export interface StateDeltaEvent extends AGUIStateDeltaEvent {
  /** Model identifier for multi-model support */
  model?: string
}

/**
 * Custom event for extensibility.
 *
 * @ag-ui/core provides: `name`, `value`
 * TanStack AI adds: `model?`
 *
 * Uses `Pick` (not `extends`) so the Zod passthrough index signature does not
 * erase discriminant property access on {@link KnownCustomEvent} /
 * {@link TypedStreamChunk} unions.
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
   * the AG-UI consumer never sees them (when that middleware is enabled).
   */
  threadId?: string
  runId?: string
}

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
/**
 * @deprecated Native interrupts use RUN_FINISHED interrupt outcomes. This
 * compatibility event remains readable until 1.0.
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
/**
 * @deprecated Native interrupts use RUN_FINISHED interrupt outcomes. This
 * compatibility event remains readable until 1.0.
 */
export interface ToolInputAvailableEvent extends CustomEvent {
  name: 'tool-input-available'
  value: {
    toolCallId: string
    toolName: string
    input: unknown
  }
}

/** Emitted when an MCP tool returns a ui:// resource (MCP Apps). Reconciled into
 *  a UIResourcePart on the assistant UIMessage. Never enters model input. */
export interface UIResourceEvent extends CustomEvent {
  name: 'ui-resource'
  value: {
    resource: UIResourcePart['resource']
    serverId?: string
    toolCallId: string
    toolName: string
    meta?: Record<string, unknown>
  }
}

// ── Sandbox events ──────────────────────────────────────────────────────────
export interface SandboxFileCustomEvent extends CustomEvent {
  name: 'sandbox.file'
  value: {
    type: 'create' | 'change' | 'delete'
    path: string
    timestamp: number
  }
}
export interface SandboxFileDiffEvent extends CustomEvent {
  name: 'sandbox.file.diff'
  value: { path: string; diff: string }
}

// ── Harness events ──────────────────────────────────────────────────────────
export interface FileChangedEvent extends CustomEvent {
  name: 'file.changed'
  value: { path: string; diff: string }
}
export interface SessionIdEvent extends CustomEvent {
  name: `${string}.session-id`
  value: { sessionId: string }
}

// ── Code-mode events ────────────────────────────────────────────────────────
export interface CodeModeExecutionStartedEvent extends CustomEvent {
  name: 'code_mode:execution_started'
  value: { timestamp: number; codeLength: number }
}
export interface CodeModeConsoleEvent extends CustomEvent {
  name: 'code_mode:console'
  value: {
    level: 'log' | 'warn' | 'error' | 'info'
    message: string
    timestamp: number
  }
}
export interface CodeModeExternalCallEvent extends CustomEvent {
  name: 'code_mode:external_call'
  value: { function: string; args: unknown; timestamp: number }
}
export interface CodeModeExternalResultEvent extends CustomEvent {
  name: 'code_mode:external_result'
  value: { function: string; result: unknown; duration: number }
}
export interface CodeModeExternalErrorEvent extends CustomEvent {
  name: 'code_mode:external_error'
  value: { function: string; error: string; duration: number }
}
export interface CodeModeSkillCallEvent extends CustomEvent {
  name: 'code_mode:skill_call'
  value: { skill: string; input: unknown; timestamp: number }
}
export interface CodeModeSkillResultEvent extends CustomEvent {
  name: 'code_mode:skill_result'
  value: { skill: string; result: unknown; duration: number; timestamp: number }
}
export interface CodeModeSkillErrorEvent extends CustomEvent {
  name: 'code_mode:skill_error'
  value: { skill: string; error: string; duration: number; timestamp: number }
}
export interface SkillRegisteredEvent extends CustomEvent {
  name: 'skill:registered'
  value: { id: string; name: string; description: string; timestamp: number }
}

/**
 * Every CUSTOM event TanStack AI itself emits, as a discriminated union on
 * `name`. User-emitted custom events (via `emitCustomEvent` with a custom name)
 * are intentionally absent — they still flow at runtime.
 */
export type KnownCustomEvent =
  | SandboxFileCustomEvent
  | SandboxFileDiffEvent
  | FileChangedEvent
  | SessionIdEvent
  | CodeModeExecutionStartedEvent
  | CodeModeConsoleEvent
  | CodeModeExternalCallEvent
  | CodeModeExternalResultEvent
  | CodeModeExternalErrorEvent
  | CodeModeSkillCallEvent
  | CodeModeSkillResultEvent
  | CodeModeSkillErrorEvent
  | SkillRegisteredEvent
  | StructuredOutputStartEvent
  | StructuredOutputCompleteEvent
  | ApprovalRequestedEvent
  | ToolInputAvailableEvent
  | UIResourceEvent

/** The default chat streaming result: standard chunks plus every typed
 *  framework CUSTOM event, with the `value: any` catch-all excluded so
 *  literal-`name` narrowing types `value`. User-emitted custom names are typed
 *  out (still flow at runtime — branch outside the name narrows or cast). */
export type ChatStream = AsyncIterable<
  Exclude<StreamChunk, CustomEvent> | KnownCustomEvent
>

/**
 * Public type for streams returned by `chat({ outputSchema, stream: true })`.
 *
 * Yields all standard `StreamChunk` lifecycle events plus the typed
 * structured-output `CUSTOM` event emitted through this path:
 * - `structured-output.complete` — terminal event with typed `value.object: T`
 *
 * User-actionable waits, such as tool approval and client tool input, are
 * represented by `RUN_FINISHED.outcome.type === 'interrupt'` in current core
 * streams. Legacy `approval-requested` and `tool-input-available` custom
 * events may still be consumed for replay and backward compatibility, but
 * they are not the current source of truth for waits.
 *
 * Each variant has a literal `name`, so a single discriminated narrow gives
 * you a typed `value` with no helper or cast:
 *
 * ```ts
 * for await (const chunk of stream) {
 *   if (chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete') {
 *     chunk.value.object // typed as T
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
  | Exclude<StreamChunk, CustomEvent>
  | StructuredOutputStartEvent
  | StructuredOutputCompleteEvent<T>
  | ApprovalRequestedEvent
  | ToolInputAvailableEvent
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
export interface ReasoningStartEvent extends AGUIReasoningStartEvent {
  /** Model identifier for multi-model support */
  model?: string
}

/**
 * Emitted when a reasoning message starts.
 *
 * @ag-ui/core provides: `messageId`, `role` ("reasoning")
 * TanStack AI adds: `model?`
 */
export interface ReasoningMessageStartEvent extends AGUIReasoningMessageStartEvent {
  /** Model identifier for multi-model support */
  model?: string
}

/**
 * Emitted when reasoning message content is generated.
 *
 * @ag-ui/core provides: `messageId`, `delta`
 * TanStack AI adds: `model?`
 */
export interface ReasoningMessageContentEvent extends AGUIReasoningMessageContentEvent {
  /** Model identifier for multi-model support */
  model?: string
}

/**
 * Emitted when a reasoning message ends.
 *
 * @ag-ui/core provides: `messageId`
 * TanStack AI adds: `model?`
 */
export interface ReasoningMessageEndEvent extends AGUIReasoningMessageEndEvent {
  /** Model identifier for multi-model support */
  model?: string
}

/**
 * Emitted when reasoning ends for a message.
 *
 * @ag-ui/core provides: `messageId`
 * TanStack AI adds: `model?`
 */
export interface ReasoningEndEvent extends AGUIReasoningEndEvent {
  /** Model identifier for multi-model support */
  model?: string
}

/**
 * Emitted for encrypted reasoning values.
 *
 * @ag-ui/core provides: `subtype`, `entityId`, `encryptedValue`
 * TanStack AI adds: `model?`
 */
export interface ReasoningEncryptedValueEvent extends AGUIReasoningEncryptedValueEvent {
  /** Model identifier for multi-model support */
  model?: string
}

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
type NonProviderTools<TTools extends ReadonlyArray<AnyTool>> = Exclude<
  TTools[number],
  ProviderTool<string, string>
>

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
type HasTypedTools<TTools extends ReadonlyArray<AnyTool>> = [
  NonProviderTools<TTools>,
] extends [never]
  ? false
  : string extends NonProviderTools<TTools>['name']
    ? false
    : true

/**
 * Safely infer input type for a single tool, guarding against `any` leaks.
 * Returns `unknown` when the tool has no inputSchema, when the schema
 * parameter defaults to `undefined` (no-schema tool definitions), or when
 * InferSchemaType produces `any` (e.g. for plain JSON Schema tools).
 * @internal
 */
type SafeToolInput<T> = T extends {
  inputSchema?: infer TInput
}
  ? [TInput] extends [undefined]
    ? unknown
    : IsAny<InferSchemaType<NonNullable<TInput>>> extends true
      ? unknown
      : InferSchemaType<NonNullable<TInput>>
  : unknown

/**
 * Safely infer output type for a single tool. Mirrors `SafeToolInput`,
 * picking `outputSchema` instead. Returns `unknown` when the tool has no
 * `outputSchema` declared, when the schema parameter defaults to `undefined`,
 * or when `InferSchemaType` produces `any`.
 * @internal
 */
type SafeToolOutput<T> = T extends {
  outputSchema?: infer TOutput
}
  ? [TOutput] extends [undefined]
    ? unknown
    : IsAny<InferSchemaType<NonNullable<TOutput>>> extends true
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
type DistributedToolCallStart<TTools extends ReadonlyArray<AnyTool>> =
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
type DistributedToolCallEnd<TTools extends ReadonlyArray<AnyTool>> =
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
 * `CUSTOM` events are narrowed to the discriminated {@link KnownCustomEvent}
 * union (sandbox, code-mode, structured-output, approvals, UI resources, etc.).
 * Free-form user-emitted custom events (via `emitCustomEvent`) still flow at
 * runtime but are excluded from the type to avoid `any` poisoning the union;
 * cast to `StreamChunk` if you need to read those.
 *
 * When tools are untyped or absent, the tool-call events stay as plain
 * `ToolCallStartEvent` / `ToolCallEndEvent` (no per-tool name narrowing) and
 * the type is equivalent to the element type of {@link ChatStream}.
 */
/**
 * Replace tool-call and bare CUSTOM variants; keep every other StreamChunk
 * arm. Matches on the string-literal `type` discriminant that TanStack tool
 * events declare (see ToolCallStartEvent / ToolCallEndEvent). AG-UI events
 * that still use the EventType enum are kept as-is via the final branch.
 *
 * Do **not** use `Exclude<StreamChunk, { type: 'TOOL_CALL_*' }>` — under
 * @ag-ui/core passthrough index signatures that form removes *every* arm.
 * @internal
 */
type RemapStreamChunkForTools<
  TChunk,
  TTools extends ReadonlyArray<AnyTool>,
> = TChunk extends { type: 'TOOL_CALL_START' }
  ? DistributedToolCallStart<TTools>
  : TChunk extends { type: 'TOOL_CALL_END' }
    ? DistributedToolCallEnd<TTools>
    : TChunk extends { type: 'CUSTOM' }
      ? never
      : TChunk

export type TypedStreamChunk<
  TTools extends ReadonlyArray<AnyTool> = ReadonlyArray<AnyTool>,
> =
  HasTypedTools<TTools> extends true
    ? RemapStreamChunkForTools<StreamChunk, TTools> | KnownCustomEvent
    : Exclude<StreamChunk, CustomEvent> | KnownCustomEvent

// Simple streaming format for basic text completions
// Converted to StreamChunk format by convertTextCompletionStream()
export interface TextCompletionChunk {
  id: string
  model: string
  content: string
  role?: 'assistant'
  finishReason?: 'stop' | 'length' | 'content_filter' | null
  usage?: TokenUsage
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
  usage: TokenUsage
}

// ============================================================================
// Image Generation Types
// ============================================================================

/**
 * Optional role hint on a media input part (image / video / audio). Adapters
 * read `metadata.role` to route the part to the provider-specific request
 * field — e.g. `'mask'` → OpenAI `mask` / fal `mask_url`, `'end_frame'` → fal
 * `end_image_url`, `'reference'` → fal `reference_image_urls`. When omitted
 * the adapter falls back to positional routing.
 */
export type MediaInputRole =
  | 'reference'
  | 'mask'
  | 'control'
  | 'start_frame'
  | 'end_frame'
  | 'character'

/**
 * Metadata convention for image / video / audio inputs to media generation.
 * Carried on `ImagePart.metadata` / `VideoPart.metadata` / `AudioPart.metadata`
 * when used as conditioning inputs to `generateImage()` or `generateVideo()`.
 */
export interface MediaInputMetadata {
  /** Optional role hint disambiguating the part's intent for the adapter */
  role?: MediaInputRole
  /**
   * Optional user-defined label for this input (e.g. `'woman-in-red-dress'`).
   * **Informational only** — adapters never read it and the SDK never
   * rewrites prompt text based on it. Use it to correlate parts with the
   * references you write in your prompt using the provider's own syntax
   * (fal's `@Image1`, OpenAI's "image 1", etc.), or for your own
   * bookkeeping/logging.
   */
  tag?: string
}

/**
 * A single part of a multimodal media-generation prompt. Reuses the chat
 * content-part shapes: text parts carry the instruction, image / video /
 * audio parts carry conditioning inputs (with an optional
 * `metadata.role` hint — see {@link MediaInputRole}).
 */
export type MediaPromptPart =
  | TextPart
  | ImagePart<MediaInputMetadata>
  | VideoPart<MediaInputMetadata>
  | AudioPart<MediaInputMetadata>

/**
 * Prompt accepted by `generateImage()` / `generateVideo()`: a plain string,
 * or an ordered array of content parts for image-conditioned generation
 * ("not like this *(image)*, more like this *(image)*"). Part order is
 * meaningful — adapters with native multimodal prompts (Gemini, OpenRouter)
 * preserve the interleaving; named-field providers (fal, OpenAI, xAI)
 * extract the media parts and flatten the text. Text is always sent
 * verbatim: to reference inputs from the prompt, write the provider's own
 * syntax yourself (e.g. fal's `@Image1`, OpenAI's "image 1"). An array may
 * be media-only (e.g. upscalers or pure img2img endpoints that take no
 * instruction text).
 */
export type MediaPrompt = string | Array<MediaPromptPart>

/**
 * Non-text modalities a media-generation model can accept in its prompt.
 */
export type MediaPromptModality = 'image' | 'video' | 'audio'

/** Maps a prompt modality to its content-part type. @internal */
interface MediaPartByModality {
  image: ImagePart<MediaInputMetadata>
  video: VideoPart<MediaInputMetadata>
  audio: AudioPart<MediaInputMetadata>
}

/**
 * Prompt type narrowed to the modalities a specific model supports.
 * `MediaPromptFor<never>` (a text-only model) is `string | Array<TextPart>`;
 * `MediaPromptFor<'image'>` additionally admits image parts, etc. Used by
 * the activity option types together with the adapter's per-model input
 * modality map so unsupported parts fail at compile time.
 */
export type MediaPromptFor<TModalities extends MediaPromptModality = never> =
  | string
  | Array<TextPart | MediaPartByModality[TModalities]>

/**
 * Per-model map from model name to the prompt modalities it accepts, used as
 * an adapter type parameter (`TModelInputModalitiesByName`). Models absent
 * from the map fall back to the unconstrained {@link MediaPrompt}.
 */
export type ModelInputModalitiesByName = Record<
  string,
  ReadonlyArray<MediaPromptModality>
>

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
  /**
   * Description of the desired image(s): a plain string, or an ordered array
   * of content parts for image-conditioned generation (image-to-image,
   * reference-guided, edit, multi-reference). Media parts may carry
   * `metadata.role` to disambiguate intent (mask, control, reference, …).
   * Adapters map parts onto the provider-native request — e.g. Gemini
   * multimodal `contents`, OpenAI `images.edit()`, fal `image_url` /
   * `mask_url` — and throw a clear runtime error for unsupported modalities.
   */
  prompt: MediaPrompt
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

export type PersistedArtifactRole = 'input' | 'output'

export type PersistedArtifactActivity =
  | 'image'
  | 'audio'
  | 'tts'
  | 'video'
  | 'transcription'

export interface PersistedArtifactRef {
  role: PersistedArtifactRole
  artifactId: string
  threadId: string
  runId: string
  name: string
  mimeType: string
  size: number
  createdAt: string
  externalUrl?: string
  source: {
    activity: PersistedArtifactActivity
    path: string
    provider: string
    model: string
    mediaType?: 'image' | 'audio' | 'video' | 'document' | 'json'
    jobId?: string
    expiresAt?: string
  }
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
  usage?: TokenUsage
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
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
  usage?: TokenUsage
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
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
  TDuration extends string | number | undefined = number,
> {
  /** The model to use for video generation */
  model: string
  /**
   * Description of the desired video: a plain string, or an ordered array of
   * content parts for image-conditioned generation. Image parts may carry
   * `metadata.role` (`'start_frame' | 'end_frame' | 'reference' |
   * 'character'`) to disambiguate intent; adapters route them onto the
   * provider-native request (e.g. OpenAI Sora `input_reference`, fal
   * `image_url` / `end_image_url`) and throw at runtime if unsupported.
   */
  prompt: MediaPrompt
  /** Video size — format depends on the provider (e.g., "16:9", "1280x720") */
  size?: TSize
  /**
   * Video duration in seconds. Adapters that declare a per-model duration
   * map narrow this to the model's valid union; use
   * `adapter.snapDuration(seconds)` to coerce raw seconds to a valid value.
   */
  duration?: TDuration
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
  /**
   * Usage information for the completed generation, when the adapter can report
   * it. For usage-based providers (e.g. fal) this carries `unitsBilled` — the
   * real billed quantity — so consumers can compute exact cost.
   */
  usage?: TokenUsage
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
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
  /** Token usage information (if provided by the adapter) */
  usage?: TokenUsage
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
}

// ============================================================================
// Transcription (Speech-to-Text) Types
// ============================================================================

/**
 * Options for audio transcription.
 * These are the common options supported across providers.
 */
export type TranscriptionResponseFormat =
  | 'json'
  | 'text'
  | 'srt'
  | 'verbose_json'
  | 'vtt'

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
  responseFormat?: TranscriptionResponseFormat
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
  /** Token usage information (if provided by the adapter) */
  usage?: TokenUsage
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
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
