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
  AIVideoCreateOptions,
  AIVideoStatusOptions,
  AIVideoUrlOptions,
  EmbeddingModels,
  ImageModels,
  SummarizeModels,
  TextModels,
  VideoModels,
} from './activities'
import type { TextAdapter } from './activities/text/adapter'
import type { EmbeddingAdapter } from './activities/embedding/adapter'
import type { SummarizeAdapter } from './activities/summarize/adapter'
import type { ImageAdapter } from './activities/image/adapter'
import type { VideoAdapter } from './activities/video/adapter'
import type { z } from 'zod'
import type {
  EmbeddingResult,
  ImageGenerationResult,
  StreamChunk,
  SummarizationResult,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
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
  | VideoAdapter<ReadonlyArray<string>, object>

/** Alias for backwards compatibility */
export type AnyAdapter = GenerateAdapter

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
 * - `'video'` → Video activity (video generation via jobs/polling) [experimental]
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
 *
 * @example Video generation (experimental)
 * ```ts
 * import { openaiVideo } from '@tanstack/ai-openai'
 *
 * // Create a video job
 * const { jobId } = await ai({
 *   adapter: openaiVideo(),
 *   model: 'sora-2',
 *   prompt: 'A cat chasing a dog'
 * })
 *
 * // Poll for status
 * const status = await ai({
 *   adapter: openaiVideo(),
 *   model: 'sora-2',
 *   jobId,
 *   request: 'status'
 * })
 *
 * // Get video URL when complete
 * const { url } = await ai({
 *   adapter: openaiVideo(),
 *   model: 'sora-2',
 *   jobId,
 *   request: 'url'
 * })
 * ```
 */

// ===========================
// AI Function Overloads
// ===========================

// Text adapter with outputSchema → Promise<z.infer<TSchema>>
export function ai<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends TextModels<TAdapter>,
  TSchema extends z.ZodType,
>(
  options: AITextOptions<TAdapter, TModel, TSchema, boolean> & {
    outputSchema: TSchema
  },
): Promise<z.infer<TSchema>>

// Text adapter with explicit stream: false → Promise<string>
export function ai<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends TextModels<TAdapter>,
>(
  options: AITextOptions<TAdapter, TModel, undefined, false> & {
    stream: false
  },
): Promise<string>

// Text adapter (streaming - default) → AsyncIterable<StreamChunk>
export function ai<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends TextModels<TAdapter>,
>(
  options: Omit<
    AITextOptions<TAdapter, TModel, undefined, true>,
    'outputSchema'
  >,
): AsyncIterable<StreamChunk>

// Embedding adapter → Promise<EmbeddingResult>
export function ai<
  TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>,
  TModel extends EmbeddingModels<TAdapter>,
>(options: AIEmbeddingOptions<TAdapter, TModel>): Promise<EmbeddingResult>

// Summarize adapter with explicit stream: true → AsyncIterable<StreamChunk>
export function ai<
  TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>,
  TModel extends SummarizeModels<TAdapter>,
>(
  options: AISummarizeOptions<TAdapter, TModel, true> & { stream: true },
): AsyncIterable<StreamChunk>

// Summarize adapter (non-streaming - default) → Promise<SummarizationResult>
export function ai<
  TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>,
  TModel extends SummarizeModels<TAdapter>,
>(
  options: AISummarizeOptions<TAdapter, TModel, false>,
): Promise<SummarizationResult>

// Image adapter → Promise<ImageGenerationResult>
export function ai<
  TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>,
  TModel extends ImageModels<TAdapter>,
>(options: AIImageOptions<TAdapter, TModel>): Promise<ImageGenerationResult>

// Video adapter status → Promise<VideoStatusResult>
export function ai<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
>(options: AIVideoStatusOptions<TAdapter, TModel>): Promise<VideoStatusResult>

// Video adapter url → Promise<VideoUrlResult>
export function ai<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
>(options: AIVideoUrlOptions<TAdapter, TModel>): Promise<VideoUrlResult>

// Video adapter create → Promise<VideoJobResult>
export function ai<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
>(options: AIVideoCreateOptions<TAdapter, TModel>): Promise<VideoJobResult>

// Implementation
export function ai(options: AIOptionsUnion): AIResultUnion {
  const { adapter } = options

  const handler = activityMap.get(adapter.kind)
  if (!handler) {
    throw new Error(`Unknown adapter kind: ${adapter.kind}`)
  }

  return handler(options)
}

/**
 * Call ai() with text adapter options and get AsyncIterable<StreamChunk> return type.
 *
 * Use this when you have a union of different text adapters (e.g., from
 * dynamic provider selection) and want to avoid type casting.
 *
 * @example
 * ```ts
 * const adapters = {
 *   openai: () => openaiText('gpt-4o'),
 *   anthropic: () => anthropicText('claude-sonnet-4-5'),
 * }
 *
 * const adapter = adapters[provider]()
 * const stream = aiText({ adapter, messages })  // No cast needed!
 * return toStreamResponse(stream)
 * ```
 */
export function aiText(options: {
  adapter: TextAdapter<ReadonlyArray<string>, object, any, any, any>
  messages: Array<any>
  model?: string
  tools?: Array<any>
  systemPrompts?: Array<string>
  options?: any
  providerOptions?: any
  abortController?: any
  agentLoopStrategy?: any
  conversationId?: string
}): AsyncIterable<StreamChunk> {
  const { adapter } = options
  const handler = activityMap.get(adapter.kind)
  if (!handler) {
    throw new Error(`Unknown adapter kind: ${adapter.kind}`)
  }
  return handler(options as AIOptionsUnion) as AsyncIterable<StreamChunk>
}

// ===========================
// Re-exported Types
// ===========================

// Re-export adapter types
export type { TextAdapter } from './activities/text/adapter'
export type { EmbeddingAdapter } from './activities/embedding/adapter'
export type { SummarizeAdapter } from './activities/summarize/adapter'
export type { ImageAdapter } from './activities/image/adapter'
export type { VideoAdapter } from './activities/video/adapter'

// Re-export type helpers
export type {
  TextModels,
  EmbeddingModels,
  SummarizeModels,
  ImageModels,
  VideoModels,
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
  VideoGenerateOptions,
  GenerateTextOptions,
  GenerateEmbeddingOptions,
  GenerateSummarizeOptions,
  GenerateImageOptions,
  GenerateVideoOptions,
} from './activities'
