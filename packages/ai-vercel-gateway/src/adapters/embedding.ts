import OpenAI from 'openai'
import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import {
  getVercelGatewayApiKeyFromEnv,
  withVercelGatewayDefaults,
} from '../utils/client'
import { mapGatewayModelOptions } from '../utils/map-gateway-options'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  TokenUsage,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type {
  VercelGatewayEmbeddingModel,
  VercelGatewayEmbeddingModelInputModalitiesByName,
  VercelGatewayEmbeddingModelProviderOptionsByName,
} from '../model-meta'
import type { VercelGatewayEmbeddingProviderOptions } from '../embedding/embedding-provider-options'
import type { VercelGatewayClientConfig } from '../utils/client'

export interface VercelGatewayEmbeddingConfig
  extends VercelGatewayClientConfig {}

/**
 * Vercel AI Gateway embedding adapter.
 *
 * Talks to `POST /v1/embeddings` on the public OpenAI-compatible Gateway API.
 */
export class VercelGatewayEmbeddingAdapter<
  TModel extends VercelGatewayEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  VercelGatewayEmbeddingProviderOptions,
  VercelGatewayEmbeddingModelProviderOptionsByName,
  VercelGatewayEmbeddingModelInputModalitiesByName
> {
  readonly name = 'vercel-gateway' as const

  protected client: OpenAI

  constructor(config: VercelGatewayEmbeddingConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(withVercelGatewayDefaults(config))
  }

  async createEmbeddings(
    options: EmbeddingOptions<VercelGatewayEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger } = options
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)
    const mapped = mapGatewayModelOptions(
      options.modelOptions as Record<string, unknown> | undefined,
    )

    try {
      const request: OpenAI_SDK.EmbeddingCreateParams = {
        ...mapped,
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

export function createVercelGatewayEmbedding<
  TModel extends VercelGatewayEmbeddingModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<VercelGatewayEmbeddingConfig, 'apiKey'>,
): VercelGatewayEmbeddingAdapter<TModel> {
  return new VercelGatewayEmbeddingAdapter({ apiKey, ...config }, model)
}

export function vercelGatewayEmbedding<
  TModel extends VercelGatewayEmbeddingModel,
>(
  model: TModel,
  config?: Omit<VercelGatewayEmbeddingConfig, 'apiKey'>,
): VercelGatewayEmbeddingAdapter<TModel> {
  return createVercelGatewayEmbedding(
    model,
    getVercelGatewayApiKeyFromEnv(),
    config,
  )
}
