import { GenerateContentParameters, GoogleGenAI } from "@google/genai";
import {
  BaseAdapter,
  type AIAdapterConfig,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type SummarizationOptions,
  type SummarizationResult,
  type EmbeddingOptions,
  type EmbeddingResult,
  type ModelMessage,
  type StreamChunk,
} from "@tanstack/ai";
import {
  GEMINI_MODELS,
  GEMINI_IMAGE_MODELS,
  GEMINI_EMBEDDING_MODELS,
  GEMINI_AUDIO_MODELS,
  GEMINI_VIDEO_MODELS,
} from "./model-meta";
import { ExternalTextProviderOptions, } from "./text/text-provider-options";
import { convertToolsToProviderFormat } from "./tools/tool-converter";

export interface GeminiAdapterConfig extends AIAdapterConfig {
  apiKey: string;
}

export type GeminiModel = (typeof GEMINI_MODELS)[number];
/**
 * Gemini-specific provider options
 * Based on Google Generative AI SDK
 * @see https://ai.google.dev/api/rest/v1/GenerationConfig
 */
export type GeminiProviderOptions = ExternalTextProviderOptions;

export class GeminiAdapter extends BaseAdapter<
  typeof GEMINI_MODELS,
  typeof GEMINI_IMAGE_MODELS,
  readonly string[],
  readonly string[],
  readonly string[],
  GeminiProviderOptions,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>
> {
  name = "gemini";
  models = GEMINI_MODELS;
  imageModels = GEMINI_IMAGE_MODELS;
  embeddingModels = GEMINI_EMBEDDING_MODELS;
  audioModels = GEMINI_AUDIO_MODELS;
  videoModels = GEMINI_VIDEO_MODELS;
  private client: GoogleGenAI;

  constructor(config: GeminiAdapterConfig) {
    super(config);
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
    });
  }

  async chatCompletion(options: ChatCompletionOptions<string, GeminiProviderOptions>): Promise<ChatCompletionResult> {
    const mappedOptions = this.mapCommonOptionsToGemini(options);

    const response = await this.client.models.generateContent(mappedOptions);

    return {
      id: this.generateId(),
      model: options.model,
      content: response.data ?? "",
      role: "assistant",
      finishReason: (response.candidates?.[0]?.finishReason as any) || "stop",
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata?.thoughtsTokenCount ?? 0,
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
      },
    };
  }

  async *chatStream(options: ChatCompletionOptions<string, GeminiProviderOptions>): AsyncIterable<StreamChunk> {
    // Map common options to Gemini format
    const mappedOptions = this.mapCommonOptionsToGemini(options);

    const result = await this.client.models.generateContentStream(mappedOptions);

    yield* this.processStreamChunks(result, options.model);
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const prompt = this.buildSummarizationPrompt(options, options.text);

    const model = (this.client as any).getGenerativeModel({
      model: options.model || "gemini-pro",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: options.maxLength || 500,
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();

    const promptTokens = this.estimateTokens(prompt);
    const completionTokens = this.estimateTokens(summary);

    return {
      id: this.generateId(),
      model: options.model || "gemini-pro",
      summary,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const embeddings: number[][] = [];

    const model = (this.client as any).getGenerativeModel({
      model: options.model || "embedding-001",
    });

    for (const input of inputs) {
      const result = await model.embedContent(input);
      embeddings.push(result.embedding.values);
    }

    const promptTokens = inputs.reduce((sum, input) => sum + this.estimateTokens(input), 0);

    return {
      id: this.generateId(),
      model: options.model || "embedding-001",
      embeddings,
      usage: {
        promptTokens,
        totalTokens: promptTokens,
      },
    };
  }

  private buildSummarizationPrompt(options: SummarizationOptions, text: string): string {
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

    prompt += `\n\nText to summarize:\n${text}\n\nSummary:`;

    return prompt;
  }

  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }


  // TODO the proper type here is AsyncGenerator<GenerateContentResponse, any, any>
  private async *processStreamChunks(result: AsyncIterable<any>, model: string): AsyncIterable<StreamChunk> {
    const timestamp = Date.now();
    let accumulatedContent = "";
    const toolCallMap = new Map<string, { name: string; args: string; index: number }>();
    let nextToolIndex = 0;

    // Iterate over the stream result (it's already an AsyncGenerator)
    for await (const chunk of result) {
      // Check for errors in the chunk
      if (chunk.error) {
        console.log("[GeminiAdapter] Error in chunk:", (chunk).error);
        yield {
          type: "error",
          id: this.generateId(),
          model,
          timestamp,
          error: {
            message: (chunk).error.message || "Unknown error",
            code: (chunk).error.code,
          },
        };
        return;
      }

      // Check if candidates array exists and has entries
      if (!chunk.candidates || chunk.candidates.length === 0) {
        // Skip empty chunks or check for finish reason in other places
        if (chunk.finishReason) {
          const finishReason = (chunk).finishReason as string;
          let mappedFinishReason = finishReason;
          if (finishReason === "UNEXPECTED_TOOL_CALL" || finishReason === "STOP") {
            mappedFinishReason = toolCallMap.size > 0 ? "tool_calls" : "stop";
          }
          yield {
            type: "done",
            id: this.generateId(),
            model,
            timestamp,
            finishReason: mappedFinishReason as any,
            usage: chunk.usageMetadata
              ? {
                promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                completionTokens: chunk.usageMetadata.thoughtsTokenCount ?? 0,
                totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
              }
              : undefined,
          };
        }
        continue;
      }
      // Extract content from candidates[0].content.parts
      // Parts can contain text or functionCall
      if (chunk.candidates?.[0]?.content?.parts) {
        const parts = chunk.candidates[0].content.parts;

        for (const part of parts) {
          // Handle text content
          if (part.text) {
            accumulatedContent += part.text;
            yield {
              type: "content",
              id: this.generateId(),
              model,
              timestamp,
              delta: part.text,
              content: accumulatedContent,
              role: "assistant",
            };
          }

          // Handle function calls (tool calls)
          // Check both camelCase (SDK) and snake_case (direct API) formats
          const functionCall = part.functionCall || part.function_call;
          if (functionCall) {
            const toolCallId = functionCall.name || `call_${Date.now()}_${nextToolIndex}`;
            const functionArgs = functionCall.args || functionCall.arguments || {};

            // Check if we've seen this tool call before (for streaming args)
            let toolCallData = toolCallMap.get(toolCallId);
            if (!toolCallData) {
              toolCallData = {
                name: functionCall.name || "",
                args: typeof functionArgs === "string" ? functionArgs : JSON.stringify(functionArgs || {}),
                index: nextToolIndex++,
              };
              toolCallMap.set(toolCallId, toolCallData);
            } else {
              // Merge arguments if streaming
              if (functionArgs) {
                try {
                  const existingArgs = JSON.parse(toolCallData.args);
                  const newArgs = typeof functionArgs === "string" ? JSON.parse(functionArgs) : functionArgs;
                  const mergedArgs = { ...existingArgs, ...newArgs };
                  toolCallData.args = JSON.stringify(mergedArgs);
                } catch {
                  // If parsing fails, use new args
                  toolCallData.args = typeof functionArgs === "string" ? functionArgs : JSON.stringify(functionArgs);
                }
              }
            }

            yield {
              type: "tool_call",
              id: this.generateId(),
              model,
              timestamp,
              toolCall: {
                id: toolCallId,
                type: "function",
                function: {
                  name: toolCallData.name,
                  arguments: toolCallData.args,
                },
              },
              index: toolCallData.index,
            };
          }
        }
      } else if (chunk.data) {
        // Fallback to chunk.data if available
        accumulatedContent += chunk.data;
        yield {
          type: "content",
          id: this.generateId(),
          model,
          timestamp,
          delta: chunk.data,
          content: accumulatedContent,
          role: "assistant",
        };
      }

      // Check for finish reason
      if (chunk.candidates?.[0]?.finishReason) {
        const finishReason = chunk.candidates[0].finishReason as string;

        // UNEXPECTED_TOOL_CALL means Gemini tried to call a function but it wasn't properly declared
        // This typically means there's an issue with the tool declaration format
        // We should map it to tool_calls to try to process it anyway
        let mappedFinishReason = finishReason;
        if (finishReason === "UNEXPECTED_TOOL_CALL") {
          // Try to extract function call from content.parts if available
          if (chunk.candidates[0].content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              const functionCall = (part).functionCall || (part).function_call;
              if (functionCall) {
                // We found a function call - process it
                const toolCallId = functionCall.name || `call_${Date.now()}_${nextToolIndex}`;
                const functionArgs = functionCall.args || functionCall.arguments || {};

                toolCallMap.set(toolCallId, {
                  name: functionCall.name || "",
                  args: typeof functionArgs === "string" ? functionArgs : JSON.stringify(functionArgs || {}),
                  index: nextToolIndex++,
                });

                yield {
                  type: "tool_call",
                  id: this.generateId(),
                  model,
                  timestamp,
                  toolCall: {
                    id: toolCallId,
                    type: "function",
                    function: {
                      name: functionCall.name || "",
                      arguments: typeof functionArgs === "string" ? functionArgs : JSON.stringify(functionArgs || {}),
                    },
                  },
                  index: nextToolIndex - 1,
                };
              }
            }
          }
          mappedFinishReason = toolCallMap.size > 0 ? "tool_calls" : "stop";
        } else if (finishReason === "STOP") {
          mappedFinishReason = toolCallMap.size > 0 ? "tool_calls" : "stop";
        }

        yield {
          type: "done",
          id: this.generateId(),
          model,
          timestamp,
          finishReason: mappedFinishReason as any,
          usage: chunk.usageMetadata
            ? {
              promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
              completionTokens: chunk.usageMetadata.thoughtsTokenCount ?? 0,
              totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
            }
            : undefined,
        };
      }
    }
  }

  private formatMessages(messages: ModelMessage[]): Array<{
    role: "user" | "model";
    parts: Array<{
      text?: string;
      functionCall?: { name: string; args: Record<string, any> };
      functionResponse?: { name: string; response: Record<string, any> };
    }>;
  }> {
    return messages
      .filter((m) => m.role !== "system") // Skip system messages
      .map((msg) => {
        const role: "user" | "model" = msg.role === "assistant" ? "model" : "user";
        const parts: Array<{
          text?: string;
          functionCall?: { name: string; args: Record<string, any> };
          functionResponse?: { name: string; response: Record<string, any> };
        }> = [];

        // Add text content if present
        if (msg.content) {
          parts.push({ text: msg.content });
        }

        // Handle tool calls (from assistant)
        if (msg.role === "assistant" && msg.toolCalls?.length) {
          for (const toolCall of msg.toolCalls) {
            let parsedArgs: Record<string, any> = {};
            try {
              parsedArgs = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
            } catch {
              parsedArgs = toolCall.function.arguments as any;
            }

            parts.push({
              functionCall: {
                name: toolCall.function.name,
                args: parsedArgs,
              },
            });
          }
        }

        // Handle tool results (from tool role)
        if (msg.role === "tool" && msg.toolCallId) {
          parts.push({
            functionResponse: {
              name: msg.toolCallId, // Gemini uses function name here
              response: {
                content: msg.content || "",
              },
            },
          });
        }

        return {
          role,
          parts: parts.length > 0 ? parts : [{ text: "" }],
        };
      });
  }

  /**
   * Maps common options to Gemini-specific format
   * Handles translation of normalized options to Gemini's API format
   */
  /**
   * Maps common options to Gemini-specific format
   * Handles translation of normalized options to Gemini's API format
   */
  private mapCommonOptionsToGemini(options: ChatCompletionOptions<string, GeminiProviderOptions>) {
    const providerOpts = options.providerOptions;
    const requestOptions: GenerateContentParameters = {
      model: options.model,
      contents: this.formatMessages(options.messages),
      config: {
        ...providerOpts,
        temperature: options.options?.temperature,
        topP: options.options?.topP,
        maxOutputTokens: options.options?.maxTokens,
        systemInstruction: options.systemPrompts?.join("\n"),
        ...providerOpts?.generationConfig,
        tools: convertToolsToProviderFormat(options.tools),
      },
    };


    return requestOptions;
  }
}

/**
 * Creates a Gemini adapter with simplified configuration
 * @param apiKey - Your Google API key
 * @returns A fully configured Gemini adapter instance
 *
 * @example
 * ```typescript
 * const gemini = createGemini("AIza...");
 *
 * const ai = new AI({
 *   adapters: {
 *     gemini,
 *   }
 * });
 * ```
 */
export function createGemini(apiKey: string, config?: Omit<GeminiAdapterConfig, "apiKey">): GeminiAdapter {
  return new GeminiAdapter({ apiKey, ...config });
}

/**
 * Create a Gemini adapter with automatic API key detection from environment variables.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini adapter instance
 * @throws Error if API key is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GOOGLE_API_KEY or GEMINI_API_KEY from environment
 * const aiInstance = ai(gemini());
 * ```
 */
export function gemini(config?: Omit<GeminiAdapterConfig, "apiKey">): GeminiAdapter {
  const env =
    typeof globalThis !== "undefined" && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== "undefined"
        ? process.env
        : undefined;
  const key = env?.GOOGLE_API_KEY || env?.GEMINI_API_KEY;

  if (!key) {
    throw new Error(
      "GOOGLE_API_KEY or GEMINI_API_KEY is required. Please set it in your environment variables or use createGemini(apiKey, config) instead."
    );
  }

  return createGemini(key, config);
}
