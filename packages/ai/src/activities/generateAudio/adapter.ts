import type { AudioGenerationOptions, AudioGenerationResult } from '../../types'

export interface AudioAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

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

  '~types': {
    providerOptions: TProviderOptions
  }

  generateAudio: (
    options: AudioGenerationOptions<TProviderOptions>,
  ) => Promise<AudioGenerationResult>
}

export type AnyAudioAdapter = AudioAdapter<any, any>

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
