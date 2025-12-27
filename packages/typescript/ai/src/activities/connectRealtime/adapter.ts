import type { RealtimeOptions, RealtimeResult } from '../../types'

/**
 * Configuration for Realtime adapter instances
 */
export interface RealtimeAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>
}

/**
 * Realtime adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'realtime-1')
 * - TProviderOptions: Provider-specific options (already resolved)
 */
export interface RealtimeAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'realtime'
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
   * Connect to Realtime
   */
  connectRealtime: (options: RealtimeOptions<TProviderOptions>) => Promise<RealtimeResult>
}

export type AnyRealtimeAdapter = RealtimeAdapter<any, any>

/**
 * Abstract base class for Realtime adapters.
 * Extend this class to implement a Realtime adapter for a specific provider.
 *
 * Generic parameters match RealtimeAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseRealtimeAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>
> implements RealtimeAdapter<TModel, TProviderOptions> {
  readonly kind = 'realtime' as const
  abstract readonly name: string
  readonly model: TModel

  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: RealtimeAdapterConfig

  constructor(config: RealtimeAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract connectRealtime(
    options: RealtimeOptions<TProviderOptions>
  ): Promise<RealtimeResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
