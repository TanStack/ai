import type {
  AIAdapter,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  EmbeddingOptions,
  EmbeddingResult,
  ChatOptions,
  ChatStreamOptionsUnion,
} from "./types";
import { AIEventEmitter, DefaultAIEventEmitter } from "./events.js";
import { ChatEngine } from "./chat-engine.js";

// Extract types from adapter (updated to 5 generics)
type ExtractModelsFromAdapter<T> = T extends AIAdapter<
  infer M,
  any,
  any,
  any,
  any
>
  ? M[number]
  : never;

function createEmitter(): AIEventEmitter {
  return new DefaultAIEventEmitter();
}

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
export async function* chat<
  TAdapter extends AIAdapter<any, any, any, any, any>
>(options: ChatStreamOptionsUnion<TAdapter>): AsyncIterable<StreamChunk> {
  const { adapter, ...chatOptions } = options;
  const emitter = createEmitter();

  const engine = new ChatEngine({
    adapter,
    events: emitter,
    params: chatOptions as ChatOptions<
      string,
      Record<string, any>,
      undefined,
      Record<string, any>
    >,
  });

  for await (const chunk of engine.chat()) {
    yield chunk;
  }
}

/**
 * Standalone summarize function with type inference from adapter
 */
export async function summarize<
  TAdapter extends AIAdapter<any, any, any, any, any>
>(
  options: Omit<SummarizationOptions, "model"> & {
    adapter: TAdapter;
    model: ExtractModelsFromAdapter<TAdapter>;
    text: string;
  }
): Promise<SummarizationResult> {
  const { adapter, model, ...restOptions } = options;

  return adapter.summarize({
    ...restOptions,
    model: model as string,
  });
}

/**
 * Standalone embed function with type inference from adapter
 */
export async function embed<
  TAdapter extends AIAdapter<any, any, any, any, any>
>(
  options: Omit<EmbeddingOptions, "model"> & {
    adapter: TAdapter;
    model: ExtractModelsFromAdapter<TAdapter>;
  }
): Promise<EmbeddingResult> {
  const { adapter, model, ...restOptions } = options;
  return adapter.createEmbeddings({
    ...restOptions,
    model: model as string,
  });
}
