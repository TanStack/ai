import type { AIPersistence } from './types'

export interface ReconstructChatOptions {
  /** Query parameter carrying the thread id. Defaults to `threadId`. */
  param?: string
  /**
   * Authorize access to the requested thread before loading history.
   *
   * ⚠️ Without this, any caller who knows or guesses `?threadId=` receives the
   * full transcript. Multi-user / multi-tenant deployments **must** supply
   * an authorization check (session → owned threads) or resolve a validated
   * thread id in the route and pass it via a custom `param` that only your
   * server sets.
   *
   * Return:
   * - `true` to allow the load
   * - `false` for a default `403` response
   * - a `Response` to return as-is (e.g. `401` with a body)
   */
  authorize?: (
    threadId: string,
    request: Request,
  ) => boolean | Response | Promise<boolean | Response>
}

/**
 * Build a JSON `Response` of a thread's stored messages, for a
 * server-authoritative client to hydrate its transcript on load (see the
 * client-persistence guide). Reads the thread id from the request query
 * (`?threadId=` by default) and returns the stored messages as JSON.
 *
 * Returns an empty array when the thread id is missing, no `messages` store is
 * configured, or the thread is unknown, so the caller never has to special-case
 * a first load.
 *
 * This helper does **not** enforce tenancy by itself. Pass
 * {@link ReconstructChatOptions.authorize} (or wrap the call in your own
 * session gate) before exposing it on a public route.
 *
 * ```ts
 * export async function GET(request: Request) {
 *   return reconstructChat(persistence, request, {
 *     authorize: async (threadId, req) => {
 *       const userId = await getSessionUserId(req)
 *       return userId != null && (await userOwnsThread(userId, threadId))
 *     },
 *   })
 * }
 * ```
 */
export async function reconstructChat(
  persistence: AIPersistence,
  request: Request,
  options?: ReconstructChatOptions,
): Promise<Response> {
  const param = options?.param ?? 'threadId'
  const threadId = new URL(request.url).searchParams.get(param) ?? ''

  if (threadId && options?.authorize) {
    const decision = await options.authorize(threadId, request)
    if (decision instanceof Response) {
      return decision
    }
    if (!decision) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
      })
    }
  }

  const messages =
    threadId && persistence.stores.messages
      ? await persistence.stores.messages.loadThread(threadId)
      : []
  return new Response(JSON.stringify(messages), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })
}
