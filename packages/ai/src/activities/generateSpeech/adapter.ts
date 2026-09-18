import type {
  ListVoicesOptions,
  ListVoicesResult,
  TTSOptions,
  TTSResult,
} from '../../types'

/**
 * What a TTS adapter can do beyond a single voice reading a single string.
 *
 * Declared statically so `generateSpeech()` can reject an unsupported request
 * before it reaches the provider, instead of surfacing a provider 422.
 */
export interface TTSCapabilities {
  /**
   * Maximum number of distinct voices accepted across `turns`
   * (ElevenLabs 10, Gemini 2). Omit it when the adapter has no dialogue
   * endpoint — then `turns` is rejected outright.
   */
  maxSpeakers?: number
  /** Set when the adapter can honour `timestamps: true`. */
  timestamps?: boolean
}

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
   * Optional static capability declaration. Absent means "single voice, no
   * timestamps" — the contract every adapter had before dialogue existed.
   */
  readonly capabilities?: TTSCapabilities

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

  /**
   * List the voices this account can use.
   *
   * Optional, because only some providers have a catalog worth querying at
   * runtime. A provider whose voices are a fixed list known at build time
   * publishes that list from its own package instead (`GeminiTTSVoices`, or
   * the `OpenAITTSVoice` union), which is strictly better than a network
   * call. Implement this only when the catalog is per-account and can change,
   * which is the case wherever `generateVoice()` can add to it.
   */
  listVoices?: (options?: ListVoicesOptions) => Promise<ListVoicesResult>
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
  declare readonly capabilities?: TTSCapabilities

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: TTSAdapterConfig

  constructor(model: TModel, config: TTSAdapterConfig = {}) {
    this.config = config
    this.model = model
  }

  abstract generateSpeech(
    options: TTSOptions<TProviderOptions>,
  ): Promise<TTSResult>

  /**
   * Not abstract: a provider with a fixed voice list has nothing to query and
   * should not be forced to write a stub.
   */
  listVoices?(options?: ListVoicesOptions): Promise<ListVoicesResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
