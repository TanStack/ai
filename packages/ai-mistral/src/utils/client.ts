import { HTTPClient, Mistral } from '@mistralai/mistralai'

export interface MistralClientConfig {
  /** Mistral API key. */
  apiKey: string

  /** Optional server URL override. */
  serverURL?: string

  /** Optional request timeout (ms). */
  timeoutMs?: number

  /** Optional default headers to include with every request. */
  defaultHeaders?: Record<string, string>
}

/**
 * Creates a Mistral SDK client instance.
 */
export function createMistralClient(config: MistralClientConfig): Mistral {
  const { apiKey, serverURL, timeoutMs, defaultHeaders } = config

  let httpClient: HTTPClient | undefined
  if (defaultHeaders && Object.keys(defaultHeaders).length > 0) {
    httpClient = new HTTPClient()
    httpClient.addHook('beforeRequest', (req) => {
      for (const [key, value] of Object.entries(defaultHeaders)) {
        req.headers.set(key, value)
      }
      return req
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
