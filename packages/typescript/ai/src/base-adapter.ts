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
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionStreamChunk,
} from './types'

/**
 * Base adapter class with support for endpoint-specific models and provider options.
 *
 * Generic parameters:
 * - TChatModels: Models that support chat/text completion
 * - TEmbeddingModels: Models that support embeddings
 * - TTranscriptionModels: Models that support transcription (optional)
 * - TChatProviderOptions: Provider-specific options for chat endpoint
 * - TEmbeddingProviderOptions: Provider-specific options for embedding endpoint
 * - TTranscriptionProviderOptions: Provider-specific options for transcription endpoint
 * - TModelProviderOptionsByName: Provider-specific options for model by name
 * - TModelInputModalitiesByName: Map from model name to its supported input modalities
 * - TMessageMetadataByModality: Map from modality type to adapter-specific metadata types
 */
export abstract class BaseAdapter<
  TChatModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TEmbeddingModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TTranscriptionModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TChatProviderOptions extends Record<string, any> = Record<string, any>,
  TEmbeddingProviderOptions extends Record<string, any> = Record<string, any>,
  TTranscriptionProviderOptions extends Record<string, any> = Record<
    string,
    any
  >,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelInputModalitiesByName extends Record<
    string,
    ReadonlyArray<Modality>
  > = Record<string, ReadonlyArray<Modality>>,
  TMessageMetadataByModality extends {
    text: unknown
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
  /** Models that support transcription. If undefined, transcription is not supported. */
  transcriptionModels?: TTranscriptionModels
  protected config: AIAdapterConfig

  // These properties are used for type inference only, never assigned at runtime
  _providerOptions?: TChatProviderOptions
  _chatProviderOptions?: TChatProviderOptions
  _embeddingProviderOptions?: TEmbeddingProviderOptions
  _transcriptionProviderOptions?: TTranscriptionProviderOptions
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

  /**
   * Transcribe audio to text.
   * Optional - adapters that support transcription should implement this method.
   * @throws Error if not implemented by the adapter
   */
  transcribe?(
    options: TranscriptionOptions<string, TTranscriptionProviderOptions>,
  ): Promise<TranscriptionResult>

  /**
   * Transcribe audio to text with streaming output.
   * Optional - adapters that support streaming transcription should implement this method.
   * @throws Error if not implemented by the adapter
   */
  transcribeStream?(
    options: TranscriptionOptions<string, TTranscriptionProviderOptions>,
  ): AsyncIterable<TranscriptionStreamChunk>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`
  }
}
