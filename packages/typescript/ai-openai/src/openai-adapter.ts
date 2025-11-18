import OpenAI_SDK from "openai";
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
  type ImageGenerationOptions,
  type ImageGenerationResult,
  type ImageData,
} from "@tanstack/ai";
import { OPENAI_CHAT_MODELS, OPENAI_IMAGE_MODELS, OPENAI_EMBEDDING_MODELS, OPENAI_AUDIO_MODELS, OPENAI_VIDEO_MODELS, OPENAI_TRANSCRIPTION_MODELS } from "./model-meta";

export interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  baseURL?: string;
}



export type OpenAIChatModel = (typeof OPENAI_CHAT_MODELS)[number];
export type OpenAIImageModel = (typeof OPENAI_IMAGE_MODELS)[number];
export type OpenAIEmbeddingModel = (typeof OPENAI_EMBEDDING_MODELS)[number];
export type OpenAIAudioModel = (typeof OPENAI_AUDIO_MODELS)[number];
export type OpenAIVideoModel = (typeof OPENAI_VIDEO_MODELS)[number];
export type OpenAITranscriptionModel = (typeof OPENAI_TRANSCRIPTION_MODELS)[number];


/**
 * OpenAI-specific provider options for chat/text generation
 * Based on OpenAI Chat Completions API documentation
 * @see https://platform.openai.com/docs/api-reference/chat/create
 */
export interface OpenAIChatProviderOptions {
  // Storage and tracking
  /** Whether to store the generation. Defaults to false */
  store?: boolean;

  // Advanced features
  /** Modifies likelihood of specific tokens appearing (token_id: bias from -100 to 100) */
  logitBias?: Record<number, number>;
  /** Return log probabilities (true or number for top n logprobs) */
  logprobs?: boolean | number;
  /** Return top_logprobs most likely tokens (0-20) */
  topLogprobs?: number;

  // Reasoning models (o1, o3, o4-mini)
  /** Reasoning effort for reasoning models: 'low' | 'medium' | 'high' */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Maximum number of completion tokens for reasoning models */
  maxCompletionTokens?: number;

  // Structured outputs
  /** Whether to use strict JSON schema validation */
  strictJsonSchema?: boolean;

  // Service configuration
  /** Service tier: 'auto' | 'default' */
  serviceTier?: 'auto' | 'default';

  // Prediction/prefill
  /** Parameters for prediction mode (content prefill) */
  prediction?: {
    type: 'content';
    content: string | Array<{ type: 'text'; text: string }>;
  };

  // Audio (for audio-enabled models)
  /** Audio output configuration */
  audio?: {
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    format: 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16';
  };
  /** Voice input for audio-enabled models */
  modalities?: Array<'text' | 'audio'>;

  // Prompt caching (beta)
  /** Cache key for manual prompt caching control */
  promptCacheKey?: string;

  // Safety and moderation
  /** Stable identifier for usage policy violation detection */
  safetyIdentifier?: string;

  // Search (preview feature)
  /** Web search options for search-enabled models */
  webSearchOptions?: {
    enabled?: boolean;
    mode?: 'auto' | 'always' | 'never';
  };

  // Response configuration
  /** Number of completions to generate (default: 1) */
  n?: number;
  /** Whether to stream partial progress as server-sent events */
  streamOptions?: {
    includeUsage?: boolean;
  };
}

/**
 * Maps common options to OpenAI-specific format
 * Handles translation of normalized options to OpenAI's API format
 */
export function mapCommonOptionsToOpenAI(
  options: ChatCompletionOptions,
  providerOpts?: OpenAIChatProviderOptions
): OpenAIChatProviderOptions {
  const requestParams: any = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    top_p: options.topP,
    frequency_penalty: options.frequencyPenalty,
    presence_penalty: options.presencePenalty,
    stop: options.stopSequences,
    stream: options.stream || false,
    seed: options.seed,
  };

  if (options.metadata) {
    requestParams.metadata = options.metadata;
  }

  // Map user identifier (common option)
  if (options.user) {
    requestParams.user = options.user;
  }

  // Map tools if provided
  if (options.tools && options.tools.length > 0) {
    requestParams.tools = options.tools.map((t) => ({
      type: t.type,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
        strict: providerOpts?.strictJsonSchema,
      },
    }));

    // Map tool choice
    if (options.toolChoice) {
      if (options.toolChoice === "auto") {
        requestParams.tool_choice = "auto";
      } else if (options.toolChoice === "none") {
        requestParams.tool_choice = "none";
      } else if (options.toolChoice === "required") {
        requestParams.tool_choice = "required";
      } else if (typeof options.toolChoice === "object") {
        requestParams.tool_choice = {
          type: "function",
          function: { name: options.toolChoice.function.name },
        };
      }
    }
  }

  // Map response format
  if (options.responseFormat) {
    if (options.responseFormat.type === "json_object") {
      requestParams.response_format = { type: "json_object" };
    } else if (options.responseFormat.type === "json_schema" && options.responseFormat.json_schema) {
      requestParams.response_format = {
        type: "json_schema",
        json_schema: {
          name: options.responseFormat.json_schema.name,
          description: options.responseFormat.json_schema.description,
          schema: options.responseFormat.json_schema.schema,
          strict: options.responseFormat.json_schema.strict ?? providerOpts?.strictJsonSchema ?? true,
        },
      };
    }
  }

  // Apply OpenAI-specific provider options
  if (providerOpts) {
    // Storage and tracking
    if (providerOpts.store !== undefined) {
      requestParams.store = providerOpts.store;
    }

    // Advanced features
    if (providerOpts.logitBias) {
      requestParams.logit_bias = providerOpts.logitBias;
    }
    if (providerOpts.logprobs !== undefined) {
      if (typeof providerOpts.logprobs === 'boolean') {
        requestParams.logprobs = providerOpts.logprobs;
      } else {
        requestParams.logprobs = true;
        requestParams.top_logprobs = providerOpts.logprobs;
      }
    }
    if (providerOpts.topLogprobs !== undefined) {
      requestParams.top_logprobs = providerOpts.topLogprobs;
    }

    // Reasoning models
    if (providerOpts.reasoningEffort) {
      requestParams.reasoning_effort = providerOpts.reasoningEffort;
    }
    if (providerOpts.maxCompletionTokens) {
      requestParams.max_completion_tokens = providerOpts.maxCompletionTokens;
    }

    // Service configuration
    if (providerOpts.serviceTier) {
      requestParams.service_tier = providerOpts.serviceTier;
    }

    // Prediction/prefill
    if (providerOpts.prediction) {
      requestParams.prediction = providerOpts.prediction;
    }

    // Audio
    if (providerOpts.audio) {
      requestParams.audio = providerOpts.audio;
    }
    if (providerOpts.modalities) {
      requestParams.modalities = providerOpts.modalities;
    }

    // Search
    if (providerOpts.webSearchOptions) {
      requestParams.web_search = providerOpts.webSearchOptions;
    }

    // Response configuration
    if (providerOpts.n) {
      requestParams.n = providerOpts.n;
    }
    if (providerOpts.streamOptions) {
      requestParams.stream_options = providerOpts.streamOptions;
    }
  }

  // Custom headers and abort signal handled at HTTP client level
  if (options.headers) {
    requestParams._headers = options.headers;
  }
  if (options.abortSignal) {
    requestParams._abortSignal = options.abortSignal;
  }

  return requestParams;
}

/**
 * Alias for OpenAIChatProviderOptions
 */
export type OpenAIProviderOptions = OpenAIChatProviderOptions;

/**
 * OpenAI-specific provider options for image generation
 * Based on OpenAI Images API documentation
 * @see https://platform.openai.com/docs/api-reference/images/create
 */
export interface OpenAIImageProviderOptions {
  /** Image quality: 'standard' | 'hd' (dall-e-3, gpt-image-1 only) */
  quality?: 'standard' | 'hd';
  /** Image style: 'natural' | 'vivid' (dall-e-3 only) */
  style?: 'natural' | 'vivid';
  /** Background: 'transparent' | 'opaque' (gpt-image-1 only) */
  background?: 'transparent' | 'opaque';
  /** Output format: 'png' | 'webp' | 'jpeg' (gpt-image-1 only) */
  outputFormat?: 'png' | 'webp' | 'jpeg';
}

/**
 * OpenAI-specific provider options for embeddings
 * Based on OpenAI Embeddings API documentation
 * @see https://platform.openai.com/docs/api-reference/embeddings/create
 */
export interface OpenAIEmbeddingProviderOptions {
  /** Encoding format for embeddings: 'float' | 'base64' */
  encodingFormat?: 'float' | 'base64';
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
  timestampGranularities?: Array<'word' | 'segment'>;
  /** Chunking strategy for long audio (gpt-4o-transcribe-diarize): 'auto' or VAD config */
  chunkingStrategy?: 'auto' | { type: 'vad'; threshold?: number; prefix_padding_ms?: number; silence_duration_ms?: number };
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
export type OpenAIAudioProviderOptions = OpenAIAudioTranscriptionProviderOptions & OpenAITextToSpeechProviderOptions;

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
  typeof OPENAI_IMAGE_MODELS,
  typeof OPENAI_EMBEDDING_MODELS,
  typeof OPENAI_AUDIO_MODELS,
  typeof OPENAI_VIDEO_MODELS,
  OpenAIChatProviderOptions,
  OpenAIImageProviderOptions,
  OpenAIEmbeddingProviderOptions,
  OpenAIAudioProviderOptions,
  OpenAIVideoProviderOptions
> {
  name = "openai" as const;
  models = OPENAI_CHAT_MODELS;
  imageModels = OPENAI_IMAGE_MODELS;
  embeddingModels = OPENAI_EMBEDDING_MODELS;
  audioModels = OPENAI_AUDIO_MODELS;
  videoModels = OPENAI_VIDEO_MODELS;
  private client: OpenAI_SDK;

  constructor(config: OpenAIConfig) {
    super({});
    this.client = new OpenAI_SDK({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
    });
  }

  async chatCompletion(
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    const providerOpts = options.providerOptions as OpenAIChatProviderOptions | undefined;

    // Map common options to OpenAI format using the centralized mapping function
    const requestParams = mapCommonOptionsToOpenAI(options, providerOpts);

    // Transform messages to OpenAI format
    requestParams.messages = options.messages.map((msg) => {
      if (msg.role === "tool" && msg.toolCallId) {
        return {
          role: "tool" as const,
          content: msg.content || "",
          tool_call_id: msg.toolCallId,
        };
      }
      if (msg.role === "assistant" && msg.toolCalls) {
        return {
          role: "assistant" as const,
          content: msg.content,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: tc.function,
          })),
        };
      }
      return {
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content || "",
        name: msg.name,
      };
    });

    // Force stream to false for non-streaming
    requestParams.stream = false;

    // Set default model if not provided
    if (!requestParams.model) {
      requestParams.model = "gpt-3.5-turbo";
    }

    // Extract custom headers and abort signal (handled separately)
    const customHeaders = requestParams._headers;
    const abortSignal = requestParams._abortSignal;
    delete requestParams._headers;
    delete requestParams._abortSignal;

    const response = await this.client.chat.completions.create(
      requestParams,
      {
        headers: customHeaders,
        signal: abortSignal
      }
    );

    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      content: choice.message.content,
      role: "assistant",
      finishReason: choice.finish_reason as any,
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: tc.function,
      })),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  async *chatCompletionStream(
    options: ChatCompletionOptions
  ): AsyncIterable<ChatCompletionChunk> {
    const providerOpts = options.providerOptions as OpenAIChatProviderOptions | undefined;

    // Map common options to OpenAI format
    const requestParams = mapCommonOptionsToOpenAI(options, providerOpts);

    // Transform messages to OpenAI format
    requestParams.messages = options.messages.map((msg) => {
      if (msg.role === "tool" && msg.toolCallId) {
        return {
          role: "tool" as const,
          content: msg.content || "",
          tool_call_id: msg.toolCallId,
        };
      }
      if (msg.role === "assistant" && msg.toolCalls) {
        return {
          role: "assistant" as const,
          content: msg.content,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: tc.function,
          })),
        };
      }
      return {
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content || "",
        name: msg.name,
      };
    });

    // Force stream to true
    requestParams.stream = true;

    // Set default model if not provided
    if (!requestParams.model) {
      requestParams.model = "gpt-3.5-turbo";
    }

    // Extract custom headers and abort signal
    const customHeaders = requestParams._headers;
    const abortSignal = requestParams._abortSignal;
    delete requestParams._headers;
    delete requestParams._abortSignal;

    // Create with explicit streaming enabled - OpenAI SDK will return a Stream
    const streamResult = await this.client.chat.completions.create(
      requestParams,
      {
        headers: customHeaders as Record<string, string> | undefined,
        signal: abortSignal as AbortSignal | undefined
      }
    );

    // TypeScript doesn't know this is a Stream when stream:true, but it is at runtime
    const stream = streamResult as unknown as AsyncIterable<any>;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield {
          id: chunk.id,
          model: chunk.model,
          content: delta.content,
          role: delta.role as "assistant" | undefined,
          finishReason: chunk.choices[0]?.finish_reason as any,
        };
      }
    }
  }

  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncIterable<import("@tanstack/ai").StreamChunk> {
    const providerOpts = options.providerOptions as OpenAIChatProviderOptions | undefined;

    // Track tool call metadata by unique ID
    // OpenAI streams tool calls with deltas - first chunk has ID/name, subsequent chunks only have args
    // We assign our own indices as we encounter unique tool call IDs
    const toolCallMetadata = new Map<string, { index: number; name: string }>();
    let nextIndex = 0;

    // Debug: Log incoming options
    if (process.env.DEBUG_TOOLS) {
      console.error(
        "[DEBUG chatStream] Received options.tools:",
        options.tools ? `${options.tools.length} tools` : "undefined"
      );
      if (options.tools && options.tools.length > 0) {
        console.error(
          "[DEBUG chatStream] First tool:",
          JSON.stringify(options.tools[0], null, 2)
        );
      }
    }

    // Map common options to OpenAI format using the centralized mapping function
    const requestParams = mapCommonOptionsToOpenAI(options, providerOpts);

    // Transform messages to OpenAI format
    requestParams.messages = options.messages.map((msg) => {
      if (msg.role === "tool" && msg.toolCallId) {
        return {
          role: "tool" as const,
          content: msg.content || "",
          tool_call_id: msg.toolCallId,
        };
      }
      if (msg.role === "assistant" && msg.toolCalls) {
        return {
          role: "assistant" as const,
          content: msg.content,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: tc.function,
          })),
        };
      }
      return {
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content || "",
        name: msg.name,
      };
    });

    // Force stream to true
    requestParams.stream = true;

    // Set default model if not provided
    if (!requestParams.model) {
      requestParams.model = "gpt-3.5-turbo";
    }

    // Debug: Show final request structure
    if (process.env.DEBUG_TOOLS) {
      console.error(
        "[DEBUG] Final request params keys:",
        Object.keys(requestParams)
      );
      console.error("[DEBUG] Has tools property:", "tools" in requestParams);
      if (requestParams.tools) {
        console.error(
          "[DEBUG] Sending tools to OpenAI:",
          JSON.stringify(requestParams.tools, null, 2)
        );
        console.error("[DEBUG] Tool choice:", requestParams.tool_choice);
      }
    }

    // Extract custom headers and abort signal
    const customHeaders = requestParams._headers;
    const abortSignal = requestParams._abortSignal;
    delete requestParams._headers;
    delete requestParams._abortSignal;

    const stream = (await this.client.chat.completions.create(
      requestParams,
      {
        headers: customHeaders,
        signal: abortSignal
      }
    )) as any;

    let accumulatedContent = "";
    const timestamp = Date.now();

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const choice = chunk.choices[0];

        // Handle content delta
        if (delta?.content) {
          accumulatedContent += delta.content;
          yield {
            type: "content",
            id: chunk.id,
            model: chunk.model,
            timestamp,
            delta: delta.content,
            content: accumulatedContent,
            role: "assistant",
          };
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            // First chunk of a tool call has ID and name
            // Subsequent chunks only have argument fragments
            if (toolCall.id) {
              // New tool call - assign it the next index
              toolCallMetadata.set(toolCall.id, {
                index: nextIndex++,
                name: toolCall.function?.name || "",
              });
            }

            // Find which tool call these deltas belong to
            // For the first chunk, we just added it above
            // For subsequent chunks, we need to find it by OpenAI's index field
            let toolCallId: string;
            let toolCallName: string;
            let actualIndex: number;

            if (toolCall.id) {
              // First chunk - use the ID we just tracked
              toolCallId = toolCall.id;
              const meta = toolCallMetadata.get(toolCallId)!;
              toolCallName = meta.name;
              actualIndex = meta.index;
            } else {
              // Delta chunk - find by OpenAI's index
              // OpenAI uses index to group deltas for the same tool call
              const openAIIndex = typeof toolCall.index === 'number' ? toolCall.index : 0;

              // Find the tool call ID that was assigned this OpenAI index
              const entry = Array.from(toolCallMetadata.entries())[openAIIndex];
              if (entry) {
                const [id, meta] = entry;
                toolCallId = id;
                toolCallName = meta.name;
                actualIndex = meta.index;
              } else {
                // Fallback if we can't find it
                toolCallId = `call_${Date.now()}`;
                toolCallName = "";
                actualIndex = openAIIndex;
              }
            }

            yield {
              type: "tool_call",
              id: chunk.id,
              model: chunk.model,
              timestamp,
              toolCall: {
                id: toolCallId,
                type: "function",
                function: {
                  name: toolCallName,
                  arguments: toolCall.function?.arguments || "",
                },
              },
              index: actualIndex,
            };
          }
        }

        // Handle completion
        if (choice?.finish_reason) {
          yield {
            type: "done",
            id: chunk.id,
            model: chunk.model,
            timestamp,
            finishReason: choice.finish_reason as any,
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
        id: this.generateId(),
        model: options.model || "gpt-3.5-turbo",
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
    const response = await this.client.completions.create({
      model: options.model,
      prompt: options.prompt,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stopSequences,
      stream: false,
    });

    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      text: choice.text,
      finishReason: choice.finish_reason as any,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  async *generateTextStream(
    options: TextGenerationOptions
  ): AsyncIterable<string> {
    const stream = await this.client.completions.create({
      model: options.model || "gpt-3.5-turbo-instruct",
      prompt: options.prompt,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stopSequences,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.choices[0]?.text) {
        yield chunk.choices[0].text;
      }
    }
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

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const numImages = options.n || 1;
    const model = options.model as OpenAIImageModel;

    // Determine max images per call based on model
    const maxPerCall = options.maxImagesPerCall || (model === "dall-e-3" ? 1 : 10);

    // Calculate how many API calls we need
    const numCalls = Math.ceil(numImages / maxPerCall);
    const allImages: ImageData[] = [];

    // Make batched API calls
    for (let i = 0; i < numCalls; i++) {
      const imagesThisCall = Math.min(maxPerCall, numImages - allImages.length);

      const requestParams: OpenAI_SDK.Images.ImageGenerateParams = {
        model,
        prompt: options.prompt,
        n: imagesThisCall,
        ...(options.size && { size: options.size as any }),
        ...(options.seed && model === "dall-e-3" && { seed: options.seed }),
        response_format: "b64_json", // Always request base64
      };

      // Add provider-specific options
      if (options.providerOptions) {
        Object.assign(requestParams, options.providerOptions);
      }

      const response = await this.client.images.generate(requestParams, {
        signal: options.abortSignal,
        headers: options.headers,
      });

      // Convert response to ImageData format
      if (response.data) {
        for (const image of response.data) {
          if (image.b64_json) {
            const base64 = image.b64_json;
            const uint8Array = this.base64ToUint8Array(base64);

            allImages.push({
              base64: `data:image/png;base64,${base64}`,
              uint8Array,
              mediaType: "image/png",
            });
          }
        }
      }
    }

    // Extract provider metadata if available
    const providerMetadata: Record<string, any> = {};
    if (options.providerOptions) {
      providerMetadata.openai = {
        images: allImages.map(() => ({})),
      };
    }

    return {
      ...(numImages === 1 ? { image: allImages[0] } : { images: allImages }),
      providerMetadata,
      response: {
        id: this.generateId(),
        model,
        timestamp: Date.now(),
      },
    };
  }

  async transcribeAudio(
    options: import("@tanstack/ai").AudioTranscriptionOptions
  ): Promise<import("@tanstack/ai").AudioTranscriptionResult> {
    const providerOpts = options.providerOptions as OpenAIAudioTranscriptionProviderOptions | undefined;

    const formData = new FormData();
    formData.append("file", options.file);
    formData.append("model", options.model);

    if (options.prompt) {
      formData.append("prompt", options.prompt);
    }

    if (options.language) {
      formData.append("language", options.language);
    }

    if (options.temperature !== undefined) {
      formData.append("temperature", String(options.temperature));
    }

    const responseFormat = options.responseFormat || "json";
    formData.append("response_format", responseFormat);

    // Add timestamp granularities if specified (whisper-1 only)
    if (providerOpts?.timestampGranularities) {
      providerOpts.timestampGranularities.forEach(gran => {
        formData.append("timestamp_granularities[]", gran);
      });
    }

    // Add diarization options if specified
    if (providerOpts?.chunkingStrategy) {
      formData.append("chunking_strategy", typeof providerOpts.chunkingStrategy === 'string'
        ? providerOpts.chunkingStrategy
        : JSON.stringify(providerOpts.chunkingStrategy));
    }

    if (providerOpts?.knownSpeakerNames) {
      providerOpts.knownSpeakerNames.forEach(name => {
        formData.append("known_speaker_names[]", name);
      });
    }

    if (providerOpts?.knownSpeakerReferences) {
      providerOpts.knownSpeakerReferences.forEach(ref => {
        formData.append("known_speaker_references[]", ref);
      });
    }

    const response = await this.client.audio.transcriptions.create(formData as any);

    // Parse response based on format
    if (typeof response === 'string') {
      return {
        id: this.generateId(),
        model: options.model,
        text: response,
      };
    }

    return {
      id: this.generateId(),
      model: options.model,
      text: (response as any).text || "",
      language: (response as any).language,
      duration: (response as any).duration,
      segments: (response as any).segments,
      logprobs: (response as any).logprobs,
    };
  }

  async generateSpeech(
    options: import("@tanstack/ai").TextToSpeechOptions
  ): Promise<import("@tanstack/ai").TextToSpeechResult> {
    const voice = options.voice;
    if (!voice) {
      throw new Error("Voice parameter is required for text-to-speech");
    }

    const response = await this.client.audio.speech.create({
      model: options.model,
      input: options.input,
      voice: voice as any,
      response_format: (options.responseFormat || "mp3") as any,
      speed: options.speed,
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    const format = (options.responseFormat || "mp3") as "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

    return {
      id: this.generateId(),
      model: options.model,
      audio: buffer,
      format,
    };
  }

  async generateVideo(
    options: import("@tanstack/ai").VideoGenerationOptions
  ): Promise<import("@tanstack/ai").VideoGenerationResult> {
    const providerOpts = options.providerOptions as OpenAIVideoProviderOptions | undefined;

    // Start video generation
    const createParams: any = {
      model: options.model,
      prompt: options.prompt,
    };

    // Add provider-specific options
    if (options.resolution) {
      createParams.size = options.resolution;
    }

    if (options.duration !== undefined) {
      createParams.seconds = String(options.duration);
    }

    if (providerOpts?.inputReference) {
      createParams.input_reference = providerOpts.inputReference;
    }

    let video: any;

    // Check if this is a remix
    if (providerOpts?.remixVideoId) {
      video = await (this.client as any).videos.remix(providerOpts.remixVideoId, {
        prompt: options.prompt,
      });
    } else {
      video = await (this.client as any).videos.create(createParams);
    }

    // Poll for completion
    while (video.status === 'queued' || video.status === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
      video = await (this.client as any).videos.retrieve(video.id);
    }

    if (video.status === 'failed') {
      throw new Error(`Video generation failed: ${video.error?.message || 'Unknown error'}`);
    }

    // Download video content
    const videoContent = await (this.client as any).videos.downloadContent(video.id);
    const buffer = Buffer.from(await videoContent.arrayBuffer());

    // Optionally download thumbnail
    let thumbnail: string | undefined;
    try {
      const thumbnailContent = await (this.client as any).videos.downloadContent(video.id, { variant: 'thumbnail' });
      const thumbBuffer = Buffer.from(await thumbnailContent.arrayBuffer());
      thumbnail = `data:image/webp;base64,${thumbBuffer.toString('base64')}`;
    } catch (e) {
      // Thumbnail download failed, continue without it
    }

    return {
      id: video.id,
      model: options.model,
      video: buffer,
      format: 'mp4',
      duration: parseInt(video.seconds) || options.duration,
      resolution: video.size || options.resolution,
      thumbnail,
    };
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    // Remove data URL prefix if present
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');

    // Decode base64 to binary string
    const binaryString = atob(base64Data);

    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
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
  const env = typeof globalThis !== "undefined" && (globalThis as any).window?.env
    ? (globalThis as any).window.env
    : typeof process !== "undefined" ? process.env : undefined;
  const key = env?.OPENAI_API_KEY;

  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is required. Please set it in your environment variables or use createOpenAI(apiKey, config) instead."
    );
  }

  return createOpenAI(key, config);
}
