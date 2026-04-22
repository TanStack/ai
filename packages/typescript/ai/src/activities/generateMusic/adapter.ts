import type { MusicGenerationOptions, MusicGenerationResult } from '../../types'

/**
 * Configuration for music generation adapter instances
 */
export interface MusicAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Music generation adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'fal-ai/minimax-music/v2.6')
 * - TProviderOptions: Provider-specific options (already resolved)
 */
export interface MusicAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'music'
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
   * Generate music from a text prompt
   */
  generateMusic: (
    options: MusicGenerationOptions<TProviderOptions>,
  ) => Promise<MusicGenerationResult>
}

/**
 * A MusicAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyMusicAdapter = MusicAdapter<any, any>

/**
 * Abstract base class for music generation adapters.
 * Extend this class to implement a music adapter for a specific provider.
 *
 * Generic parameters match MusicAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseMusicAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements MusicAdapter<TModel, TProviderOptions> {
  readonly kind = 'music' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: MusicAdapterConfig

  constructor(config: MusicAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract generateMusic(
    options: MusicGenerationOptions<TProviderOptions>,
  ): Promise<MusicGenerationResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
