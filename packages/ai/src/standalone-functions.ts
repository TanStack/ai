import type {
  AIAdapter,
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamChunk,
  CommonChatOptions,
  Message,
  Tool,
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
} from "./types";

// Extract types from adapter
type ExtractModelsFromAdapter<T> = T extends AIAdapter<infer M, any, any, any, any, any, any, any, any, any> ? M[number] : never;
type ExtractImageModelsFromAdapter<T> = T extends AIAdapter<any, infer M, any, any, any, any, any, any, any, any> ? M[number] : never;
type ExtractAudioModelsFromAdapter<T> = T extends AIAdapter<any, any, any, infer M, any, any, any, any, any, any> ? M[number] : never;
type ExtractVideoModelsFromAdapter<T> = T extends AIAdapter<any, any, any, any, infer M, any, any, any, any, any> ? M[number] : never;
type ExtractChatProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, infer P, any, any, any, any> ? P : Record<string, any>;
type ExtractImageProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, any, infer P, any, any, any> ? P : Record<string, any>;
type ExtractAudioProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, any, any, any, infer P, any> ? P : Record<string, any>;
type ExtractVideoProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, any, any, any, any, infer P> ? P : Record<string, any>;

// Helper type to compute chat return type based on the "as" option
type ChatReturnType<
  TOptions extends { as?: "promise" | "stream" | "response" }
> = TOptions["as"] extends "stream"
  ? AsyncIterable<StreamChunk>
  : TOptions["as"] extends "response"
  ? Response
  : ChatCompletionResult;

/**
 * Chat options with model and messages at root level
 */
export interface ChatOptions<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
> {
  /** Adapter instance (e.g., openai(), anthropic(), ollama()) */
  adapter: TAdapter;

  /** Model identifier (strongly typed based on adapter) */
  model: ExtractModelsFromAdapter<TAdapter>;

  /** Array of messages in the conversation */
  messages: Message[];

  /** Tools available for the model to call */
  tools?: Tool[];

  /** Common options (temperature, maxTokens, etc.) */
  options?: Omit<CommonChatOptions, "model" | "messages" | "providerOptions" | "tools">;

  /** Provider-specific options (strongly typed based on adapter) */
  providerOptions?: ExtractChatProviderOptionsFromAdapter<TAdapter>;

  /** Response mode: "promise" (default), "stream", or "response" */
  as?: "promise" | "stream" | "response";
}

/**
 * Chat completion - main entry point for conversational AI
 * 
 * @example Basic usage
 * ```typescript
 * const result = await chat({
 *   adapter: openai({ apiKey: process.env.OPENAI_API_KEY }),
 *   model: "gpt-4",
 *   messages: [{ role: "user", content: "Hello!" }],
 *   options: {
 *     temperature: 0.7,
 *   }
 * });
 * ```
 * 
 * @example With provider-specific options
 * ```typescript
 * const result = await chat({
 *   adapter: openai({ apiKey: process.env.OPENAI_API_KEY }),
 *   model: "gpt-4",
 *   messages: [{ role: "user", content: "Hello!" }],
 *   options: {
 *     temperature: 0.7,
 *   },
 *   providerOptions: {
 *     reasoningEffort: "high",
 *     store: true,
 *   }
 * });
 * ```
 * 
 * @example Streaming
 * ```typescript
 * const stream = await chat({
 *   adapter: openai({ apiKey: process.env.OPENAI_API_KEY }),
 *   model: "gpt-4",
 *   messages: [{ role: "user", content: "Hello!" }],
 *   as: "stream"
 * });
 * 
 * for await (const chunk of stream) {
 *   if (chunk.type === "content") {
 *     console.log(chunk.delta);
 *   }
 * }
 * ```
 */
export async function chat<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(
  config: ChatOptions<TAdapter>
): Promise<ChatReturnType<ChatOptions<TAdapter>>> {
  const { adapter, model, messages, tools, options = {}, providerOptions, as: asOption = "promise" } = config;

  // Build the full ChatCompletionOptions
  const chatOptions: ChatCompletionOptions = {
    ...options,
    model: model as string,
    messages: messages,
    tools: tools as any,
    providerOptions: providerOptions as any,
  };

  // Route to appropriate handler based on "as" option
  if (asOption === "stream") {
    return adapter.chatStream(chatOptions) as any;
  } else if (asOption === "response") {
    const stream = adapter.chatStream(chatOptions);
    return streamToResponse(stream) as any;
  } else {
    const result = await adapter.chatCompletion(chatOptions);

    // If responseFormat is provided, parse the content as structured data
    if (options.responseFormat && result.content) {
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
}

/**
 * Standalone summarize function with type inference from adapter
 */
export async function summarize<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(
  options: Omit<SummarizationOptions, "model"> & {
    adapter: TAdapter;
    model: ExtractModelsFromAdapter<TAdapter>;
    text: string;
  }
): Promise<SummarizationResult> {
  const { adapter, model, text, ...restOptions } = options;

  return adapter.summarize({
    model: model as string,
    text,
    ...restOptions,
  });
}

/**
 * Standalone embed function with type inference from adapter
 */
export async function embed<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(
  options: Omit<EmbeddingOptions, "model"> & {
    adapter: TAdapter;
    model: ExtractModelsFromAdapter<TAdapter>;
  }
): Promise<EmbeddingResult> {
  const { adapter, model, ...restOptions } = options;

  return adapter.createEmbeddings({
    model: model as string,
    ...restOptions,
  });
}

/**
 * Standalone image generation function with type inference from adapter
 */
export async function image<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(
  options: Omit<ImageGenerationOptions, "model" | "providerOptions"> & {
    adapter: TAdapter;
    model: ExtractImageModelsFromAdapter<TAdapter>;
    prompt: string;
    providerOptions?: ExtractImageProviderOptionsFromAdapter<TAdapter>;
  }
): Promise<ImageGenerationResult> {
  const { adapter, model, prompt, providerOptions } = options;

  if (!adapter.generateImage) {
    throw new Error(`Adapter ${adapter.name} does not support image generation`);
  }

  return adapter.generateImage({
    model: model as string,
    prompt,
    providerOptions: providerOptions as any,
  });
}

/**
 * Standalone audio transcription function with type inference from adapter
 */
export async function audio<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(
  options: Omit<AudioTranscriptionOptions, "model" | "providerOptions"> & {
    adapter: TAdapter;
    model: ExtractAudioModelsFromAdapter<TAdapter>;
    file: Blob | Buffer;
    providerOptions?: ExtractAudioProviderOptionsFromAdapter<TAdapter>;
  }
): Promise<AudioTranscriptionResult> {
  const { adapter, model, file, providerOptions, ...restOptions } = options;

  if (!adapter.transcribeAudio) {
    throw new Error(`Adapter ${adapter.name} does not support audio transcription`);
  }

  return adapter.transcribeAudio({
    model: model as string,
    file,
    providerOptions: providerOptions as any,
    ...restOptions,
  });
}

/**
 * Standalone text-to-speech function with type inference from adapter
 */
export async function speak<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(
  options: Omit<TextToSpeechOptions, "model" | "providerOptions"> & {
    adapter: TAdapter;
    model: ExtractModelsFromAdapter<TAdapter>;
    input: string;
    voice: string;
    providerOptions?: ExtractChatProviderOptionsFromAdapter<TAdapter>;
  }
): Promise<TextToSpeechResult> {
  const { adapter, model, input, voice, providerOptions, ...restOptions } = options;

  if (!adapter.generateSpeech) {
    throw new Error(`Adapter ${adapter.name} does not support text-to-speech`);
  }

  return adapter.generateSpeech({
    model: model as string,
    input,
    voice,
    providerOptions: providerOptions as any,
    ...restOptions,
  });
}

/**
 * Standalone video generation function with type inference from adapter
 */
export async function video<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(
  options: Omit<VideoGenerationOptions, "model" | "providerOptions"> & {
    adapter: TAdapter;
    model: ExtractVideoModelsFromAdapter<TAdapter>;
    prompt: string;
    providerOptions?: ExtractVideoProviderOptionsFromAdapter<TAdapter>;
  }
): Promise<VideoGenerationResult> {
  const { adapter, model, prompt, providerOptions } = options;

  if (!adapter.generateVideo) {
    throw new Error(`Adapter ${adapter.name} does not support video generation`);
  }

  return adapter.generateVideo({
    model: model as string,
    prompt,
    providerOptions: providerOptions as any,
  });
}

/**
 * Helper function to convert a stream to a Response object
 */
function streamToResponse(stream: AsyncIterable<StreamChunk>): Response {
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
