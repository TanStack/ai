import { base64ToArrayBuffer } from '@tanstack/ai-utils'
import {
  createHttpClient,
  mergeHeaders,
  parseSSE,
} from '@tanstack/ai-utils/http'
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  OpenAIError,
} from 'openai/core/error'
import { sendWith } from '@tanstack/ai-utils/kubb'
import {
  openaiPostAudioSpeech,
  openaiPostAudioTranscriptions,
  openaiPostChatCompletions,
  openaiPostEmbeddings,
  openaiPostImagesEdits,
  openaiPostImagesGenerations,
  openaiPostResponses,
  openaiPostResponsesCompact,
  openaiPostVideos,
} from '../generated/client/sdk'
import type { HttpRequest } from '@tanstack/ai-utils/http'
import type { ClientInstance } from '@tanstack/ai-utils/kubb'
import type { ClientOptions, OpenAI } from 'openai'
import type { AzureClientOptions } from 'openai/azure'
import type {
  ChatCompletion,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions/completions'
import type {
  Response as OpenAIResponse,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses'
import type { CreateEmbeddingResponse } from 'openai/resources/embeddings'
import type {
  ImageEditStreamEvent,
  ImageGenStreamEvent,
  ImagesResponse,
} from 'openai/resources/images'
import type {
  Transcription,
  TranscriptionStreamEvent,
  TranscriptionVerbose,
} from 'openai/resources/audio/transcriptions'
import type {
  OpenaiPostAudioTranscriptionsBody,
  OpenaiPostChatCompletionsBody,
  OpenaiPostEmbeddingsBody,
  OpenaiPostImagesEditsBody,
  OpenaiPostImagesGenerationsBody,
  OpenaiPostResponsesBody,
} from '../generated/client/types'
import type {
  Base64EmbeddingResponse,
  OpenAIClientLike,
  RequestOptions,
} from './types'

/** One request of the mini client. */
interface ClientRequest extends Omit<HttpRequest, 'method' | 'headers'> {
  method: 'get' | 'post' | 'delete'
  headers?: RequestOptions['headers']
  /** An `Accept` header that replaces the client one. */
  accept?: string
  /** The headers of a generated body (its content type). Request headers win. */
  bodyHeaders?: Record<string, string>
  /** Resolve to the raw `Response`, not the parsed body. */
  binary?: boolean
  /** The model of the body. Azure puts it in the deployment path. */
  model?: string | undefined
}

/** Sends one request and resolves to the 2xx `Response`. */
type Send = (request: ClientRequest) => Promise<Response>

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

const BROWSER_ERROR =
  "It looks like you're running in a browser-like environment.\n\nThis is disabled by default, as it risks exposing your secret API credentials to attackers.\nIf you understand the risks and have appropriate mitigations in place,\nyou can set the `dangerouslyAllowBrowser` option to `true`, e.g.,\n\nnew OpenAI({ apiKey, dangerouslyAllowBrowser: true });\n\nhttps://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety\n"

const MISSING_CREDENTIALS =
  'Missing credentials. Please pass an `apiKey`, `workloadIdentity`, `adminAPIKey`, or set the `OPENAI_API_KEY` or `OPENAI_ADMIN_KEY` environment variable.'

/** The Azure paths that get `/deployments/<model>` in front (SDK list). */
const DEPLOYMENT_PATHS = new Set([
  '/completions',
  '/chat/completions',
  '/embeddings',
  '/audio/transcriptions',
  '/audio/translations',
  '/audio/speech',
  '/images/generations',
  '/batches',
  '/images/edits',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The SDK `readEnv`: the trimmed value, or `undefined` when unset or empty. */
const readEnv = (name: string) =>
  typeof process === 'undefined'
    ? undefined
    : process.env[name]?.trim() || undefined

/** The SDK `encodeURIPath` for one path segment. */
const encodeURIPath = (value: string) =>
  value.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent)

/** The SDK `isRunningInBrowserOrBrowserWorker` check. */
function isBrowserLike() {
  const hasWindow =
    typeof window !== 'undefined' &&
    typeof window.document !== 'undefined' &&
    typeof navigator !== 'undefined'
  if (hasWindow) return true
  const global = (name: string): unknown => Reflect.get(globalThis, name)
  const WorkerScope = global('WorkerGlobalScope')
  const WorkerNavigator = global('WorkerNavigator')
  const workerNavigator = global('navigator')
  const nodeProcess = global('process')
  const isNode =
    isRecord(nodeProcess) &&
    isRecord(nodeProcess.versions) &&
    nodeProcess.versions.node !== undefined
  return (
    typeof WorkerScope === 'function' &&
    globalThis instanceof WorkerScope &&
    typeof WorkerNavigator === 'function' &&
    workerNavigator instanceof WorkerNavigator &&
    typeof Reflect.get(workerNavigator, 'userAgent') === 'string' &&
    Reflect.get(workerNavigator, 'userAgent') !== 'Cloudflare-Workers' &&
    !isNode &&
    ['Deno', 'Bun', 'EdgeRuntime', 'WebSocketPair'].every(
      (name) => global(name) === undefined,
    )
  )
}

/** The headers of the `OPENAI_CUSTOM_HEADERS` env var (`name: value` lines). */
function envHeaders() {
  const headers: Record<string, string> = {}
  const lines = readEnv('OPENAI_CUSTOM_HEADERS')?.split('\n') ?? []
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon >= 0) {
      headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
    }
  }
  return headers
}

/** The SDK `makeStatusError`: a JSON body with no `error` is the error. */
function makeStatusError(
  status: number | undefined,
  body: unknown,
  message: string | undefined,
  headers: Headers | undefined,
) {
  const hasError =
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    body.error != null
  const isBareError = typeof body === 'object' && body !== null && !hasError
  const errorResponse = isBareError ? { error: body } : body
  return APIError.generate(status, errorResponse ?? undefined, message, headers)
}

/** Port of the SDK `addFormValue`: arrays as `key[]`, objects as `key[name]`. */
function appendFormValue(form: FormData, key: string, value: unknown) {
  if (value === undefined) return
  if (value === null) {
    throw new TypeError(
      `Received null for "${key}"; to pass null in FormData, you must use the string 'null'`,
    )
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    form.append(key, String(value))
  } else if (value instanceof Blob) {
    // The SDK sends the base name of a File name.
    const name = value instanceof File ? value.name.split(/[\\/]/).pop() : ''
    if (name) form.append(key, value, name)
    else form.append(key, value)
  } else if (Array.isArray(value)) {
    for (const item of value) appendFormValue(form, `${key}[]`, item)
  } else if (
    typeof value === 'object' &&
    (value instanceof Response ||
      Symbol.asyncIterator in value ||
      'getReader' in value)
  ) {
    // ponytail: File and Blob uploads only. Add stream uploads when a caller
    // needs them; until then `toFile()` converts them.
    throw new TypeError(
      `Convert "${key}" to a File with toFile() before the upload.`,
    )
  } else if (typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) {
      appendFormValue(form, `${key}[${name}]`, item)
    }
  } else {
    throw new TypeError(
      `Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${String(value)} instead`,
    )
  }
}

function toFormData(body: unknown) {
  const form = new FormData()
  for (const [key, value] of Object.entries(isRecord(body) ? body : {})) {
    appendFormValue(form, key, value)
  }
  return form
}

/**
 * The body serializer of the multipart operations. It keeps the SDK form
 * keys (`image[]`, `key[name]`), where the Kubb default repeats `image` and
 * sends objects as JSON.
 */
const multipart = { body: ({ body }: { body: unknown }) => toFormData(body) }

/** The SDK `addRequestID`: a hidden `_request_id` on a JSON object. */
function addRequestID(value: unknown, response: Response) {
  if (isRecord(value)) {
    Object.defineProperty(value, '_request_id', {
      value: response.headers.get('x-request-id'),
      enumerable: false,
    })
  }
  return value
}

/** The SDK `defaultParseResponse` for a body that is not a stream. */
async function parseBody(response: Response, binary: boolean | undefined) {
  if (response.status === 204) return null
  if (binary) return response
  const mediaType = response.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase()
  const isJSON =
    mediaType?.includes('application/json') || mediaType?.endsWith('+json')
  if (!isJSON) return response.text()
  if (response.headers.get('content-length') === '0') return undefined
  const text = await response.text()
  if (!text) return undefined
  const value: unknown = JSON.parse(text)
  return addRequestID(value, response)
}

/** The SDK `Stream.fromSSEResponse`: JSON events up to `[DONE]`. */
async function* readEvents(
  response: Response,
  signal: AbortSignal | undefined,
) {
  for await (const { event, data } of parseSSE(response, signal)) {
    if (data === '[DONE]') return
    let json: unknown
    try {
      json = JSON.parse(data)
    } catch {
      throw new SyntaxError(
        'Error reading response: malformed server-sent event JSON.',
      )
    }
    const error = isRecord(json) ? json.error : undefined
    if (event === 'error') {
      throw new APIError(
        undefined,
        error ?? json ?? undefined,
        undefined,
        response.headers,
      )
    }
    if (error) {
      throw new APIError(undefined, error, undefined, response.headers)
    }
    yield json
  }
}

async function* mapEvents(
  events: AsyncIterable<unknown>,
  map: (event: unknown) => unknown,
) {
  for await (const event of events) yield map(event)
}

/** The SDK chat chunk fix: a missing `finish_reason` becomes `null`. */
function normalizeChatChunk(chunk: unknown) {
  if (!isRecord(chunk) || !Array.isArray(chunk.choices)) return chunk
  const choices: Array<unknown> = chunk.choices
  return {
    ...chunk,
    choices: choices.map((choice) =>
      isRecord(choice)
        ? { ...choice, finish_reason: choice.finish_reason ?? null }
        : choice,
    ),
  }
}

/** The SDK `addOutputText` on a non-stream Responses result. */
function addOutputText(response: unknown) {
  if (!isRecord(response) || response.object !== 'response') return response
  const output: Array<unknown> = Array.isArray(response.output)
    ? response.output
    : []
  const texts: Array<string> = []
  for (const item of output) {
    if (!isRecord(item) || item.type !== 'message') continue
    const content: Array<unknown> = Array.isArray(item.content)
      ? item.content
      : []
    for (const part of content) {
      if (isRecord(part) && part.type === 'output_text') {
        texts.push(String(part.text))
      }
    }
  }
  response.output_text = texts.join('')
  return response
}

/** The SDK embeddings fix: base64 embeddings become number arrays. */
function decodeEmbeddings(response: unknown) {
  const data: Array<unknown> =
    isRecord(response) && Array.isArray(response.data) ? response.data : []
  for (const item of data) {
    if (isRecord(item) && typeof item.embedding === 'string') {
      item.embedding = Array.from(
        new Float32Array(base64ToArrayBuffer(item.embedding)),
      )
    }
  }
  return response
}

/**
 * Sends requests with `fetch`, with the OpenAI SDK headers, retries, and
 * errors. `auth` is the credential header.
 */
function fetchTransport(
  options: ClientOptions,
  baseURL: string,
  auth: Record<string, string> | (() => Promise<Record<string, string>>),
  redirect?: RequestRedirect,
): Send {
  if (!options.dangerouslyAllowBrowser && isBrowserLike()) {
    throw new OpenAIError(BROWSER_ERROR)
  }
  const organization =
    options.organization === undefined
      ? (readEnv('OPENAI_ORG_ID') ?? null)
      : options.organization
  const project =
    options.project === undefined
      ? (readEnv('OPENAI_PROJECT_ID') ?? null)
      : options.project
  const headers = mergeHeaders(
    {
      Accept: 'application/json',
      'OpenAI-Organization': organization,
      'OpenAI-Project': project,
    },
    typeof auth === 'function' ? undefined : auth,
    envHeaders(),
    options.defaultHeaders,
  )
  const logLevel = options.logLevel ?? readEnv('OPENAI_LOG')
  const logger = options.logger ?? console
  const http = createHttpClient({
    baseURL,
    defaultQuery: options.defaultQuery,
    fetch: options.fetch,
    fetchOptions: redirect
      ? { ...options.fetchOptions, redirect }
      : options.fetchOptions,
    timeout: options.timeout,
    maxRetries: options.maxRetries,
    makeError: makeStatusError,
    makeConnectionError: (cause) =>
      new APIConnectionError({
        cause: cause instanceof Error ? cause : undefined,
      }),
    makeTimeoutError: () => new APIConnectionTimeoutError(),
    makeAbortError: () => new APIUserAbortError(),
    // ponytail: retry and failure lines only, at the SDK `info` level.
    logger:
      logLevel === 'info' || logLevel === 'debug'
        ? (message, details) => logger.info(message, details)
        : undefined,
  })
  return async (request) =>
    http.request({
      ...request,
      headers: mergeHeaders(
        headers,
        // An `apiKey` function runs before each request, like in the SDK.
        typeof auth === 'function' ? await auth() : undefined,
        request.bodyHeaders,
        request.accept ? { Accept: request.accept } : undefined,
        request.headers,
      ),
    })
}

/** Calls an `apiKey` function with the SDK's checks and error messages. */
async function callApiKey(apiKey: () => Promise<string>) {
  let token: unknown
  try {
    token = await apiKey()
  } catch (err) {
    if (err instanceof OpenAIError) throw err
    throw new OpenAIError(
      `Failed to get token from 'apiKey' function: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    )
  }
  if (typeof token !== 'string' || !token) {
    throw new OpenAIError(
      `Expected 'apiKey' function argument to return a string but it returned ${String(token)}`,
    )
  }
  return { Authorization: `Bearer ${token}` }
}

/**
 * Sends requests through a real SDK client, loaded on the first request.
 * Used for options that only the SDK supports (workload identity, Azure AD
 * tokens, `provider`, `dataResidency`).
 */
function sdkTransport(load: () => Promise<OpenAI>): Send {
  let client: Promise<OpenAI> | undefined
  return async ({
    accept,
    bodyHeaders,
    binary: _binary,
    model: _model,
    timeout,
    ...request
  }) => {
    client ??= load()
    const sdk = await client
    return sdk
      .request({
        ...request,
        // The SDK checks a `timeout` key even when its value is undefined.
        ...(timeout !== undefined && { timeout }),
        // ponytail: this merge drops a `null` in the request headers. Only
        // generated bodies, speech, and video downloads take this path.
        headers:
          accept || bodyHeaders
            ? mergeHeaders(
                bodyHeaders,
                accept ? { Accept: accept } : undefined,
                request.headers,
              )
            : request.headers,
      })
      .asResponse()
  }
}

/** The Azure rule: `/deployments/<model>` in front of the model paths. */
function withDeployment(
  send: Send,
  baseURL: string,
  deployment: string | undefined,
): Send {
  let hasDeployment = false
  try {
    hasDeployment = new URL(baseURL).pathname.split('/').includes('deployments')
  } catch {
    // A base URL that is not absolute has no path segments.
  }
  return (request) => {
    const model = deployment || request.model
    const isModelCall =
      request.method === 'post' &&
      request.body !== undefined &&
      DEPLOYMENT_PATHS.has(request.path)
    if (!isModelCall || model === undefined || hasDeployment) {
      return send(request)
    }
    return send({
      ...request,
      path: `/deployments/${encodeURIPath(model)}${request.path}`,
    })
  }
}

/** The SDK resource methods on top of one transport. */
function buildClient(send: Send, baseURL: string) {
  // Reads a 2xx response: the SSE events of a stream, else the body.
  // `transform` maps each stream event, or the parsed body.
  const read = async <T>(
    response: Response,
    request: Omit<ClientRequest, 'method' | 'path'>,
    transform?: (value: unknown) => unknown,
  ) => {
    if (request.stream) {
      const events = readEvents(response, request.signal ?? undefined)
      return (transform ? mapEvents(events, transform) : events) as T
    }
    const value = await parseBody(response, request.binary)
    return (transform ? transform(value) : value) as T
  }

  // An operation that the OpenAPI document does not have.
  const call = async <T>(
    request: ClientRequest,
    transform?: (value: unknown) => unknown,
  ) => read<T>(await send(request), request, transform)

  // A generated operation: it builds the path and the body, and `send` sends
  // it with the client headers, retries, and errors.
  const generated = async <T>(
    operation: (client: ClientInstance) => Promise<{ response: Response }>,
    request: Omit<ClientRequest, 'method' | 'path'>,
    transform?: (value: unknown) => unknown,
  ) => {
    const { response } = await operation(
      sendWith((built) =>
        send({
          ...request,
          method: 'post',
          path: built.path,
          body: built.body,
          bodyHeaders: built.headers,
        }),
      ),
    )
    return read<T>(response, request, transform)
  }

  // The per-request options of an SDK resource call.
  const options = (
    requestOptions: RequestOptions | undefined,
    extra: Omit<ClientRequest, 'method' | 'path'> = {},
  ) => ({
    headers: requestOptions?.headers,
    signal: requestOptions?.signal,
    timeout: requestOptions?.timeout,
    maxRetries: requestOptions?.maxRetries,
    query: isRecord(requestOptions?.query) ? requestOptions.query : undefined,
    ...extra,
  })
  const request = (
    method: ClientRequest['method'],
    path: string,
    requestOptions: RequestOptions | undefined,
    extra: Omit<ClientRequest, 'method' | 'path'> = {},
  ) => ({ method, path, ...options(requestOptions, extra) })

  // Each method result is the intersection of its SDK overload results, so
  // it fits every overload. The overloads of `OpenAIClientLike` give each
  // caller the one real type.
  const client: Omit<OpenAIClientLike, 'withOptions'> = {
    baseURL,
    chat: {
      completions: {
        create: (
          body: OpenaiPostChatCompletionsBody,
          requestOptions?: RequestOptions,
        ) =>
          generated<ChatCompletion & AsyncIterable<ChatCompletionChunk>>(
            (client) => openaiPostChatCompletions({ client, body }),
            options(requestOptions, {
              model: body.model,
              stream: Boolean(body.stream),
            }),
            body.stream ? normalizeChatChunk : undefined,
          ),
      },
    },
    responses: {
      create: (
        body: OpenaiPostResponsesBody,
        requestOptions?: RequestOptions,
      ) =>
        generated<OpenAIResponse & AsyncIterable<ResponseStreamEvent>>(
          (client) => openaiPostResponses({ client, body }),
          options(requestOptions, {
            model: body.model,
            stream: Boolean(body.stream),
          }),
          body.stream ? undefined : addOutputText,
        ),
      compact: (body, requestOptions) =>
        generated(
          (client) => openaiPostResponsesCompact({ client, body }),
          options(requestOptions, { model: body.model ?? undefined }),
        ),
    },
    embeddings: {
      create: (
        body: OpenaiPostEmbeddingsBody,
        requestOptions?: RequestOptions,
      ) =>
        generated<CreateEmbeddingResponse & Base64EmbeddingResponse>(
          // The SDK asks for base64 when no format is set, then decodes it.
          (client) =>
            openaiPostEmbeddings({
              client,
              body: {
                ...body,
                encoding_format: body.encoding_format || 'base64',
              },
            }),
          options(requestOptions, { model: body.model }),
          body.encoding_format ? undefined : decodeEmbeddings,
        ),
    },
    images: {
      generate: (
        body: OpenaiPostImagesGenerationsBody,
        requestOptions?: RequestOptions,
      ) =>
        generated<ImagesResponse & AsyncIterable<ImageGenStreamEvent>>(
          (client) => openaiPostImagesGenerations({ client, body }),
          options(requestOptions, {
            model: body.model ?? undefined,
            stream: Boolean(body.stream),
          }),
        ),
      edit: (
        body: OpenaiPostImagesEditsBody,
        requestOptions?: RequestOptions,
      ) =>
        generated<ImagesResponse & AsyncIterable<ImageEditStreamEvent>>(
          (client) =>
            openaiPostImagesEdits({ client, body, serializer: multipart }),
          options(requestOptions, {
            model: body.model ?? undefined,
            stream: Boolean(body.stream),
          }),
        ),
    },
    audio: {
      speech: {
        create: (body, requestOptions) =>
          generated(
            (client) => openaiPostAudioSpeech({ client, body }),
            options(requestOptions, {
              model: body.model,
              accept: 'application/octet-stream',
              binary: true,
            }),
          ),
      },
      transcriptions: {
        create: (
          body: OpenaiPostAudioTranscriptionsBody,
          requestOptions?: RequestOptions,
        ) =>
          generated<
            string &
              Transcription &
              TranscriptionVerbose &
              AsyncIterable<TranscriptionStreamEvent>
          >(
            (client) =>
              openaiPostAudioTranscriptions({
                client,
                body,
                serializer: multipart,
              }),
            options(requestOptions, {
              model: body.model,
              stream: Boolean(body.stream),
            }),
          ),
      },
    },
    files: {
      create: (body, options) =>
        call(request('post', '/files', options, { body: toFormData(body) })),
      retrieve: (fileID, options) =>
        call(request('get', `/files/${encodeURIPath(fileID)}`, options)),
      delete: (fileID, options) =>
        call(request('delete', `/files/${encodeURIPath(fileID)}`, options)),
    },
    videos: {
      create: (body, requestOptions) =>
        generated(
          (client) => openaiPostVideos({ client, body, serializer: multipart }),
          options(requestOptions),
        ),
      retrieve: (videoID, options) =>
        call(request('get', `/videos/${encodeURIPath(videoID)}`, options)),
      downloadContent: (videoID, query, options) =>
        call(
          request('get', `/videos/${encodeURIPath(videoID)}/content`, options, {
            query: query?.variant ? { variant: query.variant } : undefined,
            accept: 'application/binary',
            binary: true,
          }),
        ),
    },
    decisions: {
      create: (body, options) =>
        call(request('post', '/decisions', options, { body })),
    },
    post: <T>(path: string, options?: RequestOptions) =>
      call<T>(
        request('post', path, options, {
          body: options?.body,
          stream: Boolean(options?.stream),
        }),
      ),
  }
  return client
}

/**
 * Creates a small OpenAI client that calls the API with `fetch`. It has the
 * OpenAI SDK methods that TanStack AI adapters use, with the same arguments,
 * results, headers, retries, and error classes (`APIError` and its
 * subclasses from `openai`).
 *
 * The options are the `new OpenAI()` options, with the same env defaults
 * (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_ORG_ID`,
 * `OPENAI_PROJECT_ID`). With `workloadIdentity`, `provider`,
 * `dataResidency`, or no `apiKey`, it loads the real
 * SDK on the first request and sends through it.
 *
 * @throws `OpenAIError` when there are no credentials, or in a browser
 * without `dangerouslyAllowBrowser: true`.
 *
 * @example
 * const client = createOpenAIClient({ apiKey: process.env.OPENAI_API_KEY })
 * const stream = await client.chat.completions.create({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hi' }],
 *   stream: true,
 * })
 * for await (const chunk of stream) console.log(chunk.choices[0]?.delta)
 */
export function createOpenAIClient(options: ClientOptions) {
  const apiKey =
    options.apiKey === undefined
      ? (readEnv('OPENAI_API_KEY') ?? null)
      : options.apiKey
  const baseURL =
    (options.baseURL === undefined
      ? readEnv('OPENAI_BASE_URL')
      : options.baseURL) || DEFAULT_BASE_URL
  const usesSDKOnlyOptions = Boolean(
    options.workloadIdentity ||
    options.provider ||
    options.dataResidency ||
    options.credential ||
    options.x509Transport,
  )
  if (typeof apiKey === 'string' && apiKey && options.workloadIdentity) {
    throw new OpenAIError(
      'The `apiKey` and `workloadIdentity` options are mutually exclusive',
    )
  }
  const hasKey = typeof apiKey === 'string' && apiKey !== ''
  if (!hasKey && !usesSDKOnlyOptions) {
    const adminAPIKey =
      options.adminAPIKey === undefined
        ? readEnv('OPENAI_ADMIN_KEY')
        : options.adminAPIKey
    if (!apiKey && !adminAPIKey) throw new OpenAIError(MISSING_CREDENTIALS)
  }
  const send =
    usesSDKOnlyOptions || !apiKey
      ? sdkTransport(() =>
          import('openai').then(({ OpenAI: SDK }) => new SDK(options)),
        )
      : fetchTransport(
          options,
          baseURL,
          typeof apiKey === 'function'
            ? () => callApiKey(apiKey)
            : { Authorization: `Bearer ${apiKey}` },
        )
  const client: OpenAIClientLike = {
    ...buildClient(send, baseURL),
    withOptions: (partial: Partial<ClientOptions>) =>
      createOpenAIClient({ ...options, ...partial }),
  }
  return client
}

/**
 * Creates the Azure OpenAI version of {@link createOpenAIClient}. The options
 * are the `new AzureOpenAI()` options, with the same env defaults
 * (`AZURE_OPENAI_API_KEY`, `OPENAI_API_VERSION`, `AZURE_OPENAI_ENDPOINT`,
 * `OPENAI_BASE_URL`) and the same `/deployments/<model>` paths. It sends the
 * key in the `api-key` header and adds the `api-version` query.
 *
 * With `azureADTokenProvider` or `workloadIdentity`, it loads the real
 * `AzureOpenAI` on the first request and sends through it.
 *
 * @throws `OpenAIError` when `apiVersion`, the credential, or the endpoint is
 * missing, the same as `new AzureOpenAI()`.
 *
 * @example
 * const client = createAzureOpenAIClient({
 *   apiKey: process.env.AZURE_OPENAI_API_KEY,
 *   endpoint: 'https://my-resource.openai.azure.com',
 *   apiVersion: '2024-10-21',
 *   deployment: 'gpt-4o',
 * })
 */
export function createAzureOpenAIClient(options: AzureClientOptions) {
  const {
    baseURL: baseURLOption = readEnv('OPENAI_BASE_URL'),
    apiKey = readEnv('AZURE_OPENAI_API_KEY'),
    apiVersion = readEnv('OPENAI_API_VERSION'),
    endpoint,
    deployment,
    azureADTokenProvider,
    ...rest
  } = options
  if (!apiVersion) {
    throw new OpenAIError(
      "The OPENAI_API_VERSION environment variable is missing or empty; either provide it, or instantiate the AzureOpenAI client with an apiVersion option, like new AzureOpenAI({ apiVersion: 'My API Version' }).",
    )
  }
  if (!azureADTokenProvider && !apiKey) {
    throw new OpenAIError(
      'Missing credentials. Please pass one of `apiKey` and `azureADTokenProvider`, or set the `AZURE_OPENAI_API_KEY` environment variable.',
    )
  }
  if (azureADTokenProvider && apiKey) {
    throw new OpenAIError(
      'The `apiKey` and `azureADTokenProvider` arguments are mutually exclusive; only one can be passed at a time.',
    )
  }
  if (baseURLOption && endpoint) {
    throw new OpenAIError('baseURL and endpoint are mutually exclusive')
  }
  const resolvedEndpoint = endpoint || readEnv('AZURE_OPENAI_ENDPOINT')
  if (!baseURLOption && !resolvedEndpoint) {
    throw new OpenAIError(
      'Must provide one of the `baseURL` or `endpoint` arguments, or the `AZURE_OPENAI_ENDPOINT` environment variable',
    )
  }
  const baseURL =
    baseURLOption || `${resolvedEndpoint?.replace(/\/+$/, '')}/openai`
  const send =
    apiKey && !rest.workloadIdentity
      ? fetchTransport(
          {
            ...rest,
            defaultQuery: { ...rest.defaultQuery, 'api-version': apiVersion },
          },
          baseURL,
          { 'api-key': apiKey },
          // The SDK never follows a redirect with the key on it.
          'manual',
        )
      : sdkTransport(() =>
          import('openai').then(({ AzureOpenAI }) => new AzureOpenAI(options)),
        )
  const client: OpenAIClientLike = {
    ...buildClient(withDeployment(send, baseURL, deployment), baseURL),
    withOptions: (partial: Partial<AzureClientOptions>) => {
      // The SDK clone keeps the base URL, unless `partial` sets only an
      // endpoint.
      const endpointOnly =
        partial.endpoint !== undefined && !Object.hasOwn(partial, 'baseURL')
      return createAzureOpenAIClient({
        ...options,
        apiKey,
        apiVersion,
        baseURL,
        endpoint: undefined,
        ...partial,
        ...(endpointOnly && { baseURL: undefined }),
      })
    },
  }
  return client
}
