import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { ParallelSearchClient } from './client'
import type {
  ParallelSearchClientConfig,
  ParallelSearchMode,
  ParallelSearchSourcePolicy,
} from './client'

const inputSchema = z.object({
  query: z.string().trim().min(1).describe('The web search query.'),
  objective: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('The question or goal that focuses the search results.'),
  max_results: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum number of web results to return.'),
})

const outputSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      excerpts: z.array(z.string()),
      title: z.string().optional(),
      publish_date: z.string().optional(),
    }),
  ),
})

export interface ParallelSearchToolConfig extends ParallelSearchClientConfig {
  /** Tool name presented to the model. Defaults to parallel_search. */
  name?: string
  /** Tool description presented to the model. */
  description?: string
  /** Search mode applied to every request from this tool. */
  mode?: ParallelSearchMode
  /** Result limit applied when the model does not provide one. */
  defaultMaxResults?: number
  /** Application-controlled source restrictions for every search. */
  sourcePolicy?: ParallelSearchSourcePolicy
  /** Explicit search session to use for every request from this tool. */
  sessionId?: string
}

/** Build a server-side TanStack AI tool backed by Parallel Search. */
export function parallelSearchTool(config: ParallelSearchToolConfig = {}) {
  const {
    name,
    description,
    mode,
    defaultMaxResults,
    sourcePolicy,
    sessionId,
    ...clientConfig
  } = config

  if (
    defaultMaxResults !== undefined &&
    (!Number.isInteger(defaultMaxResults) || defaultMaxResults < 1)
  ) {
    throw new Error('defaultMaxResults must be a positive integer.')
  }

  let client: ParallelSearchClient | undefined

  return toolDefinition({
    name: name ?? 'parallel_search',
    description:
      description ??
      'Search the live web with Parallel and return ranked sources, URLs, publication dates, and relevant excerpts.',
    inputSchema,
    outputSchema,
  }).server(async ({ query, objective, max_results }, context) => {
    client ??= new ParallelSearchClient(clientConfig)
    const maxResults = max_results ?? defaultMaxResults

    const response = await client.search(
      {
        search_queries: [query],
        objective,
        mode,
        session_id: sessionId,
        advanced_settings:
          maxResults !== undefined || sourcePolicy
            ? { max_results: maxResults, source_policy: sourcePolicy }
            : undefined,
      },
      { signal: context?.abortSignal },
    )

    return { results: response.results }
  })
}
