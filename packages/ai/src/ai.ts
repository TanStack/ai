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

type AdapterMap = Record<string, AIAdapter<readonly string[], readonly string[], readonly string[], readonly string[], readonly string[], any, any, any, any, any>>;

// Extract chat model type from an adapter
type ExtractModels<T> = T extends AIAdapter<infer M, any, any, any, any, any, any, any, any, any> ? M[number] : string;

// Extract image model type from an adapter
type ExtractImageModels<T> = T extends AIAdapter<any, infer M, any, any, any, any, any, any, any, any> ? M[number] : string;

// Extract audio model type from an adapter
type ExtractAudioModels<T> = T extends AIAdapter<any, any, any, infer M, any, any, any, any, any, any> ? M[number] : string;

// Extract video model type from an adapter
type ExtractVideoModels<T> = T extends AIAdapter<any, any, any, any, infer M, any, any, any, any, any> ? M[number] : string;

// Extract chat provider options type from an adapter
type ExtractChatProviderOptions<T> = T extends AIAdapter<any, any, any, any, any, infer P, any, any, any, any> ? P : Record<string, any>;

// Extract image provider options type from an adapter
type ExtractImageProviderOptions<T> = T extends AIAdapter<any, any, any, any, any, any, infer P, any, any, any> ? P : Record<string, any>;

// Extract audio provider options type from an adapter
type ExtractAudioProviderOptions<T> = T extends AIAdapter<any, any, any, any, any, any, any, any, infer P, any> ? P : Record<string, any>;

// Extract video provider options type from an adapter
type ExtractVideoProviderOptions<T> = T extends AIAdapter<any, any, any, any, any, any, any, any, any, infer P> ? P : Record<string, any>;

// Helper to get provider options for a specific adapter (no nesting) - for backwards compatibility
type GetProviderOptionsForAdapter<TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>> = ExtractChatProviderOptions<TAdapter>;

// Helper to get chat provider options for a specific adapter
type GetChatProviderOptionsForAdapter<TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>> = ExtractChatProviderOptions<TAdapter>;

// Helper to get image provider options for a specific adapter
type GetImageProviderOptionsForAdapter<TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>> = ExtractImageProviderOptions<TAdapter>;

// Helper to get audio provider options for a specific adapter
type GetAudioProviderOptionsForAdapter<TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>> = ExtractAudioProviderOptions<TAdapter>;

// Helper to get video provider options for a specific adapter
type GetVideoProviderOptionsForAdapter<TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>> = ExtractVideoProviderOptions<TAdapter>;// Type for a single fallback configuration (discriminated union)
type AdapterFallback<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: {
    adapter: K;
    model: ExtractModels<TAdapters[K]>;
    /**
     * Provider-specific options for this fallback. Type-safe based on the adapter.
     */
    providerOptions?: GetProviderOptionsForAdapter<TAdapters[K]>;
  };
}[keyof TAdapters & string];

// Type for a single image fallback configuration
type ImageAdapterFallback<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: TAdapters[K] extends AIAdapter<any, infer ImageModels, any, any, any, any, any, any, any, any>
  ? ImageModels extends readonly string[]
  ? ImageModels['length'] extends 0
  ? never
  : {
    adapter: K;
    model: ExtractImageModels<TAdapters[K]>;
    /**
     * Provider-specific options for this fallback. Type-safe based on the adapter.
     */
    providerOptions?: GetImageProviderOptionsForAdapter<TAdapters[K]>;
  }
  : never
  : never;
}[keyof TAdapters & string];

// Type for tool registry - maps tool names to their Tool definitions
type ToolRegistry = Record<string, Tool>;

// Extract tool names from a registry
type ToolNames<TTools extends ToolRegistry> = keyof TTools & string;

interface AIConfig<T extends AdapterMap, TTools extends ToolRegistry = ToolRegistry> {
  adapters: T;
  /**
   * Default fallback configuration.
   * If an adapter fails (rate limit, service down, error), the next one in the list will be tried.
   * Each fallback specifies both the adapter name and the model to use with that adapter.
   */
  fallbacks?: ReadonlyArray<AdapterFallback<T>>;
  /**
   * Tool registry - define all available tools here.
   * Tools can then be referenced by name in chat options.
   */
  tools?: TTools;
  /**
   * Default system prompts to prepend to all chat conversations.
   * Can be overridden per chat call.
   */
  systemPrompts?: string[];
}

// Create discriminated union for adapter options with model constraint
type ChatOptionsWithAdapter<TAdapters extends AdapterMap, TTools extends ToolRegistry = ToolRegistry> = {
  [K in keyof TAdapters & string]: Omit<ChatCompletionOptions, "model" | "tools" | "providerOptions"> & {
    adapter: K;
    model: ExtractModels<TAdapters[K]>;
    /**
     * Optional fallbacks to try if the primary adapter fails.
     * If not provided, will use global fallbacks from constructor (if any).
     */
    fallbacks?: ReadonlyArray<AdapterFallback<TAdapters>>;
    /**
     * Determines the return type of the chat method:
     * - "promise": Returns a Promise<ChatCompletionResult> (default)
     * - "stream": Returns an AsyncIterable<StreamChunk> for streaming
     * - "response": Returns a Response object with proper headers for HTTP streaming
     */
    as?: "promise" | "stream" | "response";
    /**
     * Array of tool names to use for this chat.
     * Tools must be registered in the AI constructor.
     */
    tools?: ReadonlyArray<ToolNames<TTools>>;
    /**
     * System prompts to prepend to this chat conversation.
     * Overrides the default system prompts from constructor if provided.
     */
    systemPrompts?: string[];
    /**
     * Provider-specific options for chat. Type-safe based on the selected adapter.
     * For example: { reasoningEffort: 'high', parallelToolCalls: true }
     */
    providerOptions?: GetChatProviderOptionsForAdapter<TAdapters[K]>;
  };
}[keyof TAdapters & string];

// Create options type for fallback-only mode (no primary adapter)
type ChatOptionsWithFallback<TAdapters extends AdapterMap, TTools extends ToolRegistry = ToolRegistry> = Omit<
  ChatCompletionOptions,
  "model" | "tools"
> & {
  /**
   * Ordered list of fallbacks to try. If the first fails, will try the next, and so on.
   * Each fallback specifies both the adapter name and the model to use with that adapter.
   */
  fallbacks: ReadonlyArray<AdapterFallback<TAdapters>>;
  /**
   * Determines the return type of the chat method:
   * - "promise": Returns a Promise<ChatCompletionResult> (default)
   * - "stream": Returns an AsyncIterable<StreamChunk> for streaming
   * - "response": Returns a Response object with proper headers for HTTP streaming
   */
  as?: "promise" | "stream" | "response";
  /**
   * Array of tool names to use for this chat.
   * Tools must be registered in the AI constructor.
   */
  tools?: ReadonlyArray<ToolNames<TTools>>;
  /**
   * System prompts to prepend to this chat conversation.
   * Overrides the default system prompts from constructor if provided.
   */
  systemPrompts?: string[];
};

type SummarizationOptionsWithAdapter<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: Omit<SummarizationOptions, "model"> & {
    adapter: K;
    model: ExtractModels<TAdapters[K]>;
    /**
     * Optional fallbacks to try if the primary adapter fails.
     */
    fallbacks?: ReadonlyArray<AdapterFallback<TAdapters>>;
  };
}[keyof TAdapters & string];

type SummarizationOptionsWithFallback<TAdapters extends AdapterMap> = Omit<
  SummarizationOptions,
  "model"
> & {
  /**
   * Ordered list of fallbacks to try. If the first fails, will try the next, and so on.
   */
  fallbacks: ReadonlyArray<AdapterFallback<TAdapters>>;
};

type EmbeddingOptionsWithAdapter<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: Omit<EmbeddingOptions, "model"> & {
    adapter: K;
    model: ExtractModels<TAdapters[K]>;
    /**
     * Optional fallbacks to try if the primary adapter fails.
     */
    fallbacks?: ReadonlyArray<AdapterFallback<TAdapters>>;
  };
}[keyof TAdapters & string];

type EmbeddingOptionsWithFallback<TAdapters extends AdapterMap> = Omit<
  EmbeddingOptions,
  "model"
> & {
  /**
   * Ordered list of fallbacks to try. If the first fails, will try the next, and so on.
   */
  fallbacks: ReadonlyArray<AdapterFallback<TAdapters>>;
};

type ImageGenerationOptionsWithAdapter<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: TAdapters[K] extends AIAdapter<any, infer ImageModels, any, any, any, any, any, any, any, any>
  ? ImageModels extends readonly string[]
  ? ImageModels['length'] extends 0
  ? never
  : Omit<ImageGenerationOptions, "model" | "providerOptions"> & {
    adapter: K;
    model: ExtractImageModels<TAdapters[K]>;
    /**
     * Optional fallbacks to try if the primary adapter fails.
     */
    fallbacks?: ReadonlyArray<ImageAdapterFallback<TAdapters>>;
    /**
     * Provider-specific options for image generation. Type-safe based on the selected adapter.
     */
    providerOptions?: GetImageProviderOptionsForAdapter<TAdapters[K]>;
  }
  : never
  : never;
}[keyof TAdapters & string];

type ImageGenerationOptionsWithFallback<TAdapters extends AdapterMap> = Omit<
  ImageGenerationOptions,
  "model"
> & {
  /**
   * Ordered list of fallbacks to try. If the first fails, will try the next, and so on.
   */
  fallbacks: ReadonlyArray<ImageAdapterFallback<TAdapters>>;
};

// Audio transcription types
type AudioTranscriptionOptionsWithAdapter<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: TAdapters[K] extends AIAdapter<any, any, any, infer AudioModels, any, any, any, any, any, any>
  ? AudioModels extends readonly string[]
  ? AudioModels['length'] extends 0
  ? never
  : Omit<AudioTranscriptionOptions, "model" | "providerOptions"> & {
    adapter: K;
    model: ExtractAudioModels<TAdapters[K]>;
    providerOptions?: GetAudioProviderOptionsForAdapter<TAdapters[K]>;
  }
  : never
  : never;
}[keyof TAdapters & string];

// Text-to-speech types
type TextToSpeechOptionsWithAdapter<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: TAdapters[K] extends AIAdapter<any, any, any, infer AudioModels, any, any, any, any, any, any>
  ? AudioModels extends readonly string[]
  ? AudioModels['length'] extends 0
  ? never
  : Omit<TextToSpeechOptions, "model" | "providerOptions"> & {
    adapter: K;
    model: ExtractAudioModels<TAdapters[K]>;
    providerOptions?: GetAudioProviderOptionsForAdapter<TAdapters[K]>;
  }
  : never
  : never;
}[keyof TAdapters & string];

// Video generation types
type VideoGenerationOptionsWithAdapter<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: TAdapters[K] extends AIAdapter<any, any, any, any, infer VideoModels, any, any, any, any, any>
  ? VideoModels extends readonly string[]
  ? VideoModels['length'] extends 0
  ? never
  : Omit<VideoGenerationOptions, "model" | "providerOptions"> & {
    adapter: K;
    model: ExtractVideoModels<TAdapters[K]>;
    providerOptions?: GetVideoProviderOptionsForAdapter<TAdapters[K]>;
  }
  : never
  : never;
}[keyof TAdapters & string];

export class AI<T extends AdapterMap = AdapterMap, TTools extends ToolRegistry = ToolRegistry> {
  private adapters: T;
  private fallbacks?: ReadonlyArray<AdapterFallback<T>>;
  private tools: TTools;
  private systemPrompts?: string[];

  constructor(config: AIConfig<T, TTools>) {
    this.adapters = config.adapters;
    this.fallbacks = config.fallbacks;
    this.tools = (config.tools || {}) as TTools;
    this.systemPrompts = config.systemPrompts;
  }

  /**
   * Get an adapter by name
   */
  getAdapter<K extends keyof T & string>(name: K): T[K] {
    const adapter = this.adapters[name];
    if (!adapter) {
      throw new Error(
        `Adapter "${name}" not found. Available adapters: ${Object.keys(this.adapters).join(", ")}`
      );
    }
    return adapter;
  }

  /**
   * Get all adapter names
   */
  get adapterNames(): Array<keyof T & string> {
    return Object.keys(this.adapters) as Array<keyof T & string>;
  }

  /**
   * Get a tool by name
   */
  getTool<K extends ToolNames<TTools>>(name: K): TTools[K] {
    const tool = this.tools[name];
    if (!tool) {
      throw new Error(
        `Tool "${name}" not found. Available tools: ${Object.keys(this.tools).join(", ")}`
      );
    }
    return tool;
  }

  /**
   * Get all tool names
   */
  get toolNames(): Array<ToolNames<TTools>> {
    return Object.keys(this.tools) as Array<ToolNames<TTools>>;
  }

  /**
   * Get tools by names
   */
  private getToolsByNames(names: ReadonlyArray<ToolNames<TTools>>): Tool[] {
    return names.map(name => this.getTool(name));
  }

  /**
   * Prepend system prompts to messages if provided
   */
  private prependSystemPrompts(
    messages: import("./types").Message[],
    systemPrompts?: string[]
  ): import("./types").Message[] {
    const promptsToUse = systemPrompts ?? this.systemPrompts;

    if (!promptsToUse || promptsToUse.length === 0) {
      return messages;
    }

    // Check if messages already start with system prompts
    const hasSystemMessage = messages[0]?.role === "system";

    // Create system messages from prompts
    const systemMessages: import("./types").Message[] = promptsToUse.map(content => ({
      role: "system" as const,
      content,
    }));

    // If there are existing system messages, replace them; otherwise prepend
    if (hasSystemMessage) {
      // Find all leading system messages
      let systemMessageCount = 0;
      for (const msg of messages) {
        if (msg.role === "system") {
          systemMessageCount++;
        } else {
          break;
        }
      }
      // Replace existing system messages
      return [...systemMessages, ...messages.slice(systemMessageCount)];
    }

    return [...systemMessages, ...messages];
  }

  /**
   * Try multiple adapters in order until one succeeds
   */
  private async tryWithFallback<TResult>(
    fallbacks: ReadonlyArray<AdapterFallback<T>>,
    operation: (fallback: AdapterFallback<T>) => Promise<TResult>,
    operationName: string
  ): Promise<TResult> {
    const errors: Array<{ adapter: string; model: string; error: Error }> = [];

    for (const fallback of fallbacks) {
      try {
        return await operation(fallback);
      } catch (error: any) {
        errors.push({
          adapter: fallback.adapter as string,
          model: fallback.model as string,
          error: error instanceof Error ? error : new Error(String(error)),
        });

        // Log the error for debugging
        console.warn(
          `[AI] Adapter "${fallback.adapter}" with model "${fallback.model}" failed for ${operationName}:`,
          error.message
        );
      }
    }

    // All adapters failed, throw a comprehensive error
    const errorMessage = errors
      .map((e) => `  - ${e.adapter} (${e.model}): ${e.error.message}`)
      .join("\n");
    throw new Error(
      `All adapters failed for ${operationName}:\n${errorMessage}`
    );
  }

  /**
   * Try multiple adapters in order until one succeeds (async generator version)
   */
  private async *tryStreamWithFallback<TChunk>(
    fallbacks: ReadonlyArray<AdapterFallback<T>>,
    operation: (fallback: AdapterFallback<T>) => AsyncIterable<TChunk>,
    operationName: string
  ): AsyncIterable<TChunk> {
    const errors: Array<{ adapter: string; model: string; error: Error }> = [];

    for (const fallback of fallbacks) {
      try {
        const iterator = operation(fallback);
        let hasError = false;
        let errorInfo: any = null;

        // Manually iterate to catch errors during streaming
        for await (const chunk of iterator) {
          // Check if this is an error chunk (StreamChunk type)
          if ((chunk as any).type === "error") {
            hasError = true;
            errorInfo = (chunk as any).error;
            break;
          }
          yield chunk;
        }

        // If we got an error chunk, throw it to try next fallback
        if (hasError) {
          throw new Error(errorInfo?.message || "Unknown error");
        }

        return; // Success, exit
      } catch (error: any) {
        errors.push({
          adapter: fallback.adapter as string,
          model: fallback.model as string,
          error: error instanceof Error ? error : new Error(String(error)),
        });

        console.warn(
          `[AI] Adapter "${fallback.adapter}" with model "${fallback.model}" failed for ${operationName}:`,
          error.message
        );
      }
    }

    // All adapters failed
    const errorMessage = errors
      .map((e) => `  - ${e.adapter} (${e.model}): ${e.error.message}`)
      .join("\n");
    throw new Error(
      `All adapters failed for ${operationName}:\n${errorMessage}`
    );
  }

  /**
   * Complete a chat conversation
   * Return type is automatically inferred based on the "as" parameter:
   * - "promise" (default): Promise<ChatCompletionResult>
   * - "stream": AsyncIterable<StreamChunk>
   * - "response": Response
   */
  chat<const TAs extends "promise" | "stream" | "response" = "promise">(
    options: (ChatOptionsWithAdapter<T, TTools> | ChatOptionsWithFallback<T, TTools>) & { as?: TAs }
  ): TAs extends "stream"
    ? AsyncIterable<StreamChunk>
    : TAs extends "response"
    ? Response
    : Promise<ChatCompletionResult> {
    const asOption = (options.as || "promise") as "promise" | "stream" | "response";

    // Route to appropriate handler based on "as" option
    if (asOption === "stream") {
      return this.chatStream(options) as any;
    } else if (asOption === "response") {
      return this.chatResponse(options) as any;
    } else {
      return this.chatPromise(options) as any;
    }
  }

  /**
   * Internal: Handle chat as a promise (default behavior)
   */
  private async chatPromise(
    options:
      | ChatOptionsWithAdapter<T, TTools>
      | ChatOptionsWithFallback<T, TTools>
  ): Promise<ChatCompletionResult> {
    // Check if this is fallback-only mode (no primary adapter specified)
    if (!("adapter" in options)) {
      // Fallback-only mode
      const { fallbacks, as, tools, systemPrompts, ...restOptions } = options;
      const fallbackList = fallbacks.length > 0 ? fallbacks : this.fallbacks;

      if (!fallbackList || fallbackList.length === 0) {
        throw new Error(
          "No fallbacks specified. Either provide fallbacks in options or configure fallbacks in constructor."
        );
      }

      // Convert tool names to tool objects
      const toolObjects = tools ? this.getToolsByNames(tools) : undefined;

      // Prepend system prompts to messages
      const messages = this.prependSystemPrompts(restOptions.messages, systemPrompts);

      return this.tryWithFallback(
        fallbackList,
        async (fallback) => {
          return this.getAdapter(fallback.adapter).chatCompletion({
            ...restOptions,
            messages,
            model: fallback.model,
            tools: toolObjects,
            providerOptions: fallback.providerOptions,
          } as ChatCompletionOptions);
        },
        "chat"
      );
    }

    // Single adapter mode (with optional fallbacks)
    const { adapter, model, fallbacks, as, tools, systemPrompts, ...restOptions } = options;

    // Get fallback list (from options or constructor)
    const fallbackList = fallbacks && fallbacks.length > 0
      ? fallbacks
      : this.fallbacks;

    // Convert tool names to tool objects
    const toolObjects = tools ? this.getToolsByNames(tools) : undefined;

    // Prepend system prompts to messages
    const messages = this.prependSystemPrompts(restOptions.messages, systemPrompts);

    // Try primary adapter first
    try {
      return await this.getAdapter(adapter).chatCompletion({
        ...restOptions,
        messages,
        model,
        tools: toolObjects,
      } as ChatCompletionOptions);
    } catch (primaryError: any) {
      // If no fallbacks available, throw the error
      if (!fallbackList || fallbackList.length === 0) {
        throw primaryError;
      }

      // Try fallbacks
      console.warn(
        `[AI] Primary adapter "${adapter}" with model "${model}" failed for chat:`,
        primaryError.message
      );

      return this.tryWithFallback(
        fallbackList,
        async (fallback) => {
          return this.getAdapter(fallback.adapter).chatCompletion({
            ...restOptions,
            messages,
            model: fallback.model,
            tools: toolObjects,
            providerOptions: fallback.providerOptions,
          } as ChatCompletionOptions);
        },
        "chat (after primary failure)"
      );
    }
  }

  /**
   * Internal: Handle chat as a Response object with streaming
   */
  private chatResponse(
    options:
      | ChatOptionsWithAdapter<T, TTools>
      | ChatOptionsWithFallback<T, TTools>
  ): Response {
    const { toStreamResponse } = require("./stream-to-response");
    return toStreamResponse(this.chatStream(options));
  }

  /**
   * Internal: Handle chat as a stream (AsyncIterable)
   * Automatically executes tools if they have execute functions
   * Supports single adapter mode with optional fallbacks
   */
  private async *chatStream(
    options:
      | ChatOptionsWithAdapter<T, TTools>
      | ChatOptionsWithFallback<T, TTools>
  ): AsyncIterable<StreamChunk> {
    // Determine mode and extract values
    const isFallbackOnlyMode = !("adapter" in options);

    let adapterToUse: string;
    let modelToUse: string;
    let restOptions: any;
    let fallbackList: ReadonlyArray<AdapterFallback<T>> | undefined;
    let toolNames: ReadonlyArray<ToolNames<TTools>> | undefined;
    let systemPrompts: string[] | undefined;

    if (isFallbackOnlyMode) {
      // Fallback-only mode
      const { fallbacks, as, tools, systemPrompts: prompts, ...rest } = options;
      fallbackList = fallbacks && fallbacks.length > 0 ? fallbacks : this.fallbacks;
      toolNames = tools;
      systemPrompts = prompts;

      if (!fallbackList || fallbackList.length === 0) {
        throw new Error(
          "No fallbacks specified. Either provide fallbacks in options or configure fallbacks in constructor."
        );
      }

      // Use first fallback as primary
      adapterToUse = fallbackList[0].adapter;
      modelToUse = fallbackList[0].model;
      restOptions = rest;
    } else {
      // Single adapter mode (with optional fallbacks)
      const { adapter, model, fallbacks, as, tools, systemPrompts: prompts, ...rest } = options;
      adapterToUse = adapter;
      modelToUse = model;
      restOptions = rest;
      toolNames = tools;
      systemPrompts = prompts;
      fallbackList = fallbacks && fallbacks.length > 0 ? fallbacks : this.fallbacks;
    }

    // Convert tool names to tool objects
    const toolObjects = toolNames ? this.getToolsByNames(toolNames) : undefined;
    restOptions.tools = toolObjects;

    // Prepend system prompts to messages
    restOptions.messages = this.prependSystemPrompts(restOptions.messages, systemPrompts);

    const hasToolExecutors = toolObjects?.some((t: any) => t.execute);

    // If in fallback-only mode without tool executors, use simple streaming with full fallback support
    if (isFallbackOnlyMode && !hasToolExecutors) {
      yield* this.tryStreamWithFallback(
        fallbackList!,
        (fallback) => {
          return this.getAdapter(fallback.adapter).chatStream({
            ...restOptions,
            model: fallback.model,
            providerOptions: fallback.providerOptions,
            stream: true,
          } as ChatCompletionOptions);
        },
        "streamChat"
      );
      return;
    }

    const adapterInstance = this.getAdapter(adapterToUse);

    // If no tool executors, just stream normally (with fallback support on error)
    if (!hasToolExecutors) {
      // Try primary adapter first
      const errors: Array<{ adapter: string; model: string; error: Error }> = [];

      try {
        // Manually iterate to catch errors during streaming
        const iterator = adapterInstance.chatStream({
          ...restOptions,
          model: modelToUse,
          stream: true,
        } as ChatCompletionOptions);

        let hasError = false;
        let errorChunk: any = null;

        for await (const chunk of iterator) {
          // Check if this is an error chunk
          if (chunk.type === "error") {
            hasError = true;
            errorChunk = chunk;
            // Don't yield the error chunk yet - we'll try fallbacks first
            break;
          }
          yield chunk;
        }

        // If we got an error chunk, throw it to trigger fallback
        if (hasError && errorChunk) {
          throw new Error(errorChunk.error.message || "Unknown error");
        }
        return;
      } catch (primaryError: any) {
        errors.push({
          adapter: adapterToUse,
          model: modelToUse,
          error: primaryError instanceof Error ? primaryError : new Error(String(primaryError)),
        });

        // Try fallbacks if available
        if (fallbackList && fallbackList.length > 0) {
          console.warn(
            `[AI] Primary adapter "${adapterToUse}" with model "${modelToUse}" failed for streamChat:`,
            primaryError.message
          );

          // Try each fallback
          for (const fallback of fallbackList) {
            try {
              const fallbackIterator = this.getAdapter(fallback.adapter).chatStream({
                ...restOptions,
                model: fallback.model,
                providerOptions: fallback.providerOptions,
                stream: true,
              } as ChatCompletionOptions);

              let fallbackHasError = false;
              let fallbackErrorChunk: any = null;

              for await (const chunk of fallbackIterator) {
                // Check if this is an error chunk
                if (chunk.type === "error") {
                  fallbackHasError = true;
                  fallbackErrorChunk = chunk;
                  break;
                }
                yield chunk;
              }

              // If we got an error chunk, throw it to try next fallback
              if (fallbackHasError && fallbackErrorChunk) {
                throw new Error(fallbackErrorChunk.error.message || "Unknown error");
              }

              return; // Success!
            } catch (fallbackError: any) {
              errors.push({
                adapter: fallback.adapter as string,
                model: fallback.model as string,
                error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
              });

              console.warn(
                `[AI] Fallback adapter "${fallback.adapter}" with model "${fallback.model}" failed for streamChat:`,
                fallbackError.message
              );
            }
          }

          // All adapters failed
          const errorMessage = errors
            .map((e) => `  - ${e.adapter} (${e.model}): ${e.error.message}`)
            .join("\n");
          throw new Error(
            `All adapters failed for streamChat:\n${errorMessage}`
          );
        }
        throw primaryError;
      }
    }

    // Auto-execute tools
    const maxIterations = restOptions.maxIterations ?? 5;
    const messages = [...restOptions.messages];
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      const toolCalls: import("./types").ToolCall[] = [];
      const toolCallsMap = new Map<
        number,
        { id: string; name: string; args: string }
      >();
      let hasToolCalls = false;

      // Stream the current iteration
      for await (const chunk of adapterInstance.chatStream({
        ...restOptions,
        model: modelToUse,
        messages,
        stream: true,
      } as ChatCompletionOptions)) {
        yield chunk;

        // Accumulate tool calls
        if (chunk.type === "tool_call") {
          const existing = toolCallsMap.get(chunk.index) || {
            id: chunk.toolCall.id,
            name: "",
            args: "",
          };

          if (chunk.toolCall.function.name) {
            existing.name = chunk.toolCall.function.name;
          }
          existing.args += chunk.toolCall.function.arguments;
          toolCallsMap.set(chunk.index, existing);
        }

        // Check if we need to execute tools
        if (chunk.type === "done" && chunk.finishReason === "tool_calls") {
          hasToolCalls = true;
          toolCallsMap.forEach((call) => {
            toolCalls.push({
              id: call.id,
              type: "function",
              function: {
                name: call.name,
                arguments: call.args,
              },
            });
          });
        }
      }

      // If no tool calls, we're done
      if (!hasToolCalls || toolCalls.length === 0) {
        break;
      }

      // Add assistant message with tool calls
      messages.push({
        role: "assistant",
        content: null,
        toolCalls,
      });

      // Execute tools
      for (const toolCall of toolCalls) {
        const tool = restOptions.tools?.find(
          (t: any) => t.function.name === toolCall.function.name
        );

        if (tool?.execute) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await tool.execute(args);

            messages.push({
              role: "tool",
              content: result,
              toolCallId: toolCall.id,
              name: toolCall.function.name,
            });

            // Yield a custom chunk for tool execution
            yield {
              type: "content",
              id: this.generateId(),
              model: modelToUse,
              timestamp: Date.now(),
              delta: "",
              content: `[Tool ${toolCall.function.name} executed]`,
              role: "assistant",
            } as StreamChunk;
          } catch (error: any) {
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: error.message }),
              toolCallId: toolCall.id,
              name: toolCall.function.name,
            });
          }
        }
      }

      // Continue loop to get final response
    }
  }

  private generateId(): string {
    return `ai-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }



  /**
   * Summarize text
   * Supports single adapter mode with optional fallbacks
   */
  async summarize(
    options:
      | SummarizationOptionsWithAdapter<T>
      | SummarizationOptionsWithFallback<T>
  ): Promise<SummarizationResult> {
    // Check if this is fallback-only mode (no primary adapter specified)
    if (!("adapter" in options)) {
      // Fallback-only mode
      const { fallbacks, ...restOptions } = options;
      const fallbackList = fallbacks && fallbacks.length > 0 ? fallbacks : this.fallbacks;

      if (!fallbackList || fallbackList.length === 0) {
        throw new Error(
          "No fallbacks specified. Either provide fallbacks in options or configure fallbacks in constructor."
        );
      }

      return this.tryWithFallback(
        fallbackList,
        async (fallback) => {
          return this.getAdapter(fallback.adapter).summarize({
            ...restOptions,
            model: fallback.model,
            providerOptions: fallback.providerOptions,
          } as SummarizationOptions);
        },
        "summarize"
      );
    }

    // Single adapter mode (with optional fallbacks)
    const { adapter, model, fallbacks, ...restOptions } = options;

    // Get fallback list (from options or constructor)
    const fallbackList = fallbacks && fallbacks.length > 0
      ? fallbacks
      : this.fallbacks;

    // Try primary adapter first
    try {
      return await this.getAdapter(adapter).summarize({
        ...restOptions,
        model,
      } as SummarizationOptions);
    } catch (primaryError: any) {
      // If no fallbacks available, throw the error
      if (!fallbackList || fallbackList.length === 0) {
        throw primaryError;
      }

      // Try fallbacks
      console.warn(
        `[AI] Primary adapter "${adapter}" with model "${model}" failed for summarize:`,
        primaryError.message
      );

      return this.tryWithFallback(
        fallbackList,
        async (fallback) => {
          return this.getAdapter(fallback.adapter).summarize({
            ...restOptions,
            model: fallback.model,
            providerOptions: fallback.providerOptions,
          } as SummarizationOptions);
        },
        "summarize (after primary failure)"
      );
    }
  }

  /**
   * Create embeddings for text
   * Supports single adapter mode with optional fallbacks
   */
  async embed(
    options:
      | EmbeddingOptionsWithAdapter<T>
      | EmbeddingOptionsWithFallback<T>
  ): Promise<EmbeddingResult> {
    // Check if this is fallback-only mode (no primary adapter specified)
    if (!("adapter" in options)) {
      // Fallback-only mode
      const { fallbacks, ...restOptions } = options;
      const fallbackList = fallbacks && fallbacks.length > 0 ? fallbacks : this.fallbacks;

      if (!fallbackList || fallbackList.length === 0) {
        throw new Error(
          "No fallbacks specified. Either provide fallbacks in options or configure fallbacks in constructor."
        );
      }

      return this.tryWithFallback(
        fallbackList,
        async (fallback) => {
          return this.getAdapter(fallback.adapter).createEmbeddings({
            ...restOptions,
            model: fallback.model,
            providerOptions: fallback.providerOptions,
          } as EmbeddingOptions);
        },
        "embed"
      );
    }

    // Single adapter mode (with optional fallbacks)
    const { adapter, model, fallbacks, ...restOptions } = options;

    // Get fallback list (from options or constructor)
    const fallbackList = fallbacks && fallbacks.length > 0
      ? fallbacks
      : this.fallbacks;

    // Try primary adapter first
    try {
      return await this.getAdapter(adapter).createEmbeddings({
        ...restOptions,
        model,
      } as EmbeddingOptions);
    } catch (primaryError: any) {
      // If no fallbacks available, throw the error
      if (!fallbackList || fallbackList.length === 0) {
        throw primaryError;
      }

      // Try fallbacks
      console.warn(
        `[AI] Primary adapter "${adapter}" with model "${model}" failed for embed:`,
        primaryError.message
      );

      return this.tryWithFallback(
        fallbackList,
        async (fallback) => {
          return this.getAdapter(fallback.adapter).createEmbeddings({
            ...restOptions,
            model: fallback.model,
            providerOptions: fallback.providerOptions,
          } as EmbeddingOptions);
        },
        "embed (after primary failure)"
      );
    }
  }

  /**
   * Generate images from a text prompt
   * Supports single adapter mode with optional fallbacks
   * 
   * @example
   * ```typescript
   * // Single image
   * const { image } = await ai.image({
   *   adapter: 'openai',
   *   model: 'dall-e-3',
   *   prompt: 'A cat in a space suit',
   *   size: '1024x1024'
   * });
   * 
   * // Multiple images
   * const { images } = await ai.image({
   *   adapter: 'openai',
   *   model: 'dall-e-2',
   *   prompt: 'A cat in a space suit',
   *   n: 4
   * });
   * ```
   */
  async image(
    options:
      | ImageGenerationOptionsWithAdapter<T>
      | ImageGenerationOptionsWithFallback<T>
  ): Promise<ImageGenerationResult> {
    // Check if this is fallback-only mode (no primary adapter specified)
    if (!("adapter" in options)) {
      // Fallback-only mode
      const { fallbacks, ...restOptions } = options;
      const fallbackList = fallbacks && fallbacks.length > 0 ? fallbacks : undefined;

      if (!fallbackList || fallbackList.length === 0) {
        throw new Error(
          "No fallbacks specified. Either provide fallbacks in options or ensure at least one adapter supports image generation."
        );
      }

      return this.tryWithFallback(
        fallbackList as any,
        async (fallback) => {
          const adapter = this.getAdapter(fallback.adapter);
          if (!adapter.generateImage) {
            throw new Error(
              `Adapter "${fallback.adapter}" does not support image generation`
            );
          }
          return adapter.generateImage({
            ...restOptions,
            model: fallback.model,
            providerOptions: fallback.providerOptions,
          } as ImageGenerationOptions);
        },
        "image"
      );
    }

    // Single adapter mode (with optional fallbacks)
    const { adapter, model, fallbacks, ...restOptions } = options;

    // Get fallback list (from options or constructor)
    const fallbackList = fallbacks && fallbacks.length > 0
      ? fallbacks
      : undefined;

    const adapterInstance = this.getAdapter(adapter);

    // Check if adapter supports image generation
    if (!adapterInstance.generateImage) {
      throw new Error(
        `Adapter "${adapter}" does not support image generation. Available image adapters: ${Object.entries(this.adapters)
          .filter(([_, a]) => a.generateImage)
          .map(([name]) => name)
          .join(", ") || "none"}`
      );
    }

    // Try primary adapter first
    try {
      return await adapterInstance.generateImage({
        ...restOptions,
        model,
      } as ImageGenerationOptions);
    } catch (primaryError: any) {
      // If no fallbacks available, throw the error
      if (!fallbackList || fallbackList.length === 0) {
        throw primaryError;
      }

      // Try fallbacks
      console.warn(
        `[AI] Primary adapter "${adapter}" with model "${model}" failed for image:`,
        primaryError.message
      );

      return this.tryWithFallback(
        fallbackList as any,
        async (fallback) => {
          const fallbackAdapter = this.getAdapter(fallback.adapter);
          if (!fallbackAdapter.generateImage) {
            throw new Error(
              `Fallback adapter "${fallback.adapter}" does not support image generation`
            );
          }
          return fallbackAdapter.generateImage({
            ...restOptions,
            model: fallback.model,
            providerOptions: fallback.providerOptions,
          } as ImageGenerationOptions);
        },
        "image (after primary failure)"
      );
    }
  }

  /**
   * Transcribe audio to text (speech-to-text)
   * 
   * @example
   * ```ts
   * const result = await ai.audio({
   *   adapter: 'openai',
   *   model: 'whisper-1',
   *   file: audioFile,
   *   responseFormat: 'json'
   * });
   * ```
   */
  async audio(
    options: AudioTranscriptionOptionsWithAdapter<T>
  ): Promise<AudioTranscriptionResult> {
    const { adapter, model, ...restOptions } = options;
    const adapterInstance = this.getAdapter(adapter);

    if (!adapterInstance.transcribeAudio) {
      throw new Error(
        `Adapter "${adapter}" does not support audio transcription. Available audio adapters: ${Object.entries(this.adapters)
          .filter(([_, a]) => a.transcribeAudio)
          .map(([name]) => name)
          .join(", ") || "none"}`
      );
    }

    return await adapterInstance.transcribeAudio({
      ...restOptions,
      model,
    } as AudioTranscriptionOptions);
  }

  /**
   * Generate speech from text (text-to-speech)
   * 
   * @example
   * ```ts
   * const result = await ai.speak({
   *   adapter: 'openai',
   *   model: 'tts-1',
   *   input: 'Hello, world!',
   *   voice: 'alloy'
   * });
   * ```
   */
  async speak(
    options: TextToSpeechOptionsWithAdapter<T>
  ): Promise<TextToSpeechResult> {
    const { adapter, model, ...restOptions } = options;
    const adapterInstance = this.getAdapter(adapter);

    if (!adapterInstance.generateSpeech) {
      throw new Error(
        `Adapter "${adapter}" does not support text-to-speech. Available TTS adapters: ${Object.entries(this.adapters)
          .filter(([_, a]) => a.generateSpeech)
          .map(([name]) => name)
          .join(", ") || "none"}`
      );
    }

    return await adapterInstance.generateSpeech({
      ...restOptions,
      model,
    } as TextToSpeechOptions);
  }

  /**
   * Generate a video from a text prompt
   * 
   * @example
   * ```ts
   * const result = await ai.video({
   *   adapter: 'openai',
   *   model: 'sora-2',
   *   prompt: 'A cat playing with a ball of yarn',
   *   providerOptions: {
   *     size: '1280x720',
   *     seconds: 8
   *   }
   * });
   * ```
   */
  async video(
    options: VideoGenerationOptionsWithAdapter<T>
  ): Promise<VideoGenerationResult> {
    const { adapter, model, ...restOptions } = options;
    const adapterInstance = this.getAdapter(adapter);

    if (!adapterInstance.generateVideo) {
      throw new Error(
        `Adapter "${adapter}" does not support video generation. Available video adapters: ${Object.entries(this.adapters)
          .filter(([_, a]) => a.generateVideo)
          .map(([name]) => name)
          .join(", ") || "none"}`
      );
    }

    return await adapterInstance.generateVideo({
      ...restOptions,
      model,
    } as VideoGenerationOptions);
  }

  /**
   * Add a new adapter
   */
  addAdapter<K extends string>(
    name: K,
    adapter: AIAdapter<readonly string[], readonly string[], readonly string[], readonly string[], readonly string[]>
  ): AI<T & Record<K, AIAdapter<readonly string[], readonly string[], readonly string[], readonly string[], readonly string[]>>> {
    const newAdapters = { ...this.adapters, [name]: adapter } as T &
      Record<K, AIAdapter<readonly string[], readonly string[], readonly string[], readonly string[], readonly string[]>>;
    return new AI({ adapters: newAdapters });
  }
}
