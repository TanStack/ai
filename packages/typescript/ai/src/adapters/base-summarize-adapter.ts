import type { SummarizationOptions, SummarizationResult } from '../types'

/**
 * Configuration for summarize adapter instances
 */
export interface SummarizeAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Base interface for summarize adapters.
 * Provides type-safe summarization functionality.
 *
 * Generic parameters:
 * - TModels: Array of supported model names for summarization
 * - TProviderOptions: Provider-specific options for summarization endpoint
 */
export interface SummarizeAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used by generate() to determine API shape */
  readonly kind: 'summarize'
  /** Adapter name identifier */
  readonly name: string
  /** Supported models for summarization */
  readonly models: TModels

  // Type-only properties for type inference
  /** @internal Type-only property for provider options inference */
  _providerOptions?: TProviderOptions

  /**
   * Summarize the given text
   */
  summarize: (options: SummarizationOptions) => Promise<SummarizationResult>
}

/**
 * Abstract base class for summarize adapters.
 * Extend this class to implement a summarize adapter for a specific provider.
 */
export abstract class BaseSummarizeAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
> implements SummarizeAdapter<TModels, TProviderOptions> {
  readonly kind = 'summarize' as const
  abstract readonly name: string
  abstract readonly models: TModels

  // Type-only property - never assigned at runtime
  declare _providerOptions?: TProviderOptions

  protected config: SummarizeAdapterConfig

  constructor(config: SummarizeAdapterConfig = {}) {
    this.config = config
  }

  abstract summarize(
    options: SummarizationOptions,
  ): Promise<SummarizationResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
