import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import {
  validateTaskType,
  validateValue,
} from '../embedding/embedding-provider-options'
import type { GoogleGenAI } from '@google/genai'
import type {
  EmbedManyOptions,
  EmbedManyResult,
  EmbedOptions,
  EmbedResult,
} from '@tanstack/ai'
import type { GeminiEmbeddingModels } from '../model-meta'
import type { GeminiClientConfig } from '../utils'
import type {
  GeminiEmbeddingModelProviderOptionsByName,
  GeminiEmbeddingProviderOptions,
} from '../embedding/embedding-provider-options'

/**
 * Configuration for Gemini embedding adapter
 */
export interface GeminiEmbeddingConfig extends GeminiClientConfig {}

export class GeminiEmbeddingAdapter<
  TModel extends GeminiEmbeddingModels,
> extends BaseEmbeddingAdapter<TModel, GeminiEmbeddingProviderOptions> {
  readonly kind = 'embedding' as const
  readonly name = 'gemini' as const

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: GeminiEmbeddingProviderOptions
    modelProviderOptionsByName: GeminiEmbeddingModelProviderOptionsByName
  }

  private client: GoogleGenAI

  constructor(config: GeminiEmbeddingConfig, model: TModel) {
    super({}, model)
    this.client = createGeminiClient(config)
  }

  async embed(
    options: EmbedOptions<GeminiEmbeddingProviderOptions>,
  ): Promise<EmbedResult> {
    const { model, value, modelOptions } = options

    validateValue({ value, model })
    validateTaskType({ taskType: modelOptions?.taskType, model })

    const { totalTokens } = await this.client.models.countTokens({
      model,
      contents: value,
    })

    const { embeddings } = await this.client.models.embedContent({
      model,
      contents: value,
      config: {
        ...modelOptions,
      },
    })

    return {
      embedding: embeddings?.[0]?.values || [],
      id: generateId(this.name),
      model,
      usage: totalTokens ? { totalTokens } : undefined,
    }
  }

  async embedMany(
    options: EmbedManyOptions<GeminiEmbeddingProviderOptions>,
  ): Promise<EmbedManyResult> {
    const { model, values, modelOptions } = options

    validateValue({ value: values, model })
    validateTaskType({ taskType: modelOptions?.taskType, model })

    const { totalTokens } = await this.client.models.countTokens({
      model,
      contents: values,
    })

    const { embeddings } = await this.client.models.embedContent({
      model,
      contents: values,
      config: {
        ...modelOptions,
      },
    })

    return {
      embeddings: embeddings?.map((embedding) => embedding.values || []) || [],
      id: generateId(this.name),
      model,
      usage: totalTokens ? { totalTokens } : undefined,
    }
  }
}

/**
 * Creates a Gemini embedding adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'embedding-001')
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 * @returns Configured Gemini embedding adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGeminiEmbedding('embedding-001', "your-api-key");
 *
 * const result = await embed({
 *   adapter,
 *   value: 'Hello, world!'
 * });
 * ```
 */
export function createGeminiEmbedding<TModel extends GeminiEmbeddingModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiEmbeddingConfig, 'apiKey'>,
): GeminiEmbeddingAdapter<TModel> {
  return new GeminiEmbeddingAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Gemini embedding adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'embedding-001')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini embedding adapter instance with resolved types
 * @throws Error if GOOGLE_API_KEY or GEMINI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GOOGLE_API_KEY from environment
 * const adapter = geminiEmbedding('embedding-001');
 *
 * const result = await embed({
 *   adapter,
 *   value: 'Hello, world!'
 * });
 * ```
 */
export function geminiEmbedding<TModel extends GeminiEmbeddingModels>(
  model: TModel,
  config?: Omit<GeminiEmbeddingConfig, 'apiKey'>,
): GeminiEmbeddingAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiEmbedding(model, apiKey, config)
}
