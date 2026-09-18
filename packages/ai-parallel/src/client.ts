import Parallel from 'parallel-web'

const searchModes = ['turbo', 'fast', 'basic', 'advanced'] as const

export type ParallelSearchMode = NonNullable<Parallel.SearchParams['mode']>

export type ParallelSearchSourcePolicy = Parallel.SourcePolicy

export type ParallelSearchAdvancedSettings = Parallel.AdvancedSearchSettings

export type ParallelSearchRequest = Omit<
  Parallel.SearchParams,
  'search_queries'
> & {
  search_queries: ReadonlyArray<string>
}

export type ParallelSearchResult = Omit<
  Parallel.WebSearchResult,
  'title' | 'publish_date'
> & {
  title?: string
  publish_date?: string
}

export type ParallelSearchResponse = Omit<Parallel.SearchResult, 'results'> & {
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
  private readonly client: Parallel

  constructor(config: ParallelSearchClientConfig = {}) {
    const environmentKey =
      typeof process === 'undefined' ? undefined : process.env.PARALLEL_API_KEY
    const apiKey = config.apiKey?.trim() || environmentKey?.trim()

    if (!apiKey) {
      throw new Error(
        'PARALLEL_API_KEY is required. Set it in your environment or pass an explicit apiKey.',
      )
    }

    this.client = new Parallel({
      apiKey,
      baseURL: config.baseURL,
      fetch: config.fetch,
      maxRetries: 0,
    })
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
      maxResults != null &&
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

    const { signal } = options
    signal?.throwIfAborted()

    const search = this.client.search(
      {
        ...request,
        search_queries: searchQueries,
      },
      options,
    )

    if (!signal) return normalizeSearchResponse(await search)

    const response = await new Promise<Parallel.SearchResult>(
      (resolve, reject) => {
        const onAbort = () => reject(signal.reason)
        signal.addEventListener('abort', onAbort, { once: true })
        search
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', onAbort))
      },
    )

    return normalizeSearchResponse(response)
  }
}

/** Preserve TanStack's non-null citation contract without discarding SDK metadata. */
function normalizeSearchResponse(
  response: Parallel.SearchResult,
): ParallelSearchResponse {
  if (
    typeof response?.search_id !== 'string' ||
    typeof response.session_id !== 'string' ||
    !Array.isArray(response.results)
  ) {
    throw new Error('Parallel Search API returned an invalid response.')
  }

  return {
    ...response,
    results: response.results.map((result) => {
      if (
        typeof result?.url !== 'string' ||
        !Array.isArray(result.excerpts) ||
        result.excerpts.some((excerpt) => typeof excerpt !== 'string') ||
        (result.title != null && typeof result.title !== 'string') ||
        (result.publish_date != null && typeof result.publish_date !== 'string')
      ) {
        throw new Error('Parallel Search API returned an invalid response.')
      }

      const { title, publish_date, ...citation } = result

      return {
        ...citation,
        ...(title ? { title } : {}),
        ...(publish_date ? { publish_date } : {}),
      }
    }),
  }
}
