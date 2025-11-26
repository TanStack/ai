import Anthropic_SDK from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import {
  BaseAdapter,
  type ChatStreamOptionsUnion,
  type SummarizationOptions,
  type SummarizationResult,
  type EmbeddingOptions,
  type EmbeddingResult,
  type ModelMessage,
  type StreamChunk,
} from "@tanstack/ai";
import {
  ANTHROPIC_EMBEDDING_MODELS,
  ANTHROPIC_MODELS,
  type AnthropicChatModelProviderOptionsByName,
} from "./model-meta";
import { convertToolsToProviderFormat } from "./tools/tool-converter";
import {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from "./text/text-provider-options";

export interface AnthropicConfig {
  apiKey: string;
}

/**
 * Anthropic-specific provider options
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
 */
export type AnthropicProviderOptions = ExternalTextProviderOptions;

type AnthropicContentBlocks = Extract<
  MessageParam["content"],
  Array<unknown>
> extends Array<infer Block>
  ? Block[]
  : never;
type AnthropicContentBlock = AnthropicContentBlocks extends Array<infer Block>
  ? Block
  : never;


type AnthropicChatOptions = ChatStreamOptionsUnion<BaseAdapter<
  typeof ANTHROPIC_MODELS,
  typeof ANTHROPIC_EMBEDDING_MODELS,
  AnthropicProviderOptions,
  Record<string, any>,
  AnthropicChatModelProviderOptionsByName
>>

export class Anthropic extends BaseAdapter<
  typeof ANTHROPIC_MODELS,
  typeof ANTHROPIC_EMBEDDING_MODELS,
  AnthropicProviderOptions,
  Record<string, any>,
  AnthropicChatModelProviderOptionsByName
> {
  name = "anthropic" as const;
  models = ANTHROPIC_MODELS;
  embeddingModels = ANTHROPIC_EMBEDDING_MODELS;
  declare _modelProviderOptionsByName: AnthropicChatModelProviderOptionsByName;

  private client: Anthropic_SDK;

  constructor(config: AnthropicConfig) {
    super({});
    this.client = new Anthropic_SDK({
      apiKey: config.apiKey,
    });
  }

  async *chatStream(
    options: AnthropicChatOptions
  ): AsyncIterable<StreamChunk> {
    try {

      // Map common options to Anthropic format using the centralized mapping function
      const requestParams = this.mapCommonOptionsToAnthropic(options);

      const stream = await this.client.beta.messages.create(
        { ...requestParams, stream: true },
        {
          signal: options.request?.signal,
          headers: options.request?.headers,
        }
      );

      yield* this.processAnthropicStream(stream, options.model, () =>
        this.generateId()
      );
    } catch (error: any) {
      console.error("[Anthropic Adapter] Error in chatStream:", {
        message: error?.message,
        status: error?.status,
        statusText: error?.statusText,
        code: error?.code,
        type: error?.type,
        error: error,
        stack: error?.stack,
      });

      // Emit an error chunk
      yield {
        type: "error",
        id: this.generateId(),
        model: options.model || "claude-3-sonnet-20240229",
        timestamp: Date.now(),
        error: {
          message: error?.message || "Unknown error occurred",
          code: error?.code || error?.status,
        },
      };
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options);

    const response = await this.client.messages.create({
      model: options.model,
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
  private mapCommonOptionsToAnthropic(options: AnthropicChatOptions) {
    const providerOptions = options.providerOptions as
      | InternalTextProviderOptions
      | undefined;

    const formattedMessages = this.formatMessages(options.messages);
    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined;

    // Filter out invalid fields from providerOptions (like 'store' which is OpenAI-specific)
    const validProviderOptions: Partial<InternalTextProviderOptions> = {};
    if (providerOptions) {
      const validKeys: (keyof InternalTextProviderOptions)[] = [
        "container",
        "context_management",
        "mcp_servers",
        "service_tier",
        "stop_sequences",
        "system",
        "thinking",
        "tool_choice",
        "top_k",
      ];
      for (const key of validKeys) {
        if (key in providerOptions) {
          const value = (providerOptions)[key];
          // Anthropic expects tool_choice to be an object, not a string
          if (key === "tool_choice" && typeof value === "string") {
            (validProviderOptions as any)[key] = { type: value };
          } else {
            (validProviderOptions as any)[key] = value;
          }
        }
      }
    }

    // Ensure max_tokens is greater than thinking.budget_tokens if thinking is enabled
    const thinkingBudget = validProviderOptions.thinking?.type === "enabled" ? validProviderOptions.thinking?.budget_tokens : undefined;
    const defaultMaxTokens = options.options?.maxTokens || 1024;
    const maxTokens =
      thinkingBudget && thinkingBudget >= defaultMaxTokens
        ? thinkingBudget + 1 // Ensure max_tokens is greater than budget_tokens
        : defaultMaxTokens;

    const requestParams: InternalTextProviderOptions = {
      model: options.model,
      max_tokens: maxTokens,
      temperature: options.options?.temperature,
      top_p: options.options?.topP,
      messages: formattedMessages,
      tools: tools,
      ...validProviderOptions,
    };
    return requestParams;
  }

  private formatMessages(
    messages: ModelMessage[]
  ): InternalTextProviderOptions["messages"] {
    const formattedMessages: InternalTextProviderOptions["messages"] = [];

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
            parsedInput = toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {};
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

  private async *processAnthropicStream(
    stream: AsyncIterable<Anthropic_SDK.Beta.BetaRawMessageStreamEvent>,
    model: string,
    generateId: () => string
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = "";
    let accumulatedThinking = "";
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
          } else if (event.content_block.type === "thinking") {
            // Reset thinking content when a new thinking block starts
            accumulatedThinking = "";
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            const delta = event.delta.text;
            accumulatedContent += delta;
            yield {
              type: "content",
              id: generateId(),
              model: model,
              timestamp,
              delta,
              content: accumulatedContent,
              role: "assistant",
            };
          } else if (event.delta.type === "thinking_delta") {
            // Handle thinking content 
            const delta = event.delta.thinking ?? "";
            accumulatedThinking += delta;
            yield {
              type: "thinking",
              id: generateId(),
              model: model,
              timestamp,
              delta,
              content: accumulatedThinking,
            };
          } else if (event.delta.type === "input_json_delta") {
            // Tool input is being streamed
            const existing = toolCallsMap.get(currentToolIndex);
            if (existing) {
              existing.input += event.delta.partial_json;

              yield {
                type: "tool_call",
                id: generateId(),
                model: model,
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
            model: model,
            timestamp,
            finishReason: "stop",
          };
        } else if (event.type === "message_delta") {
          if (event.delta.stop_reason) {
            yield {
              type: "done",
              id: generateId(),
              model: model,
              timestamp,
              finishReason:
                event.delta.stop_reason === "tool_use"
                  ? "tool_calls"
                  // TODO Fix the any and map the responses properly
                  : (event.delta.stop_reason as any),

              usage: event.usage
                ? {
                  promptTokens: event.usage.input_tokens || 0,
                  completionTokens: event.usage.output_tokens || 0,
                  totalTokens: (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0),
                }
                : undefined,
            };
          }
        }
      }
    } catch (error: any) {
      console.error("[Anthropic Adapter] Error in processAnthropicStream:", {
        message: error?.message,
        status: error?.status,
        statusText: error?.statusText,
        code: error?.code,
        type: error?.type,
        error: error,
        stack: error?.stack,
      });

      yield {
        type: "error",
        id: generateId(),
        model: model,
        timestamp,
        error: {
          message: error?.message || "Unknown error occurred",
          code: error?.code || error?.status,
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
  const env =
    typeof globalThis !== "undefined" && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== "undefined"
        ? process.env
        : undefined;
  const key = env?.ANTHROPIC_API_KEY;

  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is required. Please set it in your environment variables or use createAnthropic(apiKey, config) instead."
    );
  }

  return createAnthropic(key, config);
}
