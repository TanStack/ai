import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '../../types'

export interface SummarizeAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

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

  '~types': {
    providerOptions: TProviderOptions
  }

  summarize: (
    options: SummarizationOptions<TProviderOptions>,
  ) => Promise<SummarizationResult>

  summarizeStream?: (
    options: SummarizationOptions<TProviderOptions>,
  ) => AsyncIterable<StreamChunk>
}

export type AnySummarizeAdapter = SummarizeAdapter<any, any>

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
    options: SummarizationOptions<TProviderOptions>,
  ): Promise<SummarizationResult>

  summarizeStream?(
    options: SummarizationOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
