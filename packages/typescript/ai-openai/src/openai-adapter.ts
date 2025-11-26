import OpenAI_SDK from "openai";
import {
  BaseAdapter,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type SummarizationOptions,
  type SummarizationResult,
  type EmbeddingOptions,
  type EmbeddingResult,
  type ModelMessage,
  type Tool,
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

    // Use Chat Completions API (standard, well-established API with reliable tool call support)
    // instead of Responses API which has issues with argument parsing
    const messages = this.convertMessagesToChatCompletionsFormat(
      options.messages
    );
    const tools = options.tools
      ? this.convertToolsToChatCompletionsFormat([...options.tools])
      : undefined;

    const response = await this.client.chat.completions.create(
      {
        model: options.model,
        messages,
        tools,
        tool_choice: options.options?.toolChoice as any,
        temperature: options.options?.temperature,
        max_tokens: options.options?.maxTokens,
        top_p: options.options?.topP,
        stream: true,
      },
      {
        headers: options.request?.headers,
        signal: options.request?.signal,
      }
    );

    // Chat Completions API uses SSE format - iterate directly
    yield* this.processChatCompletionsStream(
      response,
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
   * Convert tools to Chat Completions API format
   */
  private convertToolsToChatCompletionsFormat(
    tools: Array<Tool>
  ): Array<OpenAI_SDK.Chat.Completions.ChatCompletionTool> {
    return tools.map((tool) => {
      // Chat Completions API uses simpler format: { type: "function", function: { name, description, parameters } }
      return {
        type: "function" as const,
        function: {
          name: tool.function.name,
          description: tool.function.description || "",
          parameters: tool.function.parameters || {},
        },
      };
    });
  }

  /**
   * Convert messages to Chat Completions API format
   */
  private convertMessagesToChatCompletionsFormat(
    messages: ModelMessage[]
  ): Array<OpenAI_SDK.Chat.Completions.ChatCompletionMessageParam> {
    const result: Array<OpenAI_SDK.Chat.Completions.ChatCompletionMessageParam> =
      [];

    for (const message of messages) {
      // Handle tool messages - convert to tool role
      if (message.role === "tool") {
        result.push({
          role: "tool",
          tool_call_id: message.toolCallId || "",
          content:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
        });
        continue;
      }

      // Handle assistant messages with tool calls
      if (message.role === "assistant") {
        const assistantMsg: OpenAI_SDK.Chat.Completions.ChatCompletionAssistantMessageParam =
          {
            role: "assistant",
            content: message.content || null,
          };

        if (message.toolCalls && message.toolCalls.length > 0) {
          assistantMsg.tool_calls = message.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments || {}),
            },
          }));
        }

        result.push(assistantMsg);
        continue;
      }

      // Handle user and system messages
      if (message.role === "user") {
        result.push({
          role: "user",
          content:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
        });
      } else if (message.role === "system") {
        result.push({
          role: "system",
          content:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
        });
      }
    }

    return result;
  }

  /**
   * Process Chat Completions API stream (SSE format)
   * This is the standard, well-established API with reliable tool call support
   */
  private async *processChatCompletionsStream(
    stream: AsyncIterable<OpenAI_SDK.Chat.Completions.ChatCompletionChunk>,
    toolCallMetadata: Map<string, { index: number; name: string }>,
    options: ChatCompletionOptions,
    generateId: () => string
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = "";
    const timestamp = Date.now();
    let nextIndex = 0;

    // Track accumulated function call arguments by call_id
    const accumulatedFunctionCallArguments = new Map<string, string>();

    let responseId: string | null = null;
    let model: string | null = null;

    try {
      for await (const chunk of stream) {
        // Preserve response metadata
        if (chunk.id) responseId = chunk.id;
        if (chunk.model) model = chunk.model;

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;
        const finishReason = choice.finish_reason;

        // Handle content delta
        if (delta?.content) {
          accumulatedContent += delta.content;
          yield {
            type: "content" as const,
            id: responseId || generateId(),
            model: model || options.model || "gpt-4o",
            timestamp,
            delta: delta.content,
            content: accumulatedContent,
            role: "assistant" as const,
          };
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            let toolCallId: string;
            let toolCallName: string;
            let toolCallArgs: string;
            let actualIndex: number;

            if (toolCall.id) {
              // First chunk with ID and name
              toolCallId = toolCall.id;
              toolCallName = toolCall.function?.name || "";
              toolCallArgs = toolCall.function?.arguments || "";

              // Track for index assignment
              if (!toolCallMetadata.has(toolCallId)) {
                toolCallMetadata.set(toolCallId, {
                  index: nextIndex++,
                  name: toolCallName,
                });
                accumulatedFunctionCallArguments.set(toolCallId, "");
              }
              const meta = toolCallMetadata.get(toolCallId)!;
              actualIndex = meta.index;

              // Track the delta for this chunk
              if (toolCallArgs) {
                const current =
                  accumulatedFunctionCallArguments.get(toolCallId) || "";
                accumulatedFunctionCallArguments.set(
                  toolCallId,
                  current + toolCallArgs
                );
              }
            } else {
              // Delta chunk - find by index
              const openAIIndex =
                typeof toolCall.index === "number" ? toolCall.index : 0;
              const entry = Array.from(toolCallMetadata.entries())[openAIIndex];
              if (entry) {
                const [id, meta] = entry;
                toolCallId = id;
                toolCallName = meta.name;
                actualIndex = meta.index;
                toolCallArgs = toolCall.function?.arguments || "";

                // Track the delta
                if (toolCallArgs) {
                  const current =
                    accumulatedFunctionCallArguments.get(toolCallId) || "";
                  accumulatedFunctionCallArguments.set(
                    toolCallId,
                    current + toolCallArgs
                  );
                }
              } else {
                // Fallback
                toolCallId = `call_${Date.now()}`;
                toolCallName = "";
                actualIndex = openAIIndex;
                toolCallArgs = "";
              }
            }

            // Emit the tool call chunk
            // For chunks with ID (first chunk), always emit to register the tool call
            // For delta chunks, only emit if there are arguments to add
            // The ToolCallManager will accumulate the argument deltas for us
            if (toolCall.id || toolCallArgs) {
              yield {
                type: "tool_call",
                id: responseId || generateId(),
                model: model || options.model || "gpt-4o",
                timestamp,
                toolCall: {
                  id: toolCallId,
                  type: "function",
                  function: {
                    name: toolCallName,
                    arguments: toolCallArgs, // Only the delta, not accumulated
                  },
                },
                index: actualIndex,
              };
            }
          }
        }

        // Handle completion
        if (finishReason) {
          yield {
            type: "done" as const,
            id: responseId || generateId(),
            model: model || options.model || "gpt-4o",
            timestamp,
            finishReason: finishReason as any,
            usage: chunk.usage
              ? {
                  promptTokens: chunk.usage.prompt_tokens || 0,
                  completionTokens: chunk.usage.completion_tokens || 0,
                  totalTokens: chunk.usage.total_tokens || 0,
                }
              : undefined,
          };
        }
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

            // Debug: Log reasoning-related events at the parser level
            if (
              parsed.type &&
              (parsed.type.includes("reasoning") ||
                parsed.type.includes("reasoning_text"))
            ) {
              console.log(
                "[OpenAI Adapter] Parser: Reasoning event detected:",
                {
                  type: parsed.type,
                  hasDelta: !!parsed.delta,
                  hasItem: !!parsed.item,
                  hasPart: !!parsed.part,
                  fullEvent: JSON.stringify(parsed).substring(0, 500),
                }
              );
            }

            yield parsed;
          } catch (e) {
            // Skip malformed JSON lines
            console.log(
              "[OpenAI Adapter] Parser: Failed to parse line:",
              trimmed.substring(0, 200)
            );
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
    let accumulatedReasoning = "";
    const timestamp = Date.now();
    let nextIndex = 0;
    let chunkCount = 0;

    // Track accumulated function call arguments by call_id
    const accumulatedFunctionCallArguments = new Map<string, string>();

    // Map item_id (from delta events) to call_id (from function_call items)
    const itemIdToCallId = new Map<string, string>();

    // Preserve response metadata across events
    let responseId: string | null = null;
    let model: string | null = null;
    let doneChunkEmitted = false;
    const eventTypeCounts = new Map<string, number>();
    // Track which item indices are reasoning items
    const reasoningItemIndices = new Set<number>();

    try {
      for await (const chunk of stream) {
        chunkCount++;

        // Track event types for debugging
        if (chunk.type) {
          const count = eventTypeCounts.get(chunk.type) || 0;
          eventTypeCounts.set(chunk.type, count + 1);

          // Log first occurrence of each event type
          if (count === 0) {
            console.log(
              "[OpenAI Adapter] New event type detected:",
              chunk.type
            );
          }
        }

        // Responses API uses event-based streaming with types like:
        // - response.created
        // - response.in_progress
        // - response.output_item.added
        // - response.output_text.delta
        // - response.function_call_arguments.delta
        // - response.function_call_arguments.done
        // - response.done

        let delta: any = null;
        let finishReason: string | null = null;

        // Handle Responses API event format
        if (chunk.type) {
          const eventType = chunk.type;

          // Debug: Log all event types to help diagnose reasoning events
          if (
            eventType.includes("reasoning") ||
            eventType.includes("output_reasoning")
          ) {
            console.log("[OpenAI Adapter] Reasoning-related event detected:", {
              eventType,
              hasDelta: !!chunk.delta,
              deltaType: typeof chunk.delta,
              deltaIsArray: Array.isArray(chunk.delta),
              hasItem: !!chunk.item,
              itemType: chunk.item?.type,
              hasPart: !!chunk.part,
              partType: chunk.part?.type,
            });
          }

          // Debug: Inspect content_part events - reasoning might come through here
          if (
            eventType === "response.content_part.added" ||
            eventType === "response.content_part.done"
          ) {
            console.log("[OpenAI Adapter] Content part event:", {
              eventType,
              hasPart: !!chunk.part,
              partType: chunk.part?.type,
              partContentType: chunk.part?.content_type,
              hasText: !!chunk.part?.text,
              textLength: chunk.part?.text?.length || 0,
              hasDelta: !!chunk.delta,
              deltaType: typeof chunk.delta,
              itemIndex: chunk.item_index,
              partIndex: chunk.part_index,
              fullPart: JSON.stringify(chunk.part).substring(0, 200), // First 200 chars
            });
          }

          // Debug: Inspect ALL output_item.added events
          if (eventType === "response.output_item.added" && chunk.item) {
            const item = chunk.item;
            const itemIndex = chunk.item_index;

            // Track reasoning items by index
            if (item.type === "reasoning" && itemIndex !== undefined) {
              reasoningItemIndices.add(itemIndex);
              console.log(
                "[OpenAI Adapter] Reasoning item detected, tracking index:",
                itemIndex
              );
            }

            console.log("[OpenAI Adapter] Output item added:", {
              itemType: item.type,
              itemIndex,
              itemId: item.id,
              hasContent: !!item.content,
              contentIsArray: Array.isArray(item.content),
              contentLength: Array.isArray(item.content)
                ? item.content.length
                : 0,
              hasSummary: !!item.summary,
              summaryIsArray: Array.isArray(item.summary),
              summaryLength: Array.isArray(item.summary)
                ? item.summary.length
                : 0,
              chunkKeys: Object.keys(chunk),
            });

            if (item.type === "message" && item.content) {
              const contentTypes = item.content.map((c: any) => c.type);
              console.log(
                "[OpenAI Adapter] Output item added (message details):",
                {
                  itemType: item.type,
                  contentTypes,
                  hasReasoning: contentTypes.includes("output_reasoning"),
                  contentDetails: item.content.map((c: any) => ({
                    type: c.type,
                    hasText: !!c.text,
                    textLength: c.text?.length || 0,
                  })),
                }
              );
            } else if (item.type !== "message") {
              // Log non-message items - maybe reasoning comes as a different item type?
              console.log("[OpenAI Adapter] Output item added (non-message):", {
                itemType: item.type,
                fullItem: JSON.stringify(item).substring(0, 500), // First 500 chars
              });
            }
          }

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

          // Handle function call argument deltas
          // response.function_call_arguments.delta events contain incremental argument updates
          // Note: delta events use item_id, not call_id, and we need to map item_id to call_id
          if (
            eventType === "response.function_call_arguments.delta" &&
            chunk.delta !== undefined &&
            chunk.item_id
          ) {
            // Find the call_id by looking up the item_id in the output items
            // We need to track item_id -> call_id mapping
            // For now, we'll look it up from the item if available, or use a reverse lookup
            let callId: string | undefined;

            // Try to find call_id from item_id by checking if we have the item stored
            // The item_id corresponds to the function_call item's id
            // We need to maintain a mapping: item_id -> call_id
            // For now, we'll use a workaround: check if delta events come after output_item.added
            // and use the most recently added function call's call_id

            // Actually, we should track item_id -> call_id when we see output_item.added
            // For now, let's use the item_id as a fallback and try to find the call_id
            // by checking accumulated items or using a reverse lookup

            // Better approach: track item_id -> call_id mapping when we see output_item.added
            const itemId = chunk.item_id;

            callId = itemIdToCallId.get(itemId);

            if (callId) {
              const currentArgs =
                accumulatedFunctionCallArguments.get(callId) || "";
              // Delta is a JSON string fragment - append it to accumulate
              let deltaText: string;
              if (typeof chunk.delta === "string") {
                deltaText = chunk.delta;
              } else if (Array.isArray(chunk.delta)) {
                // Delta might be an array of characters/strings
                deltaText = chunk.delta.join("");
              } else {
                deltaText = JSON.stringify(chunk.delta);
              }

              const newArgs = currentArgs + deltaText;
              accumulatedFunctionCallArguments.set(callId, newArgs);

              // Debug: log delta accumulation for recommendGuitar
              if (process.env.DEBUG_TOOL_ARGS) {
                const meta = toolCallMetadata.get(callId);
                if (meta?.name === "recommendGuitar") {
                  console.log(
                    `[DEBUG] Delta for ${callId}:`,
                    JSON.stringify(deltaText),
                    "-> Accumulated:",
                    newArgs
                  );
                }
              }

              // Emit updated tool call with accumulated arguments
              const meta = toolCallMetadata.get(callId);
              if (meta) {
                delta = delta || {};
                delta.tool_calls = [
                  {
                    id: callId,
                    function: {
                      name: meta.name,
                      arguments: newArgs,
                    },
                  },
                ];
              }
            }
          }

          // Handle function call arguments done (complete arguments)
          // response.function_call_arguments.done events contain the final complete arguments
          if (
            eventType === "response.function_call_arguments.done" &&
            chunk.item_id
          ) {
            const itemId = chunk.item_id;
            const callId = itemIdToCallId.get(itemId);

            if (callId) {
              // Prefer accumulated arguments from deltas over the done event's arguments
              // The done event might have incomplete or empty arguments
              let completeArgs: string =
                accumulatedFunctionCallArguments.get(callId) || "";

              // If we don't have accumulated args, try the done event's arguments
              if (!completeArgs || completeArgs === "") {
                if (
                  typeof chunk.arguments === "string" &&
                  chunk.arguments !== "{}"
                ) {
                  completeArgs = chunk.arguments;
                } else if (
                  chunk.arguments &&
                  typeof chunk.arguments === "object" &&
                  Object.keys(chunk.arguments).length > 0
                ) {
                  // If it's a non-empty object, stringify it
                  completeArgs = JSON.stringify(chunk.arguments);
                } else {
                  // Fallback to empty object
                  completeArgs = "{}";
                }
              }

              accumulatedFunctionCallArguments.set(callId, completeArgs);

              // Emit final tool call with complete arguments
              const meta = toolCallMetadata.get(callId);
              if (meta) {
                delta = delta || {};
                delta.tool_calls = [
                  {
                    id: callId,
                    function: {
                      name: meta.name,
                      arguments: completeArgs,
                    },
                  },
                ];
              }
            }
          }

          // Handle reasoning text deltas (reasoning content streaming)
          // OpenAI uses response.reasoning_text.delta events for reasoning content
          if (eventType === "response.reasoning_text.delta" && chunk.delta) {
            // Delta is an array of characters/strings - join them together
            let reasoningDelta = "";
            if (Array.isArray(chunk.delta)) {
              reasoningDelta = chunk.delta.join("");
            } else if (typeof chunk.delta === "string") {
              reasoningDelta = chunk.delta;
            }

            if (reasoningDelta) {
              accumulatedReasoning += reasoningDelta;
              const thinkingChunk: StreamChunk = {
                type: "thinking" as const,
                id: responseId || generateId(),
                model: model || options.model || "gpt-4o",
                timestamp,
                delta: reasoningDelta,
                content: accumulatedReasoning,
              };
              console.log(
                "[OpenAI Adapter] Emitting thinking chunk (reasoning_text.delta):",
                {
                  eventType,
                  deltaLength: reasoningDelta.length,
                  accumulatedLength: accumulatedReasoning.length,
                  chunkType: thinkingChunk.type,
                }
              );
              yield thinkingChunk;
            }
          }

          // Also handle the old format for backwards compatibility
          if (eventType === "response.output_reasoning.delta" && chunk.delta) {
            let reasoningDelta = "";
            if (Array.isArray(chunk.delta)) {
              reasoningDelta = chunk.delta.join("");
            } else if (typeof chunk.delta === "string") {
              reasoningDelta = chunk.delta;
            }

            if (reasoningDelta) {
              accumulatedReasoning += reasoningDelta;
              const thinkingChunk: StreamChunk = {
                type: "thinking" as const,
                id: responseId || generateId(),
                model: model || options.model || "gpt-4o",
                timestamp,
                delta: reasoningDelta,
                content: accumulatedReasoning,
              };
              console.log(
                "[OpenAI Adapter] Emitting thinking chunk (output_reasoning.delta):",
                {
                  eventType,
                  deltaLength: reasoningDelta.length,
                  accumulatedLength: accumulatedReasoning.length,
                  chunkType: thinkingChunk.type,
                }
              );
              yield thinkingChunk;
            }
          }

          // Handle content part events - reasoning might come through content parts
          // Note: Content parts can belong to reasoning items (check item_index)
          if (eventType === "response.content_part.added" && chunk.part) {
            const part = chunk.part;
            const itemIndex = chunk.item_index;

            // Check if this content part belongs to a reasoning item
            const belongsToReasoningItem =
              itemIndex !== undefined && reasoningItemIndices.has(itemIndex);

            // Check if this is a reasoning content part
            const isReasoningPart =
              part.type === "output_reasoning" ||
              part.content_type === "reasoning" ||
              part.type === "reasoning_text" ||
              part.type === "reasoning" ||
              belongsToReasoningItem;

            if (isReasoningPart) {
              const reasoningText = part.text || "";
              if (reasoningText) {
                accumulatedReasoning += reasoningText;
                const thinkingChunk: StreamChunk = {
                  type: "thinking" as const,
                  id: responseId || generateId(),
                  model: model || options.model || "gpt-4o",
                  timestamp,
                  delta: reasoningText,
                  content: accumulatedReasoning,
                };
                console.log(
                  "[OpenAI Adapter] Emitting thinking chunk (from content_part):",
                  {
                    eventType,
                    partType: part.type,
                    contentType: part.content_type,
                    itemIndex,
                    belongsToReasoningItem,
                    textLength: reasoningText.length,
                    accumulatedLength: accumulatedReasoning.length,
                  }
                );
                yield thinkingChunk;
              }
            }
          }

          // Handle output item added (new items like function calls or complete messages)
          if (eventType === "response.output_item.added" && chunk.item) {
            const item = chunk.item;
            if (item.type === "function_call") {
              // Initialize arguments accumulator for this call
              const callId = item.call_id;
              const itemId = item.id; // The item's id (used in delta events)

              // Map item_id to call_id for delta event lookups
              if (itemId && callId) {
                itemIdToCallId.set(itemId, callId);
              }

              const initialArgs = item.arguments
                ? typeof item.arguments === "string"
                  ? item.arguments
                  : JSON.stringify(item.arguments)
                : "";
              accumulatedFunctionCallArguments.set(callId, initialArgs);

              // Track metadata immediately so delta/done events can use it
              if (!toolCallMetadata.has(callId)) {
                toolCallMetadata.set(callId, {
                  index: nextIndex++,
                  name: item.name,
                });
              }

              delta = delta || {};
              delta.tool_calls = [
                {
                  id: callId,
                  function: {
                    name: item.name,
                    arguments: initialArgs,
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

                // Extract reasoning content from message item
                const reasoningContent = item.content.find(
                  (c: any) => c.type === "output_reasoning"
                );
                if (reasoningContent?.text) {
                  // Reasoning content comes as complete text in message items
                  accumulatedReasoning = reasoningContent.text;
                  const thinkingChunk: StreamChunk = {
                    type: "thinking" as const,
                    id: responseId || generateId(),
                    model: model || options.model || "gpt-4o",
                    timestamp,
                    content: accumulatedReasoning,
                  };
                  console.log(
                    "[OpenAI Adapter] Emitting thinking chunk (from message item):",
                    {
                      eventType: "response.output_item.added",
                      contentLength: accumulatedReasoning.length,
                      chunkType: thinkingChunk.type,
                      hasDelta: false,
                    }
                  );
                  yield thinkingChunk;
                }
              }
              // Only set finish reason if status indicates completion (not "in_progress")
              if (item.status && item.status !== "in_progress") {
                finishReason = item.status;
              }
            }
          }

          // Handle output item done - check for both function calls and reasoning items
          if (eventType === "response.output_item.done" && chunk.item) {
            const item = chunk.item;

            // Handle function call items - check if it has final arguments
            if (item.type === "function_call" && item.call_id) {
              const callId = item.call_id;
              // The item might have the final arguments as a string
              if (
                item.arguments &&
                typeof item.arguments === "string" &&
                item.arguments !== "{}"
              ) {
                const finalArgs = item.arguments;
                accumulatedFunctionCallArguments.set(callId, finalArgs);

                // Emit final tool call with complete arguments
                const meta = toolCallMetadata.get(callId);
                if (meta) {
                  delta = delta || {};
                  delta.tool_calls = [
                    {
                      id: callId,
                      function: {
                        name: meta.name,
                        arguments: finalArgs,
                      },
                    },
                  ];
                }
              }
            }

            // Handle reasoning items - reasoning content might be available when item completes
            if (item.type === "reasoning") {
              // Check if reasoning item has content/text/summary when it's done
              console.log("[OpenAI Adapter] Reasoning item done:", {
                itemId: item.id,
                hasContent: !!item.content,
                contentType: typeof item.content,
                hasText: !!item.text,
                textLength: item.text?.length || 0,
                hasSummary: !!item.summary,
                summaryType: typeof item.summary,
                summaryIsArray: Array.isArray(item.summary),
                summaryLength: Array.isArray(item.summary)
                  ? item.summary.length
                  : 0,
                summaryContent: Array.isArray(item.summary)
                  ? item.summary
                  : item.summary,
                fullItem: JSON.stringify(item).substring(0, 1000), // More chars to see summary
              });

              // If reasoning item has text content when done, emit it
              if (item.text) {
                accumulatedReasoning = item.text;
                const thinkingChunk: StreamChunk = {
                  type: "thinking" as const,
                  id: responseId || generateId(),
                  model: model || options.model || "gpt-4o",
                  timestamp,
                  content: accumulatedReasoning,
                };
                console.log(
                  "[OpenAI Adapter] Emitting thinking chunk (from reasoning item done - text):",
                  {
                    textLength: item.text.length,
                  }
                );
                yield thinkingChunk;
              }

              // Check if summary contains reasoning text (summary might be an array of text chunks)
              if (Array.isArray(item.summary) && item.summary.length > 0) {
                // Summary might be an array of text strings or objects with text/content
                const summaryText = item.summary
                  .map((s: any) =>
                    typeof s === "string"
                      ? s
                      : s?.text || s?.content || JSON.stringify(s)
                  )
                  .join("");
                if (summaryText) {
                  accumulatedReasoning = summaryText;
                  const thinkingChunk: StreamChunk = {
                    type: "thinking" as const,
                    id: responseId || generateId(),
                    model: model || options.model || "gpt-4o",
                    timestamp,
                    content: accumulatedReasoning,
                  };
                  console.log(
                    "[OpenAI Adapter] Emitting thinking chunk (from reasoning item done - summary):",
                    {
                      summaryLength: summaryText.length,
                    }
                  );
                  yield thinkingChunk;
                }
              } else if (typeof item.summary === "string" && item.summary) {
                accumulatedReasoning = item.summary;
                const thinkingChunk: StreamChunk = {
                  type: "thinking" as const,
                  id: responseId || generateId(),
                  model: model || options.model || "gpt-4o",
                  timestamp,
                  content: accumulatedReasoning,
                };
                console.log(
                  "[OpenAI Adapter] Emitting thinking chunk (from reasoning item done - summary string):",
                  {
                    summaryLength: item.summary.length,
                  }
                );
                yield thinkingChunk;
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

            // Extract reasoning content from legacy format
            const reasoningContent = messageItem.content.find(
              (c: any) => c.type === "output_reasoning"
            );
            if (reasoningContent?.text) {
              accumulatedReasoning = reasoningContent.text;
              const thinkingChunk: StreamChunk = {
                type: "thinking" as const,
                id: responseId || chunk.id || generateId(),
                model: model || chunk.model || options.model || "gpt-4o",
                timestamp,
                content: accumulatedReasoning,
              };
              console.log(
                "[OpenAI Adapter] Emitting thinking chunk (legacy format):",
                {
                  format: "legacy",
                  contentLength: accumulatedReasoning.length,
                  chunkType: thinkingChunk.type,
                }
              );
              yield thinkingChunk;
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

      // Log summary of all event types encountered
      console.log("[OpenAI Adapter] Stream completed. Event type summary:", {
        totalChunks: chunkCount,
        eventTypes: Object.fromEntries(eventTypeCounts),
        accumulatedReasoningLength: accumulatedReasoning.length,
        accumulatedContentLength: accumulatedContent.length,
        hasReasoning: accumulatedReasoning.length > 0,
      });
    } catch (error: any) {
      console.log(
        "[OpenAI Adapter] Stream ended with error. Event type summary:",
        {
          totalChunks: chunkCount,
          eventTypes: Object.fromEntries(eventTypeCounts),
          error: error.message,
        }
      );
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

      // Debug: Log the reasoning config being sent to OpenAI
      console.log("[OpenAI Adapter] Request params (reasoning check):", {
        model: requestParams.model,
        hasReasoning: !!requestParams.reasoning,
        reasoning: requestParams.reasoning,
        reasoningEffort: requestParams.reasoning?.effort,
        providerOptionsKeys: providerOptions
          ? Object.keys(providerOptions)
          : [],
        fullProviderOptions: providerOptions,
      });

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
