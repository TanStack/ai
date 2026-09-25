import type { VoiceGenerationOptions, VoiceResult } from '../../types'

/**
 * Configuration for voice adapter instances
 */
export interface VoiceAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Voice adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'eleven_ttv_v3')
 * - TProviderOptions: Provider-specific options (already resolved)
 */
export interface VoiceAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'voice'
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
   * Create a voice from a text description and/or reference audio
   */
  generateVoice: (
    options: VoiceGenerationOptions<TProviderOptions>,
  ) => Promise<VoiceResult>
}

/**
 * A VoiceAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyVoiceAdapter = VoiceAdapter<any, any>

/**
 * Abstract base class for voice creation adapters.
 * Extend this class to implement a voice adapter for a specific provider.
 *
 * Generic parameters match VoiceAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseVoiceAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements VoiceAdapter<TModel, TProviderOptions> {
  readonly kind = 'voice' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: VoiceAdapterConfig

  constructor(model: TModel, config: VoiceAdapterConfig = {}) {
    this.config = config
    this.model = model
  }

  abstract generateVoice(
    options: VoiceGenerationOptions<TProviderOptions>,
  ): Promise<VoiceResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
