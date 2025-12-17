/**
 * Embedding Activity
 *
 * Generates vector embeddings from text input.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '../../event-client.js'
import type { EmbeddingAdapter } from './adapter'
import type { EmbeddingOptions, EmbeddingResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'embedding' as const

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract model types from an EmbeddingAdapter */
export type EmbeddingModels<TAdapter> =
  TAdapter extends EmbeddingAdapter<infer M, any, any> ? M[number] : string

/** Extract provider options from an EmbeddingAdapter */
export type EmbeddingProviderOptions<TAdapter> =
  TAdapter extends EmbeddingAdapter<any, infer P, any> ? P : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the embedding activity.
 * The model is extracted from the adapter's selectedModel property.
 *
 * @template TAdapter - The embedding adapter type (must have a selectedModel)
 */
export interface EmbeddingActivityOptions<
  TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object, string>,
> {
  /** The embedding adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Text input to embed (single string or array of strings) */
  input: string | Array<string>
  /** Optional: Number of dimensions for the embedding vector */
  dimensions?: number
  /** Provider-specific options */
  modelOptions?: EmbeddingProviderOptions<TAdapter>
}

// ===========================
// Activity Result Type
// ===========================

/** Result type for the embedding activity */
export type EmbeddingActivityResult = Promise<EmbeddingResult>

// ===========================
// Helper Functions
// ===========================

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Embedding activity - generates vector embeddings from text.
 *
 * Embeddings are numerical representations of text that capture semantic meaning.
 * They can be used for similarity search, clustering, classification, and more.
 *
 * @example Generate embeddings for a single text
 * ```ts
 * import { embedding } from '@tanstack/ai'
 * import { openaiEmbed } from '@tanstack/ai-openai'
 *
 * const result = await embedding({
 *   adapter: openaiEmbed('text-embedding-3-small'),
 *   input: 'Hello, world!'
 * })
 *
 * console.log(result.embeddings[0]) // Array of numbers
 * ```
 *
 * @example Generate embeddings for multiple texts
 * ```ts
 * const result = await embedding({
 *   adapter: openaiEmbed('text-embedding-3-small'),
 *   input: ['Hello', 'World', 'How are you?']
 * })
 *
 * // result.embeddings is an array of embedding vectors
 * result.embeddings.forEach((embedding, i) => {
 *   console.log(`Text ${i}: ${embedding.length} dimensions`)
 * })
 * ```
 *
 * @example Specify embedding dimensions
 * ```ts
 * const result = await embedding({
 *   adapter: openaiEmbed('text-embedding-3-small'),
 *   input: 'Hello, world!',
 *   dimensions: 256 // Reduce to 256 dimensions
 * })
 * ```
 */
export async function embedding<
  TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object, string>,
>(options: EmbeddingActivityOptions<TAdapter>): EmbeddingActivityResult {
  const { adapter, input, dimensions } = options
  const model = adapter.selectedModel
  const requestId = createId('embedding')
  const inputCount = Array.isArray(input) ? input.length : 1
  const startTime = Date.now()

  aiEventClient.emit('embedding:started', {
    requestId,
    model,
    inputCount,
    timestamp: startTime,
  })

  const embeddingOptions: EmbeddingOptions = {
    model,
    input,
    dimensions,
  }

  const result = await adapter.createEmbeddings(embeddingOptions)

  const duration = Date.now() - startTime

  aiEventClient.emit('embedding:completed', {
    requestId,
    model,
    inputCount,
    duration,
    timestamp: Date.now(),
  })

  return result
}

// Re-export adapter types
export type { EmbeddingAdapter, EmbeddingAdapterConfig } from './adapter'
export { BaseEmbeddingAdapter } from './adapter'
