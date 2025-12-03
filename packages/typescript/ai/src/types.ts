import type { CommonOptions } from './core/chat-common-options'
import type { z } from 'zod'
import type { ToolCallState, ToolResultState } from './stream/types'

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
> =
  | TextPart
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
> = Extract<
  ContentPart<TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta>,
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
> =
  | string
  | null
  | Array<
      ContentPartForModalities<
        ModalitiesArrayToUnion<TModalities>,
        TImageMeta,
        TAudioMeta,
        TVideoMeta,
        TDocumentMeta
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
export interface TextPart {
  type: 'text'
  content: string
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
> = Omit<ModelMessage, 'content'> & {
  content: ConstrainedContent<
    TModalities,
    TImageMeta,
    TAudioMeta,
    TVideoMeta,
    TDocumentMeta
  >
}

/**
 * Tool/Function definition for function calling.
 *
 * Tools allow the model to interact with external systems, APIs, or perform computations.
 * The model will decide when to call tools based on the user's request and the tool descriptions.
 *
 * Tools use Zod schemas for runtime validation and type safety.
 *
 * @see https://platform.openai.com/docs/guides/function-calling
 * @see https://docs.anthropic.com/claude/docs/tool-use
 */
export interface Tool<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
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
   * Zod schema describing the tool's input parameters.
   *
   * Defines the structure and types of arguments the tool accepts.
   * The model will generate arguments matching this schema.
   * The schema is converted to JSON Schema for LLM providers.
   *
   * @see https://zod.dev/
   *
   * @example
   * import { z } from 'zod';
   *
   * z.object({
   *   location: z.string().describe("City name or coordinates"),
   *   unit: z.enum(["celsius", "fahrenheit"]).optional()
   * })
   */
  inputSchema?: TInput

  /**
   * Optional Zod schema for validating tool output.
   *
   * If provided, tool results will be validated against this schema before
   * being sent back to the model. This catches bugs in tool implementations
   * and ensures consistent output formatting.
   *
   * Note: This is client-side validation only - not sent to LLM providers.
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
  tools?: Array<Tool>
  systemPrompts?: Array<string>
  agentLoopStrategy?: AgentLoopStrategy
  options?: CommonOptions
  providerOptions?: TProviderOptionsForModel
  request?: Request | RequestInit
  output?: TOutput
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

export type StreamChunkType =
  | 'content'
  | 'tool_call'
  | 'tool_result'
  | 'done'
  | 'error'
  | 'approval-requested'
  | 'tool-input-available'
  | 'thinking'

export interface BaseStreamChunk {
  type: StreamChunkType
  id: string
  model: string
  timestamp: number
}

export interface ContentStreamChunk extends BaseStreamChunk {
  type: 'content'
  delta: string // The incremental content token
  content: string // Full accumulated content so far
  role?: 'assistant'
}

export interface ToolCallStreamChunk extends BaseStreamChunk {
  type: 'tool_call'
  toolCall: {
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string // Incremental JSON arguments
    }
  }
  index: number
}

export interface ToolResultStreamChunk extends BaseStreamChunk {
  type: 'tool_result'
  toolCallId: string
  content: string
}

export interface DoneStreamChunk extends BaseStreamChunk {
  type: 'done'
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface ErrorStreamChunk extends BaseStreamChunk {
  type: 'error'
  error: {
    message: string
    code?: string
  }
}

export interface ApprovalRequestedStreamChunk extends BaseStreamChunk {
  type: 'approval-requested'
  toolCallId: string
  toolName: string
  input: any
  approval: {
    id: string
    needsApproval: true
  }
}

export interface ToolInputAvailableStreamChunk extends BaseStreamChunk {
  type: 'tool-input-available'
  toolCallId: string
  toolName: string
  input: any
}

export interface ThinkingStreamChunk extends BaseStreamChunk {
  type: 'thinking'
  delta?: string // The incremental thinking token
  content: string // Full accumulated thinking content so far
}

/**
 * Chunk returned by the sdk during streaming chat completions.
 */
export type StreamChunk =
  | ContentStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk
  | ApprovalRequestedStreamChunk
  | ToolInputAvailableStreamChunk
  | ThinkingStreamChunk

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
  TModelInputModalitiesByName extends Record<
    string,
    ReadonlyArray<Modality>
  > = Record<string, ReadonlyArray<Modality>>,
  TMessageMetadataByModality extends {
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
                        TDocumentMeta
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
                    TDocumentMeta
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
