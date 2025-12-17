import {
  createOllamaClient,
  estimateTokens,
  getOllamaHostFromEnv,
} from '../utils'

import type { Ollama } from 'ollama'
import type { EmbeddingAdapter } from '@tanstack/ai/adapters'
import type { EmbeddingOptions, EmbeddingResult } from '@tanstack/ai'

/**
 * Ollama embedding models
 * Note: Ollama models are dynamically loaded, this is a common subset
 */
export const OllamaEmbeddingModels = [
  'nomic-embed-text',
  'mxbai-embed-large',
  'all-minilm',
  'snowflake-arctic-embed',
] as const

export type OllamaEmbeddingModel =
  | (typeof OllamaEmbeddingModels)[number]
  | (string & {})

/**
 * Ollama-specific provider options for embeddings
 */
export interface OllamaEmbedProviderOptions {
  /** Number of GPU layers to use */
  num_gpu?: number
  /** Number of threads to use */
  num_thread?: number
  /** Use memory-mapped model */
  use_mmap?: boolean
  /** Use memory-locked model */
  use_mlock?: boolean
}

export interface OllamaEmbedAdapterOptions {
  host?: string
}

/**
 * Ollama Embedding Adapter
 * A tree-shakeable embedding adapter for Ollama
 */
export class OllamaEmbedAdapter<
  TSelectedModel extends string | undefined = undefined,
> implements EmbeddingAdapter<
  typeof OllamaEmbeddingModels,
  OllamaEmbedProviderOptions,
  TSelectedModel
> {
  readonly kind = 'embedding' as const
  readonly name = 'ollama' as const
  readonly models = OllamaEmbeddingModels
  readonly selectedModel: TSelectedModel

  // Type-only property - never assigned at runtime
  declare _types: {
    providerOptions: OllamaEmbedProviderOptions
  }

  private client: Ollama

  constructor(
    hostOrClient?: string | Ollama,
    selectedModel?: TSelectedModel,
    _options: OllamaEmbedAdapterOptions = {},
  ) {
    if (typeof hostOrClient === 'string' || hostOrClient === undefined) {
      this.client = createOllamaClient({ host: hostOrClient })
    } else {
      this.client = hostOrClient
    }
    this.selectedModel = selectedModel as TSelectedModel
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = options.model

    // Ensure input is an array
    const inputs = Array.isArray(options.input)
      ? options.input
      : [options.input]

    const embeddings: Array<Array<number>> = []

    for (const input of inputs) {
      const response = await this.client.embeddings({
        model,
        prompt: input,
      })

      embeddings.push(response.embedding)
    }

    const promptTokens = inputs.reduce(
      (sum: number, input: string) => sum + estimateTokens(input),
      0,
    )

    return {
      id: `embed-${Date.now()}`,
      model,
      embeddings,
      usage: {
        promptTokens,
        totalTokens: promptTokens,
      },
    }
  }
}

/**
 * Creates an Ollama embedding adapter with explicit host and model
 */
export function createOllamaEmbedding<TModel extends OllamaEmbeddingModel>(
  model: TModel,
  host?: string,
  options?: OllamaEmbedAdapterOptions,
): OllamaEmbedAdapter<TModel> {
  return new OllamaEmbedAdapter(host, model, options)
}

/**
 * Creates an Ollama embedding adapter with host from environment and required model
 */
export function ollamaEmbedding<TModel extends OllamaEmbeddingModel>(
  model: TModel,
  options?: OllamaEmbedAdapterOptions,
): OllamaEmbedAdapter<TModel> {
  const host = getOllamaHostFromEnv()
  return new OllamaEmbedAdapter(host, model, options)
}
