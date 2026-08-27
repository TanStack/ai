import type { RerankAdapterResult, RerankOptions } from '../../types'

export interface RerankAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  headers?: Record<string, string>
}

export interface RerankAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind */
  readonly kind: 'rerank'
  /** Adapter name identifier */
  readonly name: string
  /** The model this adapter is configured for */
  readonly model: TModel

  '~types': {
    providerOptions: TProviderOptions
  }

  rerank: (
    options: RerankOptions<TProviderOptions>,
  ) => Promise<RerankAdapterResult>
}

export type AnyRerankAdapter = RerankAdapter<any, any>

export abstract class BaseRerankAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements RerankAdapter<TModel, TProviderOptions> {
  readonly kind = 'rerank' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: RerankAdapterConfig

  constructor(config: RerankAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract rerank(
    options: RerankOptions<TProviderOptions>,
  ): Promise<RerankAdapterResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}
