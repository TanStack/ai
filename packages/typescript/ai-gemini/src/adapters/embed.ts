import { createGeminiClient, getGeminiApiKeyFromEnv } from '../utils'

import type { GoogleGenAI } from '@google/genai'
import type { EmbeddingAdapter } from '@tanstack/ai/adapters'
import type { EmbeddingOptions, EmbeddingResult } from '@tanstack/ai'

/**
 * Available Gemini embedding models
 */
export const GeminiEmbeddingModels = [
  'text-embedding-004',
  'embedding-001',
] as const

export type GeminiEmbeddingModel = (typeof GeminiEmbeddingModels)[number]

/**
 * Provider-specific options for Gemini embeddings
 */
export interface GeminiEmbedProviderOptions {
  taskType?:
    | 'RETRIEVAL_QUERY'
    | 'RETRIEVAL_DOCUMENT'
    | 'SEMANTIC_SIMILARITY'
    | 'CLASSIFICATION'
    | 'CLUSTERING'
  title?: string
  outputDimensionality?: number
}

export interface GeminiEmbedAdapterOptions {
  model?: GeminiEmbeddingModel
}

/**
 * Gemini Embedding Adapter
 * A tree-shakeable embedding adapter for Google Gemini
 */
export class GeminiEmbedAdapter implements EmbeddingAdapter<
  typeof GeminiEmbeddingModels,
  GeminiEmbedProviderOptions
> {
  readonly kind = 'embedding' as const
  readonly name = 'gemini' as const
  readonly models = GeminiEmbeddingModels

  /** Type-only property for provider options inference */
  declare _providerOptions?: GeminiEmbedProviderOptions

  private client: GoogleGenAI

  constructor(
    apiKeyOrClient: string | GoogleGenAI,
    _options: GeminiEmbedAdapterOptions = {},
  ) {
    this.client =
      typeof apiKeyOrClient === 'string'
        ? createGeminiClient({ apiKey: apiKeyOrClient })
        : apiKeyOrClient
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = options.model

    // Ensure input is an array
    const inputs = Array.isArray(options.input)
      ? options.input
      : [options.input]

    const embeddings: Array<Array<number>> = []

    for (const input of inputs) {
      const response = await this.client.models.embedContent({
        model,
        contents: [{ role: 'user', parts: [{ text: input }] }],
        config: {
          outputDimensionality: options.dimensions,
        },
      })

      if (response.embeddings?.[0]?.values) {
        embeddings.push(response.embeddings[0].values)
      }
    }

    return {
      id: `embed-${Date.now()}`,
      model,
      embeddings,
      usage: {
        promptTokens: 0,
        totalTokens: 0,
      },
    }
  }
}

/**
 * Creates a Gemini embedding adapter with explicit API key
 */
export function createGeminiEmbedding(
  apiKey: string,
  options?: GeminiEmbedAdapterOptions,
): GeminiEmbedAdapter {
  return new GeminiEmbedAdapter(apiKey, options)
}

/**
 * Creates a Gemini embedding adapter with API key from environment
 */
export function geminiEmbedding(
  options?: GeminiEmbedAdapterOptions,
): GeminiEmbedAdapter {
  const apiKey = getGeminiApiKeyFromEnv()
  return new GeminiEmbedAdapter(apiKey, options)
}

export function geminiEmbed(
  options?: GeminiEmbedAdapterOptions,
): GeminiEmbedAdapter {
  const apiKey = getGeminiApiKeyFromEnv()
  return new GeminiEmbedAdapter(apiKey, options)
}

export function createGeminiEmbed(
  apiKey: string,
  options?: GeminiEmbedAdapterOptions,
): GeminiEmbedAdapter {
  return new GeminiEmbedAdapter(apiKey, options)
}
