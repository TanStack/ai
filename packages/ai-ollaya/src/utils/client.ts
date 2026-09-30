/**
 * Configuration for the Ollaya HTTP client used by the adapters in this
 * package. Requests are made with plain `fetch` — no SDK dependency.
 *
 * Ollaya is a local decision server, so there is no required API key. Pass
 * `apiKey` when the server has `OLLAYA_API_KEY` set, or when a proxy
 * requires a bearer token.
 */
export interface OllayaClientConfig {
  /** Bearer token for `OLLAYA_API_KEY`, or for an auth proxy. */
  apiKey?: string

  /**
   * Base URL for every request (defaults to `http://127.0.0.1:11435`). Same
   * option name as the other adapters, so a gateway config can be spread into
   * any of them. A non-blank value wins over `baseUrl`.
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

  /** Override `fetch`. Defaults to global `fetch`. */
  fetch?: typeof fetch
}

export const OLLAYA_DEFAULT_BASE_URL = 'http://127.0.0.1:11435'

/** Resolve the effective base URL (no trailing slash) and headers. */
export function resolveOllayaTransport(config: OllayaClientConfig) {
  return {
    baseUrl: (
      config.baseURL?.trim() ||
      config.baseUrl?.trim() ||
      OLLAYA_DEFAULT_BASE_URL
    ).replace(/\/+$/, ''),
    headers: config.defaultHeaders ?? config.headers ?? {},
  }
}
