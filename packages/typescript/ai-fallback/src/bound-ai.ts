import type {
  AIAdapter,
  ChatCompletionOptions,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  EmbeddingOptions,
  EmbeddingResult,
  ImageGenerationOptions,
  ImageGenerationResult,
  AudioTranscriptionOptions,
  AudioTranscriptionResult,
  TextToSpeechOptions,
  TextToSpeechResult,
  VideoGenerationOptions,
  VideoGenerationResult,
  Tool,
  ResponseFormat,
} from "@tanstack/ai";
import type { BoundOptions, ChatCompletionReturnType, AI } from "./types";

type ExtractChatProviderOptions<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  any,
  infer P,
  any,
  any,
  any,
  any
>
  ? P
  : Record<string, any>;

type ExtractImageProviderOptions<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  any,
  any,
  infer P,
  any,
  any,
  any
>
  ? P
  : Record<string, any>;

type ExtractAudioProviderOptions<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer P,
  any
>
  ? P
  : Record<string, any>;

type ExtractVideoProviderOptions<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer P
>
  ? P
  : Record<string, any>;

/**
 * BoundAI - Wraps an AI instance with pre-bound model and options
 * 
 * This allows you to create AI instances with model and options already configured,
 * so you only need to pass messages/input at call time.
 */
export class BoundAI<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
> {
  private ai: AI<TAdapter>;
  private boundOptions: BoundOptions<TAdapter>;

  constructor(ai: AI<TAdapter>, boundOptions: BoundOptions<TAdapter>) {
    this.ai = ai;
    this.boundOptions = boundOptions;
  }

  /**
   * Get the adapter name for logging/debugging
   */
  get adapterName(): string {
    // Access private adapter field via type assertion
    // This is safe since we're just reading the name property
    return ((this.ai as any).adapter as TAdapter).name || "unknown";
  }

  /**
   * Stream a chat conversation with automatic tool execution
   */
  async *chat(
    options: Omit<ChatCompletionOptions, "model" | "providerOptions" | "responseFormat"> & {
      messages: ChatCompletionOptions["messages"];
      tools?: ReadonlyArray<Tool>;
      systemPrompts?: string[];
      providerOptions?: ExtractChatProviderOptions<TAdapter>;
    }
  ): AsyncIterable<StreamChunk> {
    yield* this.ai.chat({
      ...this.boundOptions,
      ...options,
    } as any);
  }

  /**
   * Complete a chat conversation with optional structured output
   */
  async chatCompletion<
    TOptions extends {
      output?: ResponseFormat<any>;
      providerOptions?: ExtractChatProviderOptions<TAdapter>;
    }
  >(
    options: Omit<ChatCompletionOptions, "model" | "providerOptions" | "responseFormat"> & {
      messages: ChatCompletionOptions["messages"];
      tools?: ReadonlyArray<Tool>;
      systemPrompts?: string[];
    } & TOptions
  ): Promise<ChatCompletionReturnType<TOptions>> {
    return this.ai.chatCompletion({
      ...this.boundOptions,
      ...options,
    } as any) as Promise<ChatCompletionReturnType<TOptions>>;
  }

  /**
   * Summarize text
   */
  async summarize(
    options: Omit<SummarizationOptions, "model"> & {
      text: string;
    }
  ): Promise<SummarizationResult> {
    return this.ai.summarize({
      ...this.boundOptions,
      ...options,
    } as any);
  }

  /**
   * Generate embeddings
   */
  async embed(
    options: Omit<EmbeddingOptions, "model"> & {
      input: string | string[];
    }
  ): Promise<EmbeddingResult> {
    return this.ai.embed({
      ...this.boundOptions,
      ...options,
    } as any);
  }

  /**
   * Generate an image
   */
  async image(
    options: Omit<ImageGenerationOptions, "model" | "providerOptions"> & {
      prompt: string;
      providerOptions?: ExtractImageProviderOptions<TAdapter>;
    }
  ): Promise<ImageGenerationResult> {
    return this.ai.image({
      ...this.boundOptions,
      ...options,
    } as any);
  }

  /**
   * Transcribe audio
   */
  async audio(
    options: Omit<AudioTranscriptionOptions, "model" | "providerOptions"> & {
      file: Blob | Buffer;
      providerOptions?: ExtractAudioProviderOptions<TAdapter>;
    }
  ): Promise<AudioTranscriptionResult> {
    return this.ai.audio({
      ...this.boundOptions,
      ...options,
    } as any);
  }

  /**
   * Generate speech from text
   */
  async speak(
    options: Omit<TextToSpeechOptions, "model" | "providerOptions"> & {
      input: string;
      voice: string;
      providerOptions?: ExtractChatProviderOptions<TAdapter>;
    }
  ): Promise<TextToSpeechResult> {
    return this.ai.speak({
      ...this.boundOptions,
      ...options,
    } as any);
  }

  /**
   * Generate a video
   */
  async video(
    options: Omit<VideoGenerationOptions, "model" | "providerOptions"> & {
      prompt: string;
      providerOptions?: ExtractVideoProviderOptions<TAdapter>;
    }
  ): Promise<VideoGenerationResult> {
    return this.ai.video({
      ...this.boundOptions,
      ...options,
    } as any);
  }
}

