import { getApiKeyFromEnv } from '@tanstack/ai-utils'

/**
 * Configuration for the Cohere HTTP client used by the adapters in this
 * package. Requests are made with plain `fetch` — no Cohere SDK dependency.
 */
export interface CohereClientConfig {
  /** Cohere API key. */
  apiKey: string

  /**
   * Base URL for every request (defaults to `https://api.cohere.com`). Same
   * option name as the other adapters, so a gateway config can be spread into
   * any of them. Wins over `baseUrl` when both are set.
   */
  baseURL?: string

  /** Alias of `baseURL`. */
  baseUrl?: string

  /**
   * Headers sent with every request. Same option name as the other adapters.
   * Wins over `headers` when both are set.
   */
  defaultHeaders?: Record<string, string>

  /** Alias of `defaultHeaders`. */
  headers?: Record<string, string>

  /**
   * Cohere's embed API does not fetch remote image URLs itself. When this is
   * enabled the adapter downloads http(s) image URLs and inlines them as
   * base64 `data:` URIs before sending the request. Disabled by default.
   */
  allowUrlFetch?: boolean

  /** Request timeout in milliseconds for API and image URL fetches (default: 30_000). */
  timeout?: number
}

export const COHERE_DEFAULT_BASE_URL = 'https://api.cohere.com'

/** Resolve the effective base URL (no trailing slash) and headers. */
export function resolveCohereTransport(config: CohereClientConfig): {
  baseUrl: string
  headers: Record<string, string>
} {
  return {
    baseUrl: (
      config.baseURL ??
      config.baseUrl ??
      COHERE_DEFAULT_BASE_URL
    ).replace(/\/+$/, ''),
    headers: config.defaultHeaders ?? config.headers ?? {},
  }
}

/**
 * Gets Cohere API key from environment variables.
 *
 * Looks for `COHERE_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @throws Error if COHERE_API_KEY is not found
 */
export function getCohereApiKeyFromEnv(): string {
  return getApiKeyFromEnv('COHERE_API_KEY')
}
