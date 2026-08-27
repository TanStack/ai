import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { PerplexitySearchClient } from './client'
import type { PerplexitySearchClientConfig } from './client'

const searchRecency = z.enum(['hour', 'day', 'week', 'month', 'year'])

const inputSchema = z.object({
  query: z.string().min(1).describe('The search query string.'),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Maximum number of results to return. Defaults to defaultMaxResults when configured, otherwise the API default (10).',
    ),
  search_domain_filter: z
    .array(z.string())
    .max(20)
    .optional()
    .describe(
      'Restrict results by domain (max 20). Use bare hostnames to allowlist (e.g. ["nytimes.com"]) or "-domain.com" to denylist. Allow and deny entries must NOT be mixed.',
    ),
  search_recency_filter: searchRecency
    .optional()
    .describe('Only include results from the given recency window.'),
  search_after_date_filter: z
    .string()
    .optional()
    .describe(
      'Only include results published on or after this date (m/d/yyyy).',
    ),
  search_before_date_filter: z
    .string()
    .optional()
    .describe(
      'Only include results published on or before this date (m/d/yyyy).',
    ),
})

const outputSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      date: z.string().optional(),
      last_updated: z.string().optional(),
    }),
  ),
})

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
  const { name, description, defaultMaxResults, ...clientConfig } = config
  const invalidDefaultMaxResults =
    defaultMaxResults !== undefined &&
    (!Number.isInteger(defaultMaxResults) ||
      defaultMaxResults < 1 ||
      defaultMaxResults > 20)
  if (invalidDefaultMaxResults) {
    throw new Error('defaultMaxResults must be an integer between 1 and 20.')
  }

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
      'Search the web for up-to-date information using the Perplexity Search API. Returns a ranked list of web results with titles, URLs, snippets, and optional publication dates.',
    inputSchema,
    outputSchema,
  }).server(async (args, ctx) => {
    const response = await getClient().search(
      {
        query: args.query,
        max_results: args.max_results ?? defaultMaxResults,
        search_domain_filter: args.search_domain_filter,
        search_recency_filter: args.search_recency_filter,
        search_after_date_filter: args.search_after_date_filter,
        search_before_date_filter: args.search_before_date_filter,
      },
      { signal: ctx?.abortSignal },
    )

    return {
      results: response.results.map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        ...(result.date ? { date: result.date } : {}),
        ...(result.last_updated ? { last_updated: result.last_updated } : {}),
      })),
    }
  })
}
