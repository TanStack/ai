import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '../../types'

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
 * - TSelectedModel: The model selected when creating the adapter (undefined if not selected)
 */
export interface SummarizeAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TSelectedModel extends string | undefined = undefined,
> {
  /** Discriminator for adapter kind - used by generate() to determine API shape */
  readonly kind: 'summarize'
  /** Adapter name identifier */
  readonly name: string
  /** Supported models for summarization */
  readonly models: TModels
  /** The model selected when creating the adapter */
  readonly selectedModel: TSelectedModel

  // Type-only properties for type inference
  /** @internal Type-only property for provider options inference */
  _providerOptions?: TProviderOptions

  /**
   * Summarize the given text
   */
  summarize: (options: SummarizationOptions) => Promise<SummarizationResult>

  /**
   * Stream summarization of the given text.
   * Optional - if not implemented, the activity layer will fall back to
   * non-streaming summarize and yield the result as a single chunk.
   */
  summarizeStream?: (
    options: SummarizationOptions,
  ) => AsyncIterable<StreamChunk>
}

/**
 * Abstract base class for summarize adapters.
 * Extend this class to implement a summarize adapter for a specific provider.
 */
export abstract class BaseSummarizeAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TSelectedModel extends TModels[number] | undefined = undefined,
> implements SummarizeAdapter<TModels, TProviderOptions, TSelectedModel> {
  readonly kind = 'summarize' as const
  abstract readonly name: string
  abstract readonly models: TModels
  readonly selectedModel: TSelectedModel

  // Type-only property - never assigned at runtime
  declare _providerOptions?: TProviderOptions

  protected config: SummarizeAdapterConfig

  constructor(
    config: SummarizeAdapterConfig = {},
    selectedModel?: TSelectedModel,
  ) {
    this.config = config
    this.selectedModel = selectedModel as TSelectedModel
  }

  abstract summarize(
    options: SummarizationOptions,
  ): Promise<SummarizationResult>

  /**
   * Stream summarization of the given text.
   * Override this method in concrete implementations to enable streaming.
   * If not overridden, the activity layer will fall back to non-streaming.
   */
  summarizeStream?(options: SummarizationOptions): AsyncIterable<StreamChunk>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
