import type {
  AIAdapter,
  AIAdapterConfig,
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatCompletionChunk,
  TextGenerationOptions,
  TextGenerationResult,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  EmbeddingOptions,
  EmbeddingResult,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./types";

/**
 * Base adapter class with support for endpoint-specific models and provider options.
 * 
 * Generic parameters:
 * - TChatModels: Models that support chat/text completion
 * - TImageModels: Models that support image generation
 * - TEmbeddingModels: Models that support embeddings
 * - TAudioModels: Models that support audio (transcription and text-to-speech)
 * - TVideoModels: Models that support video generation
 * - TChatProviderOptions: Provider-specific options for chat endpoint
 * - TImageProviderOptions: Provider-specific options for image endpoint  
 * - TEmbeddingProviderOptions: Provider-specific options for embedding endpoint
 * - TAudioProviderOptions: Provider-specific options for audio endpoint
 * - TVideoProviderOptions: Provider-specific options for video endpoint
 */
export abstract class BaseAdapter<
  TChatModels extends readonly string[] = readonly string[],
  TImageModels extends readonly string[] = readonly string[],
  TEmbeddingModels extends readonly string[] = readonly string[],
  TAudioModels extends readonly string[] = readonly string[],
  TVideoModels extends readonly string[] = readonly string[],
  TChatProviderOptions extends Record<string, any> = Record<string, any>,
  TImageProviderOptions extends Record<string, any> = Record<string, any>,
  TEmbeddingProviderOptions extends Record<string, any> = Record<string, any>,
  TAudioProviderOptions extends Record<string, any> = Record<string, any>,
  TVideoProviderOptions extends Record<string, any> = Record<string, any>
> implements AIAdapter<TChatModels, TImageModels, TEmbeddingModels, TAudioModels, TVideoModels, TChatProviderOptions, TImageProviderOptions, TEmbeddingProviderOptions, TAudioProviderOptions, TVideoProviderOptions> {
  abstract name: string;
  abstract models: TChatModels;
  imageModels?: TImageModels;
  embeddingModels?: TEmbeddingModels;
  audioModels?: TAudioModels;
  videoModels?: TVideoModels;
  protected config: AIAdapterConfig;

  // These properties are used for type inference only, never assigned at runtime
  _providerOptions?: TChatProviderOptions;
  _chatProviderOptions?: TChatProviderOptions;
  _imageProviderOptions?: TImageProviderOptions;
  _embeddingProviderOptions?: TEmbeddingProviderOptions;
  _audioProviderOptions?: TAudioProviderOptions;
  _videoProviderOptions?: TVideoProviderOptions;

  constructor(config: AIAdapterConfig = {}) {
    this.config = config;
  }

  abstract chatCompletion(
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult>;
  abstract chatCompletionStream(
    options: ChatCompletionOptions
  ): AsyncIterable<ChatCompletionChunk>;
  abstract chatStream(
    options: ChatCompletionOptions
  ): AsyncIterable<StreamChunk>;
  abstract generateText(
    options: TextGenerationOptions
  ): Promise<TextGenerationResult>;
  abstract generateTextStream(
    options: TextGenerationOptions
  ): AsyncIterable<string>;
  abstract summarize(
    options: SummarizationOptions
  ): Promise<SummarizationResult>;
  abstract createEmbeddings(
    options: EmbeddingOptions
  ): Promise<EmbeddingResult>;

  // Optional image generation
  generateImage?(
    options: ImageGenerationOptions
  ): Promise<ImageGenerationResult>;

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`;
  }
}
