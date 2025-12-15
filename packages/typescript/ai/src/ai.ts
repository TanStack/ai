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
 *   adapter: openaiText('gpt-4o'),
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * })) {
 *   console.log(chunk)
 * }
 * ```
 *
 * @example Chat with tools (agentic)
 * ```ts
 * for await (const chunk of ai({
 *   adapter: openaiText('gpt-4o'),
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
 *   adapter: openaiText('gpt-4o'),
 *   messages: [{ role: 'user', content: 'Generate a person' }],
 *   outputSchema: z.object({ name: z.string(), age: z.number() })
 * })
 * // result is { name: string, age: number }
 * ```
 *
 * @example Provider-specific options
 * ```ts
 * // Provider options are baked into the adapter
 * const adapter = openaiText('o1', {
 *   providerOptions: { reasoning: { effort: 'high' } }
 * })
 *
 * for await (const chunk of ai({
 *   adapter,
 *   messages: [{ role: 'user', content: 'Solve this complex problem...' }]
 * })) {
 *   console.log(chunk)
 * }
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
// Conditional Return Type
// ===========================

/**
 * Computes the return type of ai() based on the options provided.
 * This conditional type approach provides better inference than overloads
 * when options are spread from aiOptions().
 */
type AIReturnType<TOptions> =
  // Text adapter with outputSchema → Promise<z.infer<TSchema>>
  TOptions extends {
    adapter: { kind: 'text' }
    outputSchema: infer TSchema extends z.ZodType
  }
    ? Promise<z.infer<TSchema>>
    : // Text adapter with stream: false → Promise<string>
      TOptions extends { adapter: { kind: 'text' }; stream: false }
      ? Promise<string>
      : // Text adapter (streaming default) → AsyncIterable<StreamChunk>
        TOptions extends { adapter: { kind: 'text' } }
        ? AsyncIterable<StreamChunk>
        : // Embedding adapter → Promise<EmbeddingResult>
          TOptions extends { adapter: { kind: 'embedding' } }
          ? Promise<EmbeddingResult>
          : // Summarize adapter with stream: true → AsyncIterable<StreamChunk>
            TOptions extends { adapter: { kind: 'summarize' }; stream: true }
            ? AsyncIterable<StreamChunk>
            : // Summarize adapter → Promise<SummarizationResult>
              TOptions extends { adapter: { kind: 'summarize' } }
              ? Promise<SummarizationResult>
              : // Image adapter → Promise<ImageGenerationResult>
                TOptions extends { adapter: { kind: 'image' } }
                ? Promise<ImageGenerationResult>
                : // Video adapter status → Promise<VideoStatusResult>
                  TOptions extends {
                      adapter: { kind: 'video' }
                      request: 'status'
                    }
                  ? Promise<VideoStatusResult>
                  : // Video adapter url → Promise<VideoUrlResult>
                    TOptions extends {
                        adapter: { kind: 'video' }
                        request: 'url'
                      }
                    ? Promise<VideoUrlResult>
                    : // Video adapter create → Promise<VideoJobResult>
                      TOptions extends { adapter: { kind: 'video' } }
                      ? Promise<VideoJobResult>
                      : // Fallback
                        AIResultUnion

// ===========================
// AI Function Overloads
// ===========================

// Primary overload using conditional return type for better spread inference
export function ai<const TOptions extends AIOptionsUnion>(
  options: TOptions,
): AIReturnType<TOptions>

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
// This overload uses simplified typing for better inference with dynamic adapter unions
// Note: stream can be true, undefined, or not present at all - all mean "streaming mode"
export function ai<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
>(options: {
  adapter: TAdapter & { kind: 'text' }
  messages: Array<any>
  model?: string
  tools?: Array<any>
  systemPrompts?: Array<string>
  options?: any
  abortController?: any
  agentLoopStrategy?: any
  conversationId?: string
  stream?: true | undefined
  outputSchema?: undefined
}): AsyncIterable<StreamChunk>

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

// ===========================
// AI Options Helper
// ===========================

/**
 * Pre-configure options for the ai() function with full type safety.
 *
 * This helper allows you to create reusable option configurations that maintain
 * type safety when spread into ai(). The adapter's model and configuration are
 * captured, and when the options are used in ai(), the correct types flow through.
 *
 * @example Basic usage
 * ```ts
 * import { ai, aiOptions } from '@tanstack/ai'
 * import { geminiText } from '@tanstack/ai-gemini'
 *
 * const options = aiOptions({
 *   adapter: geminiText('gemini-2.0-flash'),
 *   systemPrompts: ['You are a helpful assistant'],
 * })
 *
 * const stream = ai({
 *   ...options,
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * })
 *
 * for await (const chunk of stream) {
 *   console.log(chunk)
 * }
 * ```
 *
 * @example With tools
 * ```ts
 * const options = aiOptions({
 *   adapter: openaiText('gpt-4o'),
 *   tools: [weatherTool, calculatorTool],
 *   agentLoopStrategy: maxIterations(10),
 * })
 *
 * // Reuse the options in multiple ai() calls
 * const stream1 = ai({ ...options, messages: [...] })
 * const stream2 = ai({ ...options, messages: [...] })
 * ```
 *
 * @example With structured output
 * ```ts
 * import { z } from 'zod'
 *
 * const options = aiOptions({
 *   adapter: openaiText('gpt-4o'),
 *   outputSchema: z.object({ name: z.string(), age: z.number() }),
 * })
 *
 * const result = await ai({
 *   ...options,
 *   messages: [{ role: 'user', content: 'Generate a person' }],
 * })
 * // result is { name: string, age: number }
 * ```
 */
export function aiOptions<
  const T extends {
    adapter: { kind: 'text' }
    systemPrompts?: Array<string>
    tools?: Array<any>
    options?: Record<string, any>
    agentLoopStrategy?: (state: any) => boolean
    conversationId?: string
    abortController?: AbortController
    outputSchema?: z.ZodType
    stream?: boolean
  },
>(options: T): T {
  return options
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
