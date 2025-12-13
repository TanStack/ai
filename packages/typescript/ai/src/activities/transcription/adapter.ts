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
 * Base interface for audio transcription adapters.
 * Provides type-safe transcription functionality with support for
 * model-specific provider options.
 *
 * Generic parameters:
 * - TModels: Array of supported transcription model names
 * - TProviderOptions: Base provider-specific options for transcription
 */
export interface TranscriptionAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used by ai() to determine API shape */
  readonly kind: 'transcription'
  /** Adapter name identifier */
  readonly name: string
  /** Supported transcription models */
  readonly models: TModels

  // Type-only properties for type inference
  /** @internal Type-only property for provider options inference */
  _providerOptions?: TProviderOptions

  /**
   * Transcribe audio to text
   */
  transcribe: (
    options: TranscriptionOptions<TProviderOptions>,
  ) => Promise<TranscriptionResult>
}

/**
 * Abstract base class for audio transcription adapters.
 * Extend this class to implement a transcription adapter for a specific provider.
 */
export abstract class BaseTranscriptionAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
> implements TranscriptionAdapter<TModels, TProviderOptions> {
  readonly kind = 'transcription' as const
  abstract readonly name: string
  abstract readonly models: TModels

  // Type-only properties - never assigned at runtime
  declare _providerOptions?: TProviderOptions

  protected config: TranscriptionAdapterConfig

  constructor(config: TranscriptionAdapterConfig = {}) {
    this.config = config
  }

  abstract transcribe(
    options: TranscriptionOptions<TProviderOptions>,
  ): Promise<TranscriptionResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
