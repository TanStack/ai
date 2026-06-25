import { OpenRouter } from '@openrouter/sdk'
import { BaseRerankAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import type { SDKOptions } from '@openrouter/sdk'
import type {
  OpenRouterRerankModel,
  OpenRouterRerankProviderOptions,
} from '../rerank/rerank-provider-options'
import type {
  RerankAdapterResult,
  RerankOptions,
  TokenUsage,
} from '@tanstack/ai'

export interface OpenRouterRerankConfig extends SDKOptions {}

/**
 * OpenRouter rerank adapter.
 *
 * Reorders documents by relevance to a query through OpenRouter's unified
 * `/v1/rerank` endpoint via the `@openrouter/sdk` SDK. The endpoint is
 * model-agnostic, so any rerank model OpenRouter offers works by passing its
 * slug (Cohere, NVIDIA, …). Returns scored indices into the submitted
 * documents; the `rerank()` activity maps those back to the caller's original
 * documents.
 */
export class OpenRouterRerankAdapter<
  TModel extends OpenRouterRerankModel,
> extends BaseRerankAdapter<TModel, OpenRouterRerankProviderOptions> {
  readonly name = 'openrouter' as const

  private readonly client: OpenRouter

  constructor(config: OpenRouterRerankConfig, model: TModel) {
    super({}, model)
    this.client = new OpenRouter(config)
  }

  async rerank(
    options: RerankOptions<OpenRouterRerankProviderOptions>,
  ): Promise<RerankAdapterResult> {
    const { model, query, documents, topN, modelOptions, abortSignal, logger } =
      options

    logger.request(
      `activity=rerank provider=${this.name} model=${model} documents=${documents.length}`,
      { provider: this.name, model },
    )

    try {
      const response = await this.client.rerank.rerank(
        {
          requestBody: {
            model,
            query,
            documents,
            ...(topN !== undefined ? { topN } : {}),
            ...(modelOptions?.provider
              ? { provider: modelOptions.provider }
              : {}),
          },
        },
        abortSignal ? { fetchOptions: { signal: abortSignal } } : undefined,
      )

      // The SDK types the response as `CreateRerankResponseBody | string`; the
      // bare-string form is an error/non-JSON payload, not a valid result.
      if (typeof response === 'string') {
        throw new Error('OpenRouter rerank returned an unexpected response')
      }

      const usage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: response.usage?.totalTokens ?? 0,
        ...(response.usage?.searchUnits !== undefined
          ? { unitsBilled: response.usage.searchUnits }
          : {}),
        ...(response.usage?.cost !== undefined
          ? { cost: response.usage.cost }
          : {}),
      }

      return {
        id: response.id ?? this.generateId(),
        ranking: response.results.map((r) => ({
          index: r.index,
          score: r.relevanceScore,
        })),
        usage,
      }
    } catch (error) {
      logger.errors(`${this.name}.rerank fatal`, {
        error: toRunErrorPayload(error, `${this.name}.rerank failed`),
        source: `${this.name}.rerank`,
      })
      throw error
    }
  }
}

/**
 * Creates an OpenRouter rerank adapter with an explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createOpenRouterRerank('cohere/rerank-v3.5', 'sk-or-...')
 * ```
 */
export function createOpenRouterRerank<TModel extends OpenRouterRerankModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenRouterRerankConfig, 'apiKey'>,
): OpenRouterRerankAdapter<TModel> {
  return new OpenRouterRerankAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenRouter rerank adapter, reading `OPENROUTER_API_KEY` from the
 * environment.
 *
 * @example
 * ```typescript
 * import { rerank } from '@tanstack/ai'
 * import { openRouterRerank } from '@tanstack/ai-openrouter'
 *
 * const { rerankedDocuments } = await rerank({
 *   adapter: openRouterRerank('cohere/rerank-v3.5'),
 *   query: 'talk about rain',
 *   documents: ['sunny day', 'rainy afternoon'],
 * })
 * ```
 */
export function openRouterRerank<TModel extends OpenRouterRerankModel>(
  model: TModel,
  config?: Omit<OpenRouterRerankConfig, 'apiKey'>,
): OpenRouterRerankAdapter<TModel> {
  return createOpenRouterRerank(model, getOpenRouterApiKeyFromEnv(), config)
}
