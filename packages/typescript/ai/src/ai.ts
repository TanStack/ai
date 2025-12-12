/**
 * @module ai
 *
 * Unified ai function that routes to the appropriate activity based on adapter kind.
 */

import { activityMap } from './activities'
import type {
  AIOptionsFor,
  AIOptionsUnion,
  AIResultFor,
  AIResultUnion,
  AnyAIAdapter,
} from './activities'
import type { z } from 'zod'

// ===========================
// AI Function
// ===========================

/**
 * Unified AI function - routes to the appropriate activity based on adapter kind.
 *
 * This is the main entry point for all AI operations. The adapter's `kind` property
 * determines which activity is executed:
 * - `'chat'` → Chat activity (streaming, tools, structured output)
 * - `'embedding'` → Embedding activity (vector generation)
 * - `'summarize'` → Summarize activity (text summarization)
 * - `'image'` → Image activity (image generation)
 *
 * @example Chat generation (streaming)
 * ```ts
 * import ai from '@tanstack/ai'
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
  TStream extends boolean = true,
>(
  options: AIOptionsFor<TAdapter, TModel, TSchema, TStream>,
): AIResultFor<TAdapter, TSchema, TStream>

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

// Re-export types from activities for convenience
export type {
  // Adapter union types
  AIAdapter,
  AnyAdapter,
  GenerateAdapter,
  AdapterKind,
  // Type helpers
  AnyAIAdapter,
  AIOptionsFor,
  AIResultFor,
  GenerateOptions,
  // Legacy type aliases
  ChatGenerateOptions,
  EmbeddingGenerateOptions,
  SummarizeGenerateOptions,
  ImageGenerateOptions,
  GenerateChatOptions,
  GenerateEmbeddingOptions,
  GenerateSummarizeOptions,
  GenerateImageOptions,
} from './activities'
