/**
 * The runtime of the generated provider clients (Kubb fetch runtime), plus
 * `sendWith`, which hands a generated request to a provider's own sender
 * (retries, timeouts, provider errors) instead of the global `fetch`.
 */
import { createClient, getResponseContentType } from './generated/kubb/client'
import type { ClientInstance } from './generated/kubb/client'

export * from './generated/kubb/client'

/** One request as a generated operation built it. */
export interface GeneratedRequest {
  method: string
  /** The operation path with its path params and query, no base URL. */
  path: string
  headers: Record<string, string>
  /** The serialized body: a JSON string, `FormData`, or `undefined`. */
  body: BodyInit | undefined
  signal: AbortSignal | undefined
}

/**
 * A client for generated operations that sends each request through `send`.
 * `send` resolves to the 2xx `Response` (it throws for anything else), and
 * the call result's `response` is that `Response`, body unread.
 *
 * @example
 * const { response } = await openaiPostEmbeddings({
 *   client: sendWith((request) => http.request(request)),
 *   body,
 * })
 * const json = await response.json()
 */
export function sendWith(
  send: (request: GeneratedRequest) => Promise<Response>,
): ClientInstance {
  return createClient({
    transport: async (request) => {
      const response = await send({
        method: request.method,
        path: request.url,
        headers: request.headers,
        body: request.body ?? undefined,
        signal: request.signal,
      })
      return {
        // ponytail: the body stays unread. The provider layer reads it (JSON,
        // SSE, or bytes), because Kubb parses neither SSE nor every audio type.
        data: undefined,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        contentType: getResponseContentType(response.headers),
        request: new Request(new URL(request.url, 'http://localhost'), {
          method: request.method,
        }),
        response,
      }
    },
  })
}
