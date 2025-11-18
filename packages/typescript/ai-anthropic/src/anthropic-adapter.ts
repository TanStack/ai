import Anthropic_SDK from "@anthropic-ai/sdk";
import {
  BaseAdapter,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type ChatCompletionChunk,
  type TextGenerationOptions,
  type TextGenerationResult,
  type SummarizationOptions,
  type SummarizationResult,
  type EmbeddingOptions,
  type EmbeddingResult,
  type Message,
  type StreamChunk,
} from "@tanstack/ai";
import { ANTHROPIC_AUDIO_MODELS, ANTHROPIC_EMBEDDING_MODELS, ANTHROPIC_IMAGE_MODELS, ANTHROPIC_MODELS, ANTHROPIC_VIDEO_MODELS } from "./model-meta";

export interface AnthropicConfig {
  apiKey: string;
}


/**
 * Anthropic-specific provider options
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
 */
export interface AnthropicProviderOptions {
  /** Enable extended thinking with budget tokens */
  thinking?: {
    type: 'enabled';
    budgetTokens: number;
  };
  /** Prompt caching configuration (beta) */
  cacheControl?: {
    type: 'ephemeral';
    /** Cache TTL: '5m' (default) | '1h' */
    ttl?: '5m' | '1h';
  };
  /** Include reasoning content in requests. Defaults to true */
  sendReasoning?: boolean;
}

/**
 * Maps common options to Anthropic-specific format
 * Handles translation of normalized options to Anthropic's API format
 */
function mapCommonOptionsToAnthropic(
  options: ChatCompletionOptions,
  providerOpts?: AnthropicProviderOptions
): any {
  const requestParams: any = {
    model: options.model,
    max_tokens: options.maxTokens || 1024,
    temperature: options.temperature,
    top_p: options.topP,
    stop_sequences: options.stopSequences,
    stream: options.stream || false,
  };

  if (options.metadata) {
    requestParams.metadata = options.metadata;
  }

  // Map tools if provided
  if (options.tools && options.tools.length > 0) {
    requestParams.tools = options.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    // Map tool choice
    if (options.toolChoice) {
      if (options.toolChoice === "auto") {
        requestParams.tool_choice = { type: "auto" };
      } else if (options.toolChoice === "required") {
        requestParams.tool_choice = { type: "any" };
      } else if (typeof options.toolChoice === "object") {
        requestParams.tool_choice = {
          type: "tool",
          name: options.toolChoice.function.name,
        };
      }
      // "none" is not supported by Anthropic, just omit tools instead
    }
  }

  // Apply Anthropic-specific provider options
  if (providerOpts) {
    if (providerOpts.thinking) {
      requestParams.thinking = providerOpts.thinking;
    }
    // Note: cacheControl and sendReasoning are applied at the message/tool level,
    // not at the top-level request
  }

  // Custom headers and abort signal handled at HTTP client level
  if (options.headers) {
    requestParams._headers = options.headers;
  }
  if (options.abortSignal) {
    requestParams._abortSignal = options.abortSignal;
  }

  // Anthropic uses user_id in metadata, not top-level user
  if (options.user) {
    if (!requestParams.metadata) {
      requestParams.metadata = {};
    }
    requestParams.metadata.user_id = options.user;
  }

  return requestParams;
}

export class Anthropic extends BaseAdapter<
  typeof ANTHROPIC_MODELS,
  typeof ANTHROPIC_IMAGE_MODELS,
  typeof ANTHROPIC_EMBEDDING_MODELS,
  typeof ANTHROPIC_AUDIO_MODELS,
  typeof ANTHROPIC_VIDEO_MODELS,
  AnthropicProviderOptions,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>
> {
  name = "anthropic" as const;
  models = ANTHROPIC_MODELS;
  imageModels = ANTHROPIC_IMAGE_MODELS;
  embeddingModels = ANTHROPIC_EMBEDDING_MODELS;
  audioModels = ANTHROPIC_AUDIO_MODELS;
  videoModels = ANTHROPIC_VIDEO_MODELS;
  private client: Anthropic_SDK;

  constructor(config: AnthropicConfig) {
    super({});
    this.client = new Anthropic_SDK({
      apiKey: config.apiKey,
    });
  }

  async chatCompletion(
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    const providerOpts = options.providerOptions as AnthropicProviderOptions | undefined;
    const { systemMessage, messages } = this.formatMessages(options.messages);

    // Map common options to Anthropic format using the centralized mapping function
    const requestParams = mapCommonOptionsToAnthropic(options, providerOpts);

    // Add formatted messages and system message
    requestParams.messages = messages as any;
    requestParams.system = systemMessage;

    // Force stream to false for non-streaming
    requestParams.stream = false;

    // Set default model if not provided
    if (!requestParams.model) {
      requestParams.model = "claude-3-sonnet-20240229";
    }

    // Extract custom headers and abort signal
    const customHeaders = requestParams._headers;
    const abortSignal = requestParams._abortSignal;
    delete requestParams._headers;
    delete requestParams._abortSignal;

    const response = await this.client.messages.create(
      requestParams,
      {
        headers: customHeaders as Record<string, string> | undefined,
        signal: abortSignal as AbortSignal | undefined,
      }
    );

    // Extract text content
    const textContent = response.content
      .filter((c) => c.type === "text")
      .map((c: any) => c.text)
      .join("");

    // Extract tool calls
    const toolCalls = response.content
      .filter((c) => c.type === "tool_use")
      .map((c: any) => ({
        id: c.id,
        type: "function" as const,
        function: {
          name: c.name,
          arguments: JSON.stringify(c.input),
        },
      }));

    return {
      id: response.id,
      model: response.model,
      content: textContent || null,
      role: "assistant",
      finishReason: response.stop_reason as any,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async *chatCompletionStream(
    options: ChatCompletionOptions
  ): AsyncIterable<ChatCompletionChunk> {
    const providerOpts = options.providerOptions as AnthropicProviderOptions | undefined;
    const { systemMessage, messages } = this.formatMessages(options.messages);

    // Map common options to Anthropic format
    const requestParams = mapCommonOptionsToAnthropic(options, providerOpts);

    // Add formatted messages and system message
    requestParams.messages = messages as any;
    requestParams.system = systemMessage;

    // Force stream to true
    requestParams.stream = true;

    // Set default model if not provided
    if (!requestParams.model) {
      requestParams.model = "claude-3-sonnet-20240229";
    }

    // Extract custom headers and abort signal
    const customHeaders = requestParams._headers;
    const abortSignal = requestParams._abortSignal;
    delete requestParams._headers;
    delete requestParams._abortSignal;

    const streamResult = await this.client.messages.create(
      requestParams,
      {
        headers: customHeaders as Record<string, string> | undefined,
        signal: abortSignal as AbortSignal | undefined,
      }
    );

    // TypeScript doesn't know this is a Stream when stream:true, but it is at runtime
    const stream = streamResult as unknown as AsyncIterable<any>;

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        yield {
          id: this.generateId(),
          model: options.model || "claude-3-sonnet-20240229",
          content: chunk.delta.text,
          finishReason: null,
        };
      } else if (chunk.type === "message_stop") {
        yield {
          id: this.generateId(),
          model: options.model || "claude-3-sonnet-20240229",
          content: "",
          finishReason: "stop",
        };
      }
    }
  }

  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncIterable<StreamChunk> {
    const providerOpts = options.providerOptions as AnthropicProviderOptions | undefined;
    const { systemMessage, messages } = this.formatMessages(options.messages);

    // Map common options to Anthropic format using the centralized mapping function
    const requestParams = mapCommonOptionsToAnthropic(options, providerOpts);

    // Add formatted messages and system message
    requestParams.messages = messages as any;
    requestParams.system = systemMessage;

    // Force stream to true
    requestParams.stream = true;

    // Set default model if not provided
    if (!requestParams.model) {
      requestParams.model = "claude-3-sonnet-20240229";
    }

    // Extract custom headers and abort signal
    const customHeaders = requestParams._headers;
    const abortSignal = requestParams._abortSignal;
    delete requestParams._headers;
    delete requestParams._abortSignal;

    const stream = (await this.client.messages.create(
      requestParams,
      {
        headers: customHeaders as Record<string, string> | undefined,
        signal: abortSignal as AbortSignal | undefined,
      }
    )) as any;

    let accumulatedContent = "";
    const timestamp = Date.now();
    const toolCallsMap = new Map<
      number,
      { id: string; name: string; input: string }
    >();
    let currentToolIndex = -1;

    try {
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            currentToolIndex++;
            toolCallsMap.set(currentToolIndex, {
              id: event.content_block.id,
              name: event.content_block.name,
              input: "",
            });
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            const delta = event.delta.text;
            accumulatedContent += delta;
            yield {
              type: "content",
              id: this.generateId(),
              model: options.model || "claude-3-sonnet-20240229",
              timestamp,
              delta,
              content: accumulatedContent,
              role: "assistant",
            };
          } else if (event.delta.type === "input_json_delta") {
            // Tool input is being streamed
            const existing = toolCallsMap.get(currentToolIndex);
            if (existing) {
              existing.input += event.delta.partial_json;

              yield {
                type: "tool_call",
                id: this.generateId(),
                model: options.model || "claude-3-sonnet-20240229",
                timestamp,
                toolCall: {
                  id: existing.id,
                  type: "function",
                  function: {
                    name: existing.name,
                    arguments: event.delta.partial_json,
                  },
                },
                index: currentToolIndex,
              };
            }
          }
        } else if (event.type === "message_stop") {
          yield {
            type: "done",
            id: this.generateId(),
            model: options.model || "claude-3-sonnet-20240229",
            timestamp,
            finishReason: "stop",
          };
        } else if (event.type === "message_delta") {
          if (event.delta.stop_reason) {
            yield {
              type: "done",
              id: this.generateId(),
              model: options.model || "claude-3-sonnet-20240229",
              timestamp,
              finishReason:
                event.delta.stop_reason === "tool_use"
                  ? "tool_calls"
                  : (event.delta.stop_reason as any),
              usage: event.usage
                ? {
                  promptTokens: event.usage.input_tokens || 0,
                  completionTokens: event.usage.output_tokens || 0,
                  totalTokens:
                    (event.usage.input_tokens || 0) +
                    (event.usage.output_tokens || 0),
                }
                : undefined,
            };
          }
        }
      }
    } catch (error: any) {
      yield {
        type: "error",
        id: this.generateId(),
        model: options.model || "claude-3-sonnet-20240229",
        timestamp,
        error: {
          message: error.message || "Unknown error occurred",
          code: error.code,
        },
      };
    }
  }

  async generateText(
    options: TextGenerationOptions
  ): Promise<TextGenerationResult> {
    const response = await this.client.messages.create({
      model: options.model || "claude-3-sonnet-20240229",
      messages: [{ role: "user", content: options.prompt }],
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature,
      top_p: options.topP,
      stop_sequences: options.stopSequences,
      stream: false,
    });

    const content = response.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");

    return {
      id: response.id,
      model: response.model,
      text: content,
      finishReason: response.stop_reason as any,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async *generateTextStream(
    options: TextGenerationOptions
  ): AsyncIterable<string> {
    const stream = await this.client.messages.create({
      model: options.model || "claude-3-sonnet-20240229",
      messages: [{ role: "user", content: options.prompt }],
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature,
      top_p: options.topP,
      stop_sequences: options.stopSequences,
      stream: true,
    });

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        yield chunk.delta.text;
      }
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options);

    const response = await this.client.messages.create({
      model: options.model || "claude-3-sonnet-20240229",
      messages: [{ role: "user", content: options.text }],
      system: systemPrompt,
      max_tokens: options.maxLength || 500,
      temperature: 0.3,
      stream: false,
    });

    const content = response.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");

    return {
      id: response.id,
      model: response.model,
      summary: content,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async createEmbeddings(_options: EmbeddingOptions): Promise<EmbeddingResult> {
    // Note: Anthropic doesn't have a native embeddings API
    // You would need to use a different service or implement a workaround
    throw new Error(
      "Embeddings are not natively supported by Anthropic. Consider using OpenAI or another provider for embeddings."
    );
  }

  private formatMessages(messages: Message[]): {
    systemMessage?: string;
    messages: Array<any>;
  } {
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    return {
      systemMessage: systemMessages.map((m) => m.content || "").join("\n"),
      messages: nonSystemMessages.map((m) => {
        // Handle tool result messages
        if (m.role === "tool" && m.toolCallId) {
          return {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: m.toolCallId,
                content: m.content || "",
              },
            ],
          };
        }

        // Handle assistant messages with tool calls
        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
          const content: any[] = [];

          // Add text content if present
          if (m.content) {
            content.push({
              type: "text",
              text: m.content,
            });
          }

          // Add tool use blocks
          for (const toolCall of m.toolCalls) {
            content.push({
              type: "tool_use",
              id: toolCall.id,
              name: toolCall.function.name,
              input: JSON.parse(toolCall.function.arguments),
            });
          }

          return {
            role: "assistant",
            content,
          };
        }

        // Regular messages
        return {
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content || "",
        };
      }),
    };
  }

  private buildSummarizationPrompt(options: SummarizationOptions): string {
    let prompt = "You are a professional summarizer. ";

    switch (options.style) {
      case "bullet-points":
        prompt += "Provide a summary in bullet point format. ";
        break;
      case "paragraph":
        prompt += "Provide a summary in paragraph format. ";
        break;
      case "concise":
        prompt += "Provide a very concise summary in 1-2 sentences. ";
        break;
      default:
        prompt += "Provide a clear and concise summary. ";
    }

    if (options.focus && options.focus.length > 0) {
      prompt += `Focus on the following aspects: ${options.focus.join(", ")}. `;
    }

    if (options.maxLength) {
      prompt += `Keep the summary under ${options.maxLength} tokens. `;
    }

    return prompt;
  }
}

/**
 * Creates an Anthropic adapter with simplified configuration
 * @param apiKey - Your Anthropic API key
 * @returns A fully configured Anthropic adapter instance
 * 
 * @example
 * ```typescript
 * const anthropic = createAnthropic("sk-ant-...");
 * 
 * const ai = new AI({
 *   adapters: {
 *     anthropic,
 *   }
 * });
 * ```
 */
export function createAnthropic(
  apiKey: string,
  config?: Omit<AnthropicConfig, "apiKey">
): Anthropic {
  return new Anthropic({ apiKey, ...config });
}

/**
 * Create an Anthropic adapter with automatic API key detection from environment variables.
 * 
 * Looks for `ANTHROPIC_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 * 
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Anthropic adapter instance
 * @throws Error if ANTHROPIC_API_KEY is not found in environment
 * 
 * @example
 * ```typescript
 * // Automatically uses ANTHROPIC_API_KEY from environment
 * const aiInstance = ai(anthropic());
 * ```
 */
export function anthropic(config?: Omit<AnthropicConfig, "apiKey">): Anthropic {
  const env = typeof globalThis !== "undefined" && (globalThis as any).window?.env
    ? (globalThis as any).window.env
    : typeof process !== "undefined" ? process.env : undefined;
  const key = env?.ANTHROPIC_API_KEY;

  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is required. Please set it in your environment variables or use createAnthropic(apiKey, config) instead."
    );
  }

  return createAnthropic(key, config);
}
