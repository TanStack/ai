import { getPerplexityApiKeyFromEnv } from '../utils/api-key'

export interface PerplexitySearchClientConfig {
  /** Perplexity API key. Falls back to `PERPLEXITY_API_KEY` / `PPLX_API_KEY` env vars. */
  apiKey?: string
  /** Override the API base URL (defaults to https://api.perplexity.ai). */
  baseURL?: string
  /** Optional `fetch` implementation; defaults to globalThis.fetch. */
  fetch?: typeof fetch
}

export interface PerplexitySearchRequest {
  /** The search query. */
  query: string
  /** Maximum number of results to return (1–20). Defaults to the API default (10). */
  max_results?: number
  /** Maximum tokens of content to return per page. */
  max_tokens_per_page?: number
  /**
   * Restrict (or exclude) results by domain.
   *
   * Use bare hostnames to allowlist (`["nytimes.com"]`) or `-` prefixed entries
   * to denylist (`["-pinterest.com"]`). Allow and deny entries must NOT be
   * mixed in the same request.
   */
  search_domain_filter?: Array<string>
  /** Restrict results by recency: `hour | day | week | month | year`. */
  search_recency_filter?: 'hour' | 'day' | 'week' | 'month' | 'year'
  /** Only include results published on or after this date (m/d/yyyy). */
  search_after_date_filter?: string
  /** Only include results published on or before this date (m/d/yyyy). */
  search_before_date_filter?: string
}

export interface PerplexitySearchResult {
  title: string
  url: string
  snippet: string
  date?: string
}

export interface PerplexitySearchResponse {
  id?: string
  results: Array<PerplexitySearchResult>
}

const DEFAULT_BASE_URL = 'https://api.perplexity.ai'

/**
 * Low-level HTTP client for the Perplexity Search API.
 *
 * Calls `POST {baseURL}/search` with bearer auth.
 */
export class PerplexitySearchClient {
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly fetchImpl: typeof fetch

  constructor(config: PerplexitySearchClientConfig = {}) {
    this.apiKey = config.apiKey ?? getPerplexityApiKeyFromEnv()
    this.baseURL = (config.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.fetchImpl = config.fetch ?? globalThis.fetch
  }

  async search(
    request: PerplexitySearchRequest,
    init: { signal?: AbortSignal } = {},
  ): Promise<PerplexitySearchResponse> {
    if (!request.query || typeof request.query !== 'string') {
      throw new Error('PerplexitySearchClient.search requires a non-empty `query`.')
    }
    validateDomainFilter(request.search_domain_filter)

    const body: Record<string, unknown> = { query: request.query }
    if (request.max_results !== undefined) body.max_results = request.max_results
    if (request.max_tokens_per_page !== undefined)
      body.max_tokens_per_page = request.max_tokens_per_page
    if (request.search_domain_filter)
      body.search_domain_filter = request.search_domain_filter
    if (request.search_recency_filter)
      body.search_recency_filter = request.search_recency_filter
    if (request.search_after_date_filter)
      body.search_after_date_filter = request.search_after_date_filter
    if (request.search_before_date_filter)
      body.search_before_date_filter = request.search_before_date_filter

    const response = await this.fetchImpl(`${this.baseURL}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: init.signal,
    })

    if (!response.ok) {
      const text = await safeReadText(response)
      throw new Error(
        `Perplexity Search API request failed: ${response.status} ${response.statusText}${
          text ? ` — ${text}` : ''
        }`,
      )
    }

    const data = (await response.json()) as PerplexitySearchResponse
    return {
      id: data.id,
      results: Array.isArray(data.results)
        ? data.results.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            ...(r.date ? { date: r.date } : {}),
          }))
        : [],
    }
  }
}

function validateDomainFilter(filter: Array<string> | undefined): void {
  if (!filter || filter.length === 0) return
  let hasAllow = false
  let hasDeny = false
  for (const entry of filter) {
    if (typeof entry !== 'string' || entry.length === 0) continue
    if (entry.startsWith('-')) hasDeny = true
    else hasAllow = true
  }
  if (hasAllow && hasDeny) {
    throw new Error(
      'search_domain_filter cannot mix allowlist and denylist entries. Use only `-domain.com` for negation, or only bare domains for allowlist.',
    )
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}
