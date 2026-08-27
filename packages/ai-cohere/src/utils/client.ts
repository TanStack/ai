import { getApiKeyFromEnv } from '@tanstack/ai-utils'

export interface CohereClientConfig {
  /** Cohere API key. */
  apiKey: string

  /** Optional base URL override (defaults to `https://api.cohere.com`). */
  baseUrl?: string

  /** Optional default headers to include with every request. */
  headers?: Record<string, string>

  allowUrlFetch?: boolean

  /** Request timeout in milliseconds for API and image URL fetches (default: 30_000). */
  timeout?: number
}

export const COHERE_DEFAULT_BASE_URL = 'https://api.cohere.com'

export function getCohereApiKeyFromEnv(): string {
  return getApiKeyFromEnv('COHERE_API_KEY')
}
