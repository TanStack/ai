import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import { resolveConfigFromEnv } from '../utils/config'
import { runModel } from '../utils/run'
import type { EmbeddingOptions, EmbeddingResult } from '@tanstack/ai'
import type { CloudflareConfig, CloudflareConfigInput } from '../utils/config'
import type { CloudflareEmbeddingModel } from '../utils/models'

/**
 * Texts per Workers AI request. 100 is the cap of the BGE and EmbeddingGemma
 * models. Models with a lower cap (such as `@cf/qwen/qwen3-embedding-0.6b`)
 * can still reject a full batch.
 */
const CLOUDFLARE_MAX_BATCH_SIZE = 100

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
    if (options.dimensions !== undefined) {
      throw new Error(
        'Workers AI embedding models have fixed dimensions; do not set `dimensions`',
      )
    }
    try {
      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${texts.length}`,
        { provider: this.name, model },
      )
      const vectors: Array<Array<number>> = []
      for (
        let start = 0;
        start < texts.length;
        start += CLOUDFLARE_MAX_BATCH_SIZE
      ) {
        // The binding path ignores the signal, so check it between batches.
        options.abortSignal?.throwIfAborted()
        const batch = texts.slice(start, start + CLOUDFLARE_MAX_BATCH_SIZE)
        const output = (await runModel(
          this.cfConfig,
          model,
          { ...options.modelOptions, text: batch },
          { signal: options.abortSignal },
        )) as { data?: Array<Array<number>> }
        if (
          !Array.isArray(output.data) ||
          output.data.length !== batch.length
        ) {
          throw new Error(
            `Workers AI ${model} returned ${output.data?.length ?? 0} embeddings for ${batch.length} inputs`,
          )
        }
        vectors.push(...output.data)
      }
      return {
        id: generateId(this.name),
        model,
        embeddings: vectors.map((vector, index) => ({
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
  config?: CloudflareConfigInput,
): CloudflareEmbeddingAdapter<TModel> {
  return new CloudflareEmbeddingAdapter(resolveConfigFromEnv(config), model)
}
