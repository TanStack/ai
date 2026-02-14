import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { createGeminiClient, generateId } from '../utils'
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
import type { GEMINI_EMBEDDING_MODELS } from '../model-meta'
import type { GeminiClientConfig } from '../utils'
import type {
  GeminiEmbeddingModelProviderOptionsByName,
  GeminiEmbeddingProviderOptions,
} from '../embedding/embedding-provider-options'

/**
 * Configuration for Gemini embedding adapter
 */
export interface GeminiEmbeddingConfig extends GeminiClientConfig {}

export type GeminiEmbeddingModel = (typeof GEMINI_EMBEDDING_MODELS)[number]

export class GeminiEmbeddingAdapter<
  TModel extends GeminiEmbeddingModel,
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
