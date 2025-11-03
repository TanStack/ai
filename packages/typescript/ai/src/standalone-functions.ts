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
} from "./types";
import { ai as AI } from "./ai";

// Extract types from adapter
type ExtractModelsFromAdapter<T> = T extends AIAdapter<
  infer M,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? M[number]
  : never;
type ExtractImageModelsFromAdapter<T> = T extends AIAdapter<
  any,
  infer M,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? M[number]
  : never;
type ExtractAudioModelsFromAdapter<T> = T extends AIAdapter<
  any,
  any,
  any,
  infer M,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? M[number]
  : never;
type ExtractVideoModelsFromAdapter<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  infer M,
  any,
  any,
  any,
  any,
  any
>
  ? M[number]
  : never;
type ExtractChatProviderOptionsFromAdapter<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  any,
  infer P,
  any,
  any,
  any,
  any
>
  ? P
  : Record<string, any>;
type ExtractImageProviderOptionsFromAdapter<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  any,
  any,
  infer P,
  any,
  any,
  any
>
  ? P
  : Record<string, any>;
type ExtractAudioProviderOptionsFromAdapter<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer P,
  any
>
  ? P
  : Record<string, any>;
type ExtractVideoProviderOptionsFromAdapter<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  infer P
>
  ? P
  : Record<string, any>;

// Chat streaming options
type ChatStreamOptions<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
> = Omit<
  ChatCompletionOptions,
  "model" | "providerOptions" | "responseFormat"
> & {
  adapter: TAdapter;
  model: ExtractModelsFromAdapter<TAdapter>;
  providerOptions?: ExtractChatProviderOptionsFromAdapter<TAdapter>;
};

// Chat completion options with optional structured output
type ChatCompletionOptionsWithAdapter<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>,
  TOutput extends ResponseFormat<any> | undefined = undefined
> = Omit<
  ChatCompletionOptions,
  "model" | "providerOptions" | "responseFormat"
> & {
  adapter: TAdapter;
  model: ExtractModelsFromAdapter<TAdapter>;
  output?: TOutput;
  providerOptions?: ExtractChatProviderOptionsFromAdapter<TAdapter>;
};

// Helper type for chatCompletion return type
type ChatCompletionReturnType<TOutput extends ResponseFormat<any> | undefined> =
  TOutput extends ResponseFormat<infer TData>
    ? ChatCompletionResult<TData>
    : ChatCompletionResult;

/**
 * Standalone chat streaming function with type inference from adapter
 * Returns an async iterable of StreamChunks for streaming responses
 * Includes automatic tool execution loop
 *
 * @param options Chat options
 * @param options.adapter - AI adapter instance to use
 * @param options.model - Model name (autocompletes based on adapter)
 * @param options.messages - Conversation messages
 * @param options.tools - Optional tools for function calling (auto-executed)
 * @param options.agentLoopStrategy - Optional strategy for controlling tool execution loop
 *
 * @example
 * ```typescript
 * const stream = chat({
 *   adapter: openai(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   tools: [weatherTool], // Optional: auto-executed when called
 * });
 * ```
 *
 * for await (const chunk of stream) {
 *   if (chunk.type === 'content') {
 *     console.log(chunk.delta);
 *   }
 * }
 * ```
 */
export function chat<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(options: ChatStreamOptions<TAdapter>): AsyncIterable<StreamChunk> {
  const { adapter, ...restOptions } = options;
  const aiInstance = new AI({ adapter });
  return aiInstance.chat(restOptions as any);
}

/**
 * Standalone chat completion function with type inference from adapter
 * Returns a promise with optional structured output
 * Does NOT include automatic tool execution loop
 *
 * @param options Chat completion options
 * @param options.adapter - AI adapter instance to use
 * @param options.model - Model name (autocompletes based on adapter)
 * @param options.messages - Conversation messages
 * @param options.output - Optional structured output format
 *
 * @example
 * ```typescript
 * // Promise mode without structured output
 * const result = await chatCompletion({
 *   adapter: openai(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * // Promise mode with structured output
 * const result = await chatCompletion({
 *   adapter: openai(),
 *   model: 'gpt-4o',
 *   messages: [...],
 *   output: responseFormat({ type: 'json_schema', json_schema: {...} })
 * });
 * console.log(result.data); // Typed based on schema
 * ```
 */
export async function chatCompletion<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>,
  TOutput extends ResponseFormat<any> | undefined = undefined
>(
  options: ChatCompletionOptionsWithAdapter<TAdapter, TOutput>
): Promise<ChatCompletionReturnType<TOutput>> {
  const { adapter, ...restOptions } = options;
  const aiInstance = new AI({ adapter });
  return aiInstance.chatCompletion(restOptions as any) as any;
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
    throw new Error(
      `Adapter ${adapter.name} does not support image generation`
    );
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
    throw new Error(
      `Adapter ${adapter.name} does not support audio transcription`
    );
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
  const { adapter, model, input, voice, providerOptions, ...restOptions } =
    options;

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
    throw new Error(
      `Adapter ${adapter.name} does not support video generation`
    );
  }

  return adapter.generateVideo({
    model: model as string,
    prompt,
    providerOptions: providerOptions as any,
  });
}
