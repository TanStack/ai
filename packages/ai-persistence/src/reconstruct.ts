import { modelMessagesToUIMessages } from '@tanstack/ai'
import type { UIMessage } from '@tanstack/ai'
import { validateReconstructChatStores } from './types'
import type { AIPersistence, ChatTranscriptStores } from './types'

export interface ReconstructedChat {
  messages: Array<UIMessage>
  activeRun: { runId: string } | null
  interrupts: {
    runId: string
    pending: Array<Record<string, unknown>>
  } | null
}

export interface ReconstructChatOptions {
  /** Query parameter carrying the thread id. Defaults to `threadId`. */
  param?: string
  authorize?: (
    threadId: string,
    request: Request,
  ) => boolean | Response | Promise<boolean | Response>
}

export async function reconstructChat(
  persistence: AIPersistence<ChatTranscriptStores>,
  request: Request,
  options?: ReconstructChatOptions,
): Promise<Response> {
  validateReconstructChatStores(persistence)
  const messageStore = persistence.stores.messages
  if (!messageStore) {
    // validateReconstructChatStores already throws; this narrows for TypeScript.
    throw new Error('reconstructChat requires stores.messages.')
  }

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

  const active = threadId
    ? await persistence.stores.runs?.findActiveRun(threadId)
    : null
  const stored = threadId ? await messageStore.loadThread(threadId) : []
  const pending = threadId
    ? ((await persistence.stores.interrupts?.listPending(threadId)) ?? [])
    : []
  const firstPending = pending[0]
  const body: ReconstructedChat = {
    messages: modelMessagesToUIMessages(stored),
    activeRun: active ? { runId: active.runId } : null,
    interrupts: firstPending
      ? {
          runId: firstPending.runId,
          pending: pending.map((record) => record.payload),
        }
      : null,
  }
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })
}
