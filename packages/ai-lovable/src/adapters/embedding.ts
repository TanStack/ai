import OpenAI from 'openai'
import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import { getLovableApiKeyFromEnv, withLovableDefaults } from '../utils/client'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  TokenUsage,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type {
  LovableEmbeddingModel,
  LovableEmbeddingModelInputModalitiesByName,
  LovableEmbeddingModelProviderOptionsByName,
} from '../model-meta'
import type { LovableEmbeddingProviderOptions } from '../embedding/embedding-provider-options'
import type { LovableClientConfig } from '../utils/client'

export interface LovableEmbeddingConfig extends LovableClientConfig {}

export class LovableEmbeddingAdapter<
  TModel extends LovableEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  LovableEmbeddingProviderOptions,
  LovableEmbeddingModelProviderOptionsByName,
  LovableEmbeddingModelInputModalitiesByName
> {
  readonly name = 'lovable' as const

  protected client: OpenAI

  constructor(config: LovableEmbeddingConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(withLovableDefaults(config))
  }

  async createEmbeddings(
    options: EmbeddingOptions<LovableEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger, modelOptions } = options
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)

    try {
      const request: OpenAI_SDK.EmbeddingCreateParams = {
        ...modelOptions,
        model,
        input: texts,
        encoding_format: 'float',
      }
      if (options.dimensions !== undefined) {
        request.dimensions = options.dimensions
      }

      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${texts.length}`,
        { provider: this.name, model },
      )

      const response = await this.client.embeddings.create(request)

      const usage: TokenUsage = {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: 0,
        totalTokens: response.usage.total_tokens,
      }

      return {
        id: generateId(this.name),
        model,
        embeddings: response.data.map((item) => ({
          vector: item.embedding,
          index: item.index,
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

export function createLovableEmbedding<TModel extends LovableEmbeddingModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<LovableEmbeddingConfig, 'apiKey'>,
): LovableEmbeddingAdapter<TModel> {
  return new LovableEmbeddingAdapter({ apiKey, ...config }, model)
}

export function lovableEmbedding<TModel extends LovableEmbeddingModel>(
  model: TModel,
  config?: Omit<LovableEmbeddingConfig, 'apiKey'>,
): LovableEmbeddingAdapter<TModel> {
  return createLovableEmbedding(model, getLovableApiKeyFromEnv(), config)
}
