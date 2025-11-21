import type {
  AIAdapter,
  ChatCompletionResult,
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
  ResponseFormat,
  ChatCompletionOptions,
} from "./types";
import { AIEventEmitter, DefaultAIEventEmitter } from "./events.js";
import { ChatEngine } from "./chat-engine";
import { prependSystemPrompts } from "./utils";

// Extract types from a single adapter
type ExtractModels<T> = T extends AIAdapter<
  infer M,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? M[number]
  : string;
type ExtractImageModels<T> = T extends AIAdapter<
  any,
  infer M,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? M[number]
  : string;
type ExtractAudioModels<T> = T extends AIAdapter<
  any,
  any,
  any,
  infer M,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? M[number]
  : string;
type ExtractVideoModels<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  infer M,
  any,
  any,
  any,
  any,
  any
>
  ? M[number]
  : string;
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

// Helper type to compute chatCompletion return type based on output option
type ChatCompletionReturnType<TOutput extends ResponseFormat<any> | undefined> =
  TOutput extends ResponseFormat<infer TData>
    ? ChatCompletionResult<TData>
    : ChatCompletionResult;

// Config for single adapter
type AIConfig<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
> = {
  adapter: TAdapter;
  systemPrompts?: string[];
};

/**
 * AI class - simplified to work with a single adapter only
 */
class AI<
  TAdapter extends AIAdapter<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  > = AIAdapter<any, any, any, any, any, any, any, any, any, any>
> {
  private adapter: TAdapter;
  private systemPrompts: string[];
  private events: AIEventEmitter;

  constructor(config: AIConfig<TAdapter>) {
    this.adapter = config.adapter;
    this.systemPrompts = config.systemPrompts || [];
    this.events = new DefaultAIEventEmitter();
  }

  /**
   * Stream a chat conversation with automatic tool execution
   *
   * @param options Chat options for streaming
   *
   * @example
   * // Stream mode
   * const stream = await ai.chat({
   *   model: 'gpt-4',
   *   messages: [...]
   * });
   * for await (const chunk of stream) {
   *   console.log(chunk);
   * }
   */
  async *chat(
    params: ChatCompletionOptions<
      ExtractModels<TAdapter>,
      ExtractChatProviderOptions<TAdapter>
    >
  ): AsyncIterable<StreamChunk> {
    const engine = new ChatEngine({
      adapter: this.adapter,
      events: this.events,
      systemPrompts: this.systemPrompts,
      params,
    });

    for await (const chunk of engine.chat()) {
      yield chunk;
    }
  }

  /**
   * Complete a chat conversation with optional structured output
   *
   * @param options Chat options for promise-based completion
   * @param options.output - Optional structured output
   *
   * @example
   * // Promise mode with structured output
   * const result = await ai.chatCompletion({
   *   model: 'gpt-4',
   *   messages: [...],
   *   output: { type: 'json', jsonSchema: schema }
   * });
   *
   * @example
   * // Promise mode without structured output
   * const result = await ai.chatCompletion({
   *   model: 'gpt-4',
   *   messages: [...]
   * });
   */
  async chatCompletion<
    TOutput extends ResponseFormat<any> | undefined = undefined
  >(
    params: ChatCompletionOptions<
      ExtractModels<TAdapter>,
      ExtractChatProviderOptions<TAdapter>,
      TOutput
    >
  ): Promise<ChatCompletionReturnType<TOutput>> {
    const {
      model,
      messages: inputMessages,
      tools,
      systemPrompts,
      options = {},
      providerOptions,
      request,
      abortController,
    } = params;

    // Combine abortController with request if both are provided
    // Adapters expect request?.signal, so we create a request object from abortController if needed
    const effectiveRequest =
      request ||
      (abortController ? { signal: abortController.signal } : undefined);

    const requestId = `chat-completion-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`;

    // Emit chat started event
    this.events.chatStarted({
      requestId,
      model: model as string,
      messageCount: inputMessages.length,
      hasTools: !!tools && tools.length > 0,
      streaming: false,
    });

    // Extract output if it exists
    const output = params.output;

    // Prepend system prompts to messages
    const messages = prependSystemPrompts(
      inputMessages,
      systemPrompts,
      this.systemPrompts
    );

    const result = await this.adapter.chatCompletion({
      model: model,
      messages,
      tools,
      ...options,
      request: effectiveRequest,
      providerOptions: providerOptions,
    });

    // Emit chat completed event
    this.events.chatCompleted({
      requestId,
      model: model as string,
      content: result.content || "",
      finishReason: result.finishReason || undefined,
      usage: result.usage,
    });

    // Emit usage tokens event
    if (result.usage) {
      this.events.usageTokens({
        requestId,
        model: model as string,
        usage: result.usage,
      });
    }

    // If output is provided, parse the content as structured data
    if (output && result.content) {
      try {
        const data = JSON.parse(result.content);
        return {
          ...result,
          content: result.content,
          data,
        } as any;
      } catch (error) {
        // If parsing fails, return the result as-is
        return result as any;
      }
    }

    return result as any;
  }

  /**
   * Summarize text
   */
  async summarize(
    options: Omit<SummarizationOptions, "model"> & {
      model: ExtractModels<TAdapter>;
    }
  ): Promise<SummarizationResult> {
    const { model, ...restOptions } = options;
    return this.adapter.summarize({
      ...restOptions,
      model: model as string,
    });
  }

  /**
   * Generate embeddings
   */
  async embed(
    options: Omit<EmbeddingOptions, "model"> & {
      model: ExtractModels<TAdapter>;
    }
  ): Promise<EmbeddingResult> {
    const { model, ...restOptions } = options;
    return this.adapter.createEmbeddings({
      ...restOptions,
      model: model as string,
    });
  }

  /**
   * Generate an image
   */
  async image(
    options: Omit<ImageGenerationOptions, "model" | "providerOptions"> & {
      model: ExtractImageModels<TAdapter>;
      providerOptions?: ExtractImageProviderOptions<TAdapter>;
    }
  ): Promise<ImageGenerationResult> {
    if (!this.adapter.generateImage) {
      throw new Error(
        `Adapter ${this.adapter.name} does not support image generation`
      );
    }

    const { model, providerOptions, ...restOptions } = options;
    return this.adapter.generateImage({
      ...restOptions,
      model: model as string,
      providerOptions: providerOptions as any,
    });
  }

  /**
   * Transcribe audio
   */
  async audio(
    options: Omit<AudioTranscriptionOptions, "model" | "providerOptions"> & {
      model: ExtractAudioModels<TAdapter>;
      providerOptions?: ExtractAudioProviderOptions<TAdapter>;
    }
  ): Promise<AudioTranscriptionResult> {
    if (!this.adapter.transcribeAudio) {
      throw new Error(
        `Adapter ${this.adapter.name} does not support audio transcription`
      );
    }

    const { model, providerOptions, ...restOptions } = options;
    return this.adapter.transcribeAudio({
      ...restOptions,
      model: model as string,
      providerOptions: providerOptions as any,
    });
  }

  /**
   * Generate speech from text
   */
  async speak(
    options: Omit<TextToSpeechOptions, "model" | "providerOptions"> & {
      model: ExtractModels<TAdapter>;
      providerOptions?: ExtractChatProviderOptions<TAdapter>;
    }
  ): Promise<TextToSpeechResult> {
    if (!this.adapter.generateSpeech) {
      throw new Error(
        `Adapter ${this.adapter.name} does not support text-to-speech`
      );
    }

    const { model, providerOptions, ...restOptions } = options;
    return this.adapter.generateSpeech({
      ...restOptions,
      model: model as string,
      providerOptions: providerOptions as any,
    });
  }

  /**
   * Generate a video
   */
  async video(
    options: Omit<VideoGenerationOptions, "model" | "providerOptions"> & {
      model: ExtractVideoModels<TAdapter>;
      providerOptions?: ExtractVideoProviderOptions<TAdapter>;
    }
  ): Promise<VideoGenerationResult> {
    if (!this.adapter.generateVideo) {
      throw new Error(
        `Adapter ${this.adapter.name} does not support video generation`
      );
    }

    const { model, providerOptions, ...restOptions } = options;
    return this.adapter.generateVideo({
      ...restOptions,
      model: model as string,
      providerOptions: providerOptions as any,
    });
  }
}

/**
 * Create an AI instance with a single adapter and proper type inference
 */
export function ai<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(adapter: TAdapter, config?: { systemPrompts?: string[] }): AI<TAdapter> {
  return new AI({
    adapter,
    systemPrompts: config?.systemPrompts,
  });
}

// Export AI class for type inference in other packages
export { AI };
