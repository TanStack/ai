/**
 * @module generate
 *
 * Unified generate function that infers its entire API from the adapter's kind.
 * Uses function overloads with strict option types to ensure proper type checking.
 */

import type {
  ChatOptions,
  EmbeddingOptions,
  EmbeddingResult,
  ModelMessage,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '../types'
import type { ChatAdapter } from '../adapters/base-chat-adapter'
import type { EmbeddingAdapter } from '../adapters/base-embedding-adapter'
import type { SummarizeAdapter } from '../adapters/base-summarize-adapter'

// ===========================
// Adapter Union Type
// ===========================

/** Union of all adapter types that can be passed to generate() */
export type GenerateAdapter =
  | ChatAdapter<ReadonlyArray<string>, object, any, any, any>
  | EmbeddingAdapter<ReadonlyArray<string>, object>
  | SummarizeAdapter<ReadonlyArray<string>, object>

// Alias for backwards compatibility
export type AnyAdapter = GenerateAdapter

// ===========================
// Model Extraction
// ===========================

/** Extract model types from a ChatAdapter */
type ChatModels<TAdapter> =
  TAdapter extends ChatAdapter<infer M, any, any, any, any> ? M[number] : string

/** Extract model types from an EmbeddingAdapter */
type EmbeddingModels<TAdapter> =
  TAdapter extends EmbeddingAdapter<infer M, any> ? M[number] : string

/** Extract model types from a SummarizeAdapter */
type SummarizeModels<TAdapter> =
  TAdapter extends SummarizeAdapter<infer M, any> ? M[number] : string

// ===========================
// Provider Options Extraction
// ===========================

/**
 * Extract model-specific provider options from a ChatAdapter.
 * If the model has specific options defined in ModelOptions (and not just via index signature),
 * use those; otherwise fall back to base provider options.
 */
type ChatProviderOptionsForModel<TAdapter, TModel extends string> =
  TAdapter extends ChatAdapter<
    any,
    infer BaseOptions,
    infer ModelOptions,
    any,
    any
  >
    ? string extends keyof ModelOptions
      ? // ModelOptions is Record<string, unknown> or has index signature - use BaseOptions
        BaseOptions
      : // ModelOptions has explicit keys - check if TModel is one of them
        TModel extends keyof ModelOptions
        ? ModelOptions[TModel]
        : BaseOptions
    : object

/** Extract provider options from an EmbeddingAdapter */
type EmbeddingProviderOptions<TAdapter> =
  TAdapter extends EmbeddingAdapter<any, infer P> ? P : object

/** Extract provider options from a SummarizeAdapter */
type SummarizeProviderOptions<TAdapter> =
  TAdapter extends SummarizeAdapter<any, infer P> ? P : object

// ===========================
// Strict Option Types
// ===========================

/** Base options shared by all generate calls */
interface GenerateBaseOptions<TAdapter, TModel extends string> {
  adapter: TAdapter
  model: TModel
}

/** Options for chat generation */
export interface GenerateChatOptions<
  TAdapter extends ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends ChatModels<TAdapter>,
> extends GenerateBaseOptions<TAdapter & { kind: 'chat' }, TModel> {
  messages: Array<ModelMessage>
  systemPrompts?: ChatOptions['systemPrompts']
  tools?: ChatOptions['tools']
  options?: ChatOptions['options']
  providerOptions?: ChatProviderOptionsForModel<TAdapter, TModel>
  abortController?: ChatOptions['abortController']
  agentLoopStrategy?: ChatOptions['agentLoopStrategy']
  conversationId?: ChatOptions['conversationId']
}

/** Options for embedding generation */
export interface GenerateEmbeddingOptions<
  TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>,
  TModel extends EmbeddingModels<TAdapter>,
> extends GenerateBaseOptions<TAdapter & { kind: 'embedding' }, TModel> {
  input: string | Array<string>
  dimensions?: number
  providerOptions?: EmbeddingProviderOptions<TAdapter>
}

/** Options for summarize generation */
export interface GenerateSummarizeOptions<
  TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>,
  TModel extends SummarizeModels<TAdapter>,
> extends GenerateBaseOptions<TAdapter & { kind: 'summarize' }, TModel> {
  text: string
  maxLength?: number
  style?: 'bullet-points' | 'paragraph' | 'concise'
  focus?: Array<string>
  providerOptions?: SummarizeProviderOptions<TAdapter>
}

// ===========================
// Generate Function
// ===========================

/** Union of all adapter types */
type AnyGenerateAdapter =
  | (ChatAdapter<ReadonlyArray<string>, object, any, any, any> & {
      kind: 'chat'
    })
  | (EmbeddingAdapter<ReadonlyArray<string>, object> & { kind: 'embedding' })
  | (SummarizeAdapter<ReadonlyArray<string>, object> & { kind: 'summarize' })

/** Infer the correct options type based on adapter kind */
type GenerateOptionsFor<
  TAdapter extends AnyGenerateAdapter,
  TModel extends string,
> = TAdapter extends { kind: 'chat' }
  ? TAdapter extends ChatAdapter<ReadonlyArray<string>, object, any, any, any>
    ? GenerateChatOptions<TAdapter, TModel & ChatModels<TAdapter>>
    : never
  : TAdapter extends { kind: 'embedding' }
    ? TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>
      ? GenerateEmbeddingOptions<TAdapter, TModel & EmbeddingModels<TAdapter>>
      : never
    : TAdapter extends { kind: 'summarize' }
      ? TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>
        ? GenerateSummarizeOptions<TAdapter, TModel & SummarizeModels<TAdapter>>
        : never
      : never

/** Infer the return type based on adapter kind */
type GenerateReturnType<TAdapter extends AnyGenerateAdapter> =
  TAdapter extends { kind: 'chat' }
    ? AsyncIterable<StreamChunk>
    : TAdapter extends { kind: 'embedding' }
      ? Promise<EmbeddingResult>
      : TAdapter extends { kind: 'summarize' }
        ? Promise<SummarizationResult>
        : never

/**
 * Unified generate function that adapts its API based on the adapter type.
 *
 * @example Chat generation
 * ```ts
 * import { generate } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * const adapter = openaiText()
 *
 * for await (const chunk of generate({
 *   adapter,
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * })) {
 *   console.log(chunk)
 * }
 * ```
 *
 * @example Embedding generation
 * ```ts
 * import { generate } from '@tanstack/ai'
 * import { openaiEmbed } from '@tanstack/ai-openai'
 *
 * const adapter = openaiEmbed()
 *
 * const result = await generate({
 *   adapter,
 *   model: 'text-embedding-3-small',
 *   input: 'Hello, world!'
 * })
 * ```
 *
 * @example Summarization
 * ```ts
 * import { generate } from '@tanstack/ai'
 * import { openaiSummarize } from '@tanstack/ai-openai'
 *
 * const adapter = openaiSummarize()
 *
 * const result = await generate({
 *   adapter,
 *   model: 'gpt-4o-mini',
 *   text: 'Long text to summarize...'
 * })
 * ```
 */
export function generate<
  TAdapter extends AnyGenerateAdapter,
  const TModel extends string,
>(options: GenerateOptionsFor<TAdapter, TModel>): GenerateReturnType<TAdapter>

// Implementation
export function generate(
  options:
    | GenerateChatOptions<
        ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
        string
      >
    | GenerateEmbeddingOptions<
        EmbeddingAdapter<ReadonlyArray<string>, object>,
        string
      >
    | GenerateSummarizeOptions<
        SummarizeAdapter<ReadonlyArray<string>, object>,
        string
      >,
):
  | AsyncIterable<StreamChunk>
  | Promise<EmbeddingResult>
  | Promise<SummarizationResult> {
  const { adapter } = options

  switch (adapter.kind) {
    case 'chat':
      return generateChat(
        options as GenerateChatOptions<
          ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
          string
        >,
      )
    case 'embedding':
      return generateEmbedding(
        options as GenerateEmbeddingOptions<
          EmbeddingAdapter<ReadonlyArray<string>, object>,
          string
        >,
      )
    case 'summarize':
      return generateSummary(
        options as GenerateSummarizeOptions<
          SummarizeAdapter<ReadonlyArray<string>, object>,
          string
        >,
      )
    default:
      throw new Error(
        `Unknown adapter kind: ${(adapter as GenerateAdapter).kind}`,
      )
  }
}

// ===========================
// Implementation Functions
// ===========================

async function* generateChat(
  options: GenerateChatOptions<
    ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
    string
  >,
): AsyncIterable<StreamChunk> {
  const {
    adapter,
    model,
    messages,
    systemPrompts,
    tools,
    providerOptions,
    abortController,
    agentLoopStrategy,
    conversationId,
  } = options

  const chatOptions: ChatOptions = {
    model,
    messages,
    systemPrompts,
    tools,
    options: options.options,
    providerOptions,
    abortController,
    agentLoopStrategy,
    conversationId,
  }

  const stream = adapter.chatStream(chatOptions)
  for await (const chunk of stream) {
    yield chunk
  }
}

async function generateEmbedding(
  options: GenerateEmbeddingOptions<
    EmbeddingAdapter<ReadonlyArray<string>, object>,
    string
  >,
): Promise<EmbeddingResult> {
  const { adapter, model, input, dimensions } = options

  const embeddingOptions: EmbeddingOptions = {
    model,
    input,
    dimensions,
  }

  return adapter.createEmbeddings(embeddingOptions)
}

async function generateSummary(
  options: GenerateSummarizeOptions<
    SummarizeAdapter<ReadonlyArray<string>, object>,
    string
  >,
): Promise<SummarizationResult> {
  const { adapter, model, text, maxLength, style, focus } = options

  const summarizeOptions: SummarizationOptions = {
    model,
    text,
    maxLength,
    style,
    focus,
  }

  return adapter.summarize(summarizeOptions)
}

// Re-export option types for external use
export type { GenerateChatOptions as ChatGenerateOptions }
export type { GenerateEmbeddingOptions as EmbeddingGenerateOptions }
export type { GenerateSummarizeOptions as SummarizeGenerateOptions }

// Unified options type for those who need it
export type GenerateOptions<
  TAdapter extends GenerateAdapter,
  TModel extends string,
> =
  TAdapter extends ChatAdapter<ReadonlyArray<string>, object, any, any, any>
    ? GenerateChatOptions<TAdapter, TModel & ChatModels<TAdapter>>
    : TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>
      ? GenerateEmbeddingOptions<TAdapter, TModel & EmbeddingModels<TAdapter>>
      : TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>
        ? GenerateSummarizeOptions<TAdapter, TModel & SummarizeModels<TAdapter>>
        : never
