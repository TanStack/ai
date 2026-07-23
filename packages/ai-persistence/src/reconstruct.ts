import type { AIPersistence } from './types'

export interface ReconstructChatOptions {
  /** Query parameter carrying the thread id. Defaults to `threadId`. */
  param?: string
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
 * ```ts
 * export async function GET(request: Request) {
 *   return reconstructChat(persistence, request)
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
  const messages =
    threadId && persistence.stores.messages
      ? await persistence.stores.messages.loadThread(threadId)
      : []
  return new Response(JSON.stringify(messages), {
    headers: { 'content-type': 'application/json' },
  })
}
