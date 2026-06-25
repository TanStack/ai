import type { RerankAdapterResult, RerankOptions } from '../../types'

/**
 * Configuration for rerank adapter instances
 */
export interface RerankAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  headers?: Record<string, string>
}

/**
 * Rerank adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g. 'rerank-v3.5')
 * - TProviderOptions: Provider-specific options (already resolved)
 */
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

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  '~types': {
    providerOptions: TProviderOptions
  }

  /**
   * Rerank the given (pre-serialized) documents against the query, returning
   * scored indices into `options.documents`. The activity layer maps these
   * back to the caller's original documents.
   */
  rerank: (
    options: RerankOptions<TProviderOptions>,
  ) => Promise<RerankAdapterResult>
}

/**
 * A RerankAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyRerankAdapter = RerankAdapter<any, any>

/**
 * Abstract base class for rerank adapters.
 * Extend this class to implement a rerank adapter for a specific provider.
 *
 * Generic parameters match RerankAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseRerankAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements RerankAdapter<TModel, TProviderOptions>
{
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
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
