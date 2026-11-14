import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AnthropicError,
} from '@anthropic-ai/sdk/core/error'
import {
  createHttpClient,
  mergeHeaders,
  parseSSE,
  toFormData,
} from '@tanstack/ai-utils/http'
import { sendWith } from '@tanstack/ai-utils/kubb'
import { anthropicPostV1MessagesBetaTrue } from '../generated/client/sdk'
import type Anthropic from '@anthropic-ai/sdk'
import type { ClientOptions } from '@anthropic-ai/sdk'
import type { ErrorType } from '@anthropic-ai/sdk/resources/shared'
import type {
  BetaMessage,
  BetaRawMessageStreamEvent,
  MessageCreateParamsBase,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { AnthropicPostV1MessagesBetaTrueBody } from '../generated/client/types'
import type { HeadersLike, HttpRequest } from '@tanstack/ai-utils/http'
import type {
  BetaDeletedFile,
  BetaFileMetadata,
  FileDeleteParams,
  FileRetrieveMetadataParams,
  FileUploadParams,
} from '@anthropic-ai/sdk/resources/beta/files'

/** The per-call options of the SDK methods. */
type RequestOptions = NonNullable<
  Parameters<Anthropic['beta']['files']['upload']>[1]
>

/**
 * A Messages request: the generated body, plus the SDK fields that go out as
 * headers.
 */
export type MessageCreateParams = AnthropicPostV1MessagesBetaTrueBody &
  BetaParams

/**
 * The part of the Anthropic SDK client that this package calls. Both the
 * fetch client and the lazy SDK client fit it.
 */
export interface AnthropicClient {
  readonly beta: {
    readonly messages: {
      /** `stream: true` gives the raw stream events, else the message. */
      create: (
        params: MessageCreateParams,
        options?: RequestOptions,
      ) => Promise<AsyncIterable<BetaRawMessageStreamEvent> | BetaMessage>
    }
    readonly files: {
      upload: (
        params: FileUploadParams,
        options?: RequestOptions,
      ) => Promise<BetaFileMetadata>
      retrieveMetadata: (
        fileID: string,
        params?: FileRetrieveMetadataParams | null,
        options?: RequestOptions,
      ) => Promise<BetaFileMetadata>
      delete: (
        fileID: string,
        params?: FileDeleteParams | null,
        options?: RequestOptions,
      ) => Promise<BetaDeletedFile>
    }
  }
  /** A copy of this client with some options changed. */
  withOptions: (options: Partial<ClientOptions>) => AnthropicClient
}

const DEFAULT_BASE_URL = 'https://api.anthropic.com'
const DEFAULT_TIMEOUT = 600000

const BROWSER_ERROR =
  "It looks like you're running in a browser-like environment.\n\nThis is disabled by default, as it risks exposing your secret API credentials to attackers.\nIf you understand the risks and have appropriate mitigations in place,\nyou can set the `dangerouslyAllowBrowser` option to `true`, e.g.,\n\nnew Anthropic({ apiKey, dangerouslyAllowBrowser: true });\n"

// The SDK's model tables (`resources/beta/messages/messages.mjs` and
// `internal/constants.mjs`).
const DEPRECATED_MODELS: Record<string, string> = {
  'claude-sonnet-4-5': 'November 30th, 2026',
  'claude-sonnet-4-5-20250929': 'November 30th, 2026',
}
const MODELS_TO_WARN_WITH_THINKING_ENABLED = [
  'claude-mythos-preview',
  'claude-opus-4-6',
]
const MODEL_NONSTREAMING_TOKENS: Record<string, number> = {
  'claude-opus-4@20250514': 8192,
  'anthropic.claude-opus-4-1-20250805-v1:0': 8192,
  'claude-opus-4-1@20250805': 8192,
}

// The stream events of the Messages API. The SDK skips every other name.
const MESSAGE_EVENTS = new Set([
  'message_start',
  'message_delta',
  'message_stop',
  'content_block_start',
  'content_block_delta',
  'content_block_stop',
])

/** Same as the SDK `readEnv`: trimmed, and an empty value is no value. */
function readEnv(name: string) {
  if (typeof process === 'undefined') return undefined
  return process.env[name]?.trim() || undefined
}

function safeJSON(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isAbortError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  )
}

function validatePositiveInteger(name: string, value: number) {
  if (!Number.isInteger(value)) {
    throw new AnthropicError(`${name} must be an integer`)
  }
  if (value < 0) throw new AnthropicError(`${name} must be a positive integer`)
  return value
}

/** `ANTHROPIC_CUSTOM_HEADERS`: one `name: value` per line. */
function customHeadersFromEnv() {
  const headers: Record<string, string> = {}
  const lines = readEnv('ANTHROPIC_CUSTOM_HEADERS')?.split('\n') ?? []
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon >= 0) {
      headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
    }
  }
  return headers
}

/**
 * The SDK `path` rules for one id: encode it, and refuse an empty or a dot
 * segment (`.`, `..`), which would change the endpoint.
 */
function filePath(fileID: string) {
  const encoded = fileID.replace(
    /[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g,
    encodeURIComponent,
  )
  if (/^\.{0,2}$/.test(encoded)) {
    throw new AnthropicError(
      `Path parameters result in path with invalid segments:\nValue "${encoded}" can't be safely passed as a path parameter`,
    )
  }
  return `/v1/files/${encoded}?beta=true`
}

/** True when the OpenTelemetry API has a global tracer, context, or propagator. */
function hasGlobalOpenTelemetry() {
  const api: unknown = Reflect.get(
    globalThis,
    Symbol.for('opentelemetry.js.api.1'),
  )
  return (
    typeof api === 'object' &&
    api !== null &&
    ('trace' in api || 'context' in api || 'propagation' in api)
  )
}

/**
 * The options that only the real SDK implements: middleware, OpenTelemetry
 * spans and trace headers, request logs, and the credential chain (no
 * `apiKey` and no `authToken`).
 */
function needsSdk(options: ClientOptions) {
  const logLevel = options.logLevel ?? readEnv('ANTHROPIC_LOG')
  const tracing =
    options.openTelemetry === undefined
      ? readEnv('ANTHROPIC_OPEN_TELEMETRY')?.toLowerCase() !== 'false' &&
        hasGlobalOpenTelemetry()
      : options.openTelemetry !== false
  const noCredential =
    typeof options.apiKey !== 'string' && options.authToken == null
  return (
    Boolean(options.middleware?.length) ||
    tracing ||
    logLevel === 'info' ||
    logLevel === 'debug' ||
    noCredential
  )
}

/** Reads a non-stream response the way the SDK does. */
async function readBody(response: Response) {
  if (response.status === 204) return null
  const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim()
  const isJSON =
    mediaType?.includes('application/json') || mediaType?.endsWith('+json')
  if (!isJSON) return response.text()
  if (response.headers.get('content-length') === '0') return undefined
  return response.json()
}

/**
 * The SDK `Stream.fromSSEResponse` for the Messages API: yields the message
 * events, skips `ping` and unknown events, and throws an `APIError` for an
 * `error` event. An abort ends the stream without an error.
 */
async function* messageEvents(
  response: Response,
  signal: AbortSignal | null | undefined,
) {
  if (!response.body) {
    throw new AnthropicError(
      'Attempted to iterate over a response with no body',
    )
  }
  try {
    for await (const sse of parseSSE(response, signal ?? undefined)) {
      if (sse.event === 'error') {
        // Like the SDK: the parsed JSON, else the raw text.
        const body: { error?: { type?: ErrorType } } | string =
          safeJSON(sse.data) ?? sse.data
        throw new APIError(
          undefined,
          body,
          undefined,
          response.headers,
          typeof body === 'string' ? undefined : body.error?.type,
        )
      }
      if (sse.event !== undefined && MESSAGE_EVENTS.has(sse.event)) {
        const event: BetaRawMessageStreamEvent = JSON.parse(sse.data)
        yield event
      }
    }
  } catch (error) {
    if (isAbortError(error)) return
    throw error
  }
}

interface BetaParams {
  betas?: ReadonlyArray<string> | null
  workspace_id?: string | null
  user_profile_id?: string | null
}

/** The `anthropic-beta` and workspace headers of a beta call. */
function betaHeaders(params: BetaParams) {
  return {
    'anthropic-beta': params.betas?.toString(),
    'anthropic-user-profile-id': params.user_profile_id ?? undefined,
    'anthropic-workspace-id': params.workspace_id ?? undefined,
  }
}

/**
 * The SDK `validateHeaders`: a request needs an auth header, or a `null` that
 * removes one on purpose.
 */
function assertAuth(sources: Array<HeadersLike>) {
  const headers = mergeHeaders(...sources)
  if (headers.get('x-api-key') || headers.get('authorization')) return
  // A probe value stays unless a later `null` removes the header.
  const probe = mergeHeaders({ 'x-api-key': '', authorization: '' }, ...sources)
  if (!probe.has('x-api-key') || !probe.has('authorization')) return
  throw new Error(
    'Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set. Or for one of the "X-Api-Key" or "Authorization" headers to be explicitly omitted',
  )
}

/** The SDK `transformOutputFormat`: `output_format` moves to `output_config.format`. */
function transformOutputFormat(params: MessageCreateParams) {
  if (!params.output_format) return params
  if (params.output_config?.format) {
    throw new AnthropicError(
      'Both output_format and output_config.format were provided. ' +
        'Please use only output_config.format (output_format is deprecated).',
    )
  }
  const { output_format, ...rest } = params
  return {
    ...rest,
    output_config: { ...params.output_config, format: output_format },
  }
}

/** The SDK `calculateNonstreamingTimeout`. */
function nonStreamingTimeout(maxTokens: number, model: string) {
  const maxNonStreamingTokens = MODEL_NONSTREAMING_TOKENS[model]
  const expectedTime = (60 * 60 * 1000 * maxTokens) / 128000
  const tooLong =
    expectedTime > DEFAULT_TIMEOUT ||
    (maxNonStreamingTokens !== undefined && maxTokens > maxNonStreamingTokens)
  if (tooLong) {
    throw new AnthropicError(
      'Streaming is required for operations that may take longer than 10 minutes. See https://github.com/anthropics/anthropic-sdk-typescript#long-requests for more details',
    )
  }
  return DEFAULT_TIMEOUT
}

function warnDeprecatedModel(params: MessageCreateParams) {
  const endOfLife = DEPRECATED_MODELS[params.model]
  if (endOfLife) {
    console.warn(
      `The model '${params.model}' is deprecated and will reach end-of-life on ${endOfLife}\nPlease migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`,
    )
  }
  if (
    MODELS_TO_WARN_WITH_THINKING_ENABLED.includes(params.model) &&
    params.thinking?.type === 'enabled'
  ) {
    console.warn(
      `Using Claude with ${params.model} and 'thinking.type=enabled' is deprecated. Use 'thinking.type=adaptive' instead which results in better model performance in our testing: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking`,
    )
  }
}

/** The real SDK client, imported on the first call. */
function createSdkClient(load: () => Promise<Anthropic>): AnthropicClient {
  let client: Promise<Anthropic> | undefined
  const sdk = () => (client ??= load())
  return {
    beta: {
      messages: {
        // The same JSON body: only the declared types differ (the generated
        // document against the SDK's own param types).
        create: async (params, options) =>
          (await sdk()).beta.messages.create(
            params as MessageCreateParamsBase,
            options,
          ),
      },
      files: {
        upload: async (params, options) =>
          (await sdk()).beta.files.upload(params, options),
        retrieveMetadata: async (fileID, params, options) =>
          (await sdk()).beta.files.retrieveMetadata(fileID, params, options),
        delete: async (fileID, params, options) =>
          (await sdk()).beta.files.delete(fileID, params, options),
      },
    },
    withOptions: (options) =>
      createSdkClient(async () => (await sdk()).withOptions(options)),
  }
}

/** The fetch client: the SDK request rules for the calls this package makes. */
function createFetchClient(options: ClientOptions): AnthropicClient {
  const { apiKey, authToken, dangerouslyAllowBrowser } = options
  const baseURL =
    (options.baseURL === undefined
      ? readEnv('ANTHROPIC_BASE_URL')
      : options.baseURL) || DEFAULT_BASE_URL
  const maxRetries = validatePositiveInteger(
    'maxRetries',
    options.maxRetries ?? 2,
  )
  // The SDK order: its own headers, auth, then `defaultHeaders`.
  const clientHeaders: Array<HeadersLike> = [
    {
      accept: 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': dangerouslyAllowBrowser
        ? 'true'
        : undefined,
      // The SDK ignores an `apiKey` that is not a string.
      'x-api-key': typeof apiKey === 'string' ? apiKey : undefined,
      authorization: authToken == null ? undefined : `Bearer ${authToken}`,
    },
    customHeadersFromEnv(),
    options.defaultHeaders,
  ]
  const http = createHttpClient({
    baseURL,
    defaultQuery: options.defaultQuery,
    fetch: options.fetch,
    fetchOptions: options.fetchOptions,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    maxRetries,
    // The Anthropic SDK obeys any positive `retry-after` up to 2^31 - 1 ms.
    maxRetryAfterMs: 2 ** 31 - 1,
    makeError: (status, body, message, headers) =>
      APIError.generate(
        status,
        typeof body === 'object' && body !== null ? body : undefined,
        message,
        headers,
      ),
    makeConnectionError: (cause) =>
      new APIConnectionError({
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      }),
    makeTimeoutError: () => new APIConnectionTimeoutError(),
    makeAbortError: () => new APIUserAbortError(),
  })

  /**
   * Sends one beta call. `request.timeout` wins over the call options.
   * `bodyHeaders` (the content type of a generated body) come first, so every
   * other header wins over them, like the JSON content type before.
   */
  const send = (
    request: Omit<HttpRequest, 'headers'>,
    params: BetaParams,
    requestOptions: RequestOptions = {},
    bodyHeaders?: Record<string, string>,
  ) => {
    const headers = [
      bodyHeaders,
      ...clientHeaders,
      betaHeaders(params),
      requestOptions.headers,
    ]
    assertAuth(headers)
    // ponytail: all headers merge here, so a `null` in the call headers can
    // remove a client header. A `content-type` in `defaultHeaders` then wins
    // over the JSON one, where the SDK puts the JSON one after it.
    return http.request({
      signal: requestOptions.signal,
      timeout: requestOptions.timeout,
      maxRetries: requestOptions.maxRetries,
      ...request,
      headers: mergeHeaders(...headers),
    })
  }

  return {
    beta: {
      messages: {
        create: async (params, requestOptions) => {
          const transformed = transformOutputFormat(params)
          const { betas, user_profile_id, workspace_id, ...body } = transformed
          warnDeprecatedModel(transformed)
          // Like the SDK: only a timeout that the caller set skips the
          // non-streaming guard. A `withOptions` copy always has one.
          const timeout =
            requestOptions?.timeout ??
            options.timeout ??
            (body.stream ? DEFAULT_TIMEOUT : undefined) ??
            nonStreamingTimeout(body.max_tokens, body.model)
          // The generated operation builds the path and the body; `send`
          // adds the client headers, retries, and errors.
          const { response } = await anthropicPostV1MessagesBetaTrue({
            client: sendWith((built) =>
              send(
                {
                  method: 'post',
                  path: built.path,
                  body: built.body,
                  timeout,
                },
                transformed,
                requestOptions,
                built.headers,
              ),
            ),
            body,
            headers: { 'anthropic-version': '2023-06-01' },
          })
          if (body.stream) {
            return messageEvents(response, requestOptions?.signal)
          }
          return readBody(response)
        },
      },
      files: {
        // ponytail: `file` is a `File` or `Blob` (what `toFile` gives). The
        // SDK also reads a `Response` or an async iterable here.
        upload: async ({ file, ...params }, requestOptions) =>
          readBody(
            await send(
              {
                method: 'post',
                path: '/v1/files?beta=true',
                body: toFormData({ file }),
              },
              params,
              requestOptions,
            ),
          ),
        retrieveMetadata: async (fileID, params, requestOptions) =>
          readBody(
            await send(
              { method: 'get', path: filePath(fileID) },
              params ?? {},
              requestOptions,
            ),
          ),
        delete: async (fileID, params, requestOptions) =>
          readBody(
            await send(
              { method: 'delete', path: filePath(fileID) },
              params ?? {},
              requestOptions,
            ),
          ),
      },
    },
    withOptions: (overrides) =>
      createAnthropicClient({
        ...options,
        baseURL,
        maxRetries,
        timeout: options.timeout ?? DEFAULT_TIMEOUT,
        ...overrides,
      }),
  }
}

/**
 * Creates an Anthropic client with the SDK `ClientOptions`. It sends the same
 * requests as the SDK client (auth, `anthropic-version`, `anthropic-beta`,
 * `?beta=true`, retries, timeouts) with `fetch`, and throws the SDK error
 * classes.
 *
 * Options that only the SDK implements (`middleware`, OpenTelemetry tracing,
 * `logLevel` `info` or `debug`, and the credential chain) load the real SDK
 * on the first call instead.
 *
 * @example
 * const client = createAnthropicClient({ apiKey, authToken: null })
 * const message = await client.beta.messages.create({ model, max_tokens, messages })
 *
 * @throws AnthropicError in a browser without `dangerouslyAllowBrowser`, or
 * for a `maxRetries` that is not a positive integer.
 */
export function createAnthropicClient(options: ClientOptions = {}) {
  // An explicit `profile` stops the environment credentials, as in the SDK.
  const fromEnv = (name: string) =>
    options.profile == null ? (readEnv(name) ?? null) : null
  const resolved: ClientOptions = {
    ...options,
    apiKey:
      options.apiKey === undefined
        ? fromEnv('ANTHROPIC_API_KEY')
        : options.apiKey,
    authToken:
      options.authToken === undefined
        ? fromEnv('ANTHROPIC_AUTH_TOKEN')
        : options.authToken,
  }
  const isBrowser =
    typeof window !== 'undefined' &&
    typeof window.document !== 'undefined' &&
    typeof navigator !== 'undefined'
  if (!resolved.dangerouslyAllowBrowser && isBrowser) {
    throw new AnthropicError(BROWSER_ERROR)
  }
  if (needsSdk(resolved)) {
    return createSdkClient(() =>
      import('@anthropic-ai/sdk').then(
        ({ default: AnthropicSDK }) => new AnthropicSDK(resolved),
      ),
    )
  }
  return createFetchClient(resolved)
}
