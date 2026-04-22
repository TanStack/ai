import type {
  SoundEffectsGenerationOptions,
  SoundEffectsGenerationResult,
} from '../../types'

/**
 * Configuration for sound-effects generation adapter instances
 */
export interface SoundEffectsAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Sound-effects generation adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'fal-ai/elevenlabs/sound-effects/v2')
 * - TProviderOptions: Provider-specific options (already resolved)
 */
export interface SoundEffectsAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'sound-effects'
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
   * Generate sound effects from a text prompt
   */
  generateSoundEffects: (
    options: SoundEffectsGenerationOptions<TProviderOptions>,
  ) => Promise<SoundEffectsGenerationResult>
}

/**
 * A SoundEffectsAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnySoundEffectsAdapter = SoundEffectsAdapter<any, any>

/**
 * Abstract base class for sound-effects generation adapters.
 * Extend this class to implement an adapter for a specific provider.
 *
 * Generic parameters match SoundEffectsAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseSoundEffectsAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements SoundEffectsAdapter<TModel, TProviderOptions> {
  readonly kind = 'sound-effects' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: SoundEffectsAdapterConfig

  constructor(config: SoundEffectsAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract generateSoundEffects(
    options: SoundEffectsGenerationOptions<TProviderOptions>,
  ): Promise<SoundEffectsGenerationResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
