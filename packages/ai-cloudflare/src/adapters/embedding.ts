import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import { resolveConfigFromEnv } from '../utils/config'
import { runModel } from '../utils/run'
import type { EmbeddingOptions, EmbeddingResult } from '@tanstack/ai'
import type { CloudflareConfig, CloudflareRestConfig } from '../utils/config'
import type { CloudflareEmbeddingModel } from '../utils/models'

/** Extra inputs forwarded to the embedding model (model specific). */
export type CloudflareEmbeddingProviderOptions = Record<string, unknown>

/**
 * Cloudflare embedding adapter. Runs Workers AI text-embedding models
 * (`{ text: [...] }` in, `{ data: number[][] }` out) through the binding or
 * the REST API.
 */
export class CloudflareEmbeddingAdapter<
  TModel extends CloudflareEmbeddingModel,
> extends BaseEmbeddingAdapter<TModel, CloudflareEmbeddingProviderOptions> {
  readonly name = 'cloudflare' as const

  constructor(
    private readonly cfConfig: CloudflareConfig,
    model: TModel,
  ) {
    super(model, {})
  }

  async createEmbeddings(
    options: EmbeddingOptions<CloudflareEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger } = options
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)
    try {
      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${texts.length}`,
        { provider: this.name, model },
      )
      const output = (await runModel(this.cfConfig, model, {
        ...options.modelOptions,
        text: texts,
      })) as { data?: Array<Array<number>> }
      return {
        id: generateId(this.name),
        model,
        embeddings: (output.data ?? []).map((vector, index) => ({
          vector,
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

export function createCloudflareEmbedding<
  TModel extends CloudflareEmbeddingModel,
>(model: TModel, config: CloudflareConfig): CloudflareEmbeddingAdapter<TModel> {
  return new CloudflareEmbeddingAdapter(config, model)
}

export function cloudflareEmbedding<TModel extends CloudflareEmbeddingModel>(
  model: TModel,
  config?: CloudflareConfig | Partial<CloudflareRestConfig>,
): CloudflareEmbeddingAdapter<TModel> {
  return new CloudflareEmbeddingAdapter(resolveConfigFromEnv(config), model)
}
