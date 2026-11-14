import type { NativeRequest, NativeResponse } from './client'
import type {
  HeadersInit,
  HttpMethod,
  PathParamStyle,
  PathSerializer,
  RequestBody,
  Serializers,
  Styles,
} from './serializers'
import type {
  StandardSchemaValidator,
  ValidateOption,
  ValidationErrorHandler,
} from './standardSchema'
import {
  applyHeaderStyles,
  baseContentType,
  defaultBodySerializer,
  defaultPathSerializer,
  defaultQuerySerializer,
  isDefaultJsonBody,
  serializeCookies,
} from './serializers'
import { isValidationEnabled, runValidator } from './standardSchema'
export type {
  ValidateOption,
  ValidationErrorContext,
  ValidationErrorHandler,
} from './standardSchema'

/**
 * HTTP status codes treated as a success, everything else is an error.
 */
export type SuccessStatusCode =
  | '200'
  | '201'
  | '202'
  | '203'
  | '204'
  | '205'
  | '206'
  | '207'
  | '208'
  | '226'

export type SuccessOf<TResponses> = TResponses[Extract<
  keyof TResponses,
  SuccessStatusCode
>]

export type ErrorOf<TResponses> = TResponses[Exclude<
  keyof TResponses,
  SuccessStatusCode
>]

/**
 * Converts a response record's string status key to its numeric literal, leaving non-numeric keys like `default` as `number`.
 */
export type ToStatusNumber<TStatus> =
  TStatus extends `${infer TNumber extends number}` ? TNumber : number

/**
 * Unwraps content-type variants to keep the bare body on `error`.
 */
export type DataOf<T> = T extends { contentType: string; data: infer TData }
  ? TData
  : T

/**
 * Keeps `contentType` beside `data` so switching on it narrows the body.
 */
export type SuccessVariant<TStatus, TEntry, TRequest, TResponse> =
  TEntry extends { contentType: string; data: unknown }
    ? TEntry extends { contentType: infer TContentType; data: infer TData }
      ? {
          status: ToStatusNumber<TStatus>
          data: TData
          error: undefined
          contentType: TContentType
          request: TRequest
          response: TResponse
        }
      : never
    : {
        status: ToStatusNumber<TStatus>
        data: TEntry
        error: undefined
        contentType: string | undefined
        request: TRequest
        response: TResponse
      }

/**
 * Narrows `data` or `error` when switching on the numeric status.
 */
export type ResultByStatus<
  TResponses,
  TStatus extends keyof TResponses,
  TRequest,
  TResponse,
> = TStatus extends SuccessStatusCode
  ? SuccessVariant<TStatus, TResponses[TStatus], TRequest, TResponse>
  : {
      status: ToStatusNumber<TStatus>
      data: undefined
      error: DataOf<TResponses[TStatus]>
      contentType: string | undefined
      request: TRequest
      response: TResponse
    }

export type ResultUnion<TResponses, TRequest, TResponse> = {
  [TStatus in keyof TResponses]: ResultByStatus<
    TResponses,
    TStatus,
    TRequest,
    TResponse
  >
}[keyof TResponses]

/**
 * Selects success statuses without letting untyped error payloads widen `data`.
 */
export type SuccessResultUnion<TResponses, TRequest, TResponse> = {
  [TStatus in Extract<keyof TResponses, SuccessStatusCode>]: ResultByStatus<
    TResponses,
    TStatus,
    TRequest,
    TResponse
  >
}[Extract<keyof TResponses, SuccessStatusCode>]

/**
 * Narrows `data` and `error` by status. With `throwOnError`, includes only success variants.
 */
export type RequestResult<
  TResponses,
  ThrowOnError extends boolean = true,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = ThrowOnError extends true
  ? [SuccessResultUnion<TResponses, TRequest, TResponse>] extends [never]
    ? {
        status: number
        data: SuccessOf<TResponses>
        error: undefined
        contentType: string | undefined
        request: TRequest
        response: TResponse
      }
    : SuccessResultUnion<TResponses, TRequest, TResponse>
  : [ResultUnion<TResponses, TRequest, TResponse>] extends [never]
    ? {
        status: number
        data: undefined
        error: undefined
        contentType: string | undefined
        request: TRequest
        response: TResponse
      }
    : ResultUnion<TResponses, TRequest, TResponse>

/**
 * A `RequestResult` promise with an extra `unwrap()` method that resolves to the success body.
 */
export type Unwrappable<T extends { data: unknown; error: unknown }> =
  Promise<T> & {
    unwrap: () => Promise<Extract<T, { error: undefined }>['data']>
  }

/**
 * Attaches `unwrap()` to a result promise, which rejects with `error` when the result carried one.
 *
 * @example
 * ```ts
 * const { data, error } = await getPetById({ path: { petId: 1 } })
 * ```
 *
 * @example
 * ```ts
 * const pet = await getPetById({ path: { petId: 1 } }).unwrap()
 * ```
 */
export function withUnwrap<T extends { data: unknown; error: unknown }>(
  promise: Promise<T>,
): Unwrappable<T> {
  const unwrappable = promise as Unwrappable<T>
  unwrappable.unwrap = () =>
    promise.then((result) => {
      if (result.error !== undefined) throw result.error
      return result.data as Extract<T, { error: undefined }>['data']
    })
  return unwrappable
}

/**
 * The shape a generated operation returns with `returnType: 'data'`: the success body when
 * `throwOnError` is true, or the full `RequestResult` when it is false.
 */
export type UnwrappedResult<
  TResponses,
  ThrowOnError extends boolean = true,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = ThrowOnError extends true
  ? RequestResult<TResponses, true, TRequest, TResponse>['data']
  : RequestResult<TResponses, ThrowOnError, TRequest, TResponse>

/**
 * Returns the success body when `throwOnError` is true, or the full result when it is false.
 */
export function unwrapResult<T extends { data: unknown; error: unknown }>(
  promise: Promise<T>,
  throwOnError: boolean | undefined,
): Promise<T | T['data']> {
  return promise.then((result) =>
    (throwOnError ?? true) ? result.data : result,
  )
}

export type DataShape = {
  body?: unknown
  cookies?: unknown
  headers?: unknown
  path?: unknown
  query?: unknown
}

export type RequestCredentials = 'omit' | 'same-origin' | 'include'
export type ResponseType =
  | 'arraybuffer'
  | 'blob'
  | 'document'
  | 'json'
  | 'text'
  | 'stream'
  | 'formdata'

/**
 * Decodes a response body for a codec's media type.
 */
export type Deserializer<T = unknown> = (
  raw: unknown,
  contentType: string,
) => T | Promise<T>

/**
 * Encodes a request body for a codec's media type.
 */
export type ContentBodySerializer = (
  body: unknown,
  contentType?: string,
) => RequestBody | undefined

/**
 * Encodes requests or decodes responses for a media type. Either direction can be omitted.
 */
export type Codec = {
  serialize?: ContentBodySerializer
  deserialize?: Deserializer
}

/**
 * A string sets the request content type. The object form can also set `Accept`.
 */
export type ContentType = string | { request?: string; response?: string }

/**
 * Validates request bodies and params, success bodies, or non-throwing error bodies with Standard Schema.
 */
export type Validator<T = unknown> = StandardSchemaValidator<T>

/**
 * A resolved security scheme carried on each generated call's `security` array and passed to the `auth` resolver.
 */
export type Auth = {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect'
  scheme?: 'bearer' | 'basic'
  name?: string
  in?: 'header' | 'query' | 'cookie'
  scopes?: Array<string>
}

/**
 * Return `user:password` for basic auth, or `undefined` to skip a scheme.
 */
export type AuthToken = string | undefined

/**
 * Resolves the token for a security scheme, either a static token or a callback called per scheme until one returns a token.
 */
export type AuthResolver =
  | AuthToken
  | ((auth: Auth) => AuthToken | Promise<AuthToken>)

export type RequestConfig<
  TBody = unknown,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = {
  baseURL?: string
  url?: string
  method?: HttpMethod
  path?: unknown
  query?: unknown
  /** Alias of `query`, kept for callers that pass the query under this name. */
  params?: unknown
  cookies?: unknown
  body?: TBody
  headers?: unknown
  styles?: Styles
  signal?: AbortSignal
  credentials?: RequestCredentials
  options?: Record<string, unknown>
  contentType?: ContentType
  responseType?: ResponseType
  throwOnError?: boolean
  client?: ClientInstance<TRequest, TResponse>
  transport?: Transport<TRequest, TResponse>
  serializer?: Serializers
  codecs?: Record<string, Codec>
  validator?: {
    request?: Validator
    path?: Validator
    query?: Validator
    headers?: Validator
    response?: Validator
    error?: Validator
  }
  onValidationError?: ValidationErrorHandler
  validate?: ValidateOption
  security?: Array<Auth>
  auth?: AuthResolver
}

/**
 * Combines client options with the operation's typed request params and body.
 */
export type Options<
  TData extends DataShape,
  ThrowOnError extends boolean = true,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = Omit<RequestConfig<unknown, TRequest, TResponse>, keyof DataShape | 'url'> &
  TData & {
    client?: ClientInstance<TRequest, TResponse>
    throwOnError?: ThrowOnError
  }

/**
 * Client-level configuration shared by every call an instance makes, overridden by the per-call `RequestConfig`.
 */
export type ClientConfig<
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = {
  baseURL?: string
  headers?: HeadersInit
  credentials?: RequestCredentials
  options?: Record<string, unknown>
  throwOnError?: boolean
  transport?: Transport<TRequest, TResponse>
  serializer?: Serializers
  codecs?: Record<string, Codec>
  onValidationError?: ValidationErrorHandler
  validate?: ValidateOption
  auth?: AuthResolver
}

/**
 * The normalized request the transport receives, with all serialization, auth, and header work already done.
 */
export type ResolvedRequest = {
  url: string
  method: string
  headers: Record<string, string>
  body?: RequestBody
  signal?: AbortSignal
  credentials?: RequestCredentials
  options?: Record<string, unknown>
  responseType?: ResponseType
}

/**
 * What a transport returns: the parsed body plus the native request and response objects.
 */
export type TransportResult<
  TData = unknown,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = {
  data: TData
  status: number
  statusText: string
  headers: Headers
  contentType?: string
  request: TRequest
  response: TResponse
}

/**
 * The per-plugin send, supplied to `createClientCore` as `defaultTransport`.
 */
export type Transport<TRequest = NativeRequest, TResponse = NativeResponse> = (
  request: ResolvedRequest,
) => Promise<TransportResult<unknown, TRequest, TResponse>>

export type CallResult<TRequest = NativeRequest, TResponse = NativeResponse> = {
  status: number
  data: unknown
  error: unknown
  contentType: string | undefined
  request: TRequest
  response: TResponse
}

export type InterceptorFn<T, TContext = never> = (
  value: T,
  context?: TContext,
) => T | Promise<T>

/**
 * A single interceptor channel with a transport-agnostic `use` / `eject` / `update` API.
 */
export type InterceptorStack<T, TContext = never> = {
  use: (fn: InterceptorFn<T, TContext>) => number
  eject: (id: number) => void
  update: (id: number, fn: InterceptorFn<T, TContext>) => void
  run: (value: T, context?: TContext) => Promise<T>
}

export type Interceptors<
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = {
  request: InterceptorStack<
    ResolvedRequest,
    RequestConfig<unknown, TRequest, TResponse>
  >
  response: InterceptorStack<
    TransportResult<unknown, TRequest, TResponse>,
    RequestConfig<unknown, TRequest, TResponse>
  >
  error: InterceptorStack<
    ResponseError<unknown, TRequest, TResponse>,
    RequestConfig<unknown, TRequest, TResponse>
  >
}

export type UrlConfig = Pick<
  RequestConfig,
  'baseURL' | 'url' | 'path' | 'query' | 'params' | 'serializer' | 'styles'
>

/**
 * A client instance: the callable send plus configuration, interceptors, and an isolated
 * `createClient` factory bound to the same transport.
 */
export type ClientInstance<
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = {
  <TBody = unknown>(
    config: RequestConfig<TBody, TRequest, TResponse>,
  ): Promise<CallResult<TRequest, TResponse>>
  getConfig: () => ClientConfig<TRequest, TResponse>
  setConfig: (
    config: ClientConfig<TRequest, TResponse>,
  ) => ClientConfig<TRequest, TResponse>
  getUrl: (config: UrlConfig) => string
  interceptors: Interceptors<TRequest, TResponse>
  createClient: (
    config?: ClientConfig<TRequest, TResponse>,
  ) => ClientInstance<TRequest, TResponse>
}

/**
 * Thrown for a non-2xx response, so a resolved call always means success.
 */
export class ResponseError<
  TError = unknown,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> extends Error {
  data: TError
  status: number
  statusText: string
  contentType: string | undefined
  request: TRequest
  response: TResponse

  constructor(config: {
    data: TError
    status: number
    statusText: string
    contentType?: string
    request: TRequest
    response: TResponse
    method?: string
    url?: string
  }) {
    // The query and hash are left out: sensitive query parameters or fragments must not reach logs.
    const cleanUrl = config.url?.split(/[?#]/)[0]
    const target = [config.method, cleanUrl].filter(Boolean).join(' ')
    const statusText = config.statusText?.trim()
    super(
      `${target ? `${target} failed` : 'Request failed'} with status ${config.status}${statusText ? ` ${statusText}` : ''}`,
    )
    this.name = 'ResponseError'
    this.data = config.data
    this.status = config.status
    this.statusText = config.statusText
    this.contentType = config.contentType
    this.request = config.request
    this.response = config.response
  }

  /**
   * Matches on `name`, not `instanceof`: every generated client bundles its own `ResponseError` class.
   */
  static is(error: unknown): error is ResponseError<unknown, unknown, unknown> {
    return error instanceof Error && error.name === 'ResponseError'
  }
}

export type ResponseErrorConfig<TError = unknown> = ResponseError<TError>

function headerEntries(headers: object): Array<[string, unknown]> {
  if (Array.isArray(headers)) return headers
  return headers instanceof Headers ? [...headers] : Object.entries(headers)
}

function serializeHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  if (!headers) return {}
  const entries = headerEntries(headers)
  const result: Record<string, string> = {}
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue
    result[key] =
      typeof value === 'string'
        ? value
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value)
  }
  return result
}

function collectHeadersCaseInsensitive(
  ...sources: Array<unknown>
): Record<string, unknown> {
  const keys = new Map<string, string>()
  const result: Record<string, unknown> = {}
  for (const source of sources) {
    if (!source) continue
    const entries = headerEntries(source)
    for (const [key, value] of entries) {
      if (value === undefined || value === null) continue
      const lowerCase = key.toLowerCase()
      const previous = keys.get(lowerCase)
      if (previous !== undefined) delete result[previous]
      keys.set(lowerCase, key)
      result[key] = value
    }
  }
  return result
}

function getHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  )
  return key ? headers[key] : undefined
}

function serializeUrl({
  parts,
  pathParams,
  search,
  pathSerializer = defaultPathSerializer,
  pathStyles,
}: {
  parts: Array<string | undefined>
  pathParams: Record<string, unknown>
  search: string
  pathSerializer?: PathSerializer
  pathStyles?: Record<string, PathParamStyle>
}): string {
  const path = parts
    .filter(Boolean)
    .join('')
    .replace(/\{([^{}]+)\}/g, (_, key: string) =>
      pathSerializer({
        name: key,
        value: pathParams[key],
        options: pathStyles?.[key],
      }),
    )
  return path + (search ? `?${search}` : '')
}

/**
 * Creates a transport-agnostic interceptor channel that runs interceptors in registration order.
 */
export function createInterceptorStack<T, TContext = never>(): InterceptorStack<
  T,
  TContext
> {
  let entries: Array<{ id: number; fn: InterceptorFn<T, TContext> }> = []
  let counter = 0
  return {
    use(fn) {
      const id = ++counter
      entries.push({ id, fn })
      return id
    },
    eject(id) {
      entries = entries.filter((entry) => entry.id !== id)
    },
    update(id, fn) {
      const entry = entries.find((item) => item.id === id)
      if (entry) entry.fn = fn
    },
    async run(value, context) {
      let result = value
      for (const entry of entries) {
        result = await entry.fn(result, context)
      }
      return result
    },
  }
}

/**
 * Walks the per-operation security in order and places the first resolved token on the request, mutating `headers` / `query` in place.
 */
export async function resolveAuth(params: {
  security: Array<Auth> | undefined
  auth: AuthResolver | undefined
  headers: Record<string, string>
  query: Record<string, unknown>
}): Promise<void> {
  const { security, auth, headers, query } = params
  if (!security?.length || auth === undefined) return

  for (const scheme of security) {
    const token = typeof auth === 'function' ? await auth(scheme) : auth
    if (token === undefined) continue

    if (scheme.type !== 'apiKey') {
      if (getHeader(headers, 'Authorization') === undefined) {
        headers['Authorization'] =
          scheme.scheme === 'basic'
            ? `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(token)))}`
            : `Bearer ${token}`
      }
      return
    }

    const name = scheme.name ?? 'Authorization'
    if (scheme.in === 'query') {
      if (query[name] === undefined) query[name] = token
      return
    }
    if (scheme.in === 'cookie') {
      headers['Cookie'] = [headers['Cookie'], `${name}=${token}`]
        .filter(Boolean)
        .join('; ')
      return
    }
    if (getHeader(headers, name) === undefined) headers[name] = token
    return
  }
}

/** A body a transport left as a stream: a web `ReadableStream` or an async iterable such as a Node readable. */
export function isStreamed(
  data: unknown,
): data is ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string> {
  return (
    data instanceof ReadableStream ||
    (!!data && typeof data === 'object' && Symbol.asyncIterator in data)
  )
}

/** The media type of the `Content-Type` response header, without its parameters. */
export function getResponseContentType(
  headers: Headers | Record<string, string> | undefined,
): string | undefined {
  if (!headers) return undefined
  const value =
    headers instanceof Headers
      ? headers.get('Content-Type')
      : (headers['Content-Type'] ?? headers['content-type'])
  return baseContentType(value)
}

function resolveSerializers({
  config,
  requestConfig,
}: {
  config: { serializer?: Serializers }
  requestConfig: { serializer?: Serializers }
}) {
  return {
    querySerializer:
      requestConfig.serializer?.query ??
      config.serializer?.query ??
      defaultQuerySerializer,
    bodySerializer:
      requestConfig.serializer?.body ??
      config.serializer?.body ??
      defaultBodySerializer,
    pathSerializer:
      requestConfig.serializer?.path ??
      config.serializer?.path ??
      defaultPathSerializer,
  }
}

async function resolveRequest<TBody, TRequest, TResponse>({
  config,
  requestConfig,
}: {
  config: ClientConfig<TRequest, TResponse>
  requestConfig: RequestConfig<TBody, TRequest, TResponse>
}): Promise<{
  request: ResolvedRequest
  codecs: Record<string, Codec>
  validate: ValidateOption | undefined
}> {
  const { querySerializer, bodySerializer, pathSerializer } =
    resolveSerializers({ config, requestConfig })
  const codecs = { ...config.codecs, ...requestConfig.codecs }
  const onValidationError =
    requestConfig.onValidationError ?? config.onValidationError
  const validate = requestConfig.validate ?? config.validate
  const validationContext = {
    direction: 'request',
    method: requestConfig.method,
    url: requestConfig.url,
  } as const

  // Params are encoded before anything reads them: headers before styling, query before auth adds its values.
  const paramValues = {
    path: { ...(requestConfig.path as Record<string, unknown> | undefined) },
    query: {
      ...((requestConfig.query ?? requestConfig.params) as
        | Record<string, unknown>
        | undefined),
    },
    headers: collectHeadersCaseInsensitive(
      config.headers,
      requestConfig.headers,
    ),
  }
  const [validatedPath, validatedQuery, validatedHeaders] = await Promise.all(
    (['path', 'query', 'headers'] as const).map((source) =>
      runValidator({
        validator: isValidationEnabled(validate, 'params')
          ? requestConfig.validator?.[source]
          : undefined,
        value: paramValues[source],
        context: { ...validationContext, source },
        onValidationError,
      }),
    ),
  )

  const headers = serializeHeaders(
    applyHeaderStyles(
      validatedHeaders as HeadersInit | undefined,
      requestConfig.styles?.header,
    ),
  )
  const contentType = requestConfig.contentType
  const { request: requestContentTypeOption, response: responseContentType } =
    typeof contentType === 'string'
      ? { request: contentType }
      : (contentType ?? {})
  const requestContentType =
    requestContentTypeOption ?? getHeader(headers, 'content-type')
  if (responseContentType && getHeader(headers, 'accept') === undefined) {
    headers['Accept'] = responseContentType
  }

  const query: Record<string, unknown> = {
    ...(validatedQuery as Record<string, unknown> | undefined),
  }

  await resolveAuth({
    security: requestConfig.security,
    auth: requestConfig.auth ?? config.auth,
    headers,
    query,
  })

  if (requestConfig.cookies) {
    const cookie = serializeCookies(
      requestConfig.cookies as Record<string, unknown>,
      requestConfig.styles?.cookie,
    )
    if (cookie)
      headers['Cookie'] = [headers['Cookie'], cookie].filter(Boolean).join('; ')
  }

  const validatedBody = await runValidator({
    validator: isValidationEnabled(validate, 'request')
      ? requestConfig.validator?.request
      : undefined,
    value: requestConfig.body,
    context: { ...validationContext, source: 'body' },
    onValidationError,
  })
  const requestContentTypeBase = baseContentType(requestContentType)
  const contentCodec = requestContentTypeBase
    ? codecs[requestContentTypeBase]
    : undefined
  const usesDefaultBodySerializer =
    !contentCodec?.serialize && bodySerializer === defaultBodySerializer
  const body = contentCodec?.serialize
    ? contentCodec.serialize(validatedBody, requestContentType)
    : bodySerializer({
        body: validatedBody,
        contentType: requestContentType,
        encoding: requestConfig.styles?.body,
      })
  if (requestContentTypeOption)
    headers['Content-Type'] = requestContentTypeOption
  if (
    usesDefaultBodySerializer &&
    isDefaultJsonBody(validatedBody) &&
    getHeader(headers, 'content-type') === undefined
  ) {
    headers['Content-Type'] = 'application/json'
  }
  // The transport must set the multipart boundary, even when a content type was explicitly provided.
  if (body instanceof FormData) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-type') delete headers[key]
    }
  }

  const url = serializeUrl({
    parts: [requestConfig.baseURL ?? config.baseURL, requestConfig.url],
    pathParams: (validatedPath ?? {}) as Record<string, unknown>,
    search: querySerializer(query, requestConfig.styles?.query),
    pathSerializer,
    pathStyles: requestConfig.styles?.path,
  })

  const options =
    config.options || requestConfig.options
      ? { ...config.options, ...requestConfig.options }
      : undefined

  return {
    codecs,
    validate,
    request: {
      url,
      method: (requestConfig.method ?? 'GET').toUpperCase(),
      headers,
      body,
      signal: requestConfig.signal,
      credentials: requestConfig.credentials ?? config.credentials,
      options,
      responseType: requestConfig.responseType,
    },
  }
}

/**
 * Creates an isolated client using the supplied default transport.
 */
export function createClientCore<
  TRequest = NativeRequest,
  TResponse = NativeResponse,
>(
  options: { defaultTransport: Transport<TRequest, TResponse> } & ClientConfig<
    TRequest,
    TResponse
  >,
): ClientInstance<TRequest, TResponse> {
  const { defaultTransport, ...initialConfig } = options
  let config: ClientConfig<TRequest, TResponse> = { ...initialConfig }

  const interceptors: Interceptors<TRequest, TResponse> = {
    request: createInterceptorStack<
      ResolvedRequest,
      RequestConfig<unknown, TRequest, TResponse>
    >(),
    response: createInterceptorStack<
      TransportResult<unknown, TRequest, TResponse>,
      RequestConfig<unknown, TRequest, TResponse>
    >(),
    error: createInterceptorStack<
      ResponseError<unknown, TRequest, TResponse>,
      RequestConfig<unknown, TRequest, TResponse>
    >(),
  }

  const client = (async <TBody = unknown>(
    requestConfig: RequestConfig<TBody, TRequest, TResponse>,
  ): Promise<CallResult<TRequest, TResponse>> => {
    const transport =
      requestConfig.transport ?? config.transport ?? defaultTransport
    const { request, codecs, validate } = await resolveRequest({
      config,
      requestConfig,
    })

    const resolvedRequest = await interceptors.request.run(
      request,
      requestConfig,
    )
    const result = await interceptors.response.run(
      await transport(resolvedRequest),
      requestConfig,
    )

    const throwOnError =
      requestConfig.throwOnError ?? config.throwOnError ?? true
    const validator = requestConfig.validator
    const onValidationError =
      requestConfig.onValidationError ?? config.onValidationError
    const isSuccess = result.status >= 200 && result.status < 300
    const direction = isSuccess ? 'response' : 'error'
    const contentType =
      result.contentType ?? getResponseContentType(result.headers)
    const codec = contentType ? codecs[contentType] : undefined
    const decoded =
      contentType && codec?.deserialize
        ? await codec.deserialize(result.data, contentType)
        : result.data
    // A streamed success body is validated event by event in `toEventStream`, not as a whole. A JSON answer to a streamed call is a whole body.
    const streaming =
      isSuccess &&
      resolvedRequest.responseType === 'stream' &&
      isStreamed(decoded)
    const data = await runValidator({
      validator:
        isValidationEnabled(validate, direction) && !streaming
          ? validator?.[direction]
          : undefined,
      value: decoded,
      context: {
        direction,
        source: 'body',
        method: resolvedRequest.method,
        url: resolvedRequest.url,
        status: result.status,
      },
      onValidationError,
    })
    if (!isSuccess && throwOnError) {
      const responseError = new ResponseError({
        data,
        status: result.status,
        statusText: result.statusText,
        contentType,
        request: result.request,
        response: result.response,
        method: resolvedRequest.method,
        url: resolvedRequest.url,
      })
      await interceptors.error.run(responseError, requestConfig)
      throw responseError
    }
    return {
      status: result.status,
      data: isSuccess ? data : undefined,
      error: isSuccess ? undefined : data,
      contentType,
      request: result.request,
      response: result.response,
    }
  }) as ClientInstance<TRequest, TResponse>

  client.getConfig = () => config
  client.setConfig = (next) => {
    config = {
      ...config,
      ...next,
      headers: {
        ...serializeHeaders(config.headers),
        ...serializeHeaders(next.headers),
      },
    }
    return config
  }
  client.getUrl = (requestConfig) => {
    const { querySerializer, pathSerializer } = resolveSerializers({
      config,
      requestConfig,
    })
    const query: Record<string, unknown> = {
      ...((requestConfig.query ?? requestConfig.params) as
        | Record<string, unknown>
        | undefined),
    }
    return serializeUrl({
      parts: [requestConfig.baseURL ?? config.baseURL, requestConfig.url],
      pathParams: (requestConfig.path ?? {}) as Record<string, unknown>,
      search: querySerializer(query, requestConfig.styles?.query),
      pathSerializer,
      pathStyles: requestConfig.styles?.path,
    })
  }
  client.interceptors = interceptors
  client.createClient = (next) =>
    createClientCore({ defaultTransport, ...config, ...next })

  return client
}
