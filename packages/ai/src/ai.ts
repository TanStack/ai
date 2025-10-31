import type {
  AIAdapter,
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamChunk,
  Tool,
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
} from "./types";

// Extract types from a single adapter
type ExtractModels<T> = T extends AIAdapter<infer M, any, any, any, any, any, any, any, any, any> ? M[number] : string;
type ExtractImageModels<T> = T extends AIAdapter<any, infer M, any, any, any, any, any, any, any, any> ? M[number] : string;
type ExtractAudioModels<T> = T extends AIAdapter<any, any, any, infer M, any, any, any, any, any, any> ? M[number] : string;
type ExtractVideoModels<T> = T extends AIAdapter<any, any, any, any, infer M, any, any, any, any, any> ? M[number] : string;
type ExtractChatProviderOptions<T> = T extends AIAdapter<any, any, any, any, any, infer P, any, any, any, any> ? P : Record<string, any>;
type ExtractImageProviderOptions<T> = T extends AIAdapter<any, any, any, any, any, any, infer P, any, any, any> ? P : Record<string, any>;
type ExtractAudioProviderOptions<T> = T extends AIAdapter<any, any, any, any, any, any, any, any, infer P, any> ? P : Record<string, any>;
type ExtractVideoProviderOptions<T> = T extends AIAdapter<any, any, any, any, any, any, any, any, any, infer P> ? P : Record<string, any>;

// Helper type to compute chat return type based on the "as" option
type ChatReturnType<
  TOptions extends { as?: "promise" | "stream" | "response" }
> = TOptions["as"] extends "stream"
  ? AsyncIterable<StreamChunk>
  : TOptions["as"] extends "response"
  ? Response
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
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any> = AIAdapter<any, any, any, any, any, any, any, any, any, any>
> {
  private adapter: TAdapter;
  private systemPrompts: string[];

  constructor(config: AIConfig<TAdapter>) {
    this.adapter = config.adapter;
    this.systemPrompts = config.systemPrompts || [];
  }

  /**
   * Complete a chat conversation with optional structured output
   * 
   * @param config Chat configuration with model and messages at root level
   * @param config.model - Model identifier (strongly typed based on adapter)
   * @param config.messages - Array of messages in the conversation
   * @param config.tools - Tools available for the model to call
   * @param config.options - Common options (temperature, maxTokens, etc.)
   * @param config.providerOptions - Provider-specific options
   * @param config.as - Response mode: "promise" (default), "stream", or "response"
   * 
   * @example Basic usage
   * ```typescript
   * const result = await aiInstance.chat({
   *   model: "gpt-4",
   *   messages: [{ role: "user", content: "Hello!" }],
   *   options: {
   *     temperature: 0.7,
   *   }
   * });
   * ```
   * 
   * @example With tools
   * ```typescript
   * const result = await aiInstance.chat({
   *   model: "gpt-4",
   *   messages: [{ role: "user", content: "Hello!" }],
   *   tools: [weatherTool],
   *   options: {
   *     temperature: 0.7,
   *   }
   * });
   * ```
   * 
   * @example Streaming
   * ```typescript
   * const stream = await aiInstance.chat({
   *   model: "gpt-4",
   *   messages: [{ role: "user", content: "Hello!" }],
   *   as: "stream"
   * });
   * ```
   * 
   * @example With provider options
   * ```typescript
   * const result = await aiInstance.chat({
   *   model: "gpt-4",
   *   messages: [{ role: "user", content: "Hello!" }],
   *   options: {
   *     temperature: 0.7,
   *   },
   *   providerOptions: {
   *     reasoningEffort: "high",
   *   }
   * });
   * ```
   */
  async chat<
    TOptions extends { as?: "promise" | "stream" | "response" }
  >(
    config: {
      model: ExtractModels<TAdapter>;
      messages: ChatCompletionOptions["messages"];
      tools?: Tool[];
      options?: Omit<ChatCompletionOptions, "model" | "messages" | "providerOptions" | "tools">;
      providerOptions?: ExtractChatProviderOptions<TAdapter>;
    } & TOptions
  ): Promise<ChatReturnType<TOptions>> {
    const { model, messages, tools, options = {}, providerOptions, as: asOption = "promise" } = config;

    // Prepend system prompts from instance configuration
    const finalMessages = this.prependSystemPrompts(messages);

    // Build the full ChatCompletionOptions
    const chatOptions: ChatCompletionOptions = {
      ...options,
      model: model as string,
      messages: finalMessages,
      tools: tools as any,
      providerOptions: providerOptions as any,
    };

    // Route to appropriate handler based on "as" option
    if (asOption === "stream") {
      return this.adapter.chatStream(chatOptions) as any;
    } else if (asOption === "response") {
      const stream = this.adapter.chatStream(chatOptions);
      return this.streamToResponse(stream) as any;
    } else {
      const result = await this.adapter.chatCompletion(chatOptions);

      // If responseFormat is provided, parse the content as structured data
      if (options.responseFormat && result.content) {
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
  }

  /**
   * Summarize text
   * 
   * @example
   * ```typescript
   * const result = await aiInstance.summarize({
   *   model: "gpt-4",
   *   text: "Long text to summarize..."
   * });
   * ```
   */
  async summarize(config: {
    model: ExtractModels<TAdapter>;
    text: string;
    options?: Omit<SummarizationOptions, "model" | "text">;
  }): Promise<SummarizationResult> {
    const { model, text, options = {} } = config;
    return this.adapter.summarize({
      ...options,
      model: model as string,
      text,
    });
  }

  /**
   * Generate embeddings
   * 
   * @example
   * ```typescript
   * const result = await aiInstance.embed({
   *   model: "text-embedding-3-small",
   *   input: "Text to embed"
   * });
   * ```
   */
  async embed(config: {
    model: ExtractModels<TAdapter>;
    input: string | string[];
    options?: Omit<EmbeddingOptions, "model" | "input">;
  }): Promise<EmbeddingResult> {
    const { model, input, options = {} } = config;
    return this.adapter.createEmbeddings({
      ...options,
      model: model as string,
      input,
    });
  }

  /**
   * Generate an image
   * 
   * @example
   * ```typescript
   * const result = await aiInstance.image({
   *   model: "dall-e-3",
   *   prompt: "A futuristic city",
   *   providerOptions: {
   *     size: "1024x1024"
   *   }
   * });
   * ```
   */
  async image(config: {
    model: ExtractImageModels<TAdapter>;
    prompt: string;
    options?: Omit<ImageGenerationOptions, "model" | "prompt" | "providerOptions">;
    providerOptions?: ExtractImageProviderOptions<TAdapter>;
  }): Promise<ImageGenerationResult> {
    if (!this.adapter.generateImage) {
      throw new Error(`Adapter ${this.adapter.name} does not support image generation`);
    }

    const { model, prompt, options = {}, providerOptions } = config;
    return this.adapter.generateImage({
      ...options,
      model: model as string,
      prompt,
      providerOptions: providerOptions as any,
    });
  }

  /**
   * Transcribe audio
   * 
   * @example
   * ```typescript
   * const result = await aiInstance.audio({
   *   model: "whisper-1",
   *   file: audioBlob,
   *   providerOptions: {
   *     language: "en"
   *   }
   * });
   * ```
   */
  async audio(config: {
    model: ExtractAudioModels<TAdapter>;
    file: Blob | Buffer;
    options?: Omit<AudioTranscriptionOptions, "model" | "file" | "providerOptions">;
    providerOptions?: ExtractAudioProviderOptions<TAdapter>;
  }): Promise<AudioTranscriptionResult> {
    if (!this.adapter.transcribeAudio) {
      throw new Error(`Adapter ${this.adapter.name} does not support audio transcription`);
    }

    const { model, file, options = {}, providerOptions } = config;
    return this.adapter.transcribeAudio({
      ...options,
      model: model as string,
      file,
      providerOptions: providerOptions as any,
    });
  }

  /**
   * Generate speech from text
   * 
   * @example
   * ```typescript
   * const result = await aiInstance.speak({
   *   model: "tts-1",
   *   input: "Hello, world!",
   *   voice: "alloy"
   * });
   * ```
   */
  async speak(config: {
    model: ExtractModels<TAdapter>;
    input: string;
    voice: string;
    options?: Omit<TextToSpeechOptions, "model" | "input" | "voice" | "providerOptions">;
    providerOptions?: ExtractChatProviderOptions<TAdapter>;
  }): Promise<TextToSpeechResult> {
    if (!this.adapter.generateSpeech) {
      throw new Error(`Adapter ${this.adapter.name} does not support text-to-speech`);
    }

    const { model, input, voice, options = {}, providerOptions } = config;
    return this.adapter.generateSpeech({
      ...options,
      model: model as string,
      input,
      voice,
      providerOptions: providerOptions as any,
    });
  }

  /**
   * Generate a video
   * 
   * @example
   * ```typescript
   * const result = await aiInstance.video({
   *   model: "video-model",
   *   prompt: "A cat playing piano",
   *   providerOptions: {
   *     duration: 5
   *   }
   * });
   * ```
   */
  async video(config: {
    model: ExtractVideoModels<TAdapter>;
    prompt: string;
    options?: Omit<VideoGenerationOptions, "model" | "prompt" | "providerOptions">;
    providerOptions?: ExtractVideoProviderOptions<TAdapter>;
  }): Promise<VideoGenerationResult> {
    if (!this.adapter.generateVideo) {
      throw new Error(`Adapter ${this.adapter.name} does not support video generation`);
    }

    const { model, prompt, options = {}, providerOptions } = config;
    return this.adapter.generateVideo({
      ...options,
      model: model as string,
      prompt,
      providerOptions: providerOptions as any,
    });
  }

  // Private helper methods

  private prependSystemPrompts(
    messages: ChatCompletionOptions["messages"]
  ): ChatCompletionOptions["messages"] {
    if (!this.systemPrompts || this.systemPrompts.length === 0) {
      return messages;
    }

    const systemMessages = this.systemPrompts.map((content) => ({
      role: "system" as const,
      content,
    }));

    return [...systemMessages, ...messages];
  }

  private streamToResponse(stream: AsyncIterable<StreamChunk>): Response {
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const data = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
}

/**
 * Create an AI instance with a single adapter and proper type inference
 */
export function ai<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(
  adapter: TAdapter,
  config?: { systemPrompts?: string[] }
): AI<TAdapter> {
  return new AI({
    adapter,
    systemPrompts: config?.systemPrompts,
  });
}
