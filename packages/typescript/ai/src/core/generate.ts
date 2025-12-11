/**
 * @module ai
 *
 * Unified ai function that infers its entire API from the adapter's kind.
 * Uses conditional types to ensure proper type checking based on adapter kind and options.
 */

import type { z } from 'zod'
import type {
  ChatOptions,
  EmbeddingOptions,
  EmbeddingResult,
  ImageGenerationResult,
  ModelMessage,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '../types'
import type { ChatAdapter } from '../adapters/base-chat-adapter'
import type { EmbeddingAdapter } from '../adapters/base-embedding-adapter'
import type { SummarizeAdapter } from '../adapters/base-summarize-adapter'
import type { ImageAdapter } from '../adapters/base-image-adapter'

// ===========================
// Adapter Union Type
// ===========================

/** Union of all adapter types that can be passed to generate() */
export type GenerateAdapter =
  | ChatAdapter<ReadonlyArray<string>, object, any, any, any>
  | EmbeddingAdapter<ReadonlyArray<string>, object>
  | SummarizeAdapter<ReadonlyArray<string>, object>
  | ImageAdapter<ReadonlyArray<string>, object, any, any>

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

/** Extract model types from an ImageAdapter */
type ImageModels<TAdapter> =
  TAdapter extends ImageAdapter<infer M, any, any, any> ? M[number] : string

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

/**
 * Extract model-specific provider options from an ImageAdapter.
 * If the model has specific options defined in ModelProviderOptions (and not just via index signature),
 * use those; otherwise fall back to base provider options.
 */
type ImageProviderOptionsForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<any, infer BaseOptions, infer ModelOptions, any>
  ? string extends keyof ModelOptions
  ? // ModelOptions is Record<string, unknown> or has index signature - use BaseOptions
  BaseOptions
  : // ModelOptions has explicit keys - check if TModel is one of them
  TModel extends keyof ModelOptions
  ? ModelOptions[TModel]
  : BaseOptions
  : object

/**
 * Extract model-specific size options from an ImageAdapter.
 * If the model has specific sizes defined, use those; otherwise fall back to string.
 */
type ImageSizeForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<any, any, any, infer SizeByName>
  ? string extends keyof SizeByName
  ? // SizeByName has index signature - fall back to string
  string
  : // SizeByName has explicit keys - check if TModel is one of them
  TModel extends keyof SizeByName
  ? SizeByName[TModel]
  : string
  : string

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
  TSchema extends z.ZodType | undefined = undefined,
> extends GenerateBaseOptions<TAdapter & { kind: 'chat' }, TModel> {
  messages: Array<ModelMessage>
  systemPrompts?: ChatOptions['systemPrompts']
  tools?: ChatOptions['tools']
  options?: ChatOptions['options']
  providerOptions?: ChatProviderOptionsForModel<TAdapter, TModel>
  abortController?: ChatOptions['abortController']
  agentLoopStrategy?: ChatOptions['agentLoopStrategy']
  conversationId?: ChatOptions['conversationId']
  /**
   * Optional Zod schema for structured output.
   * When provided, the ai function will return a Promise with the parsed output
   * matching the schema type instead of an AsyncIterable stream.
   *
   * @example
   * ```ts
   * import { z } from 'zod'
   * import { ai } from '@tanstack/ai'
   * import { openaiText } from '@tanstack/ai-openai'
   *
   * const PersonSchema = z.object({
   *   name: z.string(),
   *   age: z.number()
   * })
   *
   * const result = await ai({
   *   adapter: openaiText(),
   *   model: 'gpt-4o',
   *   messages: [{ role: 'user', content: 'Generate a person' }],
   *   outputSchema: PersonSchema
   * })
   * // result is { name: string, age: number }
   * ```
   */
  outputSchema?: TSchema
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
  TStream extends boolean = false,
> extends GenerateBaseOptions<TAdapter & { kind: 'summarize' }, TModel> {
  text: string
  maxLength?: number
  style?: 'bullet-points' | 'paragraph' | 'concise'
  focus?: Array<string>
  providerOptions?: SummarizeProviderOptions<TAdapter>
  /**
   * Whether to stream the summarization result.
   * When true, returns an AsyncIterable<StreamChunk> for streaming output.
   * When false or not provided, returns a Promise<SummarizationResult>.
   *
   * @default false
   *
   * @example
   * ```ts
   * // Non-streaming (default)
   * const result = await ai({
   *   adapter: summarizeAdapter,
   *   model: 'summarize-v1',
   *   text: 'Long text to summarize...'
   * })
   * console.log(result.summary)
   *
   * // Streaming
   * for await (const chunk of ai({
   *   adapter: summarizeAdapter,
   *   model: 'summarize-v1',
   *   text: 'Long text to summarize...',
   *   stream: true
   * })) {
   *   console.log(chunk)
   * }
   * ```
   */
  stream?: TStream
}

/** Options for image generation */
export interface GenerateImageOptions<
  TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>,
  TModel extends ImageModels<TAdapter>,
> extends GenerateBaseOptions<TAdapter & { kind: 'image' }, TModel> {
  /** Text description of the desired image(s) */
  prompt: string
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: ImageSizeForModel<TAdapter, TModel>
  /** Provider-specific options for image generation */
  providerOptions?: ImageProviderOptionsForModel<TAdapter, TModel>
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
  | (ImageAdapter<ReadonlyArray<string>, object, any, any> & { kind: 'image' })

/** Infer the correct options type based on adapter kind */
type GenerateOptionsFor<
  TAdapter extends AnyGenerateAdapter,
  TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = false,
> = TAdapter extends { kind: 'chat' }
  ? TAdapter extends ChatAdapter<ReadonlyArray<string>, object, any, any, any>
  ? GenerateChatOptions<TAdapter, TModel & ChatModels<TAdapter>, TSchema>
  : never
  : TAdapter extends { kind: 'embedding' }
  ? TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>
  ? GenerateEmbeddingOptions<TAdapter, TModel & EmbeddingModels<TAdapter>>
  : never
  : TAdapter extends { kind: 'summarize' }
  ? TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>
  ? GenerateSummarizeOptions<
    TAdapter,
    TModel & SummarizeModels<TAdapter>,
    TStream
  >
  : never
  : TAdapter extends { kind: 'image' }
  ? TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>
  ? GenerateImageOptions<TAdapter, TModel & ImageModels<TAdapter>>
  : never
  : never /** Infer the return type based on adapter kind, schema, and stream */
type GenerateReturnType<
  TAdapter extends AnyGenerateAdapter,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = false,
> = TAdapter extends { kind: 'chat' }
  ? TSchema extends z.ZodType
  ? Promise<z.infer<TSchema>>
  : AsyncIterable<StreamChunk>
  : TAdapter extends { kind: 'embedding' }
  ? Promise<EmbeddingResult>
  : TAdapter extends { kind: 'summarize' }
  ? TStream extends true
  ? AsyncIterable<StreamChunk>
  : Promise<SummarizationResult>
  : TAdapter extends { kind: 'image' }
  ? Promise<ImageGenerationResult>
  : never /**
 * Unified ai function that adapts its API based on the adapter type.
 *
 * @example Chat generation
 * ```ts
 * import { ai } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * const adapter = openaiText()
 *
 * for await (const chunk of ai({
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
 * import { ai } from '@tanstack/ai'
 * import { openaiEmbed } from '@tanstack/ai-openai'
 *
 * const adapter = openaiEmbed()
 *
 * const result = await ai({
 *   adapter,
 *   model: 'text-embedding-3-small',
 *   input: 'Hello, world!'
 * })
 * ```
 *
 * @example Summarization
 * ```ts
 * import { ai } from '@tanstack/ai'
 * import { openaiSummarize } from '@tanstack/ai-openai'
 *
 * const adapter = openaiSummarize()
 *
 * const result = await ai({
 *   adapter,
 *   model: 'gpt-4o-mini',
 *   text: 'Long text to summarize...'
 * })
 * ```
 *
 * @example Structured output
 * ```ts
 * import { z } from 'zod'
 * import { ai } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * const PersonSchema = z.object({
 *   name: z.string(),
 *   age: z.number()
 * })
 *
 * const person = await ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Generate a person named John' }],
 *   outputSchema: PersonSchema
 * })
 * // person is { name: string, age: number }
 * ```
 */
export function ai<
  TAdapter extends AnyGenerateAdapter,
  const TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = false,
>(
  options: GenerateOptionsFor<TAdapter, TModel, TSchema, TStream>,
): GenerateReturnType<TAdapter, TSchema, TStream>

// Implementation
export function ai(
  options:
    | GenerateChatOptions<
      ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
      string,
      z.ZodType | undefined
    >
    | GenerateEmbeddingOptions<
      EmbeddingAdapter<ReadonlyArray<string>, object>,
      string
    >
    | GenerateSummarizeOptions<
      SummarizeAdapter<ReadonlyArray<string>, object>,
      string,
      boolean
    >
    | GenerateImageOptions<
      ImageAdapter<ReadonlyArray<string>, object, any, any>,
      string
    >,
):
  | AsyncIterable<StreamChunk>
  | Promise<EmbeddingResult>
  | Promise<SummarizationResult>
  | Promise<ImageGenerationResult>
  | Promise<unknown> {
  const { adapter } = options

  switch (adapter.kind) {
    case 'chat': {
      const chatOptions = options as GenerateChatOptions<
        ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
        string,
        z.ZodType | undefined
      >

      // If outputSchema is provided, return structured output
      if (chatOptions.outputSchema) {
        return generateStructuredChat(
          chatOptions as GenerateChatOptions<
            ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
            string,
            z.ZodType
          >,
        )
      }

      // Otherwise return the stream
      return generateChat(chatOptions)
    }
    case 'embedding':
      return generateEmbedding(
        options as GenerateEmbeddingOptions<
          EmbeddingAdapter<ReadonlyArray<string>, object>,
          string
        >,
      )
    case 'summarize': {
      const summarizeOptions = options as GenerateSummarizeOptions<
        SummarizeAdapter<ReadonlyArray<string>, object>,
        string,
        boolean
      >

      // If stream is true, return streaming summary
      if (summarizeOptions.stream) {
        return generateSummaryStream(
          summarizeOptions as GenerateSummarizeOptions<
            SummarizeAdapter<ReadonlyArray<string>, object>,
            string,
            true
          >,
        )
      }

      // Otherwise return the promise
      return generateSummary(summarizeOptions)
    }
    case 'image': {
      const imageOptions = options as GenerateImageOptions<
        ImageAdapter<ReadonlyArray<string>, object, any, any>,
        string
      >

      return generateImage(imageOptions)
    }
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
    string,
    z.ZodType | undefined
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

/**
 * Generate structured output by collecting the stream and parsing with the schema.
 * When outputSchema is provided, we collect all text content from the stream,
 * then parse it as JSON and validate against the schema.
 */
async function generateStructuredChat<TSchema extends z.ZodType>(
  options: GenerateChatOptions<
    ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
    string,
    TSchema
  >,
): Promise<z.infer<TSchema>> {
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
    outputSchema,
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

  // Collect all text content from the stream
  let fullContent = ''
  const stream = adapter.chatStream(chatOptions)

  for await (const chunk of stream) {
    if (chunk.type === 'content') {
      // Use the accumulated content from the final chunk
      fullContent = chunk.content
    }
  }

  // Parse the collected content as JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(fullContent)
  } catch {
    throw new Error(
      `Failed to parse structured output as JSON. Content: ${fullContent.slice(0, 200)}${fullContent.length > 200 ? '...' : ''}`,
    )
  }

  // Validate against the schema
  if (!outputSchema) {
    throw new Error('outputSchema is required for structured output')
  }

  const result = outputSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Structured output validation failed: ${result.error.message}`,
    )
  }

  return result.data
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
    string,
    boolean
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

/**
 * Generate streaming summary by calling summarize and yielding the result as stream chunks.
 * This wraps the non-streaming summarize into a streaming interface.
 */
async function* generateSummaryStream(
  options: GenerateSummarizeOptions<
    SummarizeAdapter<ReadonlyArray<string>, object>,
    string,
    true
  >,
): AsyncIterable<StreamChunk> {
  const { adapter, model, text, maxLength, style, focus } = options

  const summarizeOptions: SummarizationOptions = {
    model,
    text,
    maxLength,
    style,
    focus,
  }

  const result = await adapter.summarize(summarizeOptions)

  // Yield content chunk with the summary
  yield {
    type: 'content',
    id: result.id,
    model: result.model,
    timestamp: Date.now(),
    delta: result.summary,
    content: result.summary,
    role: 'assistant',
  }

  // Yield done chunk
  yield {
    type: 'done',
    id: result.id,
    model: result.model,
    timestamp: Date.now(),
    finishReason: 'stop',
    usage: result.usage,
  }
}

/**
 * Generate image from a prompt.
 * Returns a promise with all generated images.
 */
async function generateImage(
  options: GenerateImageOptions<
    ImageAdapter<ReadonlyArray<string>, object, any, any>,
    string
  >,
): Promise<ImageGenerationResult> {
  const { adapter, ...rest } = options

  return adapter.generateImages(rest)
}

// Re-export option types for external use
export type { GenerateChatOptions as ChatGenerateOptions }
export type { GenerateEmbeddingOptions as EmbeddingGenerateOptions }
export type { GenerateSummarizeOptions as SummarizeGenerateOptions }
export type { GenerateImageOptions as ImageGenerateOptions }

// Unified options type for those who need it
export type GenerateOptions<
  TAdapter extends GenerateAdapter,
  TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = false,
> =
  TAdapter extends ChatAdapter<ReadonlyArray<string>, object, any, any, any>
  ? GenerateChatOptions<TAdapter, TModel & ChatModels<TAdapter>, TSchema>
  : TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>
  ? GenerateEmbeddingOptions<TAdapter, TModel & EmbeddingModels<TAdapter>>
  : TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>
  ? GenerateSummarizeOptions<
    TAdapter,
    TModel & SummarizeModels<TAdapter>,
    TStream
  >
  : TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>
  ? GenerateImageOptions<TAdapter, TModel & ImageModels<TAdapter>>
  : never
