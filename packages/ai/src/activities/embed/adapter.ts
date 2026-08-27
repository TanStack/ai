import type {
  EmbeddingModelInputModalitiesByName,
  EmbeddingOptions,
  EmbeddingResult,
} from '../../types'

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

  '~types': {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelInputModalitiesByName: TModelInputModalitiesByName
  }

  createEmbeddings: (
    options: EmbeddingOptions<TProviderOptions>,
  ) => Promise<EmbeddingResult>
}

export type AnyEmbeddingAdapter = EmbeddingAdapter<any, any, any, any>

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

  protected generateId(prefix?: string): string {
    const p = prefix ?? this.name
    return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}
