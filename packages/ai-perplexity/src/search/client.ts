import { getPerplexityApiKeyFromEnv } from '../utils/api-key'
import { getPerplexityIntegrationHeaders } from '../utils/attribution'

export interface PerplexitySearchClientConfig {
  /** Perplexity API key. Falls back to `PERPLEXITY_API_KEY` / `PPLX_API_KEY` env vars. */
  apiKey?: string
  /** Override the API base URL (defaults to https://api.perplexity.ai). */
  baseURL?: string
  /** Optional `fetch` implementation; defaults to globalThis.fetch. */
  fetch?: typeof fetch
}

export interface PerplexitySearchRequest {
  /** The search query, or up to 5 queries. */
  query: string | ReadonlyArray<string>
  /** Maximum number of results to return (1–20). Defaults to the API default (10). */
  max_results?: number
  /** Maximum tokens of content to return per page. */
  max_tokens_per_page?: number
  /**
     * Restrict (or exclude) results by domain (max 20 entries).
     *
     * Hostnames, optional paths, or TLDs. Use bare entries to allowlist
     * (`["nytimes.com"]`) or `-` prefixed entries to denylist
     * (`["-pinterest.com"]`). Allow and deny entries must NOT be mixed.
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
  last_updated?: string
}

export interface PerplexitySearchResponse {
  id?: string
  results: Array<PerplexitySearchResult>
}

const DEFAULT_BASE_URL = 'https://api.perplexity.ai'
const MAX_QUERY_BATCH = 5
const MAX_DOMAIN_FILTER = 20

/**
 * Low-level HTTP client for the Perplexity Search API.
 *
 * Calls `POST {baseURL}/search` with bearer auth.
 */
export class PerplexitySearchClient {
  /** Perplexity API key. Falls back to `PERPLEXITY_API_KEY` / `PPLX_API_KEY` env vars. */
  private readonly apiKey: string
  /** Override the API base URL (defaults to https://api.perplexity.ai). */
  private readonly baseURL: string
  private readonly fetchImpl: typeof fetch

  constructor(config: PerplexitySearchClientConfig = {}) {
    const { apiKey } = config
    const resolvedApiKey =
      typeof apiKey === 'string' && apiKey.trim().length > 0
        ? apiKey
        : getPerplexityApiKeyFromEnv()

    this.apiKey = resolvedApiKey
    this.baseURL = (config.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.fetchImpl = config.fetch ?? globalThis.fetch
  }

  async search(
    request: PerplexitySearchRequest,
    init: { signal?: AbortSignal } = {},
  ): Promise<PerplexitySearchResponse> {
    /** The search query, or up to 5 queries. */
    const query = normalizeQuery(request.query)
    validateDomainFilter(request.search_domain_filter)

    const body: Record<string, unknown> = { query }
    if (request.max_results !== undefined)
      body.max_results = requireMaxResults(request.max_results)
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
        ...getPerplexityIntegrationHeaders(),
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

    return parseSearchResponse(await response.json())
  }
}

function normalizeQuery(
  query: string | ReadonlyArray<string>,
): string | Array<string> {
  if (typeof query === 'string') {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      throw new Error(
        'PerplexitySearchClient.search requires a non-empty `query`.',
      )
    }
    return trimmed
  }

  if (query.length === 0) {
    throw new Error(
      'PerplexitySearchClient.search requires a non-empty `query`.',
    )
  }
  if (query.length > MAX_QUERY_BATCH) {
    throw new Error(
      `query array must contain at most ${MAX_QUERY_BATCH} entries.`,
    )
  }

  return query.map((entry) => {
    if (typeof entry !== 'string') {
      throw new Error(
        'PerplexitySearchClient.search requires a non-empty `query`.',
      )
    }
    if (entry.trim().length === 0) {
      throw new Error(
        'PerplexitySearchClient.search requires a non-empty `query`.',
      )
    }
    return entry.trim()
  })
}

function requireMaxResults(maxResults: number): number {
  const invalidMaxResults =
    !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 20
  if (invalidMaxResults) {
    throw new Error('max_results must be an integer between 1 and 20.')
  }
  return maxResults
}

function validateDomainFilter(filter: Array<string> | undefined): void {
  if (!filter) return
  if (filter.length === 0) return
  if (filter.length > MAX_DOMAIN_FILTER) {
    throw new Error(
      `search_domain_filter must contain at most ${MAX_DOMAIN_FILTER} entries.`,
    )
  }
  let hasAllow = false
  let hasDeny = false
  for (const entry of filter) {
    if (typeof entry !== 'string') continue
    if (entry.length === 0) continue
    if (entry.startsWith('-')) hasDeny = true
    else hasAllow = true
  }
  const mixesAllowAndDeny = hasAllow && hasDeny
  if (mixesAllowAndDeny) {
    throw new Error(
      'search_domain_filter cannot mix allowlist and denylist entries. Use only `-domain.com` for negation, or only bare domains for allowlist.',
    )
  }
}

function isSearchResult(value: unknown): value is PerplexitySearchResult {
  if (typeof value !== 'object') return false
  if (value === null) return false
  const result = value as {
    title?: unknown
    url?: unknown
    snippet?: unknown
    date?: unknown
    last_updated?: unknown
  }
  return (
    typeof result.title === 'string' &&
    typeof result.url === 'string' &&
    typeof result.snippet === 'string' &&
    (result.date === undefined ||
      result.date === null ||
      typeof result.date === 'string') &&
    (result.last_updated === undefined ||
      result.last_updated === null ||
      typeof result.last_updated === 'string')
  )
}

function parseSearchResponse(value: unknown): PerplexitySearchResponse {
  if (typeof value !== 'object') {
    throw new Error('Perplexity Search API returned an invalid response.')
  }
  if (value === null) {
    throw new Error('Perplexity Search API returned an invalid response.')
  }
  const data = value as { id?: unknown; results?: unknown }
  if (!Array.isArray(data.results)) {
    throw new Error('Perplexity Search API returned an invalid response.')
  }
  if (!data.results.every(isSearchResult)) {
    throw new Error('Perplexity Search API returned an invalid response.')
  }
  return {
    ...(typeof data.id === 'string' ? { id: data.id } : {}),
    results: data.results.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      ...(result.date ? { date: result.date } : {}),
      ...(result.last_updated ? { last_updated: result.last_updated } : {}),
    })),
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}
