import { getApiKeyFromEnv } from '@tanstack/ai-utils'

/**
 * Configuration for the Cohere HTTP client used by the adapters in this
 * package. Requests are made with plain `fetch` — no Cohere SDK dependency.
 */
export interface CohereClientConfig {
  /** Cohere API key. */
  apiKey: string

  /** Optional base URL override (defaults to `https://api.cohere.com`). */
  baseUrl?: string

  /** Optional default headers to include with every request. */
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
