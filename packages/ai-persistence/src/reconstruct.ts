import { modelMessagesToUIMessages } from '@tanstack/ai'
import type { UIMessage } from '@tanstack/ai'
import type { AIPersistence } from './types'

/**
 * The JSON body `reconstructChat` returns and a server-authoritative client
 * hydrates from on mount.
 *
 * `messages` is the stored transcript as UI messages (ready to paint).
 * `activeRun` is a cursor to a run still generating for the thread, or `null` —
 * resolved from the STABLE thread id via `stores.runs.findActiveRun`, so the
 * client learns "there is a live run to tail" without ever handling a run id.
 */
export interface ReconstructedChat {
  messages: Array<UIMessage>
  activeRun: { runId: string } | null
}

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
 * Build the JSON `Response` a server-authoritative client hydrates from on load
 * (see the client-persistence guide). Reads the thread id from the request query
 * (`?threadId=` by default) and returns `{ messages, activeRun }`
 * ({@link ReconstructedChat}):
 *
 * - `messages` — the stored transcript as UI messages.
 * - `activeRun` — `{ runId }` if a run is still generating for the thread (so the
 *   client tails it via the durability stream), else `null`. Resolved via the
 *   optional `stores.runs.findActiveRun`; `null` when that store/method is absent.
 *
 * Returns an empty transcript with no active run when the thread id is missing,
 * no `messages` store is configured, or the thread is unknown, so the caller
 * never has to special-case a first load.
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

  // Resolve the active run BEFORE reading the transcript. `withPersistence`
  // persists the final transcript BEFORE marking a run complete, so observing
  // "no active run" here guarantees the transcript read below is the FINAL one.
  // Reading them in the other order opens a finish-window race: a fast run that
  // completes between the two reads would return a stale streaming snapshot with
  // `activeRun: null`, leaving the client stuck on the partial (no run to tail).
  const active = threadId
    ? await persistence.stores.runs?.findActiveRun?.(threadId)
    : null
  const stored =
    threadId && persistence.stores.messages
      ? await persistence.stores.messages.loadThread(threadId)
      : []
  const body: ReconstructedChat = {
    messages: modelMessagesToUIMessages(stored),
    activeRun: active ? { runId: active.runId } : null,
  }
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })
}
