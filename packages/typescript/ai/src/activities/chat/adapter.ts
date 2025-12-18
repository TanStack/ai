import type {
  DefaultMessageMetadataByModality,
  JSONSchema,
  Modality,
  StreamChunk,
  TextOptions,
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
 * Options for structured output generation
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
 */
export interface TextAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality>,
  TMessageMetadataByModality extends DefaultMessageMetadataByModality,
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
  }

  /**
   * Stream text completions from the model
   */
  chatStream: (
    options: TextOptions<TProviderOptions>,
  ) => AsyncIterable<StreamChunk>

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
}

/**
 * A TextAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyTextAdapter = TextAdapter<any, any, any, any>

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
> implements TextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  TMessageMetadataByModality
> {
  readonly kind = 'text' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
    inputModalities: TInputModalities
    messageMetadataByModality: TMessageMetadataByModality
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
