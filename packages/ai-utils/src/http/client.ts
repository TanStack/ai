import { mergeHeaders } from './headers'
import type { HeadersLike } from './headers'

/**
 * Builds the error a provider throws for a non-2xx response. It gets the same
 * arguments as the Stainless SDKs' `APIError.generate`:
 *
 * - `status`: the HTTP status.
 * - `body`: the parsed JSON body, or `undefined` when the body is not JSON.
 * - `message`: the raw body text when it is not JSON, else `undefined`.
 * - `headers`: the response headers.
 *
 * The provider builds the message (for example `APIError.makeMessage`).
 */
export type ErrorFactory = (
  status: number | undefined,
  body: unknown,
  message: string | undefined,
  headers: Headers | undefined,
) => Error

/** A `fetch` the client can call. The global `fetch` fits. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface HttpClientOptions {
  /** Base URL. A request path is added to its end. */
  baseURL: string
  /** Headers on every request. A request header with the same name wins. */
  headers?: HeadersLike
  /** Query parameters on every request. */
  defaultQuery?: Record<string, string | undefined>
  /**
   * Longest `retry-after` wait in ms that the client obeys. A longer wait
   * uses the backoff. Default 60000 (OpenAI). Anthropic uses `2 ** 31 - 1`.
   */
  maxRetryAfterMs?: number
  /** Called once per attempt with `(url, init)`. Default: global `fetch`. */
  fetch?: FetchLike
  /** Extra `fetch` init options (for example a `dispatcher`). */
  fetchOptions?: RequestInit
  /** Time limit in ms for each attempt to get response headers. Default 600000. */
  timeout?: number
  /** Retries after the first attempt. Default 2. */
  maxRetries?: number
  /** Builds the error for a non-2xx response. */
  makeError: ErrorFactory
  /** Builds the error when the connection fails. Default: `APIConnectionError`. */
  makeConnectionError?: (cause: unknown) => Error
  /** Builds the error when an attempt times out. Default: `APIConnectionTimeoutError`. */
  makeTimeoutError?: () => Error
  /** Builds the error when the caller's signal aborts. Default: `APIUserAbortError`. */
  makeAbortError?: () => Error
  /** Receives one line for each retry and each failed request. */
  logger?: (message: string, details: Record<string, unknown>) => void
}

export interface HttpRequest {
  method: string
  /** Path added to `baseURL`, or an absolute URL. */
  path: string
  /** Arrays become `key[]=v`, objects become `key[sub]=v`. `undefined` is skipped. */
  query?: Record<string, unknown>
  headers?: HeadersLike
  /**
   * A plain object or array is sent as JSON with
   * `content-type: application/json`. A string, `FormData`, `Blob`,
   * `ArrayBuffer`, typed array, `URLSearchParams`, or `ReadableStream` is sent
   * as it is. A `ReadableStream` body is never retried.
   */
  body?: unknown
  signal?: AbortSignal | null
  timeout?: number
  maxRetries?: number
  /**
   * ponytail: a hint only. The client never reads a 2xx body, so stream and
   * non-stream calls run the same code. Read a stream with `parseSSE`.
   */
  stream?: boolean
}

export interface HttpClient {
  /**
   * Sends one request with the Stainless retry rules and returns the 2xx
   * `Response` without reading its body.
   *
   * @throws The `makeError` result for a non-2xx response, the
   * `makeConnectionError` / `makeTimeoutError` result when the connection
   * fails after all retries, or the `makeAbortError` result when the caller's
   * signal aborts.
   */
  request: (request: HttpRequest) => Promise<Response>
}

const namedError = (name: string, message: string, cause?: unknown) =>
  Object.assign(new Error(message, { cause }), { name })

const isRawBody = (body: unknown): body is BodyInit =>
  typeof body === 'string' ||
  body instanceof ArrayBuffer ||
  ArrayBuffer.isView(body) ||
  body instanceof Blob ||
  body instanceof FormData ||
  body instanceof URLSearchParams ||
  body instanceof ReadableStream

// Same as the SDK `isAbortError`, plus native "timed out" connection errors.
const isTimeoutError = (error: unknown) =>
  (typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError') ||
  /timed? ?out/i.test(
    String(error) + (error instanceof Error ? String(error.cause) : ''),
  )

function appendQuery(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined) return
  if (Array.isArray(value)) {
    for (const item of value) appendQuery(params, `${key}[]`, item)
  } else if (value instanceof Date) {
    params.append(key, value.toISOString())
  } else if (value !== null && typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) {
      appendQuery(params, `${key}[${name}]`, item)
    }
  } else {
    params.append(key, value === null ? '' : String(value))
  }
}

/**
 * The Stainless `shouldRetry` rules: obey `x-should-retry`, else retry 408,
 * 409, 429, and 5xx.
 */
export function shouldRetry(response: Response) {
  const header = response.headers.get('x-should-retry')
  if (header === 'true') return true
  if (header === 'false') return false
  const { status } = response
  return status === 408 || status === 409 || status === 429 || status >= 500
}

/**
 * The Stainless retry delay in ms: `retry-after-ms`, then `retry-after`
 * (seconds or an HTTP date) when it is 0 to `maxRetryAfterMs`, else exponential
 * backoff `min(0.5 * 2^n, 8)` seconds with up to 25% jitter.
 */
export function retryDelay(
  headers: Headers | undefined,
  retriesRemaining: number,
  maxRetries: number,
  maxRetryAfterMs = 60000,
) {
  let delay: number | undefined
  const retryAfterMs = headers?.get('retry-after-ms')
  if (retryAfterMs) {
    const ms = parseFloat(retryAfterMs)
    if (!Number.isNaN(ms)) delay = ms
  }
  const retryAfter = headers?.get('retry-after')
  if (retryAfter && delay === undefined) {
    const seconds = parseFloat(retryAfter)
    delay = Number.isNaN(seconds)
      ? Date.parse(retryAfter) - Date.now()
      : seconds * 1000
  }
  // NaN fails both comparisons, so it falls through to the backoff too.
  if (delay !== undefined && delay >= 0 && delay <= maxRetryAfterMs)
    return delay
  const backoff = Math.min(0.5 * 2 ** (maxRetries - retriesRemaining), 8)
  return backoff * (1 - Math.random() * 0.25) * 1000
}

const normalizeRetries = (value: number | undefined) =>
  value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : 2

/**
 * Creates a small fetch client with the Stainless SDK request rules:
 * retries, per-attempt timeout, abort, JSON bodies, and provider errors.
 *
 * @example
 * const http = createHttpClient({
 *   baseURL: 'https://api.openai.com/v1',
 *   headers: { authorization: `Bearer ${apiKey}` },
 *   makeError: (status, body, message, headers) =>
 *     APIError.generate(status, body, message, headers),
 * })
 * const response = await http.request({ method: 'post', path: '/responses', body })
 */
export function createHttpClient(options: HttpClientOptions) {
  const makeAbortError =
    options.makeAbortError ??
    (() => namedError('APIUserAbortError', 'Request was aborted.'))
  const makeTimeoutError =
    options.makeTimeoutError ??
    (() => namedError('APIConnectionTimeoutError', 'Request timed out.'))
  const makeConnectionError =
    options.makeConnectionError ??
    ((cause: unknown) =>
      namedError('APIConnectionError', 'Connection error.', cause))
  const log = options.logger ?? (() => {})

  const buildURL = (path: string, query: Record<string, unknown> = {}) => {
    const { baseURL } = options
    const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(path)
    const joined =
      baseURL.endsWith('/') && path.startsWith('/') ? path.slice(1) : path
    const url = new URL(isAbsolute ? path : baseURL + joined)
    const merged = { ...options.defaultQuery, ...query }
    for (const [key, value] of Object.entries(merged)) {
      if (value === undefined) continue
      url.searchParams.delete(key)
      appendQuery(url.searchParams, key, value)
    }
    return url.toString()
  }

  // Waits `ms`, or throws the abort error when `signal` aborts first.
  const sleep = (ms: number, signal: AbortSignal | null | undefined) =>
    new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(makeAbortError())
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      signal?.addEventListener('abort', onAbort, { once: true })
      // A signal that aborted before this wait never fires 'abort' again.
      if (signal?.aborted) onAbort()
    })

  const request = async (req: HttpRequest) => {
    const maxRetries = normalizeRetries(req.maxRetries ?? options.maxRetries)
    const timeout = req.timeout ?? options.timeout ?? 600000
    const fetchImpl = options.fetch ?? fetch
    const url = buildURL(req.path, req.query)
    const { body } = req
    const isJSONBody = body !== undefined && !isRawBody(body)
    const isStreamBody = body instanceof ReadableStream
    const init: RequestInit = {
      ...options.fetchOptions,
      method: req.method.toUpperCase(),
      headers: mergeHeaders(
        options.headers,
        isJSONBody ? { 'content-type': 'application/json' } : undefined,
        req.headers,
      ),
      ...(body === undefined
        ? {}
        : { body: isRawBody(body) ? body : JSON.stringify(body) }),
      ...(isStreamBody ? { duplex: 'half' } : {}),
    }
    const { signal } = req

    for (let attempt = 0; ; attempt++) {
      const retriesRemaining = isStreamBody ? 0 : maxRetries - attempt
      if (signal?.aborted) throw makeAbortError()

      // One controller per attempt. The timer only covers the wait for
      // headers; the caller's signal also cancels the body stream later.
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(abort, timeout)
      let response: Response
      try {
        response = await fetchImpl(url, { ...init, signal: controller.signal })
      } catch (error) {
        signal?.removeEventListener('abort', abort)
        if (signal?.aborted) throw makeAbortError()
        const isTimeout = isTimeoutError(error)
        if (retriesRemaining > 0) {
          log(`connection ${isTimeout ? 'timed out' : 'failed'} - retrying`, {
            url,
            retriesRemaining,
          })
          await sleep(
            retryDelay(undefined, retriesRemaining, maxRetries),
            signal,
          )
          continue
        }
        throw isTimeout ? makeTimeoutError() : makeConnectionError(error)
      } finally {
        clearTimeout(timer)
      }

      if (response.ok) return response

      const canRetry = retriesRemaining > 0 && shouldRetry(response)
      log(`${init.method} ${url} failed with status ${response.status}`, {
        retriesRemaining: canRetry ? retriesRemaining : 0,
      })
      if (canRetry) {
        await response.body?.cancel().catch(() => {})
        const delay = retryDelay(
          response.headers,
          retriesRemaining,
          maxRetries,
          options.maxRetryAfterMs,
        )
        await sleep(delay, signal)
        continue
      }
      const text = await response
        .text()
        .catch((error: unknown) =>
          error instanceof Error ? error.message : String(error),
        )
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        json = undefined
      }
      throw options.makeError(
        response.status,
        json,
        json ? undefined : text,
        response.headers,
      )
    }
  }

  return { request } satisfies HttpClient
}
