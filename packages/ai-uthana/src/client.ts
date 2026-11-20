import { getApiKeyFromEnv } from '@tanstack/ai-utils'

export const DEFAULT_UTHANA_URL = 'https://uthana.com'

export interface UthanaClientConfig {
  /** Uthana API key. Defaults to `UTHANA_API_KEY`. */
  apiKey?: string
  /** Defaults to `https://uthana.com`. */
  baseUrl?: string
  /** Override fetch, for a proxy or tests. */
  fetch?: typeof fetch
}

export interface ResolvedUthanaConfig {
  baseUrl: string
  authorization: string
  fetch: typeof fetch
}

export function resolveUthanaConfig(
  config?: UthanaClientConfig,
): ResolvedUthanaConfig {
  const apiKey = config?.apiKey ?? getApiKeyFromEnv('UTHANA_API_KEY')
  const fetchImpl = config?.fetch ?? globalThis.fetch
  return {
    baseUrl: (config?.baseUrl ?? DEFAULT_UTHANA_URL).replace(/\/+$/, ''),
    // Uthana uses HTTP Basic auth: the key is the user name, no password.
    authorization: `Basic ${btoa(`${apiKey}:`)}`,
    fetch: (input, init) => fetchImpl(input, init),
  }
}

interface GraphqlResponse<T> {
  data?: T | null
  errors?: Array<{ message: string }>
}

/** Run one GraphQL request. Throws on HTTP or GraphQL errors. */
export async function uthanaGraphql<T>(
  config: ResolvedUthanaConfig,
  query: string,
  variables: Record<string, unknown>,
  abortSignal?: AbortSignal,
): Promise<T> {
  const response = await config.fetch(`${config.baseUrl}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: config.authorization,
    },
    body: JSON.stringify({ query, variables }),
    ...(abortSignal ? { signal: abortSignal } : {}),
  })
  return readGraphqlResponse<T>(response)
}

export async function readGraphqlResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  let body: GraphqlResponse<T> | undefined
  try {
    body = JSON.parse(text) as GraphqlResponse<T>
  } catch {
    body = undefined
  }
  if (!response.ok || !body) {
    throw new Error(
      `Uthana request failed (${response.status} ${response.statusText}): ${text.slice(0, 300)}`,
    )
  }
  if (body.errors?.length) {
    throw new Error(`Uthana: ${body.errors.map((e) => e.message).join('; ')}`)
  }
  if (!body.data) throw new Error('Uthana returned no data')
  return body.data
}
