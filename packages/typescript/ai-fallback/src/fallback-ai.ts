import type {
  ChatCompletionOptions,
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
  Tool,
  ResponseFormat,
} from "@tanstack/ai";
import type { BoundAI } from "./bound-ai";
import type { ChatCompletionReturnType, FallbackConfig } from "./types";

/**
 * FallbackAI - Wraps multiple BoundAI instances and tries them in sequence
 * 
 * When a method is called, it tries the first BoundAI instance. If it fails,
 * it automatically tries the next one, and so on, until one succeeds or all fail.
 */
export class FallbackAI {
  private instances: BoundAI<any>[];
  private config: FallbackConfig;

  constructor(instances: BoundAI<any>[], config: FallbackConfig = {}) {
    if (instances.length === 0) {
      throw new Error("At least one AI instance is required for fallback");
    }
    this.instances = instances;
    this.config = config;
  }

  /**
   * Try multiple adapters in order until one succeeds
   */
  private async tryWithFallback<TResult>(
    operation: (instance: BoundAI<any>) => Promise<TResult>,
    operationName: string
  ): Promise<TResult> {
    const errors: Array<{ adapter: string; error: Error }> = [];

    for (const instance of this.instances) {
      try {
        return await operation(instance);
      } catch (error: any) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({
          adapter: instance.adapterName,
          error: err,
        });

        // Call error handler if provided
        if (this.config.onError) {
          this.config.onError(instance.adapterName, err);
        }

        // Check if we should stop trying
        if (this.config.stopOnError && this.config.stopOnError(err)) {
          throw err;
        }

        // Log warning
        console.warn(
          `[AI Fallback] Adapter "${instance.adapterName}" failed for ${operationName}:`,
          err.message
        );
      }
    }

    // All adapters failed, throw comprehensive error
    const errorMessage = errors
      .map((e) => `  - ${e.adapter}: ${e.error.message}`)
      .join("\n");
    throw new Error(
      `All adapters failed for ${operationName}:\n${errorMessage}`
    );
  }

  /**
   * Try multiple adapters in order until one succeeds (async generator version)
   */
  private async *tryStreamWithFallback<TChunk>(
    operation: (instance: BoundAI<any>) => AsyncIterable<TChunk>,
    operationName: string
  ): AsyncIterable<TChunk> {
    const errors: Array<{ adapter: string; error: Error }> = [];

    for (const instance of this.instances) {
      try {
        for await (const chunk of operation(instance)) {
          yield chunk;
        }
        // If we got here, the stream completed successfully
        return;
      } catch (error: any) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({
          adapter: instance.adapterName,
          error: err,
        });

        // Call error handler if provided
        if (this.config.onError) {
          this.config.onError(instance.adapterName, err);
        }

        // Check if we should stop trying
        if (this.config.stopOnError && this.config.stopOnError(err)) {
          throw err;
        }

        // Log warning
        console.warn(
          `[AI Fallback] Adapter "${instance.adapterName}" failed for ${operationName}:`,
          err.message
        );
      }
    }

    // All adapters failed
    const errorMessage = errors
      .map((e) => `  - ${e.adapter}: ${e.error.message}`)
      .join("\n");
    throw new Error(
      `All adapters failed for ${operationName}:\n${errorMessage}`
    );
  }

  /**
   * Stream a chat conversation with automatic tool execution
   */
  async *chat(
    options: Omit<ChatCompletionOptions, "model" | "providerOptions" | "responseFormat"> & {
      messages: ChatCompletionOptions["messages"];
      tools?: ReadonlyArray<Tool>;
      systemPrompts?: string[];
      providerOptions?: Record<string, any>;
    }
  ): AsyncIterable<StreamChunk> {
    yield* this.tryStreamWithFallback(
      (instance) => instance.chat(options),
      "chat"
    );
  }

  /**
   * Complete a chat conversation with optional structured output
   */
  async chatCompletion<
    TOptions extends {
      output?: ResponseFormat<any>;
      providerOptions?: Record<string, any>;
    }
  >(
    options: Omit<ChatCompletionOptions, "model" | "providerOptions" | "responseFormat"> & {
      messages: ChatCompletionOptions["messages"];
      tools?: ReadonlyArray<Tool>;
      systemPrompts?: string[];
    } & TOptions
  ): Promise<ChatCompletionReturnType<TOptions>> {
    return this.tryWithFallback(
      (instance) => instance.chatCompletion(options),
      "chatCompletion"
    );
  }

  /**
   * Summarize text
   */
  async summarize(
    options: Omit<SummarizationOptions, "model"> & {
      text: string;
    }
  ): Promise<SummarizationResult> {
    return this.tryWithFallback(
      (instance) => instance.summarize(options),
      "summarize"
    );
  }

  /**
   * Generate embeddings
   */
  async embed(
    options: Omit<EmbeddingOptions, "model"> & {
      input: string | string[];
    }
  ): Promise<EmbeddingResult> {
    return this.tryWithFallback(
      (instance) => instance.embed(options),
      "embed"
    );
  }

  /**
   * Generate an image
   */
  async image(
    options: Omit<ImageGenerationOptions, "model" | "providerOptions"> & {
      prompt: string;
      providerOptions?: Record<string, any>;
    }
  ): Promise<ImageGenerationResult> {
    return this.tryWithFallback(
      (instance) => instance.image(options),
      "image"
    );
  }

  /**
   * Transcribe audio
   */
  async audio(
    options: Omit<AudioTranscriptionOptions, "model" | "providerOptions"> & {
      file: Blob | Buffer;
      providerOptions?: Record<string, any>;
    }
  ): Promise<AudioTranscriptionResult> {
    return this.tryWithFallback(
      (instance) => instance.audio(options),
      "audio"
    );
  }

  /**
   * Generate speech from text
   */
  async speak(
    options: Omit<TextToSpeechOptions, "model" | "providerOptions"> & {
      input: string;
      voice: string;
      providerOptions?: Record<string, any>;
    }
  ): Promise<TextToSpeechResult> {
    return this.tryWithFallback(
      (instance) => instance.speak(options),
      "speak"
    );
  }

  /**
   * Generate a video
   */
  async video(
    options: Omit<VideoGenerationOptions, "model" | "providerOptions"> & {
      prompt: string;
      providerOptions?: Record<string, any>;
    }
  ): Promise<VideoGenerationResult> {
    return this.tryWithFallback(
      (instance) => instance.video(options),
      "video"
    );
  }
}

