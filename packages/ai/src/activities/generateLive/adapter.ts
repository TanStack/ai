import type { LiveGenerationOptions, LiveGenerationResult } from '../../types'

/**
 * Configuration for live generation adapter instances.
 *
 * @experimental Live generation is an experimental feature and may change.
 */
export interface LiveAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Live adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`.
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g. 'helios')
 * - TProviderOptions: Provider-specific options (already resolved)
 *
 * @experimental Live generation is an experimental feature and may change.
 */
export interface LiveAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'live'
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
   * Open a live video session from a prompt.
   *
   * Server adapters typically mint a short-lived token and return it with the
   * prompt so a browser can connect, set the prompt, and start streaming.
   */
  createLive: (
    options: LiveGenerationOptions<TProviderOptions>,
  ) => Promise<LiveGenerationResult>
}

/**
 * A LiveAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyLiveAdapter = LiveAdapter<any, any>

/**
 * Abstract base class for live generation adapters.
 * Extend this class to implement a live adapter for a specific provider.
 *
 * @experimental Live generation is an experimental feature and may change.
 */
export abstract class BaseLiveAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements LiveAdapter<TModel, TProviderOptions> {
  readonly kind = 'live' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: LiveAdapterConfig

  constructor(model: TModel, config: LiveAdapterConfig = {}) {
    this.config = config
    this.model = model
  }

  abstract createLive(
    options: LiveGenerationOptions<TProviderOptions>,
  ): Promise<LiveGenerationResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
