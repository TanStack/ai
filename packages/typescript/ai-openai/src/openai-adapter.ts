import OpenAI_SDK from "openai";
import {
  BaseAdapter,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type SummarizationOptions,
  type SummarizationResult,
  type EmbeddingOptions,
  type EmbeddingResult,
  StreamChunk,
} from "@tanstack/ai";
import {
  OPENAI_CHAT_MODELS,
  OPENAI_EMBEDDING_MODELS,
  type OpenAIChatModelProviderOptionsByName,
} from "./model-meta";
import {
  convertMessagesToInput,
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from "./text/text-provider-options";
import { convertToolsToProviderFormat } from "./tools";

export interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  baseURL?: string;
}

/**
 * Alias for TextProviderOptions
 */
export type OpenAIProviderOptions = ExternalTextProviderOptions;

/**
 * OpenAI-specific provider options for image generation
 * Based on OpenAI Images API documentation
 * @see https://platform.openai.com/docs/api-reference/images/create
 */
export interface OpenAIImageProviderOptions {
  /** Image quality: 'standard' | 'hd' (dall-e-3, gpt-image-1 only) */
  quality?: "standard" | "hd";
  /** Image style: 'natural' | 'vivid' (dall-e-3 only) */
  style?: "natural" | "vivid";
  /** Background: 'transparent' | 'opaque' (gpt-image-1 only) */
  background?: "transparent" | "opaque";
  /** Output format: 'png' | 'webp' | 'jpeg' (gpt-image-1 only) */
  outputFormat?: "png" | "webp" | "jpeg";
}

/**
 * OpenAI-specific provider options for embeddings
 * Based on OpenAI Embeddings API documentation
 * @see https://platform.openai.com/docs/api-reference/embeddings/create
 */
export interface OpenAIEmbeddingProviderOptions {
  /** Encoding format for embeddings: 'float' | 'base64' */
  encodingFormat?: "float" | "base64";
  /** Unique identifier for end-user (for abuse monitoring) */
  user?: string;
}

/**
 * OpenAI-specific provider options for audio transcription
 * Based on OpenAI Audio API documentation
 * @see https://platform.openai.com/docs/api-reference/audio/createTranscription
 */
export interface OpenAIAudioTranscriptionProviderOptions {
  /** Timestamp granularities: 'word' | 'segment' (whisper-1 only) */
  timestampGranularities?: Array<"word" | "segment">;
  /** Chunking strategy for long audio (gpt-4o-transcribe-diarize): 'auto' or VAD config */
  chunkingStrategy?:
    | "auto"
    | {
        type: "vad";
        threshold?: number;
        prefix_padding_ms?: number;
        silence_duration_ms?: number;
      };
  /** Known speaker names for diarization (gpt-4o-transcribe-diarize) */
  knownSpeakerNames?: string[];
  /** Known speaker reference audio as data URLs (gpt-4o-transcribe-diarize) */
  knownSpeakerReferences?: string[];
  /** Whether to enable streaming (gpt-4o-transcribe, gpt-4o-mini-transcribe only) */
  stream?: boolean;
  /** Include log probabilities (gpt-4o-transcribe, gpt-4o-mini-transcribe only) */
  logprobs?: boolean;
}

/**
 * OpenAI-specific provider options for text-to-speech
 * Based on OpenAI Audio API documentation
 * @see https://platform.openai.com/docs/api-reference/audio/createSpeech
 */
export interface OpenAITextToSpeechProviderOptions {
  // Currently no OpenAI-specific text-to-speech options beyond the common SDK surface.
}

/**
 * Combined audio provider options (transcription + text-to-speech)
 */
export type OpenAIAudioProviderOptions =
  OpenAIAudioTranscriptionProviderOptions & OpenAITextToSpeechProviderOptions;

/**
 * OpenAI-specific provider options for video generation
 * Based on OpenAI Video API documentation
 * @see https://platform.openai.com/docs/guides/video-generation
 */
export interface OpenAIVideoProviderOptions {
  /** Input reference image (File, Blob, or Buffer) for first frame */
  inputReference?: File | Blob | Buffer;
  /** Remix video ID to modify an existing video */
  remixVideoId?: string;
}

export class OpenAI extends BaseAdapter<
  typeof OPENAI_CHAT_MODELS,
  typeof OPENAI_EMBEDDING_MODELS,
  OpenAIProviderOptions,
  OpenAIEmbeddingProviderOptions,
  OpenAIChatModelProviderOptionsByName
> {
  name = "openai" as const;
  models = OPENAI_CHAT_MODELS;
  embeddingModels = OPENAI_EMBEDDING_MODELS;

  private client: OpenAI_SDK;

  // Type-only map used by core AI to infer per-model provider options.
  // This is never set at runtime; it exists purely for TypeScript.
  // Using definite assignment assertion (!) since this is type-only.
  // @ts-ignore - We never assign this at runtime and it's only used for types
  _modelProviderOptionsByName: OpenAIChatModelProviderOptionsByName;

  constructor(config: OpenAIConfig) {
    super({});
    this.client = new OpenAI_SDK({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
    });
  }

  async *chatStream(
    options: ChatCompletionOptions<string, OpenAIProviderOptions>
  ): AsyncIterable<StreamChunk> {
    // Track tool call metadata by unique ID
    // OpenAI streams tool calls with deltas - first chunk has ID/name, subsequent chunks only have args
    // We assign our own indices as we encounter unique tool call IDs
    const toolCallMetadata = new Map<string, { index: number; name: string }>();

    // Map common options to OpenAI format using the centralized mapping function
    const requestParams = this.mapChatOptionsToOpenAI(options);

    const response = await this.client.responses.create(
      {
        stream: true,
        ...requestParams,
      },
      {
        headers: options.request?.headers,
        signal: options.request?.signal,
      }
    );

    // The Responses API returns a stream that needs to be parsed
    // response.toReadableStream() returns raw bytes with JSON lines
    const rawStream = response.toReadableStream();

    // Parse the Responses API stream (JSON lines format)
    const parsedStream = this.parseResponsesStream(rawStream);

    yield* this.processOpenAIStreamChunks(
      parsedStream,
      toolCallMetadata,
      options,
      () => this.generateId()
    );
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options);

    const response = await this.client.chat.completions.create({
      model: options.model || "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: options.text },
      ],
      max_tokens: options.maxLength,
      temperature: 0.3,
      stream: false,
    });

    return {
      id: response.id,
      model: response.model,
      summary: response.choices[0].message.content || "",
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: options.model || "text-embedding-ada-002",
      input: options.input,
      dimensions: options.dimensions,
    });

    return {
      id: this.generateId(),
      model: response.model,
      embeddings: response.data.map((d) => d.embedding),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
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

  private mapOpenAIResponseToChatResult(
    response: OpenAI_SDK.Responses.Response
  ): ChatCompletionResult {
    // response.output is an array of output items
    const outputItems = response.output;

    // Find the message output item
    const messageItem = outputItems.find((item) => item.type === "message");
    const content =
      messageItem?.content?.[0].type === "output_text"
        ? messageItem?.content?.[0]?.text || ""
        : "";

    // Find function call items
    const functionCalls = outputItems.filter(
      (item) => item.type === "function_call"
    );
    const toolCalls =
      functionCalls.length > 0
        ? functionCalls.map((fc) => ({
            id: fc.call_id,
            type: "function" as const,
            function: {
              name: fc.name,
              arguments: JSON.stringify(fc.arguments),
            },
          }))
        : undefined;

    return {
      id: response.id,
      model: response.model,
      content,
      role: "assistant",
      finishReason: messageItem?.status,
      toolCalls,
      usage: {
        promptTokens: response.usage?.input_tokens || 0,
        completionTokens: response.usage?.output_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  /**
   * Parse Responses API stream - it's JSON lines (not SSE format)
   * Each line is a complete JSON object
   */
  private async *parseResponsesStream(
    stream: ReadableStream<Uint8Array>
  ): AsyncIterable<any> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let parsedCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (newline-separated JSON objects)
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed);
            parsedCount++;
            yield parsed;
          } catch (e) {
            // Skip malformed JSON lines
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim());
          parsedCount++;
          yield parsed;
        } catch (e) {
          // Ignore parse errors for final buffer
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // TODO proper type is AsyncIterable<OpenAI_SDK.Responses.ResponseStreamEvent>
  private async *processOpenAIStreamChunks(
    stream: AsyncIterable<any>,
    toolCallMetadata: Map<string, { index: number; name: string }>,
    options: ChatCompletionOptions,
    generateId: () => string
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = "";
    const timestamp = Date.now();
    let nextIndex = 0;
    let chunkCount = 0;

    // Preserve response metadata across events
    let responseId: string | null = null;
    let model: string | null = null;
    let doneChunkEmitted = false;

    try {
      for await (const chunk of stream) {
        chunkCount++;

        // Responses API uses event-based streaming with types like:
        // - response.created
        // - response.in_progress
        // - response.output_item.added
        // - response.output_text.delta
        // - response.done

        let delta: any = null;
        let finishReason: string | null = null;

        // Handle Responses API event format
        if (chunk.type) {
          const eventType = chunk.type;

          // Extract and preserve response metadata from response.created or response.in_progress
          if (chunk.response) {
            responseId = chunk.response.id;
            model = chunk.response.model;
          }

          // Handle output text deltas (content streaming)
          // For response.output_text.delta, chunk.delta is an array of characters/strings
          if (eventType === "response.output_text.delta" && chunk.delta) {
            // Delta is an array of characters/strings - join them together
            if (Array.isArray(chunk.delta)) {
              const textDelta = chunk.delta.join("");
              if (textDelta) {
                delta = { content: textDelta };
              }
            } else if (typeof chunk.delta === "string") {
              // Fallback: if it's already a string
              delta = { content: chunk.delta };
            }
          }

          // Handle output item added (new items like function calls or complete messages)
          if (eventType === "response.output_item.added" && chunk.item) {
            const item = chunk.item;
            if (item.type === "function_call") {
              delta = delta || {};
              delta.tool_calls = [
                {
                  id: item.call_id,
                  function: {
                    name: item.name,
                    arguments: JSON.stringify(item.arguments || {}),
                  },
                },
              ];
            } else if (item.type === "message") {
              // Extract content from message item
              if (item.content && Array.isArray(item.content)) {
                const textContent = item.content.find(
                  (c: any) => c.type === "output_text"
                );
                if (textContent?.text) {
                  // For message items added, the text might be incremental or complete
                  // We'll treat it as a delta and accumulate
                  const newContent = textContent.text;
                  // If the new content is longer than accumulated, it's likely the full content
                  // Otherwise, it's a delta
                  if (
                    newContent.length > accumulatedContent.length ||
                    !accumulatedContent
                  ) {
                    delta = { content: newContent };
                  } else {
                    // It's a delta - extract just the new part
                    const deltaText = newContent.slice(
                      accumulatedContent.length
                    );
                    if (deltaText) {
                      delta = { content: deltaText };
                    }
                  }
                }
              }
              // Only set finish reason if status indicates completion (not "in_progress")
              if (item.status && item.status !== "in_progress") {
                finishReason = item.status;
              }
            }
          }

          // Handle response done
          if (eventType === "response.done") {
            // If we have tool calls, the finish reason should be "tool_calls"
            // Otherwise, it's a normal completion with "stop"
            finishReason = toolCallMetadata.size > 0 ? "tool_calls" : "stop";
          }
        } else if (chunk.output && Array.isArray(chunk.output)) {
          // Legacy Responses API format with output array
          const messageItem = chunk.output.find(
            (item: any) => item.type === "message"
          );
          const functionCallItems = chunk.output.filter(
            (item: any) => item.type === "function_call"
          );

          if (messageItem?.content) {
            const textContent = messageItem.content.find(
              (c: any) => c.type === "output_text"
            );
            if (textContent?.text) {
              delta = { content: textContent.text };
            }
          }

          if (functionCallItems.length > 0) {
            delta = delta || {};
            delta.tool_calls = functionCallItems.map((fc: any) => ({
              id: fc.call_id,
              function: {
                name: fc.name,
                arguments: JSON.stringify(fc.arguments || {}),
              },
            }));
          }

          if (messageItem?.status) {
            // If we have tool calls, the finish reason should be "tool_calls"
            // Otherwise, use the status from the message item
            if (toolCallMetadata.size > 0) {
              finishReason = "tool_calls";
            } else {
              finishReason = messageItem.status;
            }
          }
        } else if (chunk.choices) {
          // Chat Completions format (legacy)
          delta = chunk.choices?.[0]?.delta;
          finishReason = chunk.choices?.[0]?.finish_reason;
        }

        // Handle content delta
        if (delta?.content) {
          accumulatedContent += delta.content;
          yield {
            type: "content" as const,
            id: responseId || chunk.id || generateId(),
            model: model || chunk.model || options.model || "gpt-4o",
            timestamp,
            delta: delta.content,
            content: accumulatedContent,
            role: "assistant" as const,
          };
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            // For Responses API, tool calls come as complete items, not deltas
            // For Chat Completions, they come as deltas that need tracking
            let toolCallId: string;
            let toolCallName: string;
            let toolCallArgs: string;
            let actualIndex: number;

            if (toolCall.id) {
              // Complete tool call (Responses API format) or first delta (Chat Completions)
              toolCallId = toolCall.id;
              toolCallName = toolCall.function?.name || "";
              toolCallArgs =
                typeof toolCall.function?.arguments === "string"
                  ? toolCall.function.arguments
                  : JSON.stringify(toolCall.function?.arguments || {});

              // Track for index assignment
              if (!toolCallMetadata.has(toolCallId)) {
                toolCallMetadata.set(toolCallId, {
                  index: nextIndex++,
                  name: toolCallName,
                });
              }
              const meta = toolCallMetadata.get(toolCallId)!;
              actualIndex = meta.index;
            } else {
              // Delta chunk (Chat Completions format) - find by index
              const openAIIndex =
                typeof toolCall.index === "number" ? toolCall.index : 0;
              const entry = Array.from(toolCallMetadata.entries())[openAIIndex];
              if (entry) {
                const [id, meta] = entry;
                toolCallId = id;
                toolCallName = meta.name;
                actualIndex = meta.index;
                toolCallArgs = toolCall.function?.arguments || "";
              } else {
                // Fallback
                toolCallId = `call_${Date.now()}`;
                toolCallName = "";
                actualIndex = openAIIndex;
                toolCallArgs = "";
              }
            }

            yield {
              type: "tool_call",
              id: responseId || chunk.id || generateId(),
              model: model || chunk.model || options.model || "gpt-4o",
              timestamp,
              toolCall: {
                id: toolCallId,
                type: "function",
                function: {
                  name: toolCallName,
                  arguments: toolCallArgs,
                },
              },
              index: actualIndex,
            };
          }
        }

        // Handle completion - only yield "done" for actual completion statuses
        if (finishReason && finishReason !== "in_progress") {
          // Get usage from chunk.response.usage (Responses API) or chunk.usage (Chat Completions)
          const usage = chunk.response?.usage || chunk.usage;

          yield {
            type: "done" as const,
            id: responseId || chunk.id || generateId(),
            model: model || chunk.model || options.model || "gpt-4o",
            timestamp,
            finishReason: finishReason as any,
            usage: usage
              ? {
                  promptTokens: usage.input_tokens || usage.prompt_tokens || 0,
                  completionTokens:
                    usage.output_tokens || usage.completion_tokens || 0,
                  totalTokens: usage.total_tokens || 0,
                }
              : undefined,
          };
          doneChunkEmitted = true;
        }
      }

      // After stream ends, if we have tool calls but no done chunk was emitted,
      // emit a done chunk with tool_calls finish reason
      if (toolCallMetadata.size > 0 && !doneChunkEmitted) {
        yield {
          type: "done" as const,
          id: responseId || generateId(),
          model: model || options.model || "gpt-4o",
          timestamp,
          finishReason: "tool_calls" as any,
          usage: undefined,
        };
      }
    } catch (error: any) {
      yield {
        type: "error",
        id: generateId(),
        model: options.model || "gpt-3.5-turbo",
        timestamp,
        error: {
          message: error.message || "Unknown error occurred",
          code: error.code,
        },
      };
    }
  }

  /**
   * Maps common options to OpenAI-specific format
   * Handles translation of normalized options to OpenAI's API format
   */
  private mapChatOptionsToOpenAI(options: ChatCompletionOptions) {
    try {
      const providerOptions = options.providerOptions as
        | Omit<
            InternalTextProviderOptions,
            | "max_output_tokens"
            | "tools"
            | "metadata"
            | "temperature"
            | "input"
            | "top_p"
          >
        | undefined;

      const input = convertMessagesToInput(options.messages);

      const tools = options.tools
        ? convertToolsToProviderFormat([...options.tools])
        : undefined;

      const requestParams: Omit<
        OpenAI_SDK.Responses.ResponseCreateParams,
        "stream"
      > = {
        model: options.model,
        temperature: options.options?.temperature,
        max_output_tokens: options.options?.maxTokens,
        top_p: options.options?.topP,
        metadata: options.options?.metadata,
        ...providerOptions,
        input,
        tools,
      };

      return requestParams;
    } catch (error: any) {
      console.error(">>> mapChatOptionsToOpenAI: Fatal error <<<");
      console.error(">>> Error message:", error?.message);
      console.error(">>> Error stack:", error?.stack);
      console.error(">>> Full error:", error);
      throw error;
    }
  }
}

/**
 * Creates an OpenAI adapter with simplified configuration
 * @param apiKey - Your OpenAI API key
 * @returns A fully configured OpenAI adapter instance
 *
 * @example
 * ```typescript
 * const openai = createOpenAI("sk-...");
 *
 * const ai = new AI({
 *   adapters: {
 *     openai,
 *   }
 * });
 * ```
 */
export function createOpenAI(
  apiKey: string,
  config?: Omit<OpenAIConfig, "apiKey">
): OpenAI {
  return new OpenAI({ apiKey, ...config });
}

/**
 * Create an OpenAI adapter with automatic API key detection from environment variables.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI adapter instance
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const aiInstance = ai(openai());
 * ```
 */
export function openai(config?: Omit<OpenAIConfig, "apiKey">): OpenAI {
  const env =
    typeof globalThis !== "undefined" && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== "undefined"
      ? process.env
      : undefined;
  const key = env?.OPENAI_API_KEY;

  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is required. Please set it in your environment variables or use createOpenAI(apiKey, config) instead."
    );
  }

  return createOpenAI(key, config);
}
