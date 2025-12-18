import type { TTSOptions, TTSResult } from '../../types'

/**
 * Configuration for TTS adapter instances
 */
export interface TTSAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * TTS adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'tts-1')
 * - TProviderOptions: Provider-specific options (already resolved)
 */
export interface TTSAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'tts'
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
   * Generate speech from text
   */
  generateSpeech: (options: TTSOptions<TProviderOptions>) => Promise<TTSResult>
}

/**
 * A TTSAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyTTSAdapter = TTSAdapter<any, any>

/**
 * Abstract base class for text-to-speech adapters.
 * Extend this class to implement a TTS adapter for a specific provider.
 *
 * Generic parameters match TTSAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseTTSAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements TTSAdapter<TModel, TProviderOptions> {
  readonly kind = 'tts' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: TTSAdapterConfig

  constructor(config: TTSAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract generateSpeech(
    options: TTSOptions<TProviderOptions>,
  ): Promise<TTSResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
