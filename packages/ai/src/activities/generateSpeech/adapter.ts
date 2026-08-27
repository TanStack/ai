import type { TTSOptions, TTSResult } from '../../types'

export interface TTSAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

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

  '~types': {
    providerOptions: TProviderOptions
  }

  generateSpeech: (options: TTSOptions<TProviderOptions>) => Promise<TTSResult>
}

export type AnyTTSAdapter = TTSAdapter<any, any>

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

  constructor(model: TModel, config: TTSAdapterConfig = {}) {
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
