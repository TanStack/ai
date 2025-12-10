import type { EmbeddingOptions, EmbeddingResult } from '../types'

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
 */
export interface EmbeddingAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used by generate() to determine API shape */
  readonly kind: 'embedding'
  /** Adapter name identifier */
  readonly name: string
  /** Supported embedding models */
  readonly models: TModels

  // Type-only properties for type inference
  /** @internal Type-only property for provider options inference */
  _providerOptions?: TProviderOptions

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
> implements EmbeddingAdapter<TModels, TProviderOptions>
{
  readonly kind = 'embedding' as const
  abstract readonly name: string
  abstract readonly models: TModels

  // Type-only property - never assigned at runtime
  declare _providerOptions?: TProviderOptions

  protected config: EmbeddingAdapterConfig

  constructor(config: EmbeddingAdapterConfig = {}) {
    this.config = config
  }

  abstract createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
