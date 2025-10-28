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

// Extract types from a single adapter
type ExtractModelsFromAdapter<T> = T extends AIAdapter<infer M, any, any, any, any, any, any, any, any, any> ? M[number] : never;
type ExtractImageModelsFromAdapter<T> = T extends AIAdapter<any, infer M, any, any, any, any, any, any, any, any> ? M[number] : never;
type ExtractAudioModelsFromAdapter<T> = T extends AIAdapter<any, any, any, infer M, any, any, any, any, any, any> ? M[number] : never;
type ExtractVideoModelsFromAdapter<T> = T extends AIAdapter<any, any, any, any, infer M, any, any, any, any, any> ? M[number] : never;
type ExtractChatProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, infer P, any, any, any, any> ? P : Record<string, any>;
type ExtractImageProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, any, infer P, any, any, any> ? P : Record<string, any>;
type ExtractAudioProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, any, any, any, infer P, any> ? P : Record<string, any>;
type ExtractVideoProviderOptionsFromAdapter<T> = T extends AIAdapter<any, any, any, any, any, any, any, any, any, infer P> ? P : Record<string, any>;

/**
 * Standalone chat function with type inference from adapter
 */
export async function chat<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>,
  TAs extends "promise" | "stream" = "promise"
>(
  options: Omit<ChatCompletionOptions, "model" | "providerOptions"> & {
    adapter: TAdapter;
    model: ExtractModelsFromAdapter<TAdapter>;
    as?: TAs;
    providerOptions?: ExtractChatProviderOptionsFromAdapter<TAdapter>;
  }
): Promise<TAs extends "stream" ? AsyncIterable<StreamChunk> : ChatCompletionResult> {
  const { adapter, model, messages, as, providerOptions, ...restOptions } = options;
  const asOption = (as || "promise") as "promise" | "stream";

  if (asOption === "stream") {
    return adapter.chatStream({
      ...restOptions,
      model: model as string,
      messages,
      providerOptions: providerOptions as any,
    }) as any;
  }

  return adapter.chatCompletion({
    ...restOptions,
    model: model as string,
    messages,
    providerOptions: providerOptions as any,
  }) as any;
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
