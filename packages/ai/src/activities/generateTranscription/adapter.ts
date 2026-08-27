import type { TranscriptionOptions, TranscriptionResult } from '../../types'

export interface TranscriptionAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

export interface TranscriptionAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'transcription'
  /** Adapter name identifier */
  readonly name: string
  /** The model this adapter is configured for */
  readonly model: TModel

  '~types': {
    providerOptions: TProviderOptions
  }

  transcribe: (
    options: TranscriptionOptions<TProviderOptions>,
  ) => Promise<TranscriptionResult>
}

export type AnyTranscriptionAdapter = TranscriptionAdapter<any, any>

export abstract class BaseTranscriptionAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements TranscriptionAdapter<TModel, TProviderOptions> {
  readonly kind = 'transcription' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: TranscriptionAdapterConfig

  constructor(model: TModel, config: TranscriptionAdapterConfig = {}) {
    this.config = config
    this.model = model
  }

  abstract transcribe(
    options: TranscriptionOptions<TProviderOptions>,
  ): Promise<TranscriptionResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
