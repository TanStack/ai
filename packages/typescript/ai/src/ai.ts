import type {
  AIAdapter,
  ChatCompletionResult,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  EmbeddingOptions,
  EmbeddingResult,
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
  any
>
  ? M[number]
  : string;
type ExtractEmbeddingModels<T> = T extends AIAdapter<
  any,
  infer M,
  any,
  any,
  any
>
  ? M[number]
  : string;
type ExtractChatProviderOptions<T> = T extends AIAdapter<
  any,
  any,
  infer P,
  any,
  any
>
  ? P
  : Record<string, any>;
// Helper type to compute per-model provider options from the adapter's model map.
type ExtractModelSpecificProviderOptions<
  TAdapter extends AIAdapter<any, any, any, any, any>,
  TModel extends string
> = TModel extends keyof TAdapter["_modelProviderOptionsByName"]
  ? TAdapter["_modelProviderOptionsByName"][TModel]
  : TAdapter["_modelProviderOptionsByName"][string];

// Helper type to compute chatCompletion return type based on output option
type ChatCompletionReturnType<TOutput extends ResponseFormat<any> | undefined> =
  TOutput extends ResponseFormat<infer TData>
  ? ChatCompletionResult<TData>
  : ChatCompletionResult;

// Convenience alias for the full, model-aware chat options for a given adapter/model/output
type AdapterChatParams<
  TAdapter extends AIAdapter<any, any, any, any, any>,
  TModel extends ExtractModels<TAdapter>,
  TOutput extends ResponseFormat<any> | undefined = undefined
> = ChatCompletionOptions<
  TModel,
  ExtractChatProviderOptions<TAdapter>,
  TOutput,
  ExtractModelSpecificProviderOptions<TAdapter, TModel>
>;

// Config for single adapter
type AIConfig<
  TAdapter extends AIAdapter<any, any, any, any, any>
> = {
  adapter: TAdapter;
  systemPrompts?: string[];
};

/**
 * AI class - simplified to work with a single adapter only
 */
class AI<TAdapter extends AIAdapter<any, any, any, any, any> = AIAdapter<any, any, any, any, any>> {
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
   * The `model` field controls the allowed `providerOptions`. Different
   * models can support different provider-specific capabilities, and this
   * method will narrow `providerOptions` based on the selected model.
   */
  async *chat<
    TModel extends ExtractModels<TAdapter>
  >(
    params: AdapterChatParams<
      TAdapter,
      TModel,
      undefined
    > & { model: TModel }
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
    TModel extends ExtractModels<TAdapter>,
    TOutput extends ResponseFormat<any> | undefined = undefined
  >(
    params: AdapterChatParams<
      TAdapter,
      TModel,
      TOutput
    > & { model: TModel }
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
      output,
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
      options,
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
      model: ExtractEmbeddingModels<TAdapter>;
    }
  ): Promise<EmbeddingResult> {
    const { model, ...restOptions } = options;
    return this.adapter.createEmbeddings({
      ...restOptions,
      model: model as string,
    });
  }


}

/**
 * Create an AI instance with a single adapter and proper type inference
 */
export function ai<
  TAdapter extends AIAdapter<any, any, any, any, any>
>(adapter: TAdapter, config?: { systemPrompts?: string[] }): AI<TAdapter> {
  return new AI({
    adapter,
    systemPrompts: config?.systemPrompts,
  });
}

// Export AI class for type inference in other packages
export { AI };
