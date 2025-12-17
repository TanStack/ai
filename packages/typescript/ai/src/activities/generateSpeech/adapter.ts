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
 * Base interface for text-to-speech adapters.
 * Provides type-safe TTS functionality with support for
 * model-specific provider options.
 *
 * Generic parameters:
 * - TModels: Array of supported TTS model names
 * - TProviderOptions: Base provider-specific options for TTS generation
 * - TSelectedModel: The model selected when creating the adapter (undefined if not selected)
 */
export interface TTSAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TSelectedModel extends TModels[number] | undefined = undefined,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'tts'
  /** Adapter name identifier */
  readonly name: string
  /** Supported TTS models */
  readonly models: TModels
  /** The model selected when creating the adapter */
  readonly selectedModel: TSelectedModel

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  ~types: {
    providerOptions: TProviderOptions
  }

  /**
   * Generate speech from text
   */
  generateSpeech: (options: TTSOptions<TProviderOptions>) => Promise<TTSResult>
}

/**
 * Abstract base class for text-to-speech adapters.
 * Extend this class to implement a TTS adapter for a specific provider.
 */
export abstract class BaseTTSAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TSelectedModel extends TModels[number] | undefined = undefined,
> implements TTSAdapter<TModels, TProviderOptions, TSelectedModel> {
  readonly kind = 'tts' as const
  abstract readonly name: string
  abstract readonly models: TModels
  readonly selectedModel: TSelectedModel

  // Type-only property - never assigned at runtime
  declare ~types: {
    providerOptions: TProviderOptions
  }

  protected config: TTSAdapterConfig

  constructor(config: TTSAdapterConfig = {}, selectedModel?: TSelectedModel) {
    this.config = config
    this.selectedModel = selectedModel as TSelectedModel
  }

  abstract generateSpeech(
    options: TTSOptions<TProviderOptions>,
  ): Promise<TTSResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
