// The HTTP layer of the @google/genai 2.10.0 `ApiClient`, for the Gemini
// Developer API with an API key. Same URLs, headers, timeout, extra body,
// retry options, and errors. The SDK telemetry headers (`User-Agent`,
// `x-goog-api-client`) are not sent.
import type { GoogleGenAIOptions, HttpOptions } from '@google/genai'

/**
 * The error the Gemini API calls throw for a 4xx or 5xx response. It has the
 * same `name`, `status`, and `message` as the @google/genai `ApiError`. The
 * message is the JSON error body.
 */
export class ApiError extends Error {
  status: number

  constructor(options: { message: string; status: number }) {
    super(options.message)
    this.name = 'ApiError'
    this.status = options.status
  }
}

export interface ApiRequest {
  /** Path after the API version, for example `models/x:generateContent`. */
  path: string
  method: 'GET' | 'POST' | 'DELETE'
  body?: string | Blob
  /** Per-call options. They are merged over the client options. */
  httpOptions?: HttpOptions
  abortSignal?: AbortSignal
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/'
const RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504]
// The fetch errors that p-retry (which the SDK uses) treats as network errors.
const NETWORK_ERROR_MESSAGES = [
  'Failed to fetch',
  'NetworkError when attempting to fetch resource.',
  'The Internet connection appears to be offline.',
  'Network request failed',
]

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function readEnv(name: string) {
  return typeof process === 'undefined'
    ? undefined
    : process.env[name]?.trim() || undefined
}

/**
 * Port of the SDK `resolveCloudFlag`: true when the client must use Vertex AI
 * (or Gemini Enterprise), from the options or the environment.
 */
export function usesVertexAI(options: GoogleGenAIOptions) {
  if (options.enterprise !== undefined || options.vertexai !== undefined) {
    if (
      options.enterprise !== undefined &&
      options.vertexai !== undefined &&
      options.enterprise !== options.vertexai
    ) {
      throw new Error(
        'enterprise and vertexAI flags have conflicting values, please set enterprise value only.',
      )
    }
    return options.enterprise ?? options.vertexai ?? false
  }
  const flag =
    readEnv('GOOGLE_GENAI_USE_ENTERPRISE') ??
    readEnv('GOOGLE_GENAI_USE_VERTEXAI')
  return flag?.toLowerCase() === 'true'
}

// Port of `ApiClient.patchHttpOptions`: an object value is merged one level
// deep, any other defined value replaces the old one.
function patchHttpOptions(base: HttpOptions, patch: HttpOptions) {
  const merged: HttpOptions = JSON.parse(JSON.stringify(base))
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'object') {
      Object.assign(merged, {
        [key]: { ...Reflect.get(merged, key), ...value },
      })
    } else if (value !== undefined) {
      Object.assign(merged, { [key]: value })
    }
  }
  return merged
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  const output = { ...target }
  for (const [key, value] of Object.entries(source)) {
    const current = output[key]
    output[key] =
      isPlainObject(value) && isPlainObject(current)
        ? deepMerge(current, value)
        : value
  }
  return output
}

// Port of `includeExtraBodyToRequestInit`.
function withExtraBody(
  body: string | Blob | undefined,
  extraBody: Record<string, unknown> | undefined,
) {
  if (!extraBody || Object.keys(extraBody).length === 0) return body
  if (body instanceof Blob) {
    console.warn(
      'includeExtraBodyToRequestInit: extraBody provided but current request body is a Blob. extraBody will be ignored as merging is not supported for Blob bodies.',
    )
    return body
  }
  let current: Record<string, unknown> = {}
  if (typeof body === 'string' && body.length > 0) {
    try {
      const parsed: unknown = JSON.parse(body)
      if (!isPlainObject(parsed)) {
        console.warn(
          'includeExtraBodyToRequestInit: Original request body is valid JSON but not a non-array object. Skip applying extraBody to the request body.',
        )
        return body
      }
      current = parsed
    } catch {
      console.warn(
        'includeExtraBodyToRequestInit: Original request body is not valid JSON. Skip applying extraBody to the request body.',
      )
      return body
    }
  }
  return JSON.stringify(deepMerge(current, extraBody))
}

/** Port of `throwErrorIfNotOK`. */
async function throwIfNotOK(response: Response) {
  if (response.ok) return
  const { status } = response
  const errorBody: unknown = response.headers
    .get('content-type')
    ?.includes('application/json')
    ? await response.json()
    : {
        error: {
          message: await response.text(),
          code: status,
          status: response.statusText,
        },
      }
  const message = JSON.stringify(errorBody)
  if (status >= 400 && status < 600) throw new ApiError({ message, status })
  throw new Error(message)
}

/** The response headers as a plain record, like the SDK `HttpResponse`. */
export function headerRecord(response: Response) {
  return Object.fromEntries(response.headers.entries())
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Creates the HTTP layer for one client.
 *
 * @param options - The SDK client options. `apiKey` is required here; the
 * caller sends Vertex AI and Google auth to the real SDK.
 */
export function createApiClient(options: GoogleGenAIOptions) {
  const { apiKey } = options
  const baseUrl =
    options.httpOptions?.baseUrl ?? readEnv('GOOGLE_GEMINI_BASE_URL')
  const clientHttpOptions = patchHttpOptions(
    {
      apiVersion: options.apiVersion ?? 'v1beta',
      baseUrl: DEFAULT_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
    },
    { ...options.httpOptions, ...(baseUrl !== undefined && { baseUrl }) },
  )

  // Port of `ApiClient.apiCall`: retries only when the client has
  // `retryOptions`, with the p-retry backoff (1 s, 2 s, 4 s, ...).
  const apiCall = async (url: string, init: RequestInit) => {
    const { retryOptions } = clientHttpOptions
    if (!retryOptions) return fetch(url, init)
    const retries = (retryOptions.attempts ?? 5) - 1
    for (let attempt = 0; ; attempt++) {
      let error: unknown
      try {
        const response = await fetch(url, init)
        if (response.ok) return response
        if (!RETRY_STATUS_CODES.includes(response.status)) {
          throw new Error(
            `Non-retryable exception ${response.statusText} sending request`,
          )
        }
        error = new Error(`Retryable HTTP Error: ${response.statusText}`)
      } catch (caught) {
        const isRetryable =
          caught instanceof Error &&
          !caught.message.startsWith('Non-retryable exception') &&
          !init.signal?.aborted &&
          (!(caught instanceof TypeError) ||
            NETWORK_ERROR_MESSAGES.includes(caught.message))
        if (!isRetryable) throw caught
        error = caught
      }
      if (attempt >= retries) throw error
      await sleep(1000 * 2 ** attempt)
    }
  }

  /**
   * Sends one request and returns the 2xx `Response`.
   *
   * @throws {@link ApiError} for a 4xx or 5xx response.
   */
  const request = async (req: ApiRequest) => {
    const httpOptions = req.httpOptions
      ? patchHttpOptions(clientHttpOptions, req.httpOptions)
      : clientHttpOptions
    const base = (httpOptions.baseUrl ?? '').replace(/\/$/, '')
    const url = new URL(
      [base, httpOptions.apiVersion, req.path].filter(Boolean).join('/'),
    )
    if (req.path.includes(':streamGenerateContent')) {
      url.searchParams.set('alt', 'sse')
    }

    const init: RequestInit = { method: req.method }
    if (req.method !== 'GET') {
      init.body = withExtraBody(req.body, httpOptions.extraBody)
    }
    const timeout = httpOptions.timeout ?? 0
    if (timeout > 0 || req.abortSignal) {
      const controller = new AbortController()
      if (timeout > 0) {
        const timer = setTimeout(() => controller.abort(), timeout)
        // Do not keep a Node.js process alive for the timer (like the SDK).
        if (typeof timer === 'object' && 'unref' in timer) timer.unref()
      }
      const { abortSignal } = req
      if (abortSignal?.aborted) controller.abort()
      abortSignal?.addEventListener('abort', () => controller.abort())
      init.signal = controller.signal
    }

    const headers = new Headers()
    for (const [name, value] of Object.entries(httpOptions.headers ?? {})) {
      headers.append(name, value)
    }
    if (timeout > 0) {
      headers.append('X-Server-Timeout', String(Math.ceil(timeout / 1000)))
    }
    if (apiKey !== undefined) {
      if (apiKey.startsWith('auth_tokens/')) {
        throw new Error('Ephemeral tokens are only supported by the live API.')
      }
      if (headers.get('x-goog-api-key') === null) {
        headers.append('x-goog-api-key', apiKey)
      }
    }
    init.headers = headers

    try {
      const response = await apiCall(url.toString(), init)
      await throwIfNotOK(response)
      return response
    } catch (error) {
      if (error instanceof Error) throw error
      throw new Error(`exception ${error} sending request`, { cause: error })
    }
  }

  return { request, httpOptions: clientHttpOptions }
}

export type ApiClient = ReturnType<typeof createApiClient>

/**
 * Port of `ApiClient.processStreamResponse`: reads a
 * `streamGenerateContent?alt=sse` body and yields each `data:` JSON value.
 *
 * reuse: http-core `parseSSE` hides the raw network chunks, and the SDK
 * checks each raw chunk for a JSON error body, so this keeps the SDK reader.
 */
export async function* readSdkStream(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Response body is empty')
  const decoder = new TextDecoder('utf-8')
  const delimiters = ['\n\n', '\r\r', '\r\n\r\n']
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        if (buffer.trim().length > 0) {
          throw new Error('Incomplete JSON segment at the end')
        }
        return
      }
      const chunk = decoder.decode(value, { stream: true })
      throwIfErrorChunk(chunk)
      buffer += chunk
      for (;;) {
        let index = -1
        let length = 0
        for (const delimiter of delimiters) {
          const found = buffer.indexOf(delimiter)
          if (found !== -1 && (index === -1 || found < index)) {
            index = found
            length = delimiter.length
          }
        }
        if (index === -1) break
        const event = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + length)
        if (event.startsWith('data:')) {
          const parsed: unknown = JSON.parse(event.slice(5).trim())
          yield parsed
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// A stream chunk that is a whole JSON error object (not an SSE event) is a
// failure the server reports with a 200 status.
function throwIfErrorChunk(chunk: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(chunk)
  } catch {
    return
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.error)) return
  const { code, status } = parsed.error
  if (typeof code === 'number' && code >= 400 && code < 600) {
    throw new ApiError({
      message: `got status: ${String(status)}. ${JSON.stringify(parsed)}`,
      status: code,
    })
  }
}
