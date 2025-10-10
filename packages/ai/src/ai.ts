import type {
  AIAdapter,
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatCompletionChunk,
  StreamChunk,
  TextGenerationOptions,
  TextGenerationResult,
  SummarizationOptions,
  SummarizationResult,
  EmbeddingOptions,
  EmbeddingResult,
} from "./types";

type AdapterMap = Record<string, AIAdapter<readonly string[]>>;

// Extract model type from an adapter
type ExtractModels<T> = T extends AIAdapter<infer M> ? M[number] : string;

// Type for a single fallback configuration (discriminated union)
type AdapterFallback<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: {
    adapter: K;
    model: ExtractModels<TAdapters[K]>;
  };
}[keyof TAdapters & string];

interface AIConfig<T extends AdapterMap> {
  adapters: T;
  /**
   * Default fallback configuration.
   * If an adapter fails (rate limit, service down, error), the next one in the list will be tried.
   * Each fallback specifies both the adapter name and the model to use with that adapter.
   */
  fallbacks?: ReadonlyArray<AdapterFallback<T>>;
}

// Create discriminated union for adapter options with model constraint
type ChatOptionsWithAdapter<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: Omit<ChatCompletionOptions, "model"> & {
    adapter: K;
    model: ExtractModels<TAdapters[K]>;
    /**
     * Optional fallbacks to try if the primary adapter fails.
     * If not provided, will use global fallbacks from constructor (if any).
     */
    fallbacks?: ReadonlyArray<AdapterFallback<TAdapters>>;
  };
}[keyof TAdapters & string];

// Create options type for fallback-only mode (no primary adapter)
type ChatOptionsWithFallback<TAdapters extends AdapterMap> = Omit<
  ChatCompletionOptions,
  "model"
> & {
  /**
   * Ordered list of fallbacks to try. If the first fails, will try the next, and so on.
   * Each fallback specifies both the adapter name and the model to use with that adapter.
   */
  fallbacks: ReadonlyArray<AdapterFallback<TAdapters>>;
};

type TextGenerationOptionsWithAdapter<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: Omit<TextGenerationOptions, "model"> & {
    adapter: K;
    model: ExtractModels<TAdapters[K]>;
    /**
     * Optional fallbacks to try if the primary adapter fails.
     */
    fallbacks?: ReadonlyArray<AdapterFallback<TAdapters>>;
  };
}[keyof TAdapters & string];

type TextGenerationOptionsWithFallback<TAdapters extends AdapterMap> = Omit<
  TextGenerationOptions,
  "model"
> & {
  /**
   * Ordered list of fallbacks to try. If the first fails, will try the next, and so on.
   */
  fallbacks: ReadonlyArray<AdapterFallback<TAdapters>>;
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

export class AI<T extends AdapterMap = AdapterMap> {
  private adapters: T;
  private fallbacks?: ReadonlyArray<AdapterFallback<T>>;

  constructor(config: AIConfig<T>) {
    this.adapters = config.adapters;
    this.fallbacks = config.fallbacks;
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
        yield* operation(fallback);
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
   * Supports single adapter mode with optional fallbacks
   */
  async chat(
    options:
      | ChatOptionsWithAdapter<T>
      | ChatOptionsWithFallback<T>
  ): Promise<ChatCompletionResult> {
    // Check if this is fallback-only mode (no primary adapter specified)
    if (!("adapter" in options)) {
      // Fallback-only mode
      const { fallbacks, ...restOptions } = options;
      const fallbackList = fallbacks.length > 0 ? fallbacks : this.fallbacks;

      if (!fallbackList || fallbackList.length === 0) {
        throw new Error(
          "No fallbacks specified. Either provide fallbacks in options or configure fallbacks in constructor."
        );
      }

      return this.tryWithFallback(
        fallbackList,
        async (fallback) => {
          return this.getAdapter(fallback.adapter).chatCompletion({
            ...restOptions,
            model: fallback.model,
          } as ChatCompletionOptions);
        },
        "chat"
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
      return await this.getAdapter(adapter).chatCompletion({
        ...restOptions,
        model,
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
            model: fallback.model,
          } as ChatCompletionOptions);
        },
        "chat (after primary failure)"
      );
    }
  }

  /**
   * Complete a chat conversation with streaming (legacy)
   * Supports single adapter mode with optional fallbacks
   * @deprecated Use streamChat() for structured streaming with JSON chunks
   */
  async *chatStream(
    options:
      | ChatOptionsWithAdapter<T>
      | ChatOptionsWithFallback<T>
  ): AsyncIterable<ChatCompletionChunk> {
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

      yield* this.tryStreamWithFallback(
        fallbackList,
        (fallback) => {
          return this.getAdapter(fallback.adapter).chatCompletionStream({
            ...restOptions,
            model: fallback.model,
            stream: true,
          } as ChatCompletionOptions);
        },
        "chatStream"
      );
      return;
    }

    // Single adapter mode (with optional fallbacks)
    const { adapter, model, fallbacks, ...restOptions } = options;

    // Get fallback list (from options or constructor)
    const fallbackList = fallbacks && fallbacks.length > 0
      ? fallbacks
      : this.fallbacks;

    // Try primary adapter first
    try {
      yield* this.getAdapter(adapter).chatCompletionStream({
        ...restOptions,
        model,
        stream: true,
      } as ChatCompletionOptions);
    } catch (primaryError: any) {
      // If no fallbacks available, throw the error
      if (!fallbackList || fallbackList.length === 0) {
        throw primaryError;
      }

      // Try fallbacks
      console.warn(
        `[AI] Primary adapter "${adapter}" with model "${model}" failed for chatStream:`,
        primaryError.message
      );

      yield* this.tryStreamWithFallback(
        fallbackList,
        (fallback) => {
          return this.getAdapter(fallback.adapter).chatCompletionStream({
            ...restOptions,
            model: fallback.model,
            stream: true,
          } as ChatCompletionOptions);
        },
        "chatStream (after primary failure)"
      );
    }
  }

  /**
   * Stream chat with structured JSON chunks (supports tools and detailed token info)
   * Automatically executes tools if they have execute functions
   * Supports single adapter mode with optional fallbacks
   */
  async *streamChat(
    options:
      | ChatOptionsWithAdapter<T>
      | ChatOptionsWithFallback<T>
  ): AsyncIterable<StreamChunk> {
    // Determine mode and extract values
    const isFallbackOnlyMode = !("adapter" in options);

    let adapterToUse: string;
    let modelToUse: string;
    let restOptions: any;
    let fallbackList: ReadonlyArray<AdapterFallback<T>> | undefined;

    if (isFallbackOnlyMode) {
      // Fallback-only mode
      const { fallbacks, ...rest } = options;
      fallbackList = fallbacks && fallbacks.length > 0 ? fallbacks : this.fallbacks;

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
      const { adapter, model, fallbacks, ...rest } = options;
      adapterToUse = adapter;
      modelToUse = model;
      restOptions = rest;
      fallbackList = fallbacks && fallbacks.length > 0 ? fallbacks : this.fallbacks;
    }

    const hasToolExecutors = restOptions.tools?.some((t: any) => t.execute);

    // If in fallback-only mode without tool executors, use simple streaming with full fallback support
    if (isFallbackOnlyMode && !hasToolExecutors) {
      yield* this.tryStreamWithFallback(
        fallbackList!,
        (fallback) => {
          return this.getAdapter(fallback.adapter).chatStream({
            ...restOptions,
            model: fallback.model,
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
      try {
        yield* adapterInstance.chatStream({
          ...restOptions,
          model: modelToUse,
          stream: true,
        } as ChatCompletionOptions);
        return;
      } catch (primaryError: any) {
        // Try fallbacks if available
        if (fallbackList && fallbackList.length > 0) {
          console.warn(
            `[AI] Primary adapter "${adapterToUse}" with model "${modelToUse}" failed for streamChat:`,
            primaryError.message
          );

          yield* this.tryStreamWithFallback(
            fallbackList,
            (fallback) => {
              return this.getAdapter(fallback.adapter).chatStream({
                ...restOptions,
                model: fallback.model,
                stream: true,
              } as ChatCompletionOptions);
            },
            "streamChat (after primary failure)"
          );
          return;
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
   * Generate text from a prompt
   * Supports single adapter mode with optional fallbacks
   */
  async generateText(
    options:
      | TextGenerationOptionsWithAdapter<T>
      | TextGenerationOptionsWithFallback<T>
  ): Promise<TextGenerationResult> {
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
          return this.getAdapter(fallback.adapter).generateText({
            ...restOptions,
            model: fallback.model,
          } as TextGenerationOptions);
        },
        "generateText"
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
      return await this.getAdapter(adapter).generateText({
        ...restOptions,
        model,
      } as TextGenerationOptions);
    } catch (primaryError: any) {
      // If no fallbacks available, throw the error
      if (!fallbackList || fallbackList.length === 0) {
        throw primaryError;
      }

      // Try fallbacks
      console.warn(
        `[AI] Primary adapter "${adapter}" with model "${model}" failed for generateText:`,
        primaryError.message
      );

      return this.tryWithFallback(
        fallbackList,
        async (fallback) => {
          return this.getAdapter(fallback.adapter).generateText({
            ...restOptions,
            model: fallback.model,
          } as TextGenerationOptions);
        },
        "generateText (after primary failure)"
      );
    }
  }

  /**
   * Generate text from a prompt with streaming
   * Supports single adapter mode with optional fallbacks
   */
  async *generateTextStream(
    options:
      | TextGenerationOptionsWithAdapter<T>
      | TextGenerationOptionsWithFallback<T>
  ): AsyncIterable<string> {
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

      yield* this.tryStreamWithFallback(
        fallbackList,
        (fallback) => {
          return this.getAdapter(fallback.adapter).generateTextStream({
            ...restOptions,
            model: fallback.model,
            stream: true,
          } as TextGenerationOptions);
        },
        "generateTextStream"
      );
      return;
    }

    // Single adapter mode (with optional fallbacks)
    const { adapter, model, fallbacks, ...restOptions } = options;

    // Get fallback list (from options or constructor)
    const fallbackList = fallbacks && fallbacks.length > 0
      ? fallbacks
      : this.fallbacks;

    // Try primary adapter first
    try {
      yield* this.getAdapter(adapter).generateTextStream({
        ...restOptions,
        model,
        stream: true,
      } as TextGenerationOptions);
    } catch (primaryError: any) {
      // If no fallbacks available, throw the error
      if (!fallbackList || fallbackList.length === 0) {
        throw primaryError;
      }

      // Try fallbacks
      console.warn(
        `[AI] Primary adapter "${adapter}" with model "${model}" failed for generateTextStream:`,
        primaryError.message
      );

      yield* this.tryStreamWithFallback(
        fallbackList,
        (fallback) => {
          return this.getAdapter(fallback.adapter).generateTextStream({
            ...restOptions,
            model: fallback.model,
            stream: true,
          } as TextGenerationOptions);
        },
        "generateTextStream (after primary failure)"
      );
    }
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
          } as EmbeddingOptions);
        },
        "embed (after primary failure)"
      );
    }
  }

  /**
   * Add a new adapter
   */
  addAdapter<K extends string>(
    name: K,
    adapter: AIAdapter<readonly string[]>
  ): AI<T & Record<K, AIAdapter<readonly string[]>>> {
    const newAdapters = { ...this.adapters, [name]: adapter } as T &
      Record<K, AIAdapter<readonly string[]>>;
    return new AI({ adapters: newAdapters });
  }
}
