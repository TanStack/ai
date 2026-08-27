import OpenAI from 'openai'
import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  TokenUsage,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type {
  OpenAIEmbeddingModel,
  OpenAIEmbeddingModelInputModalitiesByName,
  OpenAIEmbeddingModelProviderOptionsByName,
} from '../model-meta'
import type { OpenAIEmbeddingProviderOptions } from '../embedding/embedding-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

export interface OpenAIEmbeddingConfig extends OpenAIClientConfig {}

export class OpenAIEmbeddingAdapter<
  TModel extends OpenAIEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  OpenAIEmbeddingProviderOptions,
  OpenAIEmbeddingModelProviderOptionsByName,
  OpenAIEmbeddingModelInputModalitiesByName
> {
  readonly name = 'openai' as const

  protected client: OpenAI

  constructor(config: OpenAIEmbeddingConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(config)
  }

  async createEmbeddings(
    options: EmbeddingOptions<OpenAIEmbeddingProviderOptions>,
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

export function createOpenaiEmbedding<TModel extends OpenAIEmbeddingModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAIEmbeddingConfig, 'apiKey'>,
): OpenAIEmbeddingAdapter<TModel> {
  return new OpenAIEmbeddingAdapter({ apiKey, ...config }, model)
}

export function openaiEmbedding<TModel extends OpenAIEmbeddingModel>(
  model: TModel,
  config?: Omit<OpenAIEmbeddingConfig, 'apiKey'>,
): OpenAIEmbeddingAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiEmbedding(model, apiKey, config)
}
