import type {
  AIAdapter,
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamChunk,
  DoneStreamChunk,
  ToolCall,
  Message,
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
    const {
      model,
      tools,
      systemPrompts,
      providerOptions,
      maxIterations = 5,
      ...restOptions
    } = options;

    // Prepend system prompts to messages
    let messages = this.prependSystemPrompts(
      restOptions.messages,
      systemPrompts
    );

    let iterationCount = 0;

    while (iterationCount < maxIterations) {
      let accumulatedContent = "";
      const toolCallsMap = new Map<number, ToolCall>();
      let doneChunk: DoneStreamChunk | null = null;

      // Stream the current iteration
      // IMPORTANT: Extract messages from restOptions to avoid passing stale messages
      const { messages: _, ...restOptionsWithoutMessages } = restOptions;
      for await (const chunk of this.adapter.chatStream({
        ...restOptionsWithoutMessages,
        messages,
        model: model as string,
        tools,
        responseFormat: undefined,
        providerOptions: providerOptions as any,
      })) {
        // Forward all chunks to the caller
        yield chunk;

        // Track content
        if (chunk.type === "content") {
          accumulatedContent = chunk.content;
        }

        // Track tool calls
        if (chunk.type === "tool_call") {
          const index = chunk.index ?? 0;
          const existing = toolCallsMap.get(index);
          if (!existing) {
            // Only create entry if we have a tool call ID and name
            if (chunk.toolCall.id && chunk.toolCall.function.name) {
              toolCallsMap.set(index, {
                id: chunk.toolCall.id,
                type: "function",
                function: {
                  name: chunk.toolCall.function.name,
                  arguments: chunk.toolCall.function.arguments || "",
                },
              });
            }
          } else {
            // Update name if it wasn't set before
            if (chunk.toolCall.function.name && !existing.function.name) {
              existing.function.name = chunk.toolCall.function.name;
            }
            // Accumulate arguments for streaming tool calls
            if (chunk.toolCall.function.arguments) {
              existing.function.arguments += chunk.toolCall.function.arguments;
            }
          }
        }

        // Track done chunk
        if (chunk.type === "done") {
          doneChunk = chunk;
        }

        // Forward errors
        if (chunk.type === "error") {
          return; // Stop on error
        }
      }

      // Check if we need to execute tools
      if (
        doneChunk?.finishReason === "tool_calls" &&
        tools &&
        tools.length > 0
      ) {
        // Filter out incomplete tool calls (must have name and id)
        const toolCallsArray = Array.from(toolCallsMap.values()).filter(
          (tc) =>
            tc.id && tc.function.name && tc.function.name.trim().length > 0
        );

        if (toolCallsArray.length > 0) {
          // Add assistant message with tool calls
          messages = [
            ...messages,
            {
              role: "assistant",
              content: accumulatedContent || null,
              toolCalls: toolCallsArray,
            },
          ];

          // Execute tools and add results
          // IMPORTANT: We must execute ALL tools and add results for ALL tool_call_ids
          const toolResults: Message[] = [];
          const toolCallIds = new Set<string>();

          // Process tool calls in order to maintain order for tool results
          for (const toolCall of toolCallsArray) {
            // Track which tool call IDs we're processing
            if (!toolCall.id) {
              throw new Error(
                `Tool call missing ID: ${JSON.stringify(toolCall)}`
              );
            }
            toolCallIds.add(toolCall.id);

            const tool = tools.find(
              (t) => t.function.name === toolCall.function.name
            );

            let toolResultContent: string;
            if (tool?.execute) {
              try {
                // Parse arguments - by the time we get the done chunk, arguments should be complete JSON
                let args: any;
                try {
                  args = JSON.parse(toolCall.function.arguments);
                } catch (parseError) {
                  throw new Error(
                    `Failed to parse tool arguments as JSON: ${toolCall.function.arguments}`
                  );
                }

                const result = await tool.execute(args);

                toolResultContent =
                  typeof result === "string" ? result : JSON.stringify(result);
              } catch (error: any) {
                // If tool execution fails, add error message
                toolResultContent = `Error executing tool: ${error.message}`;
              }
            } else {
              // Tool doesn't have execute function, add placeholder
              toolResultContent = `Tool ${toolCall.function.name} does not have an execute function`;
            }

            // Emit tool_result chunk so callers can track tool execution
            yield {
              type: "tool_result",
              id: doneChunk.id,
              model: doneChunk.model,
              timestamp: Date.now(),
              toolCallId: toolCall.id,
              content: toolResultContent,
            };

            // Add tool result message - MUST have toolCallId matching the tool call
            toolResults.push({
              role: "tool",
              content: toolResultContent,
              toolCallId: toolCall.id,
            });
          }

          // Verify we have a tool result for every tool call
          if (toolResults.length !== toolCallsArray.length) {
            throw new Error(
              `Mismatch: ${toolCallsArray.length} tool calls but ${toolResults.length} tool results`
            );
          }

          // Verify all tool call IDs have corresponding results
          const resultToolCallIds = new Set(
            toolResults.map((tr) => tr.toolCallId).filter(Boolean)
          );
          const missingIds = Array.from(toolCallIds).filter(
            (id) => !resultToolCallIds.has(id)
          );
          if (missingIds.length > 0) {
            throw new Error(
              `Missing tool results for tool_call_ids: ${missingIds.join(", ")}`
            );
          }

          // CRITICAL: Add tool results to messages BEFORE continuing to next iteration
          // The adapter expects every tool_call_id to have a corresponding tool message
          messages = [...messages, ...toolResults];

          iterationCount++;
          continue; // Continue loop to get next response with updated messages
        }
      }

      // Not tool_calls or no tools to execute, we're done
      break;
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
