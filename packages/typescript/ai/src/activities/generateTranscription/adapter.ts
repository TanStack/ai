import type { TranscriptionOptions, TranscriptionResult } from '../../types'

/**
 * Configuration for transcription adapter instances
 */
export interface TranscriptionAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Transcription adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'whisper-1')
 * - TProviderOptions: Provider-specific options (already resolved)
 */
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

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  '~types': {
    providerOptions: TProviderOptions
  }

  /**
   * Transcribe audio to text
   */
  transcribe: (
    options: TranscriptionOptions<TProviderOptions>,
  ) => Promise<TranscriptionResult>
}

/**
 * A TranscriptionAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyTranscriptionAdapter = TranscriptionAdapter<any, any>

/**
 * Abstract base class for audio transcription adapters.
 * Extend this class to implement a transcription adapter for a specific provider.
 *
 * Generic parameters match TranscriptionAdapter - all pre-resolved by the provider function.
 */
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

  constructor(config: TranscriptionAdapterConfig = {}, model: TModel) {
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
