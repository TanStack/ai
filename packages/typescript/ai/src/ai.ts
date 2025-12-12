/**
 * @module ai
 *
 * Unified ai function that infers its entire API from the adapter's kind.
 * Uses conditional types to ensure proper type checking based on adapter kind and options.
 */

import { activityMap } from './activities'
import type {
  AIEmbeddingOptions,
  AIImageOptions,
  AIOptionsUnion,
  AIResultUnion,
  AISummarizeOptions,
  AITextOptions,
  AnyAIAdapter,
  EmbeddingModels,
  ImageModels,
  SummarizeModels,
  TextModels,
} from './activities'
import type { TextAdapter } from './activities/text/adapter'
import type { EmbeddingAdapter } from './activities/embedding/adapter'
import type { SummarizeAdapter } from './activities/summarize/adapter'
import type { ImageAdapter } from './activities/image/adapter'
import type { z } from 'zod'
import type {
  EmbeddingResult,
  ImageGenerationResult,
  StreamChunk,
  SummarizationResult,
} from './types'

// ===========================
// Adapter Union Type
// ===========================

/** Union of all adapter types that can be passed to ai() */
export type GenerateAdapter =
  | TextAdapter<ReadonlyArray<string>, object, any, any, any>
  | EmbeddingAdapter<ReadonlyArray<string>, object>
  | SummarizeAdapter<ReadonlyArray<string>, object>
  | ImageAdapter<ReadonlyArray<string>, object, any, any>

/** Alias for backwards compatibility */
export type AnyAdapter = GenerateAdapter

// ===========================
// Local Type Aliases
// ===========================

// Alias imported types to internal names for consistency in this file
type ExtractTextModels<T> = TextModels<T>
type ExtractEmbeddingModels<T> = EmbeddingModels<T>
type ExtractSummarizeModels<T> = SummarizeModels<T>
type ExtractImageModels<T> = ImageModels<T>

// ===========================
// Options/Return Type Mapping
// ===========================

type AIOptionsFor<
  TAdapter extends AnyAIAdapter,
  TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TTextStream extends boolean = true,
  TSummarizeStream extends boolean = false,
> = TAdapter extends { kind: 'text' }
  ? AITextOptions<
    Extract<
      TAdapter,
      TextAdapter<ReadonlyArray<string>, object, any, any, any>
    >,
    TModel & ExtractTextModels<TAdapter>,
    TSchema,
    TTextStream
  >
  : TAdapter extends { kind: 'embedding' }
  ? AIEmbeddingOptions<
    Extract<TAdapter, EmbeddingAdapter<ReadonlyArray<string>, object>>,
    TModel & ExtractEmbeddingModels<TAdapter>
  >
  : TAdapter extends { kind: 'summarize' }
  ? AISummarizeOptions<
    Extract<TAdapter, SummarizeAdapter<ReadonlyArray<string>, object>>,
    TModel & ExtractSummarizeModels<TAdapter>,
    TSummarizeStream
  >
  : TAdapter extends { kind: 'image' }
  ? AIImageOptions<
    Extract<
      TAdapter,
      ImageAdapter<ReadonlyArray<string>, object, any, any>
    >,
    TModel & ExtractImageModels<TAdapter>
  >
  : never

type AIReturnFor<
  TAdapter extends AnyAIAdapter,
  TSchema extends z.ZodType | undefined = undefined,
  TTextStream extends boolean = true,
  TSummarizeStream extends boolean = false,
> = TAdapter extends { kind: 'text' }
  ? TSchema extends z.ZodType
  ? Promise<z.infer<TSchema>>
  : TTextStream extends false
  ? Promise<string>
  : AsyncIterable<StreamChunk>
  : TAdapter extends { kind: 'embedding' }
  ? Promise<EmbeddingResult>
  : TAdapter extends { kind: 'summarize' }
  ? TSummarizeStream extends true
  ? AsyncIterable<StreamChunk>
  : Promise<SummarizationResult>
  : TAdapter extends { kind: 'image' }
  ? Promise<ImageGenerationResult>
  : never

// ===========================
// AI Function
// ===========================

/**
 * Unified AI function - routes to the appropriate activity based on adapter kind.
 *
 * This is the main entry point for all AI operations. The adapter's `kind` property
 * determines which activity is executed:
 * - `'text'` → Text activity (streaming, tools, structured output)
 * - `'embedding'` → Embedding activity (vector generation)
 * - `'summarize'` → Summarize activity (text summarization)
 * - `'image'` → Image activity (image generation)
 *
 * @example Chat generation (streaming)
 * ```ts
 * import { ai } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * for await (const chunk of ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * })) {
 *   console.log(chunk)
 * }
 * ```
 *
 * @example Chat with tools (agentic)
 * ```ts
 * for await (const chunk of ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'What is the weather?' }],
 *   tools: [weatherTool]
 * })) {
 *   console.log(chunk)
 * }
 * ```
 *
 * @example Structured output (with or without tools)
 * ```ts
 * import { z } from 'zod'
 *
 * const result = await ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Generate a person' }],
 *   outputSchema: z.object({ name: z.string(), age: z.number() })
 * })
 * // result is { name: string, age: number }
 * ```
 *
 * @example Embedding generation
 * ```ts
 * import { openaiEmbed } from '@tanstack/ai-openai'
 *
 * const result = await ai({
 *   adapter: openaiEmbed(),
 *   model: 'text-embedding-3-small',
 *   input: 'Hello, world!'
 * })
 * ```
 *
 * @example Summarization
 * ```ts
 * import { openaiSummarize } from '@tanstack/ai-openai'
 *
 * const result = await ai({
 *   adapter: openaiSummarize(),
 *   model: 'gpt-4o-mini',
 *   text: 'Long text to summarize...'
 * })
 * ```
 *
 * @example Image generation
 * ```ts
 * import { openaiImage } from '@tanstack/ai-openai'
 *
 * const result = await ai({
 *   adapter: openaiImage(),
 *   model: 'dall-e-3',
 *   prompt: 'A serene mountain landscape'
 * })
 * ```
 */
export function ai<
  TAdapter extends AnyAIAdapter,
  const TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TTextStream extends boolean = true,
  TSummarizeStream extends boolean = false,
>(
  options: AIOptionsFor<
    TAdapter,
    TModel,
    TSchema,
    TTextStream,
    TSummarizeStream
  >,
): AIReturnFor<TAdapter, TSchema, TTextStream, TSummarizeStream>

// Implementation
export function ai(options: AIOptionsUnion): AIResultUnion {
  const { adapter } = options

  const handler = activityMap.get(adapter.kind)
  if (!handler) {
    throw new Error(`Unknown adapter kind: ${adapter.kind}`)
  }

  return handler(options)
}

// ===========================
// Re-exported Types
// ===========================

// Re-export adapter types
export type { TextAdapter } from './activities/text/adapter'
export type { EmbeddingAdapter } from './activities/embedding/adapter'
export type { SummarizeAdapter } from './activities/summarize/adapter'
export type { ImageAdapter } from './activities/image/adapter'

// Re-export type helpers
export type {
  TextModels,
  EmbeddingModels,
  SummarizeModels,
  ImageModels,
} from './activities'

// Re-export activity option types and legacy aliases used by the package entrypoint
export type {
  AIAdapter,
  AnyAIAdapter,
  GenerateOptions,
  TextGenerateOptions,
  EmbeddingGenerateOptions,
  SummarizeGenerateOptions,
  ImageGenerateOptions,
  GenerateTextOptions,
  GenerateEmbeddingOptions,
  GenerateSummarizeOptions,
  GenerateImageOptions,
} from './activities'
