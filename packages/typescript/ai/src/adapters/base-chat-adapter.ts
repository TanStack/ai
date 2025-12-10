import type {
  ChatOptions,
  DefaultMessageMetadataByModality,
  Modality,
  StreamChunk,
} from '../types'

/**
 * Configuration for adapter instances
 */
export interface ChatAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Base interface for chat adapters.
 * Provides type-safe chat/text completion functionality.
 *
 * Generic parameters:
 * - TModels: Array of supported model names
 * - TProviderOptions: Provider-specific options for chat endpoint
 * - TModelProviderOptionsByName: Map from model name to its specific provider options
 * - TModelInputModalitiesByName: Map from model name to its supported input modalities
 * - TMessageMetadataByModality: Map from modality type to adapter-specific metadata types
 */
export interface ChatAdapter<
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
  readonly kind: 'chat'
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
   * Stream chat completions from the model
   */
  chatStream: (
    options: ChatOptions<string, TProviderOptions>,
  ) => AsyncIterable<StreamChunk>
}

/**
 * Abstract base class for chat adapters.
 * Extend this class to implement a chat adapter for a specific provider.
 */
export abstract class BaseChatAdapter<
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
> implements ChatAdapter<
  TModels,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelInputModalitiesByName,
  TMessageMetadataByModality
> {
  readonly kind = 'chat' as const
  abstract readonly name: string
  abstract readonly models: TModels

  // Type-only properties - never assigned at runtime
  declare _providerOptions?: TProviderOptions
  declare _modelProviderOptionsByName?: TModelProviderOptionsByName
  declare _modelInputModalitiesByName?: TModelInputModalitiesByName
  declare _messageMetadataByModality?: TMessageMetadataByModality

  protected config: ChatAdapterConfig

  constructor(config: ChatAdapterConfig = {}) {
    this.config = config
  }

  abstract chatStream(
    options: ChatOptions<string, TProviderOptions>,
  ): AsyncIterable<StreamChunk>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
