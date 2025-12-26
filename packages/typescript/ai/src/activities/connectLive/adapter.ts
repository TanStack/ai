import type { LiveAPIOptions, LiveAPIResult } from '../../types'

/**
 * Configuration for Live API adapter instances
 */
export interface LiveAPIAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>
}

/**
 * Live API adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'liveAPI-1')
 * - TProviderOptions: Provider-specific options (already resolved)
 */
export interface LiveAPIAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'liveAPI'
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
   * Connect to Live API
   */
  connectLive: (options: LiveAPIOptions<TProviderOptions>) => Promise<LiveAPIResult>
}

export type AnyLiveAPIAdapter = LiveAPIAdapter<any, any>

/**
 * Abstract base class for Live API adapters.
 * Extend this class to implement a Live API adapter for a specific provider.
 *
 * Generic parameters match LiveAPIAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseLiveAPIAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>
> implements LiveAPIAdapter<TModel, TProviderOptions> {
  readonly kind = 'liveAPI' as const
  abstract readonly name: string
  readonly model: TModel

  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: LiveAPIAdapterConfig

  constructor(config: LiveAPIAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract connectLive(
    options: LiveAPIOptions<TProviderOptions>
  ): Promise<LiveAPIResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
