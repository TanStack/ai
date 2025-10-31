import type {
  AIAdapter,
  ChatCompletionOptions,
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
  Tool,
  ResponseFormat,
} from "./types";

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
type ChatCompletionReturnType<
  TOptions extends { output?: ResponseFormat<any> }
> = TOptions["output"] extends ResponseFormat<infer TData>
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

  constructor(config: AIConfig<TAdapter>) {
    this.adapter = config.adapter;
    this.systemPrompts = config.systemPrompts || [];
  }

  /**
   * Stream a chat conversation
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
  chat(
    options: Omit<
      ChatCompletionOptions,
      "model" | "providerOptions" | "responseFormat"
    > & {
      model: ExtractModels<TAdapter>;
      tools?: ReadonlyArray<Tool>;
      systemPrompts?: string[];
      providerOptions?: ExtractChatProviderOptions<TAdapter>;
    }
  ): AsyncIterable<StreamChunk> {
    const { model, tools, systemPrompts, providerOptions, ...restOptions } =
      options;

    // Prepend system prompts to messages
    const messages = this.prependSystemPrompts(
      restOptions.messages,
      systemPrompts
    );

    return this.adapter.chatStream({
      ...restOptions,
      messages,
      model: model as string,
      tools,
      responseFormat: undefined,
      providerOptions: providerOptions as any,
    });
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
    TOptions extends {
      output?: ResponseFormat<any>;
      providerOptions?: ExtractChatProviderOptions<TAdapter>;
    }
  >(
    options: Omit<
      ChatCompletionOptions,
      "model" | "providerOptions" | "responseFormat"
    > & {
      model: ExtractModels<TAdapter>;
      tools?: ReadonlyArray<Tool>;
      systemPrompts?: string[];
    } & TOptions
  ): Promise<ChatCompletionReturnType<TOptions>> {
    const { model, tools, systemPrompts, providerOptions, ...restOptions } =
      options;

    // Extract output if it exists
    const output = (options as any).output as ResponseFormat | undefined;
    const responseFormat = output;

    // Prepend system prompts to messages
    const messages = this.prependSystemPrompts(
      restOptions.messages,
      systemPrompts
    );

    const result = await this.adapter.chatCompletion({
      ...restOptions,
      messages,
      model: model as string,
      tools,
      responseFormat,
      providerOptions: providerOptions as any,
    });

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

  // Private helper methods

  private prependSystemPrompts(
    messages: ChatCompletionOptions["messages"],
    systemPrompts?: string[]
  ): ChatCompletionOptions["messages"] {
    const prompts = systemPrompts || this.systemPrompts;
    if (!prompts || prompts.length === 0) {
      return messages;
    }

    const systemMessages = prompts.map((content) => ({
      role: "system" as const,
      content,
    }));

    return [...systemMessages, ...messages];
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
