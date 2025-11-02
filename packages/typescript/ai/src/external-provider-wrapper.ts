/**
 * External Provider Adapter Wrapper
 * 
 * This utility allows you to use external AI SDK providers with our AI system.
 * It wraps provider functions (like those from Vercel AI SDK) and converts them
 * to our BaseAdapter format while maintaining full type safety and automatically
 * inferring available models from the provider function's parameter types.
 * 
 * @example
 * ```typescript
 * import { openai } from '@ai-sdk/openai';
 * import { wrapExternalProvider } from '@tanstack/ai';
 * 
 * // Create adapter - models are automatically inferred from openai('modelId') parameter type!
 * const adapter = wrapExternalProvider(openai);
 * 
 * // Use with our AI class
 * const ai = new AI({
 *   adapters: { openai: adapter },
 * });
 * 
 * // Model types are automatically inferred from the provider function
 * await ai.chat({
 *   adapter: 'openai',
 *   model: 'gpt-4o', // ✅ Autocomplete from openai() function's parameter type!
 *   messages: [...],
 * });
 * ```
 */

import type {
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatCompletionChunk,
  TextGenerationOptions,
  TextGenerationResult,
  SummarizationOptions,
  SummarizationResult,
  EmbeddingOptions,
  EmbeddingResult,
  ImageGenerationOptions,
  ImageGenerationResult,
  ModelMessage,
  StreamChunk,
} from "./types";
import { BaseAdapter } from "./base-adapter";

// External provider types (compatible with Vercel AI SDK and similar)
// These types work with both v2 and v3 specification versions
export interface ExternalLanguageModel {
  readonly specificationVersion?: 'v3' | 'v2' | string;
  readonly provider: string;
  readonly modelId: string;
  doGenerate(options: any): PromiseLike<any>;
  doStream(options: any): PromiseLike<any>;
}

export interface ExternalEmbeddingModel {
  readonly specificationVersion?: 'v3' | 'v2' | string;
  readonly provider: string;
  readonly modelId: string;
  readonly maxEmbeddingsPerCall?: number;
  readonly supportsParallelCalls?: boolean;
  doEmbed(options: any): PromiseLike<any>;
}

export interface ExternalImageModel {
  readonly specificationVersion?: 'v3' | 'v2' | string;
  readonly provider: string;
  readonly modelId: string;
  doGenerate(options: any): PromiseLike<any>;
}

// Internal helper to extract the raw model parameter from a callable provider shape
type ExtractRawModelId<T> = T extends {
  (modelId: infer M, ...args: any[]): any;
}
  ? M
  : T extends (modelId: infer M, ...args: any[]) => any
  ? M
  : never;

// Remove "catch-all" string signatures (e.g. `string`, `string & {}`) while keeping literal unions
type StripGenericString<T> = T extends string
  ? string extends T
  ? never
  : T
  : never;

// Extract the literal model id union. Falls back to `string` if nothing more specific can be derived.
type ExtractModelId<T> = ExtractRawModelId<T> extends infer Raw
  ? [Raw] extends [never]
  ? string
  : StripGenericString<Raw> extends infer Narrow
  ? [Narrow] extends [never]
  ? Raw extends string
  ? string
  : string
  : Narrow
  : string
  : string;

/**
 * Wraps an external AI SDK provider function to work with our AI class.
 * Automatically infers available models from the provider function's parameter type.
 * 
 * @example
 * ```typescript
 * import { openai } from '@ai-sdk/openai';
 * 
 * // Basic usage - models are automatically inferred
 * const adapter = wrapExternalProvider(openai);
 * 
 * // With typed provider options
 * import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
 * const adapter = wrapExternalProvider<OpenAIResponsesProviderOptions>()(openai);
 * ```
 */
// Overload 1: Curried form with provider options type
export function wrapExternalProvider<
  TChatProviderOptions extends Record<string, any>
>(): <TProvider extends { (modelId: any, ...args: any[]): ExternalLanguageModel }>(
  provider: TProvider
) => BaseAdapter<
  readonly [ExtractModelId<TProvider>],
  readonly string[],
  readonly string[],
  readonly string[],
  readonly string[],
  TChatProviderOptions,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>
>;

// Overload 2: Direct form without provider options type
export function wrapExternalProvider<
  TProvider extends { (modelId: any, ...args: any[]): ExternalLanguageModel }
>(
  provider: TProvider
): BaseAdapter<
  readonly [ExtractModelId<TProvider>],
  readonly string[],
  readonly string[],
  readonly string[],
  readonly string[],
  Record<string, any>,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>
>;

// Implementation
export function wrapExternalProvider<
  TChatProviderOptions extends Record<string, any> = Record<string, any>,
  TProvider extends { (modelId: any, ...args: any[]): ExternalLanguageModel } = any
>(provider?: TProvider): any {
  if (provider) {
    // Direct call
    const providerName = (provider as any).name || 'external';
    const models = [] as unknown as readonly [ExtractModelId<TProvider>];
    const imageModels = [] as unknown as readonly string[];
    const embeddingModels = [] as unknown as readonly string[];
    const audioModels = [] as unknown as readonly string[];
    const videoModels = [] as unknown as readonly string[];

    return new ExternalAdapterWrapper<
      readonly [ExtractModelId<TProvider>],
      readonly string[],
      readonly string[],
      readonly string[],
      readonly string[],
      Record<string, any>,
      Record<string, any>,
      Record<string, any>,
      Record<string, any>,
      Record<string, any>
    >(
      provider,
      providerName,
      models,
      imageModels,
      embeddingModels,
      audioModels,
      videoModels
    ) as any;
  } else {
    // Curried call
    return <TProv extends (modelId: any, ...args: any[]) => ExternalLanguageModel>(
      prov: TProv
    ) => {
      const providerName = (prov as any).name || 'external';
      const models = [] as unknown as readonly [ExtractModelId<TProv>];
      const imageModels = [] as unknown as readonly string[];
      const embeddingModels = [] as unknown as readonly string[];
      const audioModels = [] as unknown as readonly string[];
      const videoModels = [] as unknown as readonly string[];

      return new ExternalAdapterWrapper<
        readonly [ExtractModelId<TProv>],
        readonly string[],
        readonly string[],
        readonly string[],
        readonly string[],
        TChatProviderOptions,
        Record<string, any>,
        Record<string, any>,
        Record<string, any>,
        Record<string, any>
      >(
        prov,
        providerName,
        models,
        imageModels,
        embeddingModels,
        audioModels,
        videoModels
      ) as any;
    };
  }
}

class ExternalAdapterWrapper<
  TChatModels extends readonly string[],
  TImageModels extends readonly string[],
  TEmbeddingModels extends readonly string[],
  TAudioModels extends readonly string[],
  TVideoModels extends readonly string[],
  TChatProviderOptions extends Record<string, any>,
  TImageProviderOptions extends Record<string, any>,
  TEmbeddingProviderOptions extends Record<string, any>,
  TAudioProviderOptions extends Record<string, any>,
  TVideoProviderOptions extends Record<string, any>
> extends BaseAdapter<
  TChatModels,
  TImageModels,
  TEmbeddingModels,
  TAudioModels,
  TVideoModels,
  TChatProviderOptions,
  TImageProviderOptions,
  TEmbeddingProviderOptions,
  TAudioProviderOptions,
  TVideoProviderOptions
> {
  name: string;
  models: TChatModels;
  imageModels?: TImageModels;
  embeddingModels?: TEmbeddingModels;
  audioModels?: TAudioModels;
  videoModels?: TVideoModels;

  private provider: (modelId: any, ...args: any[]) => ExternalLanguageModel;

  constructor(
    provider: (modelId: any, ...args: any[]) => ExternalLanguageModel,
    name: string,
    models: TChatModels,
    imageModels: TImageModels,
    embeddingModels: TEmbeddingModels,
    audioModels: TAudioModels,
    videoModels: TVideoModels
  ) {
    super({});
    this.provider = provider;
    this.name = name;
    this.models = models;
    this.imageModels = imageModels.length > 0 ? imageModels : undefined;
    this.embeddingModels = embeddingModels.length > 0 ? embeddingModels : undefined;
    this.audioModels = audioModels.length > 0 ? audioModels : undefined;
    this.videoModels = videoModels.length > 0 ? videoModels : undefined;
  }

  // Convert our ModelMessage format to external provider format
  private convertMessages(messages: ModelMessage[]): any[] {
    return messages.map(msg => {
      if (msg.role === 'system') {
        return { role: 'system', content: msg.content };
      }
      if (msg.role === 'user') {
        // Vercel AI SDK expects content as array of parts for user messages
        return {
          role: 'user',
          content: typeof msg.content === 'string'
            ? [{ type: 'text', text: msg.content }]
            : msg.content
        };
      }
      if (msg.role === 'assistant') {
        const result: any = { role: 'assistant' };
        if (msg.content) result.content = msg.content;
        if (msg.toolCalls) {
          result.toolCalls = msg.toolCalls.map(tc => ({
            type: 'function',
            id: tc.id,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }));
        }
        return result;
      }
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          toolCallId: msg.toolCallId,
          content: msg.content,
        };
      }
      return msg;
    });
  }

  // Convert tools to external provider format
  private convertTools(tools?: any[]): any[] | undefined {
    if (!tools) return undefined;
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  async chatCompletion(
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    // Call provider function with model ID to get the language model
    const model = this.provider(options.model || '');

    const externalMessages = this.convertMessages(options.messages);
    const externalTools = this.convertTools(options.tools);

    const result = await model.doGenerate({
      inputFormat: 'messages',
      mode: {
        type: 'regular',
        tools: externalTools,
      },
      prompt: externalMessages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      stopSequences: options.stopSequences,
      ...options.providerOptions,
    });

    // Convert external provider response to our format
    const modelId = options.model || '';
    const id = `${this.name}-${Date.now()}`;

    const response: ChatCompletionResult = {
      id,
      model: modelId,
      role: 'assistant' as const,
      content: result.text || null,
      finishReason: result.finishReason === 'stop' ? 'stop' :
        result.finishReason === 'length' ? 'length' :
          result.finishReason === 'tool-calls' ? 'tool_calls' :
            result.finishReason === 'content-filter' ? 'content_filter' : 'stop',
      usage: {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      },
      toolCalls: result.toolCalls?.map((tc: any) => ({
        id: tc.toolCallId,
        type: 'function' as const,
        function: {
          name: tc.toolName,
          arguments: JSON.stringify(tc.args),
        },
      })),
    };

    return response;
  }

  async *chatCompletionStream(
    options: ChatCompletionOptions
  ): AsyncIterable<ChatCompletionChunk> {
    const model = this.provider(options.model || '');

    const externalMessages = this.convertMessages(options.messages);
    const externalTools = this.convertTools(options.tools);

    const streamResult = await model.doStream({
      inputFormat: 'messages',
      mode: {
        type: 'regular',
        tools: externalTools,
      },
      prompt: externalMessages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      stopSequences: options.stopSequences,
      ...options.providerOptions,
    });

    const modelId = options.model || '';
    const id = `${this.name}-${Date.now()}`;
    let accumulatedContent = '';

    // Stream the response
    for await (const chunk of streamResult.stream) {
      if (chunk.type === 'text-delta') {
        accumulatedContent += chunk.textDelta;
        yield {
          id,
          model: modelId,
          content: accumulatedContent,
          role: 'assistant' as const,
        };
      }
    }
  }

  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncIterable<StreamChunk> {
    const model = this.provider(options.model || '');

    const externalMessages = this.convertMessages(options.messages);
    const externalTools = this.convertTools(options.tools);

    const streamResult = await model.doStream({
      inputFormat: 'messages',
      mode: {
        type: 'regular',
        tools: externalTools,
      },
      prompt: externalMessages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      stopSequences: options.stopSequences,
      ...options.providerOptions,
    });

    const modelId = options.model || '';
    const id = `${this.name}-${Date.now()}`;
    const timestamp = Date.now();
    let accumulatedContent = '';

    // Stream the response
    for await (const chunk of streamResult.stream) {
      if (chunk.type === 'text-delta') {
        accumulatedContent += chunk.textDelta;
        yield {
          type: 'content' as const,
          id,
          model: modelId,
          timestamp,
          delta: chunk.textDelta,
          content: accumulatedContent,
          role: 'assistant' as const,
        };
      } else if (chunk.type === 'tool-call-delta') {
        yield {
          type: 'tool_call' as const,
          id,
          model: modelId,
          timestamp,
          toolCall: {
            id: chunk.toolCallId,
            type: 'function' as const,
            function: {
              name: chunk.toolName || '',
              arguments: chunk.argsTextDelta || '',
            },
          },
          index: 0,
        };
      } else if (chunk.type === 'finish') {
        yield {
          type: 'done' as const,
          id,
          model: modelId,
          timestamp,
          finishReason: chunk.finishReason === 'stop' ? 'stop' :
            chunk.finishReason === 'length' ? 'length' :
              chunk.finishReason === 'tool-calls' ? 'tool_calls' :
                chunk.finishReason === 'content-filter' ? 'content_filter' : null,
          usage: chunk.usage ? {
            promptTokens: chunk.usage.promptTokens || 0,
            completionTokens: chunk.usage.completionTokens || 0,
            totalTokens: chunk.usage.totalTokens || 0,
          } : undefined,
        };
      }
    }
  }

  async generateText(
    options: TextGenerationOptions
  ): Promise<TextGenerationResult> {
    const result = await this.chatCompletion({
      model: options.model,
      messages: [{ role: 'user', content: options.prompt }],
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      stopSequences: options.stopSequences,
      providerOptions: options.providerOptions,
    });

    return {
      id: result.id,
      model: result.model,
      text: result.content || '',
      finishReason: (result.finishReason === 'tool_calls' || result.finishReason === 'content_filter') ? null : result.finishReason,
      usage: result.usage,
    };
  }

  async *generateTextStream(
    options: TextGenerationOptions
  ): AsyncIterable<string> {
    const stream = this.chatStream({
      model: options.model,
      messages: [{ role: 'user', content: options.prompt }],
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      stopSequences: options.stopSequences,
      stream: true,
      providerOptions: options.providerOptions,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        yield chunk.delta;
      }
    }
  }

  async summarize(
    options: SummarizationOptions
  ): Promise<SummarizationResult> {
    const systemPrompt = `Summarize the following text${options.maxLength ? ` in ${options.maxLength} words or less` : ''}${options.style ? ` in ${options.style} style` : ''}${options.focus ? `. Focus on: ${options.focus.join(', ')}` : ''}.`;

    const result = await this.chatCompletion({
      model: options.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        { role: 'user', content: options.text },
      ],
    });

    return {
      id: result.id,
      model: result.model,
      summary: result.content || '',
      usage: result.usage,
    };
  }

  async createEmbeddings(
    // @ts-expect-error - Not yet implemented
    options: EmbeddingOptions
  ): Promise<EmbeddingResult> {
    throw new Error(`Provider "${this.name}" embeddings not yet supported by wrapper. Use provider-specific adapter.`);
  }

  async generateImage(
    // @ts-expect-error - Not yet implemented
    options: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    throw new Error(`Provider "${this.name}" image generation not yet supported by wrapper. Use provider-specific adapter.`);
  }
}
