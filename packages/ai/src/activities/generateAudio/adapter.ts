import type { AudioGenerationOptions, AudioGenerationResult } from '../../types'

/**
 * Configuration for audio generation adapter instances
 */
export interface AudioAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Audio generation adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'fal-ai/diffrhythm')
 * - TProviderOptions: Provider-specific options (already resolved)
 */
export interface AudioAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'audio'
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
   * Generate audio from a text prompt
   */
  generateAudio: (
    options: AudioGenerationOptions<TProviderOptions>,
  ) => Promise<AudioGenerationResult>
}

/**
 * An AudioAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyAudioAdapter = AudioAdapter<any, any>

/**
 * Abstract base class for audio generation adapters.
 * Extend this class to implement an audio adapter for a specific provider.
 *
 * Generic parameters match AudioAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseAudioAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements AudioAdapter<TModel, TProviderOptions> {
  readonly kind = 'audio' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: AudioAdapterConfig

  constructor(model: TModel, config: AudioAdapterConfig = {}) {
    this.config = config
    this.model = model
  }

  abstract generateAudio(
    options: AudioGenerationOptions<TProviderOptions>,
  ): Promise<AudioGenerationResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
