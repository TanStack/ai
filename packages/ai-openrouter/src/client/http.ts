import { OpenRouterError } from '@openrouter/sdk/models/errors/openroutererror.js'
import { OpenRouterDefaultError } from '@openrouter/sdk/models/errors/openrouterdefaulterror.js'
import {
  ConnectionError,
  RequestAbortedError,
  RequestTimeoutError,
  UnexpectedClientError,
} from '@openrouter/sdk/models/errors/httpclienterrors.js'
import { parseSSE } from '@tanstack/ai-utils/http'
import { sendWith } from '@tanstack/ai-utils/kubb'
import { fits, remap } from './remap'
import type { RemapNode, RemapObjects } from './remap'
import type { ClientInstance } from '@tanstack/ai-utils/kubb'
import type { SDKOptions } from '@openrouter/sdk'
import type { RequestOptions } from '@openrouter/sdk/lib/sdks.js'
import type { RetryConfig } from '@openrouter/sdk/lib/retries.js'

/** Anything with the `request` method of the SDK `HTTPClient`. */
export interface HttpClientLike {
  request: (request: Request) => Promise<Response>
}

/** `SDKOptions`, with any object that has `request(Request)` as `httpClient`. */
export type OpenRouterClientOptions = Omit<SDKOptions, 'httpClient'> & {
  httpClient?: HttpClientLike
}

/** One SDK operation, as the generated `funcs/*.js` describe it. */
export interface Operation {
  method: 'GET' | 'POST'
  path: string
  query?: string
  /** The serialized body, JSON unless `bodyHeaders` say otherwise. `undefined` sends no body. */
  body?: BodyInit
  /** The headers of a generated body (its content type). Request headers win. */
  bodyHeaders?: Record<string, string>
  accept: string
  /** The request fields that override the client headers. */
  headers?: {
    httpReferer?: string
    appTitle?: string
    appCategories?: string
    xOpenRouterMetadata?: string
  }
  /** The 2xx status the operation expects. */
  okStatus: number
  /** The content types of a good response. */
  okTypes: ReadonlyArray<string>
  /** Statuses with a typed error class. Other 4xx and 5xx give `OpenRouterDefaultError`. */
  errorStatuses: ReadonlyArray<number>
}

const SERVER_PRODUCTION = 'https://openrouter.ai/api/v1'

const DEFAULT_BACKOFF = {
  initialInterval: 500,
  maxInterval: 60000,
  exponent: 1.5,
  maxElapsedTime: 3600000,
}

const DEFAULT_RETRY: RetryConfig = {
  strategy: 'backoff',
  backoff: DEFAULT_BACKOFF,
  retryConnectionErrors: true,
}

const ERROR_NAMES: Record<number, string> = {
  400: 'BadRequestResponseError',
  401: 'UnauthorizedResponseError',
  402: 'PaymentRequiredResponseError',
  403: 'ForbiddenResponseError',
  404: 'NotFoundResponseError',
  408: 'RequestTimeoutResponseError',
  413: 'PayloadTooLargeResponseError',
  422: 'UnprocessableEntityResponseError',
  429: 'TooManyRequestsResponseError',
  500: 'InternalServerResponseError',
  502: 'BadGatewayResponseError',
  503: 'ServiceUnavailableResponseError',
  524: 'EdgeNetworkTimeoutResponseError',
  529: 'ProviderOverloadedResponseError',
}

/**
 * Reads an environment variable where there is a `process.env`.
 * ponytail: the SDK also reads `Deno.env`; Deno has `process.env` too.
 */
function readEnv(name: string) {
  return typeof process === 'undefined' ? undefined : process.env[name]
}

/** The base URL, the same as the SDK `serverURLFromOptions`. */
function baseURLOf(serverURL: string | URL | undefined) {
  const url = new URL(serverURL || SERVER_PRODUCTION)
  url.pathname = url.pathname.replace(/\/+$/, '') + '/'
  return url
}

/** The SDK `fillGlobals`: header options from the environment. */
function withEnvDefaults(options: OpenRouterClientOptions) {
  return {
    ...options,
    httpReferer: options.httpReferer ?? readEnv('OPENROUTER_HTTP_REFERER'),
    appTitle: options.appTitle ?? readEnv('OPENROUTER_APP_TITLE'),
    appCategories:
      options.appCategories ?? readEnv('OPENROUTER_APP_CATEGORIES'),
  }
}

/** A generated operation, called with a client that sends through `send`. */
export type GeneratedOperation = (
  client: ClientInstance,
) => Promise<{ response: Response }>

/** The errors that have a typed class for chat and responses. */
const TEXT_ERRORS = [
  400, 401, 402, 403, 404, 408, 413, 422, 429, 500, 502, 503, 524, 529,
]

/**
 * Gives a function that sends one operation with these client options. It
 * reads the environment and the server URL once, as the SDK constructor does.
 */
export function createCaller(config: OpenRouterClientOptions) {
  const options = withEnvDefaults(config)
  const baseURL = baseURLOf(options.serverURL)
  return (operation: Operation, requestOptions?: RequestOptions) =>
    send(options, baseURL, operation, requestOptions)
}

/**
 * Sends a generated operation. It builds the path and the body; `call`
 * sends them with the client headers, auth, retries, and errors.
 */
export async function callGenerated(
  call: ReturnType<typeof createCaller>,
  generated: GeneratedOperation,
  operation: Omit<Operation, 'path' | 'body'>,
  requestOptions: RequestOptions | undefined,
) {
  let exchange: Exchange | undefined
  await generated(
    sendWith(async (built) => {
      exchange = await call(
        {
          ...operation,
          // The generated path starts with `/`. The base URL can have a path
          // (`/api/v1`), so the path stays relative to it.
          path: built.path.slice(1),
          body: built.body,
          bodyHeaders: built.headers,
        },
        requestOptions,
      )
      return exchange.response
    }),
  )
  if (!exchange) throw new Error('The generated operation sent no request')
  return exchange
}

/** The tables to remap the result of one text operation. */
export interface TextTables {
  objects: RemapObjects
  json: RemapNode
  event: RemapNode
}

/**
 * Sends a chat or responses request. Gives back the renamed JSON result, or
 * the renamed SSE events when the server streams.
 */
export async function sendText(
  call: ReturnType<typeof createCaller>,
  operation: GeneratedOperation,
  stream: boolean | null | undefined,
  request: Operation['headers'],
  tables: TextTables,
  requestOptions: RequestOptions | undefined,
) {
  const exchange = await callGenerated(
    call,
    operation,
    {
      method: 'POST',
      accept: stream ? 'text/event-stream' : 'application/json',
      headers: request,
      okStatus: 200,
      okTypes: ['application/json', 'text/event-stream'],
      errorStatuses: TEXT_ERRORS,
    },
    requestOptions,
  )
  const { response } = exchange
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    return events(response, tables)
  }
  return readJSON(exchange, tables.json, tables.objects)
}

/**
 * The SSE events of a response, parsed and renamed. Stops at `[DONE]`.
 * A `ReadableStream`, like the SDK `EventStream`, so `drainAfterTerminal`
 * can read the rest of the body after a terminal event.
 */
function events(response: Response, tables: TextTables) {
  // Cancelling the stream stops a pending body read at once.
  const stop = new AbortController()
  const source = (async function* () {
    for await (const event of parseSSE(response, stop.signal)) {
      if (event.data === '[DONE]') return
      // The SDK skips events with no data line.
      if (event.data === '') continue
      yield remap(JSON.parse(event.data), tables.event, tables.objects)
    }
  })()
  const stream = new ReadableStream<unknown>({
    async pull(controller) {
      try {
        const step = await source.next()
        if (step.done) controller.close()
        else controller.enqueue(step.value)
      } catch (error) {
        controller.error(error)
      }
    },
    cancel: () => stop.abort(),
  })
  // Same as the SDK `EventStream`: async iteration also where the runtime's
  // `ReadableStream` has none.
  return Object.assign(stream, {
    [Symbol.asyncIterator]: () => {
      const reader = stream.getReader()
      return {
        next: () => reader.read(),
        return: async () => {
          await reader.cancel('done')
          reader.releaseLock()
          return { done: true as const, value: undefined }
        },
        [Symbol.asyncIterator]() {
          return this
        },
      }
    },
  })
}

/**
 * Sends one operation the way the SDK `ClientSDK` does: headers, auth,
 * timeout, the Speakeasy retry loop, the `httpClient`, and the debug logger.
 * Throws the SDK error classes. Returns a response whose status and content
 * type match the operation.
 */
async function send(
  options: OpenRouterClientOptions,
  baseURL: URL,
  operation: Operation,
  requestOptions: RequestOptions | undefined,
) {
  const base = new URL(requestOptions?.serverURL ?? baseURL)
  base.pathname = base.pathname.replace(/\/+$/, '') + '/'
  const url = new URL(operation.path, base)
  if (operation.query) url.search = `?${operation.query}`

  const opHeaders = operation.headers
  const headerValues: Record<string, string | undefined> = {
    'Content-Type':
      operation.body === undefined ? undefined : 'application/json',
    Accept: operation.accept,
    'HTTP-Referer': opHeaders?.httpReferer ?? options.httpReferer,
    'X-OpenRouter-Metadata': opHeaders?.xOpenRouterMetadata,
    'X-OpenRouter-Categories':
      opHeaders?.appCategories ?? options.appCategories,
    'X-OpenRouter-Title': opHeaders?.appTitle ?? options.appTitle,
  }
  const headers = new Headers()
  for (const [name, value] of Object.entries({
    ...headerValues,
    ...operation.bodyHeaders,
  })) {
    if (value !== undefined) headers.set(name, value)
  }
  const apiKey =
    (typeof options.apiKey === 'function'
      ? await options.apiKey()
      : options.apiKey) ?? readEnv('OPENROUTER_API_KEY')
  if (apiKey) {
    headers.set(
      'Authorization',
      apiKey.slice(0, 7).toLowerCase() === 'bearer '
        ? apiKey
        : `Bearer ${apiKey}`,
    )
  }
  const userHeaders = new Headers(
    requestOptions?.headers ?? requestOptions?.fetchOptions?.headers,
  )
  for (const [name, value] of userHeaders) headers.set(name, value)
  // ponytail: the SDK default user agent and its empty `cookie` header are
  // not sent. A user agent set in the options still is (not in a browser).
  if (options.userAgent && typeof window === 'undefined') {
    headers.set('user-agent', options.userAgent)
  }

  const init: RequestInit = {
    ...requestOptions?.fetchOptions,
    ...requestOptions,
  }
  const timeoutMs = requestOptions?.timeoutMs || options.timeoutMs || -1
  if (!init.signal && timeoutMs > 0)
    init.signal = AbortSignal.timeout(timeoutMs)
  const request = new Request(url, {
    ...init,
    body: operation.body ?? null,
    headers,
    method: operation.method,
  })

  const logger =
    options.debugLogger ?? (readEnv('OPENROUTER_DEBUG') ? console : undefined)
  const retryConfig =
    requestOptions?.retries || options.retryConfig || DEFAULT_RETRY
  const retryCodes = requestOptions?.retryCodes || ['5XX']
  let response: Response
  try {
    response = await retry(
      async () => {
        const attempt = request.clone()
        await logRequest(logger, attempt).catch((e: unknown) =>
          logger?.log('Failed to log request:', e),
        )
        const result = await (options.httpClient?.request(attempt) ??
          fetch(attempt))
        await logResponse(logger, result, attempt).catch((e: unknown) =>
          logger?.log('Failed to log response:', e),
        )
        return result
      },
      retryConfig,
      retryCodes,
    )
  } catch (error) {
    throw toClientError(error)
  }
  await checkResponse(response, request, operation)
  return { request, response }
}

/** One request and its good response. */
export type Exchange = Awaited<ReturnType<typeof send>>

type HttpMeta = { request: Request; response: Response; body: string }

/** The SDK `ResponseValidationError`, built on `OpenRouterError`. */
function validationError(raw: unknown, httpMeta: HttpMeta) {
  return Object.assign(
    new OpenRouterError('Response validation failed', httpMeta),
    {
      name: 'ResponseValidationError',
      rawValue: raw,
      rawMessage: 'Response validation failed',
    },
  )
}

/**
 * Reads a JSON result and renames it. Throws the SDK
 * `ResponseValidationError` when a required key is missing. ponytail: the
 * SDK also checks primitive types; the tables do not keep them.
 */
export async function readJSON(
  { request, response }: Exchange,
  node: RemapNode,
  objects: RemapObjects,
) {
  const body = await response.text()
  const raw: unknown = JSON.parse(body)
  if (!fits(raw, node, objects)) {
    throw validationError(raw, { request, response, body })
  }
  return remap(raw, node, objects)
}

async function checkResponse(
  response: Response,
  request: Request,
  operation: Operation,
) {
  const type = mediaType(response)
  if (
    response.status === operation.okStatus &&
    operation.okTypes.includes(type)
  ) {
    return response
  }
  const httpMeta = { request, response }
  if (
    operation.errorStatuses.includes(response.status) &&
    type === 'application/json'
  ) {
    const body = await response.text()
    throw typedError(JSON.parse(body), { ...httpMeta, body })
  }
  const isErrorStatus = response.status >= 400 && response.status < 600
  if (isErrorStatus) {
    const body = await response.text()
    throw new OpenRouterDefaultError('API error occurred', {
      ...httpMeta,
      body,
    })
  }
  const body = await response.text().catch(() => '')
  throw new OpenRouterDefaultError('Unexpected Status or Content-Type', {
    ...httpMeta,
    body,
  })
}

/**
 * The typed SDK error (`BadRequestResponseError` and the others), built on
 * `OpenRouterError` with the same name and fields. ponytail: the typed
 * classes import zod, so `instanceof BadRequestResponseError` does not match;
 * `instanceof OpenRouterError` and `name` do.
 */
function typedError(raw: unknown, httpMeta: HttpMeta) {
  const fields = isRecord(raw) ? raw : {}
  const hasErrorData =
    isRecord(fields.error) &&
    fields.error.code !== undefined &&
    fields.error.message !== undefined
  if (!hasErrorData || !isRecord(fields.error)) {
    return validationError(raw, httpMeta)
  }
  // The SDK error data schema: `code`, `message`, and `metadata`.
  const { code, message: errorMessage, metadata } = fields.error
  const error = {
    code,
    message: errorMessage,
    ...('metadata' in fields.error && { metadata }),
  }
  const data = {
    error,
    ...('openrouter_metadata' in fields && {
      openrouterMetadata: fields.openrouter_metadata,
    }),
    ...('user_id' in fields && { userId: fields.user_id }),
    request$: httpMeta.request,
    response$: httpMeta.response,
    body$: httpMeta.body,
  }
  const message =
    (typeof errorMessage === 'string' && errorMessage) ||
    `API error occurred: ${JSON.stringify(data)}`
  return Object.assign(new OpenRouterError(message, httpMeta), {
    data$: data,
    error,
    ...(data.openrouterMetadata != null && {
      openrouterMetadata: data.openrouterMetadata,
    }),
    ...(data.userId != null && { userId: data.userId }),
    name: ERROR_NAMES[httpMeta.response.status] ?? 'OpenRouterError',
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The media type of a response, lowercase, without parameters. */
function mediaType(response: Response) {
  const type =
    response.headers.get('content-type')?.trim() || 'application/octet-stream'
  return type.toLowerCase().split(/\s*;\s*/)[0] ?? ''
}

function hasCode(error: object, code: unknown) {
  return 'code' in error && error.code === code
}

function hasStringCode(error: object, code: string) {
  return (
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.toLowerCase() === code
  )
}

function hasName(error: object, name: string) {
  return 'name' in error && error.name === name
}

function isAbortError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false
  return (
    hasName(error, 'AbortError') ||
    hasCode(error, 20) ||
    hasStringCode(error, 'econnaborted')
  )
}

function isTimeoutError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false
  return (
    hasName(error, 'TimeoutError') ||
    hasCode(error, 23) ||
    hasStringCode(error, 'econnaborted')
  )
}

function isConnectionError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false
  const message = error instanceof TypeError ? error.message.toLowerCase() : ''
  return (
    message.startsWith('failed to fetch') ||
    message.startsWith('fetch failed') ||
    hasStringCode(error, 'econnreset') ||
    hasName(error, 'ConnectionError')
  )
}

function toClientError(error: unknown) {
  if (isAbortError(error)) {
    return new RequestAbortedError('Request aborted by client', {
      cause: error,
    })
  }
  if (isTimeoutError(error)) {
    return new RequestTimeoutError('Request timed out', { cause: error })
  }
  if (isConnectionError(error)) {
    return new ConnectionError('Unable to make request', { cause: error })
  }
  return new UnexpectedClientError('Unexpected HTTP client error', {
    cause: error,
  })
}

function matchesCode(status: number, codes: ReadonlyArray<string>) {
  const actual = String(status)
  return codes.some((code) =>
    /^[0-9]xx$/i.test(code) ? code[0] === actual[0] : code === actual,
  )
}

/** Milliseconds from a `Retry-After` header (seconds or a date), else 0. */
function retryAfter(response: Response) {
  const value = response.headers.get('retry-after') || ''
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isInteger(seconds)) return seconds * 1000
  const date = Date.parse(value)
  if (Number.isInteger(date)) {
    const delta = date - Date.now()
    return delta > 0 ? Math.ceil(delta) : 0
  }
  return 0
}

/** The Speakeasy retry loop (`lib/retries.js` of the SDK). */
async function retry(
  attempt: () => Promise<Response>,
  config: RetryConfig,
  statusCodes: ReadonlyArray<string>,
) {
  if (config.strategy !== 'backoff') return attempt()
  const { initialInterval, maxInterval, exponent, maxElapsedTime } =
    config.backoff ?? DEFAULT_BACKOFF
  const start = Date.now()
  for (let count = 0; ; count++) {
    let interval = 0
    try {
      const response = await attempt()
      if (!matchesCode(response.status, statusCodes)) return response
      if (Date.now() - start > maxElapsedTime) return response
      interval = retryAfter(response)
    } catch (error) {
      const canRetry =
        config.retryConnectionErrors &&
        (isTimeoutError(error) || isConnectionError(error))
      if (!canRetry || Date.now() - start > maxElapsedTime) throw error
    }
    if (interval <= 0) {
      interval =
        initialInterval * Math.pow(count, exponent) + Math.random() * 1000
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(interval, maxInterval)),
    )
  }
}

type Logger = NonNullable<SDKOptions['debugLogger']>

const JSON_TYPE = /^(application|text)\/([^+]+\+)*json.*/
const JSONL_TYPE = /^(application|text)\/([^+]+\+)*(jsonl|x-ndjson)\b.*/

async function logBody(
  logger: Logger,
  message: Request | Response,
  type: string,
  rawType: string | null,
) {
  if (JSON_TYPE.test(type) && !JSONL_TYPE.test(type)) {
    logger.log(await message.clone().json())
  } else if (type.startsWith('text/') && type !== 'text/event-stream') {
    logger.log(await message.clone().text())
  } else {
    logger.log(`<${rawType}>`)
  }
}

async function logRequest(logger: Logger | undefined, request: Request) {
  if (!logger) return
  logger.group(`> Request: ${request.method} ${request.url}`)
  logger.group('Headers:')
  for (const [name, value] of request.headers.entries()) {
    logger.log(`${name}: ${value}`)
  }
  logger.groupEnd()
  logger.group('Body:')
  const rawType = request.headers.get('content-type')
  await logBody(logger, request, rawType?.split(';')[0] || '', rawType)
  logger.groupEnd()
  logger.groupEnd()
}

async function logResponse(
  logger: Logger | undefined,
  response: Response,
  request: Request,
) {
  if (!logger) return
  logger.group(`< Response: ${request.method} ${request.url}`)
  logger.log('Status Code:', response.status, response.statusText)
  logger.group('Headers:')
  for (const [name, value] of response.headers.entries()) {
    logger.log(`${name}: ${value}`)
  }
  logger.groupEnd()
  logger.group('Body:')
  await logBody(
    logger,
    response,
    mediaType(response),
    response.headers.get('content-type'),
  )
  logger.groupEnd()
  logger.groupEnd()
}
