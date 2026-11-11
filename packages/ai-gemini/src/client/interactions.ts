// The Interactions API (`client.interactions`) of @google/genai 2.32.0, for
// the Gemini Developer API with an API key. Same URL, headers, body, retries,
// response shape (`steps`, `output_text`, ...), and error fields.
import { createHttpClient, parseSSE } from '@tanstack/ai-utils/http'
import type { HttpOptions, Interactions } from '@google/genai'

type Interaction = Interactions.Interaction
type InteractionSSEEvent = Interactions.InteractionSSEEvent

/** `client.interactions.create` params, plus the SDK `api_version` field. */
export type InteractionCreateParams = Interactions.InteractionCreateParams & {
  api_version?: string
}

/**
 * `client.interactions.get` params, plus the SDK `api_version` field.
 * ponytail: no `stream` option, because no adapter streams a `get`.
 */
export type InteractionGetParams = Omit<
  Interactions.InteractionGetParamsNonStreaming,
  'stream'
> & {
  api_version?: string
}

/** The request options that the adapters pass. */
export interface InteractionRequestOptions {
  signal?: AbortSignal | null
}

/** An interaction, with the `output_*` fields that the SDK adds. */
export type GeminiInteraction = Interaction & {
  sdkHttpResponse?: { headers?: Record<string, string> }
}

/**
 * `create` returns an event stream when `stream` is `true`, an interaction
 * when it is `false` or not set, and either one when it is a `boolean`.
 */
export type InteractionResult<P> = 'stream' extends keyof P
  ? P extends { stream: true }
    ? AsyncIterable<InteractionSSEEvent>
    : P extends { stream?: false }
      ? GeminiInteraction
      : AsyncIterable<InteractionSSEEvent> | GeminiInteraction
  : GeminiInteraction

// ponytail: the SDK has no client timeout here; this is the largest delay
// `setTimeout` accepts.
const NO_TIMEOUT = 2 ** 31 - 1
// The Lyria models whose interactions still use the old `outputs` field.
const LEGACY_LYRIA_MODELS = new Set([
  'lyria-3-pro-preview',
  'lyria-3-clip-preview',
])

// The SDK error class name for each status (`APIError.generate`).
const ERROR_NAMES: Record<number, string> = {
  400: 'BadRequestError',
  401: 'AuthenticationError',
  403: 'PermissionDeniedError',
  404: 'NotFoundError',
  409: 'ConflictError',
  422: 'UnprocessableEntityError',
  429: 'RateLimitError',
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The error that `interactions.create` and `interactions.get` throw for a 4xx
 * or 5xx response. It has the `name`, `message`, and fields of the SDK
 * `APIError` subclasses (`BadRequestError`, `RateLimitError`, ...).
 */
export class InteractionsApiError extends Error {
  status: number | undefined
  statusCode: number | undefined
  headers: Headers | undefined
  /** The parsed error body, for example `{ error: { code, message } }`. */
  error: unknown
  body: string
  contentType: string

  constructor(
    status: number | undefined,
    error: unknown,
    text: string | undefined,
    headers: Headers | undefined,
  ) {
    const nested = isPlainObject(error) ? error.error : undefined
    const nestedMessage = isPlainObject(nested) ? nested.message : undefined
    const message =
      typeof nestedMessage === 'string' && nestedMessage
        ? nestedMessage
        : `API error occurred: ${JSON.stringify(error ?? text)}`
    super(status ? `${status} ${message}` : message)
    this.status = status
    this.statusCode = status
    this.headers = headers
    this.error = error
    this.body = text ?? (error === undefined ? '' : JSON.stringify(error))
    this.contentType = headers?.get('content-type') ?? ''
    this.name =
      status === undefined
        ? 'APIError'
        : (ERROR_NAMES[status] ??
          (status >= 500 ? 'InternalServerError' : 'APIError'))
  }
}

// Port of `normalizeInteractionShape` + `addOutputProperties`.
function withOutputProperties(value: unknown): unknown {
  if (!isPlainObject(value)) return value
  let interaction: Record<string, unknown> = value
  if (!Array.isArray(value.steps)) {
    const { outputs, ...rest } = value
    const isLegacyLyria =
      typeof value.model === 'string' &&
      LEGACY_LYRIA_MODELS.has(value.model) &&
      Array.isArray(outputs)
    interaction = isLegacyLyria
      ? { ...rest, steps: [{ type: 'model_output', content: outputs }] }
      : { ...value, steps: [] }
  }
  const steps: Array<unknown> = Array.isArray(interaction.steps)
    ? interaction.steps
    : []
  const textParts: Array<string> = []
  let collecting = false
  outer: for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (!isPlainObject(step) || step.type === 'user_input') break
    if (step.type !== 'model_output' || !Array.isArray(step.content)) {
      if (collecting) break
      continue
    }
    for (let j = step.content.length - 1; j >= 0; j--) {
      const item: unknown = step.content[j]
      if (isPlainObject(item) && item.type === 'text') {
        collecting = true
        textParts.push(typeof item.text === 'string' ? item.text : '')
      } else if (collecting) {
        break outer
      }
    }
  }
  const outputs: Record<string, unknown> = {}
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (!isPlainObject(step) || step.type === 'user_input') break
    if (step.type !== 'model_output' || !Array.isArray(step.content)) continue
    for (let j = step.content.length - 1; j >= 0; j--) {
      const content: unknown = step.content[j]
      if (!isPlainObject(content)) continue
      for (const type of ['image', 'audio', 'video']) {
        const key = `output_${type}`
        if (content.type === type && !outputs[key]) outputs[key] = content
      }
    }
  }
  const outputText = textParts.reverse().join('')
  const dateString = (date: unknown) =>
    date instanceof Date ? date.toISOString() : date
  return {
    ...interaction,
    created: dateString(interaction.created),
    updated: dateString(interaction.updated),
    ...(outputText && { output_text: outputText }),
    ...outputs,
  }
}

async function* readEvents(response: Response, signal?: AbortSignal | null) {
  for await (const event of parseSSE(response, signal ?? undefined)) {
    // The SDK skips events without data and stops at the `[DONE]` sentinel.
    if (event.data === '') continue
    if (event.data === '[DONE]') return
    const parsed: InteractionSSEEvent = JSON.parse(event.data)
    yield parsed
  }
  // `parseSSE` ends quietly on abort. The SDK stream throws the abort error.
  if (signal?.aborted) throw signal.reason
}

/**
 * Creates `client.interactions` for one client.
 *
 * @param client - The API key and the HTTP options of the client.
 */
export function createInteractions(client: {
  apiKey: string
  httpOptions: HttpOptions
}) {
  const { apiKey, httpOptions } = client
  // Like the SDK: `httpOptions.headers` are sent, but `Content-Type` wins
  // over them, and a caller `x-goog-api-key` wins over `apiKey`.
  const clientHeaders = new Headers(httpOptions.headers)
  clientHeaders.set('Content-Type', 'application/json')
  if (!clientHeaders.has('x-goog-api-key'))
    clientHeaders.set('x-goog-api-key', apiKey)
  const http = createHttpClient({
    baseURL: (httpOptions.baseUrl ?? '').replace(/\/+$/, ''),
    headers: clientHeaders,
    // The SDK default: 4 retries, exponential backoff from 0.5 s to 8 s.
    maxRetries: 4,
    timeout: httpOptions.timeout ?? NO_TIMEOUT,
    makeError: (status, body, message, headers) =>
      new InteractionsApiError(status, body, message, headers),
  })
  const versionPath = (apiVersion: string | undefined) =>
    `/${encodeURIComponent(apiVersion ?? httpOptions.apiVersion ?? '')}`

  const send = async (
    request: Parameters<typeof http.request>[0],
    isStream: boolean,
  ) => {
    const response = await http.request({
      ...request,
      headers: {
        Accept: isStream ? 'text/event-stream' : 'application/json',
      },
    })
    if (isStream) return readEvents(response, request.signal)
    const json: unknown = await response.json()
    const withResponse = isPlainObject(json)
      ? {
          ...json,
          sdkHttpResponse: {
            headers: Object.fromEntries(response.headers.entries()),
          },
        }
      : json
    return withOutputProperties(withResponse)
  }

  return {
    /**
     * Creates an interaction. With `stream: true` it returns the event
     * stream, else the finished (or background) interaction.
     */
    async create<P extends InteractionCreateParams>(
      params: P,
      options?: InteractionRequestOptions,
    ) {
      const { api_version, ...body } = params
      const result = await send(
        {
          method: 'post',
          path: `${versionPath(api_version)}/interactions`,
          body,
          signal: options?.signal,
        },
        body.stream === true,
      )
      // The SDK lists the hop ids in `continuation_ids` when it can continue
      // (not for background or agent interactions).
      // ponytail: one hop only. A `requires_continuation` result is returned
      // as is; the SDK sends more hops and merges them. Port that loop if an
      // adapter needs long decodes.
      if (
        isPlainObject(result) &&
        body.stream !== true &&
        body.background !== true &&
        Reflect.get(body, 'agent') == null &&
        Reflect.get(body, 'agent_config') == null
      ) {
        const ids = Array.isArray(result.continuation_ids)
          ? result.continuation_ids
          : []
        result.continuation_ids = [
          ...new Set(
            [...ids, result.id].filter(
              (id) => typeof id === 'string' && id !== '',
            ),
          ),
        ]
      }
      // ponytail: `send` returns the shape that `stream` selects.
      return result as InteractionResult<P>
    },

    /** Gets an interaction by id. */
    async get(
      id: string,
      params: InteractionGetParams = {},
      options?: InteractionRequestOptions,
    ) {
      const { api_version, last_event_id, include_input } = params
      const result = await send(
        {
          method: 'get',
          path: `${versionPath(api_version)}/interactions/${encodeURIComponent(id)}`,
          query: { include_input, last_event_id, stream: false },
          signal: options?.signal,
        },
        false,
      )
      return result as GeminiInteraction
    },
  }
}
