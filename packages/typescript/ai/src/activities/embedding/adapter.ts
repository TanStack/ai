import type { EmbeddingOptions, EmbeddingResult } from '../../types'

/**
 * Configuration for embedding adapter instances
 */
export interface EmbeddingAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Base interface for embedding adapters.
 * Provides type-safe embedding generation functionality.
 *
 * Generic parameters:
 * - TModels: Array of supported embedding model names
 * - TProviderOptions: Provider-specific options for embedding endpoint
 * - TSelectedModel: The model selected when creating the adapter (undefined if not selected)
 */
export interface EmbeddingAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TSelectedModel extends string | undefined = undefined,
> {
  /** Discriminator for adapter kind - used by generate() to determine API shape */
  readonly kind: 'embedding'
  /** Adapter name identifier */
  readonly name: string
  /** Supported embedding models */
  readonly models: TModels
  /** The model selected when creating the adapter */
  readonly selectedModel: TSelectedModel

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  _types: {
    providerOptions: TProviderOptions
  }

  /**
   * Create embeddings for the given input
   */
  createEmbeddings: (options: EmbeddingOptions) => Promise<EmbeddingResult>
}

/**
 * Abstract base class for embedding adapters.
 * Extend this class to implement an embedding adapter for a specific provider.
 */
export abstract class BaseEmbeddingAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TSelectedModel extends TModels[number] | undefined = undefined,
> implements EmbeddingAdapter<TModels, TProviderOptions, TSelectedModel> {
  readonly kind = 'embedding' as const
  abstract readonly name: string
  abstract readonly models: TModels
  readonly selectedModel: TSelectedModel

  // Type-only property - never assigned at runtime
  declare _types: {
    providerOptions: TProviderOptions
  }

  protected config: EmbeddingAdapterConfig

  constructor(
    config: EmbeddingAdapterConfig = {},
    selectedModel?: TSelectedModel,
  ) {
    this.config = config
    this.selectedModel = selectedModel as TSelectedModel
  }

  abstract createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
