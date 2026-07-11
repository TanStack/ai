import type {
  EmbeddingModelInputModalitiesByName,
  EmbeddingOptions,
  EmbeddingResult,
} from '../../types'

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
 * Embedding adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'text-embedding-3-small')
 * - TProviderOptions: Base provider-specific options (already resolved)
 * - TModelProviderOptionsByName: Map from model name to its specific provider options
 * - TModelInputModalitiesByName: Map from model name to the input modalities it
 *   accepts (constrains the `input` item types at compile time)
 */
export interface EmbeddingAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelInputModalitiesByName extends EmbeddingModelInputModalitiesByName =
    EmbeddingModelInputModalitiesByName,
> {
  /** Discriminator for adapter kind */
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
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelInputModalitiesByName: TModelInputModalitiesByName
  }

  /**
   * Generate embeddings for the input items (one vector per item)
   */
  createEmbeddings: (
    options: EmbeddingOptions<TProviderOptions>,
  ) => Promise<EmbeddingResult>
}

/**
 * An EmbeddingAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyEmbeddingAdapter = EmbeddingAdapter<any, any, any, any>

/**
 * Abstract base class for embedding adapters.
 * Extend this class to implement an embedding adapter for a specific provider.
 *
 * Generic parameters match EmbeddingAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseEmbeddingAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelInputModalitiesByName extends EmbeddingModelInputModalitiesByName =
    EmbeddingModelInputModalitiesByName,
> implements EmbeddingAdapter<
  TModel,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelInputModalitiesByName
> {
  readonly kind = 'embedding' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelInputModalitiesByName: TModelInputModalitiesByName
  }

  protected config: EmbeddingAdapterConfig

  constructor(model: TModel, config: EmbeddingAdapterConfig = {}) {
    this.config = config
    this.model = model
  }

  abstract createEmbeddings(
    options: EmbeddingOptions<TProviderOptions>,
  ): Promise<EmbeddingResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
