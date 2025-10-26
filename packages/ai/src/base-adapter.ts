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

export abstract class BaseAdapter<
  TModels extends readonly string[] = readonly string[],
  TImageModels extends readonly string[] = readonly string[],
  TProviderOptions extends Record<string, any> = Record<string, any>
> implements AIAdapter<TModels, TImageModels, TProviderOptions> {
  abstract name: string;
  abstract models: TModels;
  imageModels?: TImageModels;
  protected config: AIAdapterConfig;

  // This property is used for type inference only, never assigned at runtime
  _providerOptions?: TProviderOptions;

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
