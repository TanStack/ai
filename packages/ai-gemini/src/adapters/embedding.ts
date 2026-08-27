import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import type { EmbeddingOptions, EmbeddingResult } from '@tanstack/ai'
import type { EmbedContentConfig, GoogleGenAI } from '@google/genai'
import type {
  GeminiEmbeddingModel,
  GeminiEmbeddingModelInputModalitiesByName,
  GeminiEmbeddingModelProviderOptionsByName,
} from '../model-meta'
import type { GeminiEmbeddingProviderOptions } from '../embedding/embedding-provider-options'
import type { GeminiClientConfig } from '../utils/client'

export interface GeminiEmbeddingConfig extends GeminiClientConfig {}

export class GeminiEmbeddingAdapter<
  TModel extends GeminiEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  GeminiEmbeddingProviderOptions,
  GeminiEmbeddingModelProviderOptionsByName,
  GeminiEmbeddingModelInputModalitiesByName
> {
  readonly name = 'gemini' as const

  protected client: GoogleGenAI

  constructor(config: GeminiEmbeddingConfig, model: TModel) {
    super(model, {})
    this.client = createGeminiClient(config)
  }

  async createEmbeddings(
    options: EmbeddingOptions<GeminiEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger, modelOptions } = options
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)

    try {
      // Build the config incrementally so possibly-undefined values are never
      // assigned to optional fields (exactOptionalPropertyTypes).
      const config: EmbedContentConfig = {}
      if (options.dimensions !== undefined) {
        config.outputDimensionality = options.dimensions
      }
      if (modelOptions?.taskType !== undefined) {
        config.taskType = modelOptions.taskType
      }
      if (modelOptions?.title !== undefined) {
        config.title = modelOptions.title
      }

      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${texts.length}`,
        { provider: this.name, model },
      )

      const response = await this.client.models.embedContent({
        model,
        contents: texts,
        config,
      })

      const embeddings = response.embeddings
      if (!embeddings || embeddings.length !== texts.length) {
        throw new Error(
          `Gemini embedContent returned ${embeddings ? embeddings.length : 'no'} embeddings for ${texts.length} inputs (model: ${model}).`,
        )
      }

      // The Gemini embedding API does not report token usage, so `usage` is
      // omitted from the result.
      return {
        id: generateId(this.name),
        model,
        embeddings: embeddings.map((embedding, index) => ({
          vector: embedding.values ?? [],
          index,
        })),
      }
    } catch (error: unknown) {
      logger.errors(`${this.name}.createEmbeddings fatal`, {
        error: toRunErrorPayload(error, `${this.name}.createEmbeddings failed`),
        source: `${this.name}.createEmbeddings`,
      })
      throw error
    }
  }
}

export function createGeminiEmbedding<TModel extends GeminiEmbeddingModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiEmbeddingConfig, 'apiKey'>,
): GeminiEmbeddingAdapter<TModel> {
  // Put apiKey LAST so caller-supplied config can't silently override the
  // explicit argument.
  return new GeminiEmbeddingAdapter({ ...config, apiKey }, model)
}

export function geminiEmbedding<TModel extends GeminiEmbeddingModel>(
  model: TModel,
  config?: Omit<GeminiEmbeddingConfig, 'apiKey'>,
): GeminiEmbeddingAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiEmbedding(model, apiKey, config)
}
