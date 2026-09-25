import { isTerminalRunStatus, modelMessagesToUIMessages } from '@tanstack/ai'
import type {
  ModelMessage,
  RunRecord,
  SubagentPart,
  TerminalRunStatus,
  UIMessage,
} from '@tanstack/ai'
import { storedSubagentInfo } from './subagent-runs'
import { validateReconstructChatStores } from './types'
import type {
  AIPersistence,
  ChatTranscriptStores,
  InterruptRecord,
  MessagePage,
  MessageStore,
} from './types'

const MAX_PAGE_SIZE = 500

/**
 * The JSON body `reconstructChat` returns and a server-authoritative client
 * hydrates from on mount.
 *
 * `messages` is the stored transcript as UI messages (ready to paint).
 * `activeRun` is a cursor to a run still generating for the thread, or `null` —
 * resolved from the STABLE thread id via `stores.runs.findActiveRun`, so the
 * client learns "there is a live run to tail" without ever handling a run id.
 * `interrupts` is the thread's pending human-in-the-loop interrupts (tool
 * approvals, client-tool/generic waits) and the run they paused, or `null` —
 * so a reload (or another device) re-prompts the approval from the SERVER, not
 * from client storage. Resolved via `stores.interrupts.listPending`.
 * `page` is set only when the GET included a valid `limit`. `truncated` is true
 * when older UI messages exist. `cursor` is the opaque `before` token for the
 * next older window.
 */
export interface ReconstructedChat {
  messages: Array<UIMessage>
  activeRun: { runId: string } | null
  interrupts: {
    runId: string
    pending: Array<Record<string, unknown>>
  } | null
  page?: { truncated: false } | { truncated: true; cursor: string }
  /**
   * The thread's finished runs, ascending by `startedAt`. Set only when
   * {@link ReconstructChatOptions.includeRuns} is `true` and the `runs` store
   * implements `listByThread`. Each assistant message of a listed run also
   * gets the timings on `message.metadata.tanstack.run`.
   */
  runs?: Array<{
    runId: string
    status: TerminalRunStatus
    startedAt: number
    finishedAt?: number
  }>
}

export interface ReconstructChatOptions {
  /** Query parameter carrying the thread id. Defaults to `threadId`. */
  param?: string
  /**
   * Add the thread's finished runs, with `startedAt` and `finishedAt`, to the
   * response as `runs`. Needs a `runs` store that implements `listByThread`.
   * Default: `false`.
   */
  includeRuns?: boolean
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
 * (`?threadId=` by default) and returns `{ messages, activeRun, interrupts }`
 * ({@link ReconstructedChat}):
 *
 * - `messages` — the stored transcript as UI messages.
 * - `activeRun` — `{ runId }` if a run is still generating for the thread (so the
 *   client tails it via the durability stream), else `null`. Resolved via the
 *   required `stores.runs.findActiveRun`; `null` when the `runs` store is absent.
 * - `interrupts` — `{ runId, pending }` if the thread has pending human-in-the-loop
 *   interrupts (a paused approval / wait) and the run they paused, else `null`, so
 *   a reload re-prompts the decision from the server. Resolved via the optional
 *   `stores.interrupts.listPending`; `null` when that store is absent.
 *
 * Paging is opt-in. A valid `?limit=` (positive integer, capped at 500) returns
 * the newest window of UI messages plus `page`. `?before=` walks to an older
 * window. Invalid `limit` (`0`, negative, NaN) is ignored and the full
 * transcript is returned. `activeRun` and `interrupts` are never paged.
 *
 * Requires `stores.messages`. Returns an empty transcript with no active run
 * and no interrupts when the thread id is missing or the thread is unknown, so
 * the caller never has to special-case a first load.
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

  const requestUrl = new URL(request.url)
  const param = options?.param ?? 'threadId'
  const threadId = requestUrl.searchParams.get(param) ?? ''
  const pageSize = parsePageSize(requestUrl.searchParams.get('limit'))
  const before = parseBefore(requestUrl.searchParams.get('before'))

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
    ? await persistence.stores.runs?.findActiveRun(threadId)
    : null
  const stored =
    threadId === ''
      ? []
      : pageSize === undefined
        ? await messageStore.loadThread(threadId)
        : await messageStore.loadThread(threadId, {
            limit: pageSize + 1,
            ...(before === undefined ? {} : { before }),
          })
  // Pending interrupts for the thread, so a reload re-prompts the approval from
  // the server. Each stored `payload` is the full interrupt descriptor the
  // client hydrates; they share the run they paused.
  const pending = threadId
    ? ((await persistence.stores.interrupts?.listPending(threadId)) ?? [])
    : []
  const firstPending = pending[0]
  const isPaging = pageSize !== undefined && threadId !== ''
  const transcript = !isPaging
    ? {
        messages: modelMessagesToUIMessages(threadMessages(stored)),
      }
    : Array.isArray(stored)
      ? await windowFromArray({
          stored,
          messageStore,
          threadId,
          pageSize,
          before,
        })
      : windowFromMessagePage(stored, pageSize)
  const messages = await attachSubagentCards(
    transcript.messages,
    persistence.stores.runs,
    messageStore,
    threadId,
    pending,
  )
  const runStore = persistence.stores.runs
  const runs =
    options?.includeRuns && threadId && runStore?.listByThread
      ? (await runStore.listByThread(threadId)).flatMap((run) =>
          isTerminalRunStatus(run.status)
            ? [
                {
                  runId: run.runId,
                  status: run.status,
                  startedAt: run.startedAt,
                  ...(run.finishedAt !== undefined && {
                    finishedAt: run.finishedAt,
                  }),
                },
              ]
            : [],
        )
      : undefined
  const body: ReconstructedChat = {
    messages: runs ? stampRunTimings(messages, runs) : messages,
    activeRun: active ? { runId: active.runId } : null,
    interrupts: firstPending
      ? {
          runId: firstPending.runId,
          pending: pending.map((record) => record.payload),
        }
      : null,
    ...('page' in transcript ? { page: transcript.page } : {}),
    ...(runs ? { runs } : {}),
  }
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })
}

function messageRunId(message: UIMessage) {
  const metadata = message.metadata
  if (!metadata || typeof metadata !== 'object') return
  const tanstack = metadata.tanstack
  if (!tanstack || typeof tanstack !== 'object') return
  const runId = (tanstack as { runId?: unknown }).runId
  return typeof runId === 'string' && runId !== '' ? runId : undefined
}

/**
 * Write each finished run's timings to `metadata.tanstack.run` on the
 * assistant messages of that run, so a client reads them from the message.
 */
function stampRunTimings(
  messages: Array<UIMessage>,
  runs: NonNullable<ReconstructedChat['runs']>,
): Array<UIMessage> {
  const byId = new Map(runs.map((run) => [run.runId, run]))
  return messages.map((message) => {
    const tanstack = message.metadata?.tanstack
    const runId: unknown = tanstack?.run?.id
    const run =
      message.role === 'assistant' && typeof runId === 'string'
        ? byId.get(runId)
        : undefined
    if (!run) return message
    return {
      ...message,
      metadata: {
        ...message.metadata,
        tanstack: {
          ...tanstack,
          run: {
            id: run.runId,
            startedAt: run.startedAt,
            ...(run.finishedAt !== undefined && { finishedAt: run.finishedAt }),
          },
        },
      },
    }
  })
}

type Runs = NonNullable<ChatTranscriptStores['runs']>

/** Rebuild one child card from its run record and stored transcript. */
async function childCard(
  child: RunRecord,
  runs: Runs,
  messageStore: MessageStore,
  pending: ReadonlyArray<InterruptRecord>,
  depth: number,
): Promise<SubagentPart> {
  const subagentRunId = child.subagentRunId ?? child.runId
  const stored = await messageStore.loadThread(child.threadId)
  const info = storedSubagentInfo(stored)
  const messages = modelMessagesToUIMessages(
    stored.filter(
      (message) => storedSubagentInfo([message])?.placeholder !== true,
    ),
  )
  const nested =
    runs.listByParentRun && depth < 8
      ? await runs.listByParentRun(subagentRunId)
      : []
  if (nested.length > 0) {
    const cards = await Promise.all(
      nested.map((run) =>
        childCard(run, runs, messageStore, pending, depth + 1),
      ),
    )
    const last = messages.findLastIndex((m) => m.role === 'assistant')
    if (last === -1) {
      messages.push({
        id: `child-cards:${subagentRunId}`,
        role: 'assistant',
        parts: cards,
      })
    } else {
      const host = messages[last]
      if (host) messages[last] = { ...host, parts: [...host.parts, ...cards] }
    }
  }
  const failed = child.status === 'failed' || child.status === 'aborted'
  const interruptIds = pending
    .filter((record) => record.payload.subagentRunId === subagentRunId)
    .map((record) => record.interruptId)
  return {
    type: 'subagent',
    subagent: {
      id: subagentRunId,
      name: child.name ?? info?.name ?? 'subagent',
      status: failed
        ? 'error'
        : child.status === 'running'
          ? 'running'
          : child.status === 'interrupted'
            ? 'suspended'
            : 'finished',
      ...(child.parentRunId !== undefined && {
        parentRunId: child.parentRunId,
      }),
      ...(info?.parentToolCallId !== undefined && {
        parentToolCallId: info.parentToolCallId,
      }),
      ...(interruptIds.length > 0 && { interruptIds }),
      ...(info?.metadata !== undefined && { metadata: info.metadata }),
      messages,
      ...(failed && child.error ? { error: child.error } : {}),
    },
  }
}

/**
 * Put stored subagent cards back on the transcript. A routed child sits on
 * the parent assistant message of its run. A child that a tool call started
 * sits on the message that holds that tool call.
 */
async function attachSubagentCards(
  messages: Array<UIMessage>,
  runs: ChatTranscriptStores['runs'],
  messageStore: MessageStore,
  threadId: string,
  pending: ReadonlyArray<InterruptRecord>,
) {
  if (!runs?.listByParentRun) return messages
  const parentRunIds = new Set<string>()
  for (const message of messages) {
    const runId = messageRunId(message)
    if (runId) parentRunIds.add(runId)
  }
  const hasToolCalls = messages.some((message) =>
    message.parts.some((part) => part.type === 'tool-call'),
  )
  if (hasToolCalls && runs.listByThread && threadId !== '') {
    for (const run of await runs.listByThread(threadId)) {
      parentRunIds.add(run.runId)
    }
  }

  const cardsByRun = new Map<string, Array<SubagentPart>>()
  const cardsByToolCall = new Map<string, Array<SubagentPart>>()
  for (const runId of parentRunIds) {
    for (const child of await runs.listByParentRun(runId)) {
      const card = await childCard(child, runs, messageStore, pending, 0)
      const toolCallId = card.subagent.parentToolCallId
      const target = toolCallId === undefined ? cardsByRun : cardsByToolCall
      const key = toolCallId ?? runId
      target.set(key, [...(target.get(key) ?? []), card])
    }
  }
  if (cardsByRun.size === 0 && cardsByToolCall.size === 0) return messages

  return messages.map((message) => {
    if (message.role !== 'assistant') return message
    const runId = messageRunId(message)
    const routed = runId !== undefined ? cardsByRun.get(runId) : undefined
    const started = message.parts.flatMap((part) =>
      part.type === 'tool-call' ? (cardsByToolCall.get(part.id) ?? []) : [],
    )
    if (!routed && started.length === 0) return message
    // A routed parent message holds only the children's text. The cards
    // replace it.
    const parts = routed
      ? message.parts.filter((part) => part.type !== 'text')
      : message.parts
    return {
      ...message,
      parts: [...(routed ?? []), ...parts, ...started],
    }
  })
}

function parsePageSize(raw: string | null) {
  if (raw == null) return
  const pageSize = Number(raw)
  const isValidPageSize = Number.isInteger(pageSize) && pageSize > 0
  if (!isValidPageSize) return
  return Math.min(pageSize, MAX_PAGE_SIZE)
}

function parseBefore(raw: string | null) {
  if (raw == null || raw === '') return
  return raw
}

function threadMessages(
  loaded: Array<ModelMessage> | MessagePage,
): Array<ModelMessage> {
  return Array.isArray(loaded) ? loaded : loaded.messages
}

function completePage() {
  return { truncated: false as const }
}

function truncatedPage(cursor: string) {
  return { truncated: true as const, cursor }
}

function pageFromCursor(cursor: string | undefined) {
  if (cursor === undefined || cursor === '') {
    return completePage()
  }
  return truncatedPage(cursor)
}

function newestUiWindow(messages: Array<UIMessage>, pageSize: number) {
  const truncated = messages.length > pageSize
  if (!truncated) {
    return { messages, page: completePage() }
  }
  const uiWindow = messages.slice(messages.length - pageSize)
  return {
    messages: uiWindow,
    page: pageFromCursor(uiWindow[0]?.id),
  }
}

function uiBeforeCursor(messages: Array<UIMessage>, cursor: string) {
  const cut = messages.findIndex((message) => message.id === cursor)
  if (cut === -1) return
  return messages.slice(0, cut)
}

function windowFromMessagePage(page: MessagePage, pageSize: number) {
  const ui = modelMessagesToUIMessages(page.messages)
  if (ui.length > pageSize) {
    // Extra slice uses a library-minted cursor. Keeping the adapter cursor
    // after dropping the oldest row would skip that row on the next GET.
    return newestUiWindow(ui, pageSize)
  }
  if (page.truncated) {
    return {
      messages: ui,
      page: pageFromCursor(page.cursor),
    }
  }
  return { messages: ui, page: completePage() }
}

async function windowFromArray(input: {
  stored: Array<ModelMessage>
  messageStore: MessageStore
  threadId: string
  pageSize: number
  before: string | undefined
}) {
  const { stored, messageStore, threadId, pageSize, before } = input
  if (before === undefined) {
    return newestUiWindow(modelMessagesToUIMessages(stored), pageSize)
  }
  // Array adapters own no cursor. Apply `before` to the full transcript so an
  // adapter that ignored the hint cannot return the same newest page forever.
  const full = threadMessages(await messageStore.loadThread(threadId))
  const older = uiBeforeCursor(modelMessagesToUIMessages(full), before)
  if (older === undefined) {
    return { messages: [], page: truncatedPage(before) }
  }
  return newestUiWindow(older, pageSize)
}
