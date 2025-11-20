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
  Tool,
  ResponseFormat,
  ModelMessage,
  ChatCompletionOptions,
} from "./types";
import { ToolCallManager } from "./tool-call-manager";
import { executeToolCalls } from "./agent/executor";
import { maxIterations as maxIterationsStrategy } from "./agent-loop-strategies";
import { aiEventClient } from "./event-client.js";

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
    params: ChatCompletionOptions<
      ExtractModels<TAdapter>,
      ExtractChatProviderOptions<TAdapter>
    >
  ): AsyncIterable<StreamChunk> {
    const {
      model,
      messages: inputMessages,
      tools,
      systemPrompts,
      agentLoopStrategy,
      options = {},
      providerOptions,
      abortController,
    } = params;

    // Adapters call this the request controller and signal
    const effectiveRequest = abortController
      ? { signal: abortController.signal }
      : undefined;
    const effectiveSignal = abortController?.signal;

    const requestId = `chat-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`;
    const streamId = `stream-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`;

    // Emit chat started event
    aiEventClient.emit("chat:started", {
      requestId,
      model: model as string,
      messageCount: inputMessages.length,
      hasTools: !!tools && tools.length > 0,
      streaming: true,
      timestamp: Date.now(),
    });

    const shouldContinueLoop = agentLoopStrategy || maxIterationsStrategy(5);

    // Prepend system prompts to messages
    let messages = this.prependSystemPrompts(inputMessages, systemPrompts);

    let iterationCount = 0;
    const toolCallManager = new ToolCallManager(tools || []);
    let lastFinishReason: string | null = null;
    const streamStartTime = Date.now();
    let totalChunkCount = 0; // Track total chunks across all iterations

    // Emit stream started event
    aiEventClient.emit("stream:started", {
      streamId,
      model,
      provider: this.adapter.name,
      timestamp: streamStartTime,
    });

    do {
      // Check if aborted before starting iteration
      if (effectiveSignal?.aborted) {
        break;
      }

      let accumulatedContent = "";
      let doneChunk = null;
      let chunkCount = 0;

      // Generate a unique messageId for this response/chunk group
      const messageId = `msg-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`;

      // Stream the current iteration, passing abortSignal
      for await (const chunk of this.adapter.chatStream({
        model: model as string,
        messages,
        tools: tools as Tool[] | undefined,
        ...options,
        request: effectiveRequest,
        providerOptions: providerOptions as any,
      })) {
        // Check if aborted during iteration
        if (effectiveSignal?.aborted) {
          break;
        }
        chunkCount++;
        totalChunkCount++; // Increment total as well
        // Forward all chunks to the caller
        yield chunk;

        // Emit granular chunk events
        if (chunk.type === "content") {
          accumulatedContent = chunk.content;
          aiEventClient.emit("stream:chunk:content", {
            streamId,
            messageId,
            content: chunk.content,
            delta: chunk.delta,
            timestamp: Date.now(),
          });

          // Emit content event
        }

        // Track tool calls
        if (chunk.type === "tool_call") {
          toolCallManager.addToolCallChunk(chunk);
          aiEventClient.emit("stream:chunk:tool-call", {
            streamId,
            messageId,
            toolCallId: chunk.toolCall.id,
            toolName: chunk.toolCall.function.name,
            index: chunk.index,
            arguments: chunk.toolCall.function.arguments,
            timestamp: Date.now(),
          });

          // Emit tool call event
        }

        // Track tool results
        if (chunk.type === "tool_result") {
          aiEventClient.emit("stream:chunk:tool-result", {
            streamId,
            messageId,
            toolCallId: chunk.toolCallId,
            result: chunk.content,
            timestamp: Date.now(),
          });

          // Emit tool result event
        }

        // Track done chunk
        if (chunk.type === "done") {
          doneChunk = chunk;
          lastFinishReason = chunk.finishReason;
          aiEventClient.emit("stream:chunk:done", {
            streamId,
            messageId,
            finishReason: chunk.finishReason,
            usage: chunk.usage,
            timestamp: Date.now(),
          });

          // Emit done event
        }

        // Forward errors
        if (chunk.type === "error") {
          aiEventClient.emit("stream:chunk:error", {
            streamId,
            messageId,
            error: chunk.error.message,
            timestamp: Date.now(),
          });

          // Emit error event
          return; // Stop on error
        }
      }

      // Check if aborted before tool execution
      if (effectiveSignal?.aborted) {
        break;
      }

      // Check if we need to execute tools
      if (
        doneChunk?.finishReason === "tool_calls" &&
        tools &&
        tools.length > 0 &&
        toolCallManager.hasToolCalls()
      ) {
        const toolCallsArray = toolCallManager.getToolCalls();

        // Emit iteration event
        aiEventClient.emit("chat:iteration", {
          requestId,
          iterationNumber: iterationCount + 1,
          messageCount: messages.length,
          toolCallCount: toolCallsArray.length,
          timestamp: Date.now(),
        });

        // Add assistant message with tool calls
        messages = [
          ...messages,
          {
            role: "assistant",
            content: accumulatedContent || null,
            toolCalls: toolCallsArray,
          },
        ];

        // Extract approvals and client tool results from messages
        const approvals = new Map<string, boolean>();
        const clientToolResults = new Map<string, any>();

        // Look for approval responses and client tool outputs in assistant messages
        for (const msg of messages) {
          if (msg.role === "assistant" && (msg as any).parts) {
            const parts = (msg as any).parts;
            for (const part of parts) {
              // Handle approval responses
              if (
                part.type === "tool-call" &&
                part.state === "approval-responded" &&
                part.approval
              ) {
                approvals.set(part.approval.id, part.approval.approved);
              }

              // Handle client tool outputs
              if (
                part.type === "tool-call" &&
                part.output !== undefined &&
                !part.approval
              ) {
                clientToolResults.set(part.id, part.output);
              }
            }
          }
        }

        // Execute tools using new executor
        const executionResult = await executeToolCalls(
          toolCallsArray,
          tools,
          approvals,
          clientToolResults
        );

        // Check if we need approvals or client execution
        if (
          executionResult.needsApproval.length > 0 ||
          executionResult.needsClientExecution.length > 0
        ) {
          // Emit special chunks for client
          for (const approval of executionResult.needsApproval) {
            aiEventClient.emit("stream:approval-requested", {
              streamId,
              messageId,
              toolCallId: approval.toolCallId,
              toolName: approval.toolName,
              input: approval.input,
              approvalId: approval.approvalId,
              timestamp: Date.now(),
            });

            yield {
              type: "approval-requested",
              id: doneChunk.id,
              model: doneChunk.model,
              timestamp: Date.now(),
              toolCallId: approval.toolCallId,
              toolName: approval.toolName,
              input: approval.input,
              approval: {
                id: approval.approvalId,
                needsApproval: true as const,
              },
            };
          }

          for (const clientTool of executionResult.needsClientExecution) {
            aiEventClient.emit("stream:tool-input-available", {
              streamId,
              toolCallId: clientTool.toolCallId,
              toolName: clientTool.toolName,
              input: clientTool.input,
              timestamp: Date.now(),
            });

            yield {
              type: "tool-input-available",
              id: doneChunk.id,
              model: doneChunk.model,
              timestamp: Date.now(),
              toolCallId: clientTool.toolCallId,
              toolName: clientTool.toolName,
              input: clientTool.input,
            };
          }

          // STOP the loop - wait for client to respond
          return;
        }

        // Execute completed tools - emit tool_result chunks
        for (const result of executionResult.results) {
          aiEventClient.emit("tool:call-completed", {
            streamId,
            toolCallId: result.toolCallId,
            toolName: result.toolCallId, // We'd need to track this better
            result: result.result,
            duration: 0, // We'd need to track execution time
            timestamp: Date.now(),
          });

          const resultChunk = {
            type: "tool_result" as const,
            id: doneChunk.id,
            model: doneChunk.model,
            timestamp: Date.now(),
            toolCallId: result.toolCallId,
            content: JSON.stringify(result.result),
          };

          yield resultChunk;

          // Add to messages
          messages = [
            ...messages,
            {
              role: "tool" as const,
              content: resultChunk.content,
              toolCallId: result.toolCallId,
            },
          ];
        }

        // Clear tool calls for next iteration
        toolCallManager.clear();

        iterationCount++;
        // Continue to next iteration (checked by while condition)
      } else {
        // Not tool_calls or no tools to execute, we're done
        break;
      }
    } while (
      shouldContinueLoop({
        iterationCount,
        messages,
        finishReason: lastFinishReason,
      })
    );

    // Emit stream ended event
    aiEventClient.emit("stream:ended", {
      streamId,
      totalChunks: totalChunkCount,
      duration: Date.now() - streamStartTime,
      timestamp: Date.now(),
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
    aiEventClient.emit("chat:started", {
      requestId,
      model: model as string,
      messageCount: inputMessages.length,
      hasTools: !!tools && tools.length > 0,
      streaming: false,
      timestamp: Date.now(),
    });

    // Extract output if it exists
    const output = params.output;

    // Prepend system prompts to messages
    const messages = this.prependSystemPrompts(inputMessages, systemPrompts);

    const result = await this.adapter.chatCompletion({
      model: model,
      messages,
      tools,
      ...options,
      request: effectiveRequest,
      providerOptions: providerOptions,
    });

    // Emit chat completed event
    aiEventClient.emit("chat:completed", {
      requestId,
      model: model as string,
      content: result.content || "",
      finishReason: result.finishReason || undefined,
      usage: result.usage,
      timestamp: Date.now(),
    });

    // Emit usage tokens event
    if (result.usage) {
      aiEventClient.emit("usage:tokens", {
        requestId,
        model: model as string,
        usage: result.usage,
        timestamp: Date.now(),
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

  // Private helper methods

  private prependSystemPrompts(
    messages: ModelMessage[],
    systemPrompts?: string[]
  ): ModelMessage[] {
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

// Export AI class for type inference in other packages
export { AI };
