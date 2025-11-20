import Anthropic_SDK from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import {
  BaseAdapter,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type SummarizationOptions,
  type SummarizationResult,
  type EmbeddingOptions,
  type EmbeddingResult,
  type ModelMessage,
  type StreamChunk,
} from "@tanstack/ai";
import { ANTHROPIC_AUDIO_MODELS, ANTHROPIC_EMBEDDING_MODELS, ANTHROPIC_IMAGE_MODELS, ANTHROPIC_MODELS, ANTHROPIC_VIDEO_MODELS } from "./model-meta";
import { convertToolsToProviderFormat } from "./tools/tool-converter";
import { TextProviderOptions } from "./text/text-provider-options";

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

type AnthropicContentBlocks = Extract<MessageParam["content"], Array<unknown>> extends Array<infer Block>
  ? Block[]
  : never;
type AnthropicContentBlock = AnthropicContentBlocks extends Array<infer Block>
  ? Block
  : never;

export class Anthropic extends BaseAdapter<
  typeof ANTHROPIC_MODELS,
  typeof ANTHROPIC_IMAGE_MODELS,
  typeof ANTHROPIC_EMBEDDING_MODELS,
  typeof ANTHROPIC_AUDIO_MODELS,
  typeof ANTHROPIC_VIDEO_MODELS,
  TextProviderOptions,
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


    // Map common options to Anthropic format using the centralized mapping function
    const requestParams = this.mapCommonOptionsToAnthropic(options);


    const response = await this.client.beta.messages.create(
      {
        ...requestParams,

        stream: false,
      }, {
      signal: options.request?.signal,
      headers: options.request?.headers,
    }
    );

    return this.extractChatCompletionResult(response);
  }

  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncIterable<StreamChunk> {
    // Map common options to Anthropic format using the centralized mapping function
    const requestParams = this.mapCommonOptionsToAnthropic(options);

    const stream = await this.client.beta.messages.create(
      { ...requestParams, stream: true }, {
      signal: options.request?.signal,
      headers: options.request?.headers,
    }
    );

    yield* this.processAnthropicStream(stream, options.model, () => this.generateId());
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

  /**
   * Maps common options to Anthropic-specific format
   * Handles translation of normalized options to Anthropic's API format
   */
  private mapCommonOptionsToAnthropic(
    options: ChatCompletionOptions,
  ) {
    const providerOptions = options.providerOptions as TextProviderOptions | undefined;
    const requestParams: TextProviderOptions = {
      model: options.model,
      max_tokens: options.options?.maxTokens || 1024,
      temperature: options.options?.temperature,
      top_p: options.options?.topP,
      messages: this.formatMessages(options.messages),
      tools: options.tools ? convertToolsToProviderFormat(options.tools) : undefined,
      ...providerOptions
    };
    return requestParams
  }

  private formatMessages(messages: ModelMessage[]): TextProviderOptions["messages"] {
    const formattedMessages: TextProviderOptions["messages"] = [];

    for (const message of messages) {
      const role = message.role ?? "user";

      if (role === "system") {
        continue;
      }

      if (role === "tool" && message.toolCallId) {
        formattedMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: message.toolCallId,
              content: message.content ?? "",
            },
          ],
        });
        continue;
      }

      if (role === "assistant" && message.toolCalls?.length) {
        const contentBlocks: AnthropicContentBlocks = [];

        if (message.content) {
          const textBlock: AnthropicContentBlock = {
            type: "text",
            text: message.content,
          };
          contentBlocks.push(textBlock);
        }

        for (const toolCall of message.toolCalls) {
          let parsedInput: unknown = {};
          try {
            parsedInput = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
          } catch {
            parsedInput = toolCall.function.arguments;
          }

          const toolUseBlock: AnthropicContentBlock = {
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.function.name,
            input: parsedInput,
          };
          contentBlocks.push(toolUseBlock);
        }

        formattedMessages.push({
          role: "assistant",
          content: contentBlocks,
        });

        continue;
      }

      formattedMessages.push({
        role: role === "assistant" ? "assistant" : "user",
        content: message.content ?? "",
      });
    }

    return formattedMessages;
  }

  private extractChatCompletionResult(response: Anthropic_SDK.Beta.BetaMessage): Omit<ChatCompletionResult, "data"> {
    // Extract text content
    const textContent = response.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    // Extract tool calls
    const toolCalls = response.content
      .filter((c) => c.type === "tool_use")
      .map((c) => ({
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
      // todo fix me
      finishReason: response.stop_reason as any,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  private async *processAnthropicStream(
    stream: AsyncIterable<Anthropic_SDK.Beta.BetaRawMessageStreamEvent>,
    model: string,
    generateId: () => string
  ): AsyncIterable<StreamChunk> {
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
              id: generateId(),
              model: model || "claude-3-sonnet-20240229",
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
                id: generateId(),
                model: model || "claude-3-sonnet-20240229",
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
            id: generateId(),
            model: model || "claude-3-sonnet-20240229",
            timestamp,
            finishReason: "stop",
          };
        } else if (event.type === "message_delta") {
          if (event.delta.stop_reason) {
            yield {
              type: "done",
              id: generateId(),
              model: model || "claude-3-sonnet-20240229",
              timestamp,
              finishReason:
                event.delta.stop_reason === "tool_use"
                  ? "tool_calls"
                  : (event.delta.stop_reason as any),
              // TODO Fix usage
              usage: event.usage
                ? {
                  promptTokens: 0,
                  completionTokens: event.usage.output_tokens || 0,
                  totalTokens:
                    (0) +
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
        id: generateId(),
        model: model,
        timestamp,
        error: {
          message: error.message || "Unknown error occurred",
          code: error.code,
        },
      };
    }
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
