import { toolDefinition } from '@tanstack/ai'
import { PerplexitySearchClient } from './client'
import type {
  PerplexitySearchClientConfig,
  PerplexitySearchResult,
} from './client'

/**
 * Build a TanStack AI tool that performs real-time web search via Perplexity.
 *
 * The tool returns an array of `{title, url, snippet, date?}` results suitable
 * for citation/grounding in an LLM agent loop.
 *
 * @example
 * ```ts
 * import { perplexitySearchTool } from '@tanstack/ai-perplexity'
 *
 * const search = perplexitySearchTool().server(async (args) => args)
 * ```
 */
export function perplexitySearchTool(
  config: PerplexitySearchClientConfig & {
    /** Override the tool name (defaults to `perplexity_search`). */
    name?: string
    /** Override the tool description shown to the model. */
    description?: string
    /** Default max_results applied when the model does not provide one. */
    defaultMaxResults?: number
  } = {},
) {
  const {
    name,
    description,
    defaultMaxResults,
    ...clientConfig
  } = config

  // Lazily construct the client so missing API keys don't blow up at import
  // time (e.g. on bundlers that statically evaluate module top-level).
  let client: PerplexitySearchClient | null = null
  const getClient = () => {
    if (!client) client = new PerplexitySearchClient(clientConfig)
    return client
  }

  return toolDefinition({
    name: name ?? 'perplexity_search',
    description:
      description ??
      'Search the web for up-to-date information using the Perplexity Search API. Returns a ranked list of web results with titles, URLs, snippets, and publication dates.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'The search query string.',
        },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description:
            'Maximum number of results to return. Defaults to the API default (10).',
        },
        search_domain_filter: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Restrict results by domain. Use bare hostnames to allowlist (e.g. ["nytimes.com"]) or "-domain.com" to denylist. Allow and deny entries must NOT be mixed.',
        },
        search_recency_filter: {
          type: 'string',
          enum: ['hour', 'day', 'week', 'month', 'year'],
          description: 'Only include results from the given recency window.',
        },
        search_after_date_filter: {
          type: 'string',
          description: 'Only include results published on or after this date (m/d/yyyy).',
        },
        search_before_date_filter: {
          type: 'string',
          description: 'Only include results published on or before this date (m/d/yyyy).',
        },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['results'],
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'url', 'snippet'],
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              snippet: { type: 'string' },
              date: { type: 'string' },
            },
          },
        },
      },
    },
  }).server(async (args) => {
    const input = (args ?? {}) as {
      query: string
      max_results?: number
      search_domain_filter?: Array<string>
      search_recency_filter?: 'hour' | 'day' | 'week' | 'month' | 'year'
      search_after_date_filter?: string
      search_before_date_filter?: string
    }

    const response = await getClient().search({
      query: input.query,
      max_results: input.max_results ?? defaultMaxResults,
      search_domain_filter: input.search_domain_filter,
      search_recency_filter: input.search_recency_filter,
      search_after_date_filter: input.search_after_date_filter,
      search_before_date_filter: input.search_before_date_filter,
    })

    const results: Array<PerplexitySearchResult> = response.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      ...(r.date ? { date: r.date } : {}),
    }))

    return { results }
  })
}
