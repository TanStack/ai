const searchModes = ['turbo', 'fast', 'basic', 'advanced'] as const

export type ParallelSearchMode = (typeof searchModes)[number]

export interface ParallelSearchSourcePolicy {
  after_date?: string
  include_domains?: Array<string>
  exclude_domains?: Array<string>
}

export interface ParallelSearchAdvancedSettings {
  max_results?: number
  source_policy?: ParallelSearchSourcePolicy
  location?: string
}

export interface ParallelSearchRequest {
  search_queries: ReadonlyArray<string>
  objective?: string
  mode?: ParallelSearchMode
  advanced_settings?: ParallelSearchAdvancedSettings
  max_chars_total?: number
  session_id?: string
}

export interface ParallelSearchResult {
  url: string
  excerpts: Array<string>
  title?: string
  publish_date?: string
}

export interface ParallelSearchResponse {
  search_id: string
  session_id: string
  results: Array<ParallelSearchResult>
}

export interface ParallelSearchClientConfig {
  /** API key. Defaults to the PARALLEL_API_KEY environment variable. */
  apiKey?: string
  /** API base URL. Defaults to https://api.parallel.ai. */
  baseURL?: string
  /** Fetch implementation for custom transports and tests. */
  fetch?: typeof fetch
}

/** A small client for the generally available Parallel Search API. */
export class ParallelSearchClient {
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly fetchImpl: typeof fetch

  constructor(config: ParallelSearchClientConfig = {}) {
    const environmentKey =
      typeof process === 'undefined' ? undefined : process.env.PARALLEL_API_KEY
    const apiKey = config.apiKey?.trim() || environmentKey?.trim()

    if (!apiKey) {
      throw new Error(
        'PARALLEL_API_KEY is required. Set it in your environment or pass an explicit apiKey.',
      )
    }

    this.apiKey = apiKey
    this.baseURL = (config.baseURL ?? 'https://api.parallel.ai').replace(
      /\/+$/,
      '',
    )
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async search(
    request: ParallelSearchRequest,
    options: { signal?: AbortSignal } = {},
  ): Promise<ParallelSearchResponse> {
    const searchQueries = request.search_queries.map((query) => query.trim())

    if (
      searchQueries.length === 0 ||
      searchQueries.some((query) => query.length === 0)
    ) {
      throw new Error(
        'ParallelSearchClient.search requires at least one non-empty search query.',
      )
    }

    if (request.mode && !searchModes.includes(request.mode)) {
      throw new Error('mode must be turbo, fast, basic, or advanced.')
    }

    const maxResults = request.advanced_settings?.max_results
    if (
      maxResults !== undefined &&
      (!Number.isInteger(maxResults) || maxResults < 1)
    ) {
      throw new Error('max_results must be a positive integer.')
    }

    const sourcePolicy = request.advanced_settings?.source_policy
    const domainCount =
      (sourcePolicy?.include_domains?.length ?? 0) +
      (sourcePolicy?.exclude_domains?.length ?? 0)
    if (domainCount > 200) {
      throw new Error(
        'include_domains and exclude_domains can contain at most 200 domains combined.',
      )
    }

    const response = await this.fetchImpl(`${this.baseURL}/v1/search`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        ...request,
        search_queries: searchQueries,
      }),
      signal: options.signal,
    })

    if (!response.ok) {
      let details = ''
      try {
        details = await response.text()
      } catch {
        // Preserve the HTTP status when the response body cannot be read.
      }
      throw new Error(
        `Parallel Search API request failed: ${response.status} ${response.statusText}${
          details ? `: ${details}` : ''
        }`,
      )
    }

    return parseSearchResponse(await response.json())
  }
}

function isSearchResult(value: unknown): value is ParallelSearchResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    typeof value.url === 'string' &&
    'excerpts' in value &&
    Array.isArray(value.excerpts) &&
    value.excerpts.every((excerpt) => typeof excerpt === 'string') &&
    (!('title' in value) ||
      value.title === null ||
      typeof value.title === 'string') &&
    (!('publish_date' in value) ||
      value.publish_date === null ||
      typeof value.publish_date === 'string')
  )
}

function parseSearchResponse(value: unknown): ParallelSearchResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('search_id' in value) ||
    typeof value.search_id !== 'string' ||
    !('session_id' in value) ||
    typeof value.session_id !== 'string' ||
    !('results' in value) ||
    !Array.isArray(value.results) ||
    !value.results.every(isSearchResult)
  ) {
    throw new Error('Parallel Search API returned an invalid response.')
  }

  return {
    search_id: value.search_id,
    session_id: value.session_id,
    results: value.results.map((result) => ({
      url: result.url,
      excerpts: result.excerpts,
      ...(result.title ? { title: result.title } : {}),
      ...(result.publish_date ? { publish_date: result.publish_date } : {}),
    })),
  }
}
