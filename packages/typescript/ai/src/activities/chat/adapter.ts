import type {
  DefaultMessageMetadataByModality,
  JSONSchema,
  Modality,
  StreamChunk,
  TextOptions,
  ToolCall,
} from '../../types'

/**
 * Configuration for adapter instances
 */
export interface TextAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Options for structured output generation.
 *
 * The internal logger is threaded through `chatOptions.logger` (inherited from
 * `TextOptions`). Adapter implementations must call `logger.request()` before
 * SDK calls, `logger.provider()` for each chunk received, and `logger.errors()`
 * in catch blocks.
 */
export interface StructuredOutputOptions<TProviderOptions extends object> {
  /** Text options for the request */
  chatOptions: TextOptions<TProviderOptions>
  /** JSON Schema for structured output - already converted from Zod in the ai layer */
  outputSchema: JSONSchema
}

/**
 * Result from structured output generation
 */
export interface StructuredOutputResult<T = unknown> {
  /** The parsed data conforming to the schema */
  data: T
  /** The raw text response from the model before parsing */
  rawText: string
}

/**
 * Result from a wire-level non-streaming chat call (`adapter.chat()`).
 *
 * Returned by adapters that send `stream: false` on the wire and receive a
 * single JSON response. The dispatch layer (`runNonStreamingText`) uses this
 * shape to drive a non-streaming agent loop: keep calling `adapter.chat()`,
 * execute any returned tool calls, append the tool results, and call again
 * until `finishReason !== 'tool_calls'` or the agent loop strategy stops.
 */
export interface NonStreamingChatResult<TToolCallMetadata = unknown> {
  /** Concatenated assistant text content. May be empty when only tool calls fired. */
  content: string
  /**
   * Reasoning / thinking content if the provider returned it (Claude
   * extended thinking, OpenRouter reasoningDetails, etc.). Captured on the
   * result for completeness; the public `chat({stream:false})` return value
   * stays content-only to preserve the existing `Promise<string>` contract.
   */
  reasoning?: string
  /**
   * Tool calls the model wants to execute. Empty / undefined when the turn
   * is terminal. Argument strings stay as JSON strings to match the
   * streaming `TOOL_CALL_END` shape — the tool executor parses them.
   */
  toolCalls?: Array<ToolCall<TToolCallMetadata>>
  /**
   * Finish reason normalised to the set used by the streaming
   * RUN_FINISHED event. The dispatch loop uses `'tool_calls'` to decide
   * whether to continue.
   */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | string
  /** Token usage if the provider returned it. */
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

/**
 * Text adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'gpt-4o')
 * - TProviderOptions: Provider-specific options for this model (already resolved)
 * - TInputModalities: Supported input modalities for this model (already resolved)
 * - TMessageMetadata: Metadata types for content parts (already resolved)
 * - TToolCapabilities: Tuple of tool-kind strings supported by this model, resolved from `supports.tools`
 * - TToolCallMetadata: Metadata type that round-trips with tool calls (e.g. Gemini's `thoughtSignature`)
 */
export interface TextAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality>,
  TMessageMetadataByModality extends DefaultMessageMetadataByModality,
  TToolCapabilities extends ReadonlyArray<string> = ReadonlyArray<string>,
  TToolCallMetadata = unknown,
> {
  /** Discriminator for adapter kind */
  readonly kind: 'text'
  /** Provider name identifier (e.g., 'openai', 'anthropic') */
  readonly name: string
  /** The model this adapter is configured for */
  readonly model: TModel

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  '~types': {
    providerOptions: TProviderOptions
    inputModalities: TInputModalities
    messageMetadataByModality: TMessageMetadataByModality
    toolCapabilities: TToolCapabilities
    toolCallMetadata: TToolCallMetadata
  }

  /**
   * Stream text completions from the model
   */
  chatStream: (
    options: TextOptions<TProviderOptions>,
  ) => AsyncIterable<StreamChunk>

  /**
   * Optional: generate a single text completion in one round-trip with
   * `stream: false` on the wire. When an adapter implements this, the
   * dispatch layer (`chat({ stream: false })`) routes through it instead
   * of stream-then-concatenate — see issue #557.
   *
   * Adapters that omit this method keep the legacy behaviour:
   * `runNonStreamingText` drains `chatStream` and concatenates text. That
   * preserves API stability for out-of-tree adapters at the cost of still
   * sending an SSE wire request when the caller asked for non-streaming.
   *
   * Named `chatNonStreaming` (rather than `chat`) so it doesn't collide
   * with the public top-level `chat()` activity function exported from
   * `@tanstack/ai`.
   */
  chatNonStreaming?: (
    options: TextOptions<TProviderOptions>,
  ) => Promise<NonStreamingChatResult<TToolCallMetadata>>

  /**
   * Generate structured output using the provider's native structured output API.
   * This method uses stream: false and sends the JSON schema to the provider
   * to ensure the response conforms to the expected structure.
   *
   * @param options - Structured output options containing chat options and JSON schema
   * @returns Promise with the raw data (validation is done in the chat function)
   */
  structuredOutput: (
    options: StructuredOutputOptions<TProviderOptions>,
  ) => Promise<StructuredOutputResult<unknown>>

  /**
   * Stream structured output using the provider's native streaming structured
   * output API (stream + response_format json_schema in a single request).
   *
   * Optional — adapters without native streaming JSON omit this method and the
   * activity layer synthesizes a stream around the non-streaming
   * `structuredOutput` call.
   *
   * Implementations must emit standard AG-UI lifecycle events (RUN_STARTED,
   * TEXT_MESSAGE_*, RUN_FINISHED) carrying raw JSON text deltas, plus a final
   * `CUSTOM` event named `structured-output.complete` whose `value` is
   * `{ object, raw, reasoning? }`.
   */
  structuredOutputStream?: (
    options: StructuredOutputOptions<TProviderOptions>,
  ) => AsyncIterable<StreamChunk>
}

/**
 * A TextAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyTextAdapter = TextAdapter<any, any, any, any, any, any>

/**
 * Abstract base class for text adapters.
 * Extend this class to implement a text adapter for a specific provider.
 *
 * Generic parameters match TextAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseTextAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality>,
  TMessageMetadataByModality extends DefaultMessageMetadataByModality,
  TToolCapabilities extends ReadonlyArray<string> = ReadonlyArray<string>,
  TToolCallMetadata = unknown,
> implements TextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  TMessageMetadataByModality,
  TToolCapabilities,
  TToolCallMetadata
> {
  readonly kind = 'text' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
    inputModalities: TInputModalities
    messageMetadataByModality: TMessageMetadataByModality
    toolCapabilities: TToolCapabilities
    toolCallMetadata: TToolCallMetadata
  }

  protected config: TextAdapterConfig

  constructor(config: TextAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk>

  /**
   * Optional wire-level non-streaming chat. Override on subclasses to send
   * `stream: false` directly to the provider — see {@link TextAdapter.chatNonStreaming}.
   * When omitted, `chat({ stream: false })` falls back to draining
   * `chatStream` (legacy behaviour).
   */
  chatNonStreaming?(
    options: TextOptions<TProviderOptions>,
  ): Promise<NonStreamingChatResult<TToolCallMetadata>>

  /**
   * Generate structured output using the provider's native structured output API.
   * Concrete implementations should override this to use provider-specific structured output.
   */
  abstract structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
