import { BaseRerankAdapter } from '@tanstack/ai/adapters'
import {
  COHERE_DEFAULT_BASE_URL,
  getCohereApiKeyFromEnv,
} from '../utils/client'
import type { CohereClientConfig } from '../utils/client'
import type {
  CohereRerankModel,
  InferCohereRerankProviderOptions,
} from '../model-meta'
import type { RerankAdapterResult, RerankOptions, TokenUsage } from '@tanstack/ai'

/** Shape of the Cohere `/v2/rerank` response we depend on. */
interface CohereRerankResponse {
  id?: string
  results: Array<{ index: number; relevance_score: number }>
  meta?: { billed_units?: { search_units?: number } }
}

function isCohereRerankResponse(value: unknown): value is CohereRerankResponse {
  if (typeof value !== 'object' || value === null) return false
  const results = (value as { results?: unknown }).results
  return (
    Array.isArray(results) &&
    results.every(
      (r) =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as { index?: unknown }).index === 'number' &&
        typeof (r as { relevance_score?: unknown }).relevance_score ===
          'number',
    )
  )
}

/**
 * Cohere rerank adapter.
 *
 * Talks to Cohere's `/v2/rerank` endpoint over raw `fetch` — no SDK. Returns
 * scored indices into the submitted documents; the `rerank()` activity maps
 * those back to the caller's original documents.
 */
export class CohereRerankAdapter<
  TModel extends CohereRerankModel,
> extends BaseRerankAdapter<TModel, InferCohereRerankProviderOptions<TModel>> {
  readonly name = 'cohere' as const

  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor(config: CohereClientConfig, model: TModel) {
    super({}, model)
    this.apiKey = config.apiKey
    this.baseUrl = (config.baseUrl ?? COHERE_DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    )
    this.headers = config.headers ?? {}
  }

  async rerank(
    options: RerankOptions<InferCohereRerankProviderOptions<TModel>>,
  ): Promise<RerankAdapterResult> {
    const { model, query, documents, topN, modelOptions, abortSignal, logger } =
      options

    const body: Record<string, unknown> = { model, query, documents }
    if (topN !== undefined) body['top_n'] = topN
    if (modelOptions?.maxTokensPerDoc !== undefined) {
      body['max_tokens_per_doc'] = modelOptions.maxTokensPerDoc
    }

    logger.request(
      `activity=rerank provider=${this.name} model=${model} documents=${documents.length}`,
      { provider: this.name, model },
    )

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/v2/rerank`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(body),
        ...(abortSignal ? { signal: abortSignal } : {}),
      })
    } catch (error) {
      logger.errors(`${this.name}.rerank fatal`, {
        error,
        source: `${this.name}.rerank`,
      })
      throw error
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const error = new Error(
        `Cohere rerank request failed: ${response.status} ${response.statusText}${
          detail ? ` — ${detail}` : ''
        }`,
      )
      logger.errors(`${this.name}.rerank fatal`, {
        error,
        source: `${this.name}.rerank`,
      })
      throw error
    }

    const json: unknown = await response.json()
    if (!isCohereRerankResponse(json)) {
      throw new Error('Cohere rerank response had an unexpected shape')
    }

    const searchUnits = json.meta?.billed_units?.search_units
    const usage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      ...(searchUnits !== undefined ? { unitsBilled: searchUnits } : {}),
    }

    return {
      id: json.id ?? this.generateId(),
      ranking: json.results.map((r) => ({
        index: r.index,
        score: r.relevance_score,
      })),
      usage,
    }
  }
}

/**
 * Creates a Cohere rerank adapter with an explicit API key. Type resolution
 * (per-model provider options) happens here at the call site.
 *
 * @example
 * ```typescript
 * const adapter = createCohereRerank('rerank-v3.5', 'co-...')
 * ```
 */
export function createCohereRerank<TModel extends CohereRerankModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<CohereClientConfig, 'apiKey'>,
): CohereRerankAdapter<TModel> {
  return new CohereRerankAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Cohere rerank adapter, reading `COHERE_API_KEY` from the
 * environment.
 *
 * @throws Error if `COHERE_API_KEY` is not found.
 *
 * @example
 * ```typescript
 * import { rerank } from '@tanstack/ai'
 * import { cohereRerank } from '@tanstack/ai-cohere'
 *
 * const { rerankedDocuments } = await rerank({
 *   adapter: cohereRerank('rerank-v3.5'),
 *   query: 'talk about rain',
 *   documents: ['sunny day', 'rainy afternoon'],
 * })
 * ```
 */
export function cohereRerank<TModel extends CohereRerankModel>(
  model: TModel,
  config?: Omit<CohereClientConfig, 'apiKey'>,
): CohereRerankAdapter<TModel> {
  return createCohereRerank(model, getCohereApiKeyFromEnv(), config)
}
