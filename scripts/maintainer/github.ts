/**
 * Thin GitHub API client. Token and fetch are injected so tests never touch
 * the network and callers control auth.
 */

export interface GitHubClient {
  graphql: <T>(query: string, variables: Record<string, unknown>) => Promise<T>
  rest: (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ) => Promise<unknown>
}

export interface GitHubClientOptions {
  token: string
  fetchImpl?: typeof fetch
  baseUrl?: string
}

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? 'https://api.github.com'
  const headers = {
    authorization: `Bearer ${options.token}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'tanstack-ai-maintainer-toolset',
    'x-github-api-version': '2022-11-28',
  }

  return {
    async graphql<T>(
      query: string,
      variables: Record<string, unknown>,
    ): Promise<T> {
      const response = await fetchImpl(`${baseUrl}/graphql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
      })
      const payload: unknown = await response.json()
      if (!response.ok) {
        throw new Error(
          `GitHub GraphQL HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`,
        )
      }
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'errors' in payload &&
        Array.isArray(payload.errors) &&
        (payload as { errors: Array<unknown> }).errors.length > 0
      ) {
        throw new Error(
          `GitHub GraphQL errors: ${JSON.stringify(payload.errors).slice(0, 800)}`,
        )
      }
      return (payload as { data: T }).data
    },

    async rest(method, path, body): Promise<unknown> {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const text = await response.text()
      if (!response.ok) {
        throw new Error(
          `GitHub REST ${method} ${path} → HTTP ${response.status}: ${text.slice(0, 500)}`,
        )
      }
      return text.length > 0 ? JSON.parse(text) : null
    },
  }
}
