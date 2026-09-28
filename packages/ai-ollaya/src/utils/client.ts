/**
 * Configuration for the Ollaya HTTP client used by the adapters in this
 * package. Requests are made with plain `fetch` — no SDK dependency.
 *
 * Ollaya is a local decision server, so there is no required API key. Pass
 * `apiKey` only when you front Ollaya with an authenticating proxy.
 */
export interface OllayaClientConfig {
  /** Optional bearer token, for when Ollaya sits behind an auth proxy. */
  apiKey?: string

  /**
   * Base URL for every request (defaults to `http://127.0.0.1:11435`). Same
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

export const OLLAYA_DEFAULT_BASE_URL = 'http://127.0.0.1:11435'

/** Resolve the effective base URL (no trailing slash) and headers. */
export function resolveOllayaTransport(config: OllayaClientConfig) {
  return {
    baseUrl: (
      config.baseURL ??
      config.baseUrl ??
      OLLAYA_DEFAULT_BASE_URL
    ).replace(/\/+$/, ''),
    headers: config.defaultHeaders ?? config.headers ?? {},
  }
}
