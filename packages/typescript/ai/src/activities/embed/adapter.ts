import type {
  EmbedManyOptions,
  EmbedManyResult,
  EmbedOptions,
  EmbedResult,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'embedding' as const

export interface EmbeddingAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

export interface EmbeddingAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'embedding'
  /** Adapter name identifier */
  readonly name: string
  /** The model this adapter is configured for */
  readonly model: TModel

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  '~types': {
    providerOptions: TProviderOptions
  }

  /**
   * Generate embeddings for text
   */
  embed: (options: EmbedOptions<TProviderOptions>) => Promise<EmbedResult>

  /**
   * Generate embeddings for multiple texts
   */
  embedMany: (
    options: EmbedManyOptions<TProviderOptions>,
  ) => Promise<EmbedManyResult>
}

/**
 * A EmbeddingAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyEmbeddingAdapter = EmbeddingAdapter<any, any>

/**
 * Abstract base class for embed adapters.
 * Extend this class to implement an embed adapter for a specific provider.
 *
 * Generic parameters match EmbedAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseEmbeddingAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements EmbeddingAdapter<TModel, TProviderOptions> {
  readonly kind = 'embedding' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: EmbeddingAdapterConfig

  constructor(config: EmbeddingAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract embed(options: EmbedOptions<TProviderOptions>): Promise<EmbedResult>

  abstract embedMany(
    options: EmbedManyOptions<TProviderOptions>,
  ): Promise<EmbedManyResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
