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
  chatOptions: TextOptions<string, TProviderOptions>
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
 * Base interface for text adapters.
 * Provides type-safe chat/text completion functionality.
 *
 * Generic parameters:
 * - TModels: Array of supported model names
 * - TProviderOptions: Provider-specific options for text endpoint
 * - TModelProviderOptionsByName: Map from model name to its specific provider options
 * - TModelInputModalitiesByName: Map from model name to its supported input modalities
 * - TMessageMetadataByModality: Map from modality type to adapter-specific metadata types
 */
export interface TextAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, unknown> = Record<
    string,
    unknown
  >,
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
  /** Discriminator for adapter kind - used by generate() to determine API shape */
  readonly kind: 'text'
  /** Adapter name identifier */
  readonly name: string
  /** Supported chat models */
  readonly models: TModels

  // Type-only properties for type inference
  /** @internal Type-only property for provider options inference */
  _providerOptions?: TProviderOptions
  /** @internal Type-only map from model name to its specific provider options */
  _modelProviderOptionsByName?: TModelProviderOptionsByName
  /** @internal Type-only map from model name to its supported input modalities */
  _modelInputModalitiesByName?: TModelInputModalitiesByName
  /** @internal Type-only map for message metadata types */
  _messageMetadataByModality?: TMessageMetadataByModality

  /**
   * Stream text completions from the model
   */
  chatStream: (
    options: TextOptions<string, TProviderOptions>,
  ) => AsyncIterable<StreamChunk>

  /**
   * Generate structured output using the provider's native structured output API.
   * This method uses stream: false and sends the JSON schema to the provider
   * to ensure the response conforms to the expected structure.
   *
   * @param options - Structured output options containing chat options and JSON schema
   * @returns Promise with the raw data (validation is done in the ai function)
   */
  structuredOutput: (
    options: StructuredOutputOptions<TProviderOptions>,
  ) => Promise<StructuredOutputResult<unknown>>
}

/**
 * Abstract base class for text adapters.
 * Extend this class to implement a text adapter for a specific provider.
 */
export abstract class BaseTextAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, unknown> = Record<
    string,
    unknown
  >,
  TModelInputModalitiesByName extends Record<string, ReadonlyArray<Modality>> =
    Record<string, ReadonlyArray<Modality>>,
  TMessageMetadataByModality extends {
    text: unknown
    image: unknown
    audio: unknown
    video: unknown
    document: unknown
  } = DefaultMessageMetadataByModality,
> implements TextAdapter<
  TModels,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelInputModalitiesByName,
  TMessageMetadataByModality
> {
  readonly kind = 'text' as const
  abstract readonly name: string
  abstract readonly models: TModels

  // Type-only properties - never assigned at runtime
  declare _providerOptions?: TProviderOptions
  declare _modelProviderOptionsByName?: TModelProviderOptionsByName
  declare _modelInputModalitiesByName?: TModelInputModalitiesByName
  declare _messageMetadataByModality?: TMessageMetadataByModality

  protected config: TextAdapterConfig

  constructor(config: TextAdapterConfig = {}) {
    this.config = config
  }

  abstract chatStream(
    options: TextOptions<string, TProviderOptions>,
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
