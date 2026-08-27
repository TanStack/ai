import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import {
  createMistralClient,
  generateId,
  getMistralApiKeyFromEnv,
} from '../utils/client'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  TokenUsage,
} from '@tanstack/ai'
import type { Mistral } from '@mistralai/mistralai'
import type { EmbeddingRequest } from '@mistralai/mistralai/models/components'
import type {
  MistralEmbeddingModel,
  MistralEmbeddingModelInputModalitiesByName,
  MistralEmbeddingModelProviderOptionsByName,
} from '../model-meta'
import type { MistralEmbeddingProviderOptions } from '../embedding/embedding-provider-options'
import type { MistralClientConfig } from '../utils/client'

export type MistralEmbeddingConfig = MistralClientConfig

export class MistralEmbeddingAdapter<
  TModel extends MistralEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  MistralEmbeddingProviderOptions,
  MistralEmbeddingModelProviderOptionsByName,
  MistralEmbeddingModelInputModalitiesByName
> {
  readonly name = 'mistral' as const

  protected client: Mistral

  constructor(config: MistralEmbeddingConfig, model: TModel) {
    super(model, {})
    this.client = createMistralClient(config)
  }

  async createEmbeddings(
    options: EmbeddingOptions<MistralEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger, modelOptions } = options
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)

    const rejectsDimensions =
      options.dimensions !== undefined && model === 'mistral-embed'
    if (rejectsDimensions) {
      throw new Error(
        'mistral-embed does not support requesting dimensions (output is a fixed 1024-dimension vector). Use codestral-embed for dimension reduction, or omit `dimensions`.',
      )
    }

    try {
      const request: EmbeddingRequest = {
        ...modelOptions,
        model,
        inputs: texts,
      }
      if (options.dimensions !== undefined) {
        request.outputDimension = options.dimensions
      }

      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${texts.length}`,
        { provider: this.name, model },
      )

      const response = await this.client.embeddings.create(request)

      const usage: TokenUsage = {
        promptTokens: response.usage.promptTokens ?? 0,
        completionTokens: 0,
        totalTokens: response.usage.totalTokens ?? 0,
      }

      return {
        id: generateId(this.name),
        model,
        // Mistral returns one entry per input; `index` is optional in the SDK
        // types, so fall back to array order when it's absent.
        embeddings: response.data.map((item, arrayIndex) => ({
          vector: item.embedding ?? [],
          index: item.index ?? arrayIndex,
        })),
        usage,
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

export function createMistralEmbedding<TModel extends MistralEmbeddingModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<MistralEmbeddingConfig, 'apiKey'>,
): MistralEmbeddingAdapter<TModel> {
  return new MistralEmbeddingAdapter({ apiKey, ...config }, model)
}

export function mistralEmbedding<TModel extends MistralEmbeddingModel>(
  model: TModel,
  config?: Omit<MistralEmbeddingConfig, 'apiKey'>,
): MistralEmbeddingAdapter<TModel> {
  const apiKey = getMistralApiKeyFromEnv()
  return createMistralEmbedding(model, apiKey, config)
}
