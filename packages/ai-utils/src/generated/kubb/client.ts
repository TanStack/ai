import * as core from './core'
import type { ResponseType, Transport, TransportResult } from './core'
import { createClientCore, getResponseContentType } from './core'
import { isJsonMediaType } from './serializers'
export * from './core'

/** The request and response objects of this transport, carried on every result and error. */
export type NativeRequest = Request
export type NativeResponse = Response

/**
 * Extra `fetch` init the transport spreads onto every `Request`, an escape hatch for fields the runtime does not set itself such as `cache`, `redirect`, and Next.js's `next`.
 */
export type FetchOptions = RequestInit & { next?: Record<string, unknown> }

export type RequestConfig<
  TBody = unknown,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = core.RequestConfig<TBody, TRequest, TResponse> & {
  options?: FetchOptions
}
export type Options<
  TData extends core.DataShape,
  ThrowOnError extends boolean = true,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = core.Options<TData, ThrowOnError, TRequest, TResponse> & {
  options?: FetchOptions
}
export type ClientConfig<
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = core.ClientConfig<TRequest, TResponse> & { options?: FetchOptions }
export type ResolvedRequest = core.ResolvedRequest & { options?: FetchOptions }
export type ResponseError<
  TError = unknown,
  TRequest = NativeRequest,
  TResponse = NativeResponse,
> = core.ResponseError<TError, TRequest, TResponse>
/** The core's `ResponseError` class, typed with this transport's request and response. `instanceof` and `ResponseError.is` both match what the client throws. */
export const ResponseError = core.ResponseError as {
  new <TError = unknown, TRequest = NativeRequest, TResponse = NativeResponse>(
    config: ConstructorParameters<
      typeof core.ResponseError<TError, TRequest, TResponse>
    >[0],
  ): core.ResponseError<TError, TRequest, TResponse>
  is: typeof core.ResponseError.is
  // `instanceof` narrows to this type, so it carries the native request and response.
  prototype: core.ResponseError<unknown, NativeRequest, NativeResponse>
}

function detectResponseType(
  contentType: string | null,
): ResponseType | undefined {
  if (!contentType) return undefined
  if (contentType.includes('text/event-stream')) return 'stream'
  if (
    contentType.includes('application/json') ||
    contentType.includes('text/json')
  )
    return 'json'
  if (contentType.includes('text/')) return 'text'
  if (
    contentType.includes('image/') ||
    contentType.includes('application/octet-stream')
  )
    return 'blob'
  return undefined
}

async function parseResponse(
  response: Response,
  responseType?: ResponseType,
): Promise<unknown> {
  if (
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304 ||
    !response.body
  ) {
    return undefined
  }

  const contentType = response.headers.get('Content-Type')
  // A server may answer a streamed operation with JSON, or with an error body: both are decoded by their content type. Any other streamed success body stays a stream.
  const detected =
    responseType === 'stream' && (!response.ok || isJsonMediaType(contentType))
      ? undefined
      : responseType
  switch (detected ?? detectResponseType(contentType)) {
    case 'text':
    case 'document':
      return response.text()
    case 'blob':
      return response.blob()
    case 'arraybuffer':
      return response.arrayBuffer()
    case 'stream':
      return response.body ?? undefined
    case 'json': {
      // An empty body with a JSON content-type would make response.json() throw, so treat it as no data.
      const body = await response.text()
      return body ? JSON.parse(body) : undefined
    }
  }

  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * The default transport that sends the resolved request through `globalThis.fetch` and returns the parsed body with the native request and response.
 */
export const defaultTransport: Transport = async (
  request: ResolvedRequest,
): Promise<TransportResult> => {
  const init: RequestInit = {
    ...request.options,
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
  }
  if (request.credentials) init.credentials = request.credentials

  const nativeRequest = new Request(request.url, init)
  const response = await globalThis.fetch(nativeRequest)
  const data = await parseResponse(response, request.responseType)

  return {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    contentType: getResponseContentType(response.headers),
    request: nativeRequest,
    response,
  }
}

export const client = createClientCore({ defaultTransport })

export const createClient = (
  config?: Parameters<typeof client.createClient>[0],
) => client.createClient(config)
