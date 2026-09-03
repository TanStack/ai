import { HTTPClient, Mistral } from '@mistralai/mistralai'

export interface MistralClientConfig {
  /** Mistral API key. */
  apiKey: string

  /**
   * Base URL for every request. Same option name as the other adapters, so a
   * gateway config can be spread into any of them. Wins over `serverURL` when
   * both are set.
   */
  baseURL?: string

  /** Alias of `baseURL`. */
  serverURL?: string

  /** Optional request timeout (ms). */
  timeoutMs?: number

  /** Optional default headers to include with every request. */
  defaultHeaders?: Record<string, string>

  /**
   * Optional Google / Vertex access token. When set, it replaces
   * `apiKey` on the Authorization header.
   */
  getAccessToken?: () => Promise<string>

  /**
   * Optional chat completions URL. Vertex uses this for
   * `:rawPredict` and `:streamRawPredict`.
   */
  resolveRequestUrl?: (stream: boolean) => string

  /** Optional model id sent on the wire. Vertex uses publisher model ids. */
  requestModel?: string
}

/**
 * Creates a Mistral SDK client instance.
 */
export function createMistralClient(config: MistralClientConfig): Mistral {
  const {
    apiKey,
    baseURL,
    timeoutMs,
    defaultHeaders,
    getAccessToken,
    resolveRequestUrl,
  } = config
  const serverURL = baseURL ?? config.serverURL

  const needsHook =
    (defaultHeaders !== undefined && Object.keys(defaultHeaders).length > 0) ||
    getAccessToken !== undefined ||
    resolveRequestUrl !== undefined

  let httpClient: HTTPClient | undefined
  if (needsHook) {
    httpClient = new HTTPClient()
    httpClient.addHook('beforeRequest', async (req) => {
      const nextUrl =
        resolveRequestUrl === undefined ? req.url : resolveRequestUrl(false)
      const next = new Request(nextUrl, req)
      if (defaultHeaders) {
        for (const [key, value] of Object.entries(defaultHeaders)) {
          next.headers.set(key, value)
        }
      }
      if (getAccessToken !== undefined) {
        next.headers.set('Authorization', `Bearer ${await getAccessToken()}`)
      }
      return next
    })
  }

  return new Mistral({
    apiKey,
    ...(serverURL !== undefined ? { serverURL } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(httpClient !== undefined ? { httpClient } : {}),
  })
}

/**
 * Gets Mistral API key from environment variables.
 * @throws Error if MISTRAL_API_KEY is not found
 */
export function getMistralApiKeyFromEnv(): string {
  let key: string | undefined

  if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
    key = process.env.MISTRAL_API_KEY
  } else {
    const g = globalThis as { window?: { env?: Record<string, string> } }
    key = g.window?.env?.MISTRAL_API_KEY
  }

  if (!key) {
    throw new Error(
      'MISTRAL_API_KEY is required. In Node.js set it as an environment variable; in browser environments inject it via window.env.MISTRAL_API_KEY or use the factory function with an explicit API key.',
    )
  }

  return key
}

/**
 * Generates a unique ID with a prefix.
 */
export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
