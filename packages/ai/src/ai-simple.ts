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

// Type for tool registry - maps tool names to their Tool definitions
type ToolRegistry = Record<string, Tool>;

// Extract tool names from a registry
type ToolNames<TTools extends ToolRegistry> = keyof TTools & string;

// Config for single adapter
type AIConfig<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>,
  TTools extends ToolRegistry = ToolRegistry
> = {
  adapter: TAdapter;
  tools?: TTools;
  systemPrompts?: string[];
};

/**
 * AI class - simplified to work with a single adapter only
 */
export class AI<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any> = AIAdapter<any, any, any, any, any, any, any, any, any, any>,
  TTools extends ToolRegistry = ToolRegistry
> {
  private adapter: TAdapter;
  private tools: TTools;
  private systemPrompts: string[];

  constructor(config: AIConfig<TAdapter, TTools>) {
    this.adapter = config.adapter;
    this.tools = (config.tools || {}) as TTools;
    this.systemPrompts = config.systemPrompts || [];
  }

  /**
   * Complete a chat conversation
   */
  async chat<const TAs extends "promise" | "stream" | "response" = "promise">(
    options: Omit<ChatCompletionOptions, "model" | "tools" | "providerOptions"> & {
      model: ExtractModels<TAdapter>;
      as?: TAs;
      tools?: ReadonlyArray<ToolNames<TTools>>;
      systemPrompts?: string[];
      providerOptions?: ExtractChatProviderOptions<TAdapter>;
    }
  ): Promise<TAs extends "stream" ? AsyncIterable<StreamChunk> : TAs extends "response" ? Response : ChatCompletionResult> {
    const asOption = (options.as || "promise") as "promise" | "stream" | "response";
    const { model, tools, systemPrompts, providerOptions, ...restOptions } = options;

    // Convert tool names to tool objects
    const toolObjects = tools ? this.getToolsByNames(tools) : undefined;

    // Prepend system prompts to messages
    const messages = this.prependSystemPrompts(restOptions.messages, systemPrompts);

    // Route to appropriate handler based on "as" option
    if (asOption === "stream") {
      return this.adapter.chatStream({
        ...restOptions,
        messages,
        model: model as string,
        tools: toolObjects,
        providerOptions: providerOptions as any,
      }) as any;
    } else if (asOption === "response") {
      const stream = this.adapter.chatStream({
        ...restOptions,
        messages,
        model: model as string,
        tools: toolObjects,
        providerOptions: providerOptions as any,
      });
      return this.streamToResponse(stream) as any;
    } else {
      return this.adapter.chatCompletion({
        ...restOptions,
        messages,
        model: model as string,
        tools: toolObjects,
        providerOptions: providerOptions as any,
      }) as any;
    }
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
      throw new Error(`Adapter ${this.adapter.name} does not support image generation`);
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
      throw new Error(`Adapter ${this.adapter.name} does not support audio transcription`);
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
      throw new Error(`Adapter ${this.adapter.name} does not support text-to-speech`);
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
      throw new Error(`Adapter ${this.adapter.name} does not support video generation`);
    }

    const { model, providerOptions, ...restOptions } = options;
    return this.adapter.generateVideo({
      ...restOptions,
      model: model as string,
      providerOptions: providerOptions as any,
    });
  }

  /**
   * Get the current adapter
   */
  getAdapter(): TAdapter {
    return this.adapter;
  }

  /**
   * Set a new adapter
   */
  setAdapter<NewAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>>(
    adapter: NewAdapter
  ): AI<NewAdapter, TTools> {
    return new AI({
      adapter,
      tools: this.tools,
      systemPrompts: this.systemPrompts,
    });
  }

  // Private helper methods

  private getToolsByNames(toolNames: ReadonlyArray<string>): Tool[] {
    return toolNames.map((name) => {
      const tool = this.tools[name];
      if (!tool) {
        throw new Error(`Tool "${name}" not found in registry`);
      }
      return tool;
    });
  }

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
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>,
  TTools extends ToolRegistry = ToolRegistry
>(
  adapter: TAdapter,
  config?: { tools?: TTools; systemPrompts?: string[] }
): AI<TAdapter, TTools> {
  return new AI({
    adapter,
    tools: config?.tools,
    systemPrompts: config?.systemPrompts,
  });
}
