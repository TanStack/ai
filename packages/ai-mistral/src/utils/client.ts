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

  getAccessToken?: () => Promise<string>

  resolveRequestUrl?: (stream: boolean) => string

  /** Optional model id sent on the wire. Vertex uses publisher model ids. */
  requestModel?: string
}

export function createMistralClient(config: MistralClientConfig): Mistral {
  const {
    apiKey,
    serverURL,
    timeoutMs,
    defaultHeaders,
    getAccessToken,
    resolveRequestUrl,
  } = config

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
        const headerEntries = Object.entries(defaultHeaders)
        for (const [key, value] of headerEntries) {
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

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
