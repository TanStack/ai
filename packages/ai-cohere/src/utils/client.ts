/**
 * Cohere client configuration shared by the rerank adapter.
 */
export interface CohereClientConfig {
  /** Cohere API key. Required by the adapter factories. */
  apiKey: string
  /** Override the API base URL. Defaults to `https://api.cohere.com`. */
  baseUrl?: string
  /** Extra headers merged into every request. */
  headers?: Record<string, string>
}

export const COHERE_DEFAULT_BASE_URL = 'https://api.cohere.com'

/**
 * Reads the Cohere API key from the environment.
 *
 * Looks for `COHERE_API_KEY` in `process.env` (Node) or `window.env`
 * (browser with injected env).
 *
 * @throws Error if `COHERE_API_KEY` is not found.
 */
export function getCohereApiKeyFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' &&
    (globalThis as Record<string, unknown>).window
      ? ((
          (globalThis as Record<string, unknown>).window as Record<
            string,
            unknown
          >
        ).env as Record<string, string> | undefined)
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.['COHERE_API_KEY']
  if (!key) {
    throw new Error(
      'COHERE_API_KEY not found in environment. Pass an API key explicitly via createCohereRerank(model, apiKey).',
    )
  }
  return key
}
