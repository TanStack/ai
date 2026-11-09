import type {
  FalClient as SdkFalClient,
  QueueClient,
  Result,
  StorageClient,
  StorageSettings,
  ValidationErrorInfo,
} from '@fal-ai/client'
import type { FalModel, FalModelInput, FalModelOutput } from '../model-meta'
import { sendWith } from '@tanstack/ai-utils/kubb'
import {
  falGetEndpointIdRequestsRequestId,
  falPostEndpointId,
} from '../generated/client/sdk'
import type { ClientInstance } from '@tanstack/ai-utils/kubb'

/**
 * Config for {@link createFalClient}. These are the `@fal-ai/client` config
 * fields this package uses.
 */
export interface FalClientOptions {
  /** Sent as `Authorization: Key <credentials>`. */
  credentials: string
  fetch: typeof fetch
  /** In a browser, requests go here with the real URL in `x-fal-target-url`. */
  proxyUrl?: string
}

/** `Omit` that keeps each member of a union (the SDK queue mode options). */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** An SDK options type with `input` typed by the generated endpoint map. */
type WithInput<Options, Id extends string> = OmitEach<Options, 'input'> & {
  input?: FalModelInput<Id>
}

/**
 * The part of the `@fal-ai/client` client that the adapters call, with the
 * SDK option and result shapes. Each endpoint's input and output come from
 * the modelschemas types in `model-meta.ts`.
 */
export interface FalClient {
  subscribe: <Id extends FalModel>(
    endpointId: Id,
    options: WithInput<Parameters<SdkFalClient['subscribe']>[1], Id>,
  ) => Promise<Result<FalModelOutput<Id>>>
  queue: Pick<QueueClient, 'status' | 'cancel'> & {
    submit: <Id extends FalModel>(
      endpointId: Id,
      options: WithInput<Parameters<QueueClient['submit']>[1], Id>,
    ) => ReturnType<QueueClient['submit']>
    result: <Id extends FalModel>(
      endpointId: Id,
      options: Parameters<QueueClient['result']>[1],
    ) => Promise<Result<FalModelOutput<Id>>>
  }
  storage: Pick<StorageClient, 'upload'>
}

interface ApiErrorArgs<Body> {
  message: string
  status: number
  body?: Body
  requestId?: string
  timeoutType?: string
}

/**
 * Thrown when fal answers with a status that is not OK. Same name and fields
 * as the `@fal-ai/client` `ApiError`.
 */
export class ApiError<Body = unknown> extends Error {
  readonly status: number
  readonly body: Body | undefined
  readonly requestId: string
  readonly timeoutType?: string

  constructor({
    message,
    status,
    body,
    requestId,
    timeoutType,
  }: ApiErrorArgs<Body>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.requestId = requestId || ''
    this.timeoutType = timeoutType
  }

  /** True when the request hit the timeout that the caller asked for. */
  get isUserTimeout() {
    return this.status === 504 && this.timeoutType === 'user'
  }
}

/**
 * Thrown for a 422 answer. Same name and fields as the `@fal-ai/client`
 * `ValidationError`.
 */
export class ValidationError extends ApiError<{
  detail?: Array<ValidationErrorInfo> | string
}> {
  constructor(
    args: ApiErrorArgs<{ detail?: Array<ValidationErrorInfo> | string }>,
  ) {
    super(args)
    this.name = 'ValidationError'
  }

  get fieldErrors(): Array<ValidationErrorInfo> {
    const detail = this.body?.detail
    if (typeof detail === 'string') {
      return [{ loc: ['body'], msg: detail, type: 'value_error' }]
    }
    return detail || []
  }

  getFieldErrors(field: string) {
    return this.fieldErrors.filter((error) => error.loc.at(-1) === field)
  }
}

interface RetryPolicy {
  maxRetries: number
  maxDelay: number
  statusCodes: Array<number>
}

const RETRYABLE_STATUS_CODES = [429, 502, 503, 504]
const DEFAULT_RETRY: RetryPolicy = {
  maxRetries: 3,
  maxDelay: 30_000,
  statusCodes: RETRYABLE_STATUS_CODES,
}
const QUEUE_RETRY: RetryPolicy = { ...DEFAULT_RETRY, maxDelay: 60_000 }
const QUEUE_STATUS_RETRY: RetryPolicy = {
  maxRetries: 5,
  maxDelay: 30_000,
  statusCodes: [...RETRYABLE_STATUS_CODES, 500],
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
])

const QUEUE_HOST = 'https://queue.fal.run'
const POLL_INTERVAL_MS = 500
const MULTIPART_THRESHOLD_BYTES = 90 * 1024 * 1024
const UPLOAD_INITIATE_URL =
  'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3'
const ENDPOINT_NAMESPACES = ['workflows', 'comfy']
const EXPIRATION_SECONDS: Record<string, number | undefined> = {
  never: undefined,
  immediate: 60,
  '1h': 3600,
  '1d': 86400,
  '7d': 604800,
  '30d': 2592000,
  '1y': 31536000,
}

/**
 * The one cast between the client arguments and the types of the generated
 * client. Its endpoint ids are an enum of the catalog models, and its body is
 * `object`. Both describe the same request.
 */
const wire = <T>(value: unknown) => value as T

/**
 * Endpoint ids keep their slashes: `fal-ai/flux/dev` is three path segments.
 * The default path serializer would send `fal-ai%2Fflux%2Fdev`, and the
 * runtime does not apply `allowReserved` to path params.
 */
const rawPath = { path: ({ value }: { value: unknown }) => String(value) }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isBrowser = () =>
  typeof window !== 'undefined' && typeof window.document !== 'undefined'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && Object.getPrototypeOf(value) === Object.prototype
}

/** Transport errors (reset, DNS, socket timeout) are retried. Aborts are not. */
function isNetworkError(error: unknown) {
  const seen = new Set<unknown>()
  let current = error
  let hasNetworkCode = false
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const name = 'name' in current ? current.name : undefined
    const code = 'code' in current ? current.code : undefined
    if (name === 'AbortError' || name === 'TimeoutError') return false
    if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) {
      hasNetworkCode = true
    }
    current = 'cause' in current ? current.cause : undefined
  }
  return (
    hasNetworkCode ||
    (error instanceof TypeError && /fetch failed/i.test(error.message))
  )
}

function isRetryable(error: unknown, statusCodes: Array<number>) {
  if (error instanceof ApiError) {
    return !error.isUserTimeout && statusCodes.includes(error.status)
  }
  return isNetworkError(error)
}

/** Exponential backoff from 1 s, doubled per attempt, capped, with +-25% jitter. */
function backoffDelay(attempt: number, maxDelay: number) {
  const delay = Math.min(1000 * 2 ** attempt, maxDelay)
  return Math.max(0, delay + 0.25 * delay * (Math.random() * 2 - 1))
}

/** Reads a fal response, or throws `ApiError` / `ValidationError`. */
async function parseResponse(response: Response) {
  const { status, statusText } = response
  const contentType = response.headers.get('Content-Type') ?? ''
  const requestId = response.headers.get('x-fal-request-id') || undefined
  const timeoutType =
    response.headers.get('x-fal-request-timeout-type') || undefined
  const isJson = contentType.includes('application/json')
  if (!response.ok) {
    if (!isJson) {
      throw new ApiError({
        message: `HTTP ${status}: ${statusText}`,
        status,
        requestId,
        timeoutType,
      })
    }
    const body = await response.json()
    const ErrorType = status === 422 ? ValidationError : ApiError
    throw new ErrorType({
      message: body.message || statusText,
      status,
      body,
      requestId,
      timeoutType,
    })
  }
  if (isJson) return response.json()
  if (contentType.includes('application/octet-stream')) {
    return response.arrayBuffer()
  }
  return response.text()
}

/** `123-app` becomes `123/app`. Ids that already have a `/` stay as they are. */
function normalizeEndpointId(id: string) {
  if (id.includes('/')) return id
  const match = /^([0-9]+)-([a-zA-Z0-9-]+)$/.exec(id)
  if (!match) {
    throw new Error(
      `Invalid app id: ${id}. Must be in the format <appOwner>/<appId>`,
    )
  }
  return `${match[1]}/${match[2]}`
}

/** Status and result URLs use only `[namespace/]owner/alias`, not the subpath. */
function queueAppId(endpointId: string) {
  const parts = normalizeEndpointId(endpointId).split('/')
  const hasNamespace = ENDPOINT_NAMESPACES.includes(parts[0] ?? '')
  const [owner, alias] = hasNamespace ? parts.slice(1) : parts
  return `${hasNamespace ? `${parts[0]}/` : ''}${owner}/${alias}`
}

function isFalUrl(url: string) {
  try {
    return /(fal\.(ai|run))$/.test(new URL(url).host)
  } catch {
    return false
  }
}

function queueUrl(id: string, path = '', query?: Record<string, string>) {
  const search = query ? `?${new URLSearchParams(query).toString()}` : ''
  const cleanPath = path.replace(/^\//, '').replace(/\/{2,}/, '/')
  if (isFalUrl(id)) {
    return `${id.endsWith('/') ? id : `${id}/`}${cleanPath}${search}`
  }
  const url = `${QUEUE_HOST}/${normalizeEndpointId(id)}/${cleanPath}`
  return `${url.replace(/\/$/, '')}${search}`
}

function lifecycleConfig(lifecycle: StorageSettings | undefined) {
  if (!lifecycle) return undefined
  const { expiresIn, initialAcl } = lifecycle
  const seconds =
    typeof expiresIn === 'number'
      ? expiresIn
      : expiresIn === undefined
        ? undefined
        : EXPIRATION_SECONDS[expiresIn]
  const config = {
    ...(seconds !== undefined ? { expiration_duration_seconds: seconds } : {}),
    ...(initialAcl !== undefined ? { initial_acl: initialAcl } : {}),
  }
  return Object.keys(config).length > 0 ? config : undefined
}

function uploadFileName(file: Blob, contentType: string) {
  if (file instanceof File && file.name) return file.name
  const extension = contentType.split('/')[1]?.split(/[-;]/)[0] ?? 'bin'
  return `${Date.now()}.${extension}`
}

interface SendOptions {
  /** The serialized body. */
  body?: BodyInit
  /** The headers of a generated body (its content type). `headers` win. */
  bodyHeaders?: Record<string, string>
  headers?: Record<string, string>
  signal?: AbortSignal
  retry?: RetryPolicy
}

/**
 * Create a fal client that talks to the fal queue and storage REST API with
 * `fetch`. It has the same method names, arguments, results, and errors as the
 * `@fal-ai/client` methods the adapters use.
 *
 * @param options credentials, the `fetch` to use, and an optional proxy URL.
 * @example
 * const client = createFalClient({ credentials: 'key', fetch })
 * const { data } = await client.subscribe('fal-ai/flux/dev', { input })
 */
export function createFalClient(options: FalClientOptions) {
  const { credentials, proxyUrl } = options
  if (isBrowser() && credentials) {
    console.warn(
      "The fal credentials are exposed in the browser's environment. " +
        "That's not recommended for production use cases.",
    )
  }

  async function send(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    {
      body,
      bodyHeaders,
      headers,
      signal,
      retry = DEFAULT_RETRY,
    }: SendOptions = {},
  ) {
    // Same as the SDK proxy middleware: without a `when` rule it only
    // proxies in a browser.
    const useProxy = proxyUrl !== undefined && isBrowser()
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await options.fetch(useProxy ? proxyUrl : url, {
          method,
          headers: {
            ...(credentials ? { Authorization: `Key ${credentials}` } : {}),
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...bodyHeaders,
            ...headers,
            ...(useProxy ? { 'x-fal-target-url': url } : {}),
          },
          signal,
          body,
        })
        return { response, data: await parseResponse(response) }
      } catch (error) {
        const isLastTry =
          attempt === retry.maxRetries ||
          !isRetryable(error, retry.statusCodes) ||
          signal?.aborted
        if (isLastTry) throw error
        await sleep(backoffDelay(attempt, retry.maxDelay))
      }
    }
  }

  // A generated queue operation: it builds the path and the body, and `send`
  // sends it to the queue host with the auth, proxy, retries, and errors.
  async function generated(
    method: 'GET' | 'POST',
    operation: (client: ClientInstance) => Promise<unknown>,
    sendOptions: SendOptions,
  ) {
    let result: Awaited<ReturnType<typeof send>> | undefined
    await operation(
      sendWith(async (built) => {
        result = await send(method, `${QUEUE_HOST}${built.path}`, {
          ...sendOptions,
          body: built.body,
          bodyHeaders: built.headers,
        })
        return result.response
      }),
    )
    // ponytail: `send` already read the body (errors and retries need it), so
    // the parsed result comes from here, not from the generated call.
    if (!result) throw new Error('The generated fal operation sent no request')
    return result
  }

  async function transformInput(input: unknown): Promise<unknown> {
    if (Array.isArray(input)) {
      return Promise.all(input.map((item) => transformInput(item)))
    }
    if (input instanceof Blob) return storage.upload(input)
    if (isPlainObject(input)) {
      const entries = Object.entries(input)
      return Object.fromEntries(
        await Promise.all(
          entries.map(async ([key, value]) => [
            key,
            await transformInput(value),
          ]),
        ),
      )
    }
    return input
  }

  const storage: FalClient['storage'] = {
    async upload(file, uploadOptions) {
      if (file.size > MULTIPART_THRESHOLD_BYTES) {
        // ponytail: multipart upload stays in the SDK. Only files over 90 MB
        // load it.
        const sdk = await import('@fal-ai/client')
        return sdk.createFalClient(options).storage.upload(file, uploadOptions)
      }
      const contentType = file.type || 'application/octet-stream'
      const lifecycle = lifecycleConfig(uploadOptions?.lifecycle)
      const { data } = await send('POST', UPLOAD_INITIATE_URL, {
        body: JSON.stringify({
          content_type: contentType,
          file_name: uploadFileName(file, contentType),
        }),
        headers: lifecycle
          ? { 'X-Fal-Object-Lifecycle': JSON.stringify(lifecycle) }
          : {},
      })
      const uploaded = await options.fetch(data.upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': contentType },
      })
      await parseResponse(uploaded)
      return data.file_url
    },
  }

  const queue: FalClient['queue'] = {
    async submit(endpointId, { input, abortSignal }) {
      const body = input ? await transformInput(input) : undefined
      const sendOptions = {
        headers: { 'x-fal-queue-priority': 'normal' },
        signal: abortSignal,
        retry: QUEUE_RETRY,
      }
      // A full fal URL is not the queue host shape of the document.
      if (isFalUrl(endpointId)) {
        const { data } = await send('POST', queueUrl(endpointId), {
          ...sendOptions,
          body: body ? JSON.stringify(body) : undefined,
        })
        return data
      }
      const { data } = await generated(
        'POST',
        (client) =>
          falPostEndpointId({
            client,
            serializer: rawPath,
            path: { endpoint_id: wire(normalizeEndpointId(endpointId)) },
            body: wire(body),
          }),
        sendOptions,
      )
      return data
    },
    async status(endpointId, { requestId, logs = false, abortSignal }) {
      const url = queueUrl(
        queueAppId(endpointId),
        `/requests/${requestId}/status`,
        { logs: logs ? '1' : '0' },
      )
      const { data } = await send('GET', url, {
        signal: abortSignal,
        retry: QUEUE_STATUS_RETRY,
      })
      return data
    },
    async result(endpointId, { requestId, abortSignal }) {
      const appId = queueAppId(endpointId)
      const sendOptions = { signal: abortSignal, retry: QUEUE_RETRY }
      const { response, data } = isFalUrl(appId)
        ? await send(
            'GET',
            queueUrl(appId, `/requests/${requestId}`),
            sendOptions,
          )
        : await generated(
            'GET',
            (client) =>
              falGetEndpointIdRequestsRequestId({
                client,
                serializer: rawPath,
                path: { endpoint_id: wire(appId), request_id: requestId },
              }),
            sendOptions,
          )
      return {
        data,
        requestId: response.headers.get('x-fal-request-id') || '',
      }
    },
    async cancel(endpointId, { requestId, abortSignal }) {
      const url = queueUrl(
        queueAppId(endpointId),
        `/requests/${requestId}/cancel`,
      )
      await send('PUT', url, { signal: abortSignal })
    },
  }

  const client: FalClient = {
    queue,
    storage,
    async subscribe(endpointId, subscribeOptions) {
      const { request_id: requestId } = await queue.submit(
        endpointId,
        subscribeOptions,
      )
      const { abortSignal, logs, onEnqueue } = subscribeOptions
      onEnqueue?.(requestId)
      // Same as the SDK: poll right away, then every 500 ms until COMPLETED.
      while (
        (await queue.status(endpointId, { requestId, logs, abortSignal }))
          .status !== 'COMPLETED'
      ) {
        await sleep(POLL_INTERVAL_MS)
      }
      // The SDK does not pass the abort signal to the result request.
      return queue.result(endpointId, { requestId })
    },
  }
  return client
}
