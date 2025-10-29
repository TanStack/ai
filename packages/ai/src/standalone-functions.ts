import type {
  AIAdapter,
  ChatCompletionOptions,
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
  ResponseFormat,
} from "./types";

// Extract types from a single adapter
type ExtractModelsFromAdapter<T> = T extends AIAdapter<infer M, any, any, any, any, any, any, any, any, any> ? M[number] : never;
type ExtractImageModelsFromAdapter<T> = T extends AIAdapter<any, infer M, any, any, any, any, any, any, any, any> ? M[number] : never;
type ExtractAudioModelsFromAdapter<T> = T extends AIAdapter<any, any, any, infer M, any, any, any, any, any, any> ? M[number] : never;
type ExtractVideoModelsFromAdapter<T> = T extends AIAdapter<any, any, any, any, infer M, any, any, any, any, any> ? M[number] : never;
type ExtractChatProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, infer P, any, any, any, any> ? P : Record<string, any>;
type ExtractImageProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, any, infer P, any, any, any> ? P : Record<string, any>;
type ExtractAudioProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, any, any, any, infer P, any> ? P : Record<string, any>;
type ExtractVideoProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, any, any, any, any, infer P> ? P : Record<string, any>;

// Base options shared across all modes
type BaseChatOptions<TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>> =
  Omit<ChatCompletionOptions, "model" | "providerOptions" | "responseFormat" | "as"> & {
    adapter: TAdapter;
    model: ExtractModelsFromAdapter<TAdapter>;
  };

// Create a discriminated union type based on the "as" property
type ChatOptionsUnion<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>,
  TOutput extends ResponseFormat<any> | undefined = undefined
> =
  | (BaseChatOptions<TAdapter> & {
    as: "stream";
    providerOptions?: ExtractChatProviderOptionsFromAdapter<TAdapter>;
  })
  | (BaseChatOptions<TAdapter> & {
    as: "response";
    providerOptions?: ExtractChatProviderOptionsFromAdapter<TAdapter>;
  })
  | (BaseChatOptions<TAdapter> & {
    as?: "promise";
    output?: TOutput;
    providerOptions?: ExtractChatProviderOptionsFromAdapter<TAdapter>;
  });

// Helper type to compute the return type based on the "as" option
type ChatReturnType<
  TOptions extends { as?: "promise" | "stream" | "response"; output?: ResponseFormat<any> }
> = TOptions["as"] extends "stream"
  ? AsyncIterable<StreamChunk>
  : TOptions["as"] extends "response"
  ? Response
  : TOptions["output"] extends ResponseFormat<infer TData>
  ? ChatCompletionResult<TData>
  : ChatCompletionResult;

/**
 * Standalone chat function with type inference from adapter
 * 
 * @param options Chat options with discriminated union on "as" property
 * @param options.adapter - AI adapter instance to use
 * @param options.as - Response mode: "promise" (default), "stream", or "response"
 * @param options.output - Optional structured output (only available with as="promise")
 * 
 * @example
 * // Promise mode with structured output
 * const result = await chat({
 *   adapter: openai(),
 *   model: 'gpt-4',
 *   messages: [...],
 *   output: { type: 'json', jsonSchema: schema }
 * });
 * 
 * @example
 * // Stream mode (output not available)
 * const stream = await chat({
 *   adapter: openai(),
 *   model: 'gpt-4',
 *   messages: [...],
 *   as: "stream"
 * });
 * 
 * @example
 * // Response mode (output not available)
 * const response = await chat({
 *   adapter: openai(),
 *   model: 'gpt-4',
 *   messages: [...],
 *   as: "response"
 * });
 */
export async function chat<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>,
  TOptions extends ChatOptionsUnion<TAdapter, any>
>(
  options: BaseChatOptions<TAdapter> & TOptions
): Promise<ChatReturnType<TOptions>> {
  const { adapter, model, messages, as, providerOptions, ...restOptions } = options;
  const asOption = (as || "promise") as "promise" | "stream" | "response";

  // Extract output if it exists (only in promise mode)
  const output = (options as any).output as ResponseFormat | undefined;
  const responseFormat = output;

  if (asOption === "stream") {
    return adapter.chatStream({
      ...restOptions,
      model: model as string,
      messages,
      responseFormat,
      providerOptions: providerOptions as any,
    }) as any;
  }

  if (asOption === "response") {
    const stream = adapter.chatStream({
      ...restOptions,
      model: model as string,
      messages,
      responseFormat,
      providerOptions: providerOptions as any,
    });
    return streamToResponse(stream) as any;
  }

  const result = await adapter.chatCompletion({
    ...restOptions,
    model: model as string,
    messages,
    responseFormat,
    providerOptions: providerOptions as any,
  });

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
