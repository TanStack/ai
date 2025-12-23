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
 * Summarize adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'gpt-4o')
 * - TProviderOptions: Provider-specific options (already resolved)
 */
export interface SummarizeAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used by generate() to determine API shape */
  readonly kind: 'summarize'
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
 * A SummarizeAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnySummarizeAdapter = SummarizeAdapter<any, any>

/**
 * Abstract base class for summarize adapters.
 * Extend this class to implement a summarize adapter for a specific provider.
 *
 * Generic parameters match SummarizeAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseSummarizeAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements SummarizeAdapter<TModel, TProviderOptions> {
  readonly kind = 'summarize' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: SummarizeAdapterConfig

  constructor(config: SummarizeAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
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
