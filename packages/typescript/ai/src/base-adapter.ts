import type {
  AIAdapter,
  AIAdapterConfig,
  ChatOptions,
  DefaultMessageMetadataByModality,
  EmbeddingOptions,
  EmbeddingResult,
  Modality,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from './types'

/**
 * Base adapter class with support for endpoint-specific models and provider options.
 *
 * Generic parameters:
 * - TChatModels: Models that support chat/text completion
 * - TEmbeddingModels: Models that support embeddings
 * - TChatProviderOptions: Provider-specific options for chat endpoint
 * - TEmbeddingProviderOptions: Provider-specific options for embedding endpoint
 * - TModelProviderOptionsByName: Provider-specific options for model by name
 * - TModelInputModalitiesByName: Map from model name to its supported input modalities
 * - TMessageMetadataByModality: Map from modality type to adapter-specific metadata types
 */
export abstract class BaseAdapter<
  TChatModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TEmbeddingModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TChatProviderOptions extends Record<string, any> = Record<string, any>,
  TEmbeddingProviderOptions extends Record<string, any> = Record<string, any>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelInputModalitiesByName extends Record<
    string,
    ReadonlyArray<Modality>
  > = Record<string, ReadonlyArray<Modality>>,
  TMessageMetadataByModality extends {
    image: unknown
    audio: unknown
    video: unknown
    document: unknown
  } = DefaultMessageMetadataByModality,
> implements
    AIAdapter<
      TChatModels,
      TEmbeddingModels,
      TChatProviderOptions,
      TEmbeddingProviderOptions,
      TModelProviderOptionsByName,
      TModelInputModalitiesByName,
      TMessageMetadataByModality
    >
{
  abstract name: string
  abstract models: TChatModels
  embeddingModels?: TEmbeddingModels
  protected config: AIAdapterConfig

  // These properties are used for type inference only, never assigned at runtime
  _providerOptions?: TChatProviderOptions
  _chatProviderOptions?: TChatProviderOptions
  _embeddingProviderOptions?: TEmbeddingProviderOptions
  // Type-only map; concrete adapters should override this with a precise type
  _modelProviderOptionsByName!: TModelProviderOptionsByName
  // Type-only map for model input modalities; concrete adapters should override this
  _modelInputModalitiesByName?: TModelInputModalitiesByName
  // Type-only map for message metadata types; concrete adapters should override this
  _messageMetadataByModality?: TMessageMetadataByModality

  constructor(config: AIAdapterConfig = {}) {
    this.config = config
  }

  abstract chatStream(options: ChatOptions): AsyncIterable<StreamChunk>

  abstract summarize(
    options: SummarizationOptions,
  ): Promise<SummarizationResult>
  abstract createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`
  }
}
