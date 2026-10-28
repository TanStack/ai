import OpenAI from 'openai'
import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import { getNeonTokenFromEnv, withNeonDefaults } from '../utils/client'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  TokenUsage,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { NeonEmbeddingModel } from '../model-meta'
import type { NeonClientConfig } from '../utils/client'

export interface NeonEmbeddingConfig extends NeonClientConfig {}

export interface NeonEmbeddingProviderOptions {
  user?: string
}

type ByName<T> = { [K in NeonEmbeddingModel]: T }

/**
 * Neon AI Gateway embedding adapter. Talks to `POST /v1/embeddings`.
 *
 * ponytail: Neon's own provider sends at most 150 inputs per call; chunk the
 * input here if a caller hits a gateway limit.
 */
export class NeonEmbeddingAdapter<
  TModel extends NeonEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  NeonEmbeddingProviderOptions,
  ByName<NeonEmbeddingProviderOptions>,
  ByName<readonly ['text']>
> {
  readonly name = 'neon' as const

  protected client: OpenAI

  constructor(config: NeonEmbeddingConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(withNeonDefaults(config, 'chat'))
  }

  async createEmbeddings(
    options: EmbeddingOptions<NeonEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger } = options
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)

    try {
      const request: OpenAI_SDK.EmbeddingCreateParams = {
        ...options.modelOptions,
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

/** Creates a Neon AI Gateway embedding adapter with an explicit token. */
export function createNeonEmbedding<TModel extends NeonEmbeddingModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<NeonEmbeddingConfig, 'apiKey'>,
): NeonEmbeddingAdapter<TModel> {
  return new NeonEmbeddingAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Neon AI Gateway embedding adapter with the token from
 * `NEON_AI_GATEWAY_TOKEN` and the host from `NEON_AI_GATEWAY_BASE_URL`.
 */
export function neonEmbedding<TModel extends NeonEmbeddingModel>(
  model: TModel,
  config?: Omit<NeonEmbeddingConfig, 'apiKey'>,
): NeonEmbeddingAdapter<TModel> {
  return createNeonEmbedding(model, getNeonTokenFromEnv(), config)
}
