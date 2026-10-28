import { getApiKeyFromEnv } from '@tanstack/ai-utils'

/**
 * Configuration for the TypeSafe HTTP client used by the adapters in this
 * package. Requests are made with plain `fetch` — no TypeSafe SDK dependency.
 */
export interface TypesafeClientConfig {
  /** TypeSafe API key. */
  apiKey: string

  /**
   * Base URL for every request (defaults to `https://api.typesafe.ai`). Same
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

  /** Request timeout in milliseconds (default: 30_000). */
  timeout?: number

  /** Override `fetch`. Defaults to global `fetch`. */
  fetch?: typeof fetch
}

export const TYPESAFE_DEFAULT_BASE_URL = 'https://api.typesafe.ai'

/** Resolve the effective base URL (no trailing slash) and headers. */
export function resolveTypesafeTransport(config: TypesafeClientConfig) {
  return {
    baseUrl: (
      config.baseURL ??
      config.baseUrl ??
      TYPESAFE_DEFAULT_BASE_URL
    ).replace(/\/+$/, ''),
    headers: config.defaultHeaders ?? config.headers ?? {},
  }
}

/**
 * Gets the TypeSafe API key from environment variables.
 *
 * Looks for `TYPESAFE_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @throws Error if TYPESAFE_API_KEY is not found
 */
export function getTypesafeApiKeyFromEnv() {
  return getApiKeyFromEnv('TYPESAFE_API_KEY')
}
