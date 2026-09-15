import type { WorldGenerationOptions, WorldGenerationResult } from '../../types'

/**
 * Configuration for world generation adapter instances.
 *
 * @experimental World generation is an experimental feature and may change.
 */
export interface WorldAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * World adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`.
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g. 'visko-orbis-stable')
 * - TProviderOptions: Provider-specific options (already resolved)
 *
 * @experimental World generation is an experimental feature and may change.
 */
export interface WorldAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'world'
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
   * Open a world session from a prompt.
   *
   * Server adapters typically mint a short-lived token and return it with the
   * prompt so a browser can connect, set the prompt, and start streaming.
   */
  createWorld: (
    options: WorldGenerationOptions<TProviderOptions>,
  ) => Promise<WorldGenerationResult>
}

/**
 * A WorldAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyWorldAdapter = WorldAdapter<any, any>

/**
 * Abstract base class for world generation adapters.
 * Extend this class to implement a world adapter for a specific provider.
 *
 * @experimental World generation is an experimental feature and may change.
 */
export abstract class BaseWorldAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements WorldAdapter<TModel, TProviderOptions> {
  readonly kind = 'world' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: WorldAdapterConfig

  constructor(model: TModel, config: WorldAdapterConfig = {}) {
    this.config = config
    this.model = model
  }

  abstract createWorld(
    options: WorldGenerationOptions<TProviderOptions>,
  ): Promise<WorldGenerationResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
