import {
  EventType,
  chatParamsFromRequestBody,
  convertMessagesToModelMessages,
  isContentPart,
  modelMessagesToUIMessages,
  readInterruptBinding,
  resolveResumeRunId,
  toServerSentEventsStream,
} from '@tanstack/ai'
import { parseRangeHeader, resolveBlobRange } from '@tanstack/ai-persistence'
import { AccessDeniedError } from './access'
import { accessOf, durableStoresOf, sessionOfTurn } from './host'
import { MediaError } from './media'
import { tenantStores } from './tenant-stores'
import {
  HARNESS_PROTOCOL_VERSION,
  applyInput,
  capabilitiesOf,
  describeForClient,
  parseControlFrame,
  parseHarnessInput,
  turnReceipt,
} from './protocol'
import { base64url, isRecord } from './utils'
import { SessionMetadataError } from './session-entry'
import { SessionImpl } from './session/harness-session'
import { liveSessionOf } from './session/observed-session'
import type {
  ModelMessage,
  RunStore,
  UIMessage,
  WebSocketLike,
} from '@tanstack/ai'
import type { SessionIndexEntry, SessionMember } from '@tanstack/ai-persistence'
import type { AnyHarness } from './define'
import type { HarnessHost, HostEvent } from './host'
import type { HostFrame } from './protocol'
import type { HarnessSession } from './session/index'
import type { ObservedSession } from './session/observed-session'
import type { Cursor, Principal, SessionEvent, UserInput } from './types'

/**
 * Who a handler or a socket serves when its host has no `access`. `true`:
 * each request runs with no principal, in the default tenant (one user).
 * `{ principal }`: each request runs as that principal, for example the one
 * local user of a CLI.
 */
export type OpenAccess<P extends Principal = Principal> =
  | true
  | { principal: P }

export interface HarnessHandlerOptions<P extends Principal = Principal> {
  /**
   * The host. With `access`, `access.identify` reads the user of each
   * request, and the host checks each action.
   */
  host: HarnessHost<P>
  harness: AnyHarness
  /**
   * For a host without `access` only: who the requests run as. Without
   * host access and without this option, the handler throws at the start,
   * so a server never serves every thread to everyone by mistake.
   */
  openAccess?: OpenAccess<P>
  /**
   * How the handler signs media URLs. Required on a durable host
   * (`stores.log`), where another instance can serve the next request.
   * Without a log store, leave it out to sign with a random key per handler,
   * so signed URLs stop working after a restart.
   */
  media?: {
    /**
     * The secret that signs media URLs (HMAC SHA-256). Use the same value on
     * every server behind one URL.
     */
    secret: string
  }
}

/** How long a signed media URL works. */
const SIGNED_URL_TTL_MS = 60 * 60 * 1000

const HMAC = { name: 'HMAC', hash: 'SHA-256' }

// Every media answer: a browser must not guess another type, and a `text/*`
// document must not run as a page of this origin.
const MEDIA_HEADERS = {
  'Accept-Ranges': 'bytes',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
}

const encoder = new TextEncoder()

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const forbidden = () => json({ error: 'forbidden' }, 403)

/**
 * An SSE response: one event per frame, with `data` as JSON and `id` when
 * the frame has one. `watch` gets the reader: aborting it ends the stream.
 * When the client leaves, the reader aborts.
 */
function sseResponse(
  frames: (
    signal: AbortSignal,
  ) => AsyncIterable<{ id?: string; data: unknown }>,
  watch?: (reader: AbortController) => void,
) {
  // Not `request.signal`: some servers abort it once the body is read.
  const reader = new AbortController()
  let isCancelled = false
  const body = new ReadableStream<Uint8Array>({
    cancel: () => {
      isCancelled = true
      reader.abort()
    },
    async start(controller) {
      watch?.(reader)
      try {
        for await (const { id, data } of frames(reader.signal)) {
          const idLine = id === undefined ? '' : `id: ${id}\n`
          controller.enqueue(
            encoder.encode(`${idLine}data: ${JSON.stringify(data)}\n\n`),
          )
        }
      } finally {
        if (!isCancelled) controller.close()
        // The watch ends with the stream.
        reader.abort()
      }
    },
  })
  return new Response(body, { headers: SSE_HEADERS })
}

/**
 * Session events as an AG-UI SSE response. With `withIds`, each event has its
 * cursor as `id`, so a client that loses the connection resumes with
 * `Last-Event-ID`. `watch` gets the reader, as in `sseResponse`. When the
 * client leaves, the read stops.
 */
function cursorResponse(
  read: (signal: AbortSignal) => AsyncIterable<SessionEvent>,
  withIds: boolean,
  watch?: (reader: AbortController) => void,
) {
  // Not `request.signal`: some servers abort it once the body is read.
  const reader = new AbortController()
  watch?.(reader)
  const cursors: Array<string> = []
  async function* chunks() {
    try {
      for await (const entry of read(reader.signal)) {
        cursors.push(entry.cursor)
        yield entry.event
      }
    } finally {
      // The watch ends with the stream.
      reader.abort()
    }
  }
  return new Response(
    toServerSentEventsStream(
      chunks(),
      reader,
      withIds ? (_chunk, index) => cursors.at(index) : undefined,
    ),
    { headers: SSE_HEADERS },
  )
}

/**
 * A handler error as JSON: a refused action is 403, a `MediaError` keeps its
 * status, the rest is 400.
 */
const failed = (error: unknown) => {
  if (error instanceof AccessDeniedError) return forbidden()
  if (error instanceof MediaError) {
    return json({ error: error.message }, error.status)
  }
  return json(
    { error: error instanceof Error ? error.message : String(error) },
    400,
  )
}

/**
 * The content of the last user message of an AG-UI request, as TanStack
 * content parts. Text stays a string. `undefined` when there is none.
 */
function lastUserInput(messages: Array<UIMessage | ModelMessage>) {
  const message = messages.findLast((entry) => entry.role === 'user')
  if (!message) return undefined
  const [converted] = convertMessagesToModelMessages([message])
  const content = converted?.content ?? ''
  // The converter passes media parts through unchecked, so drop what is not
  // a valid content part (for example an AG-UI `binary` part).
  const input: UserInput = Array.isArray(content)
    ? content.filter(isContentPart)
    : content
  return input
}

const isRole = (value: unknown): value is SessionMember['role'] =>
  value === 'owner' || value === 'member' || value === 'viewer'

/** A `POST sessions` body, or `undefined` when it is not a valid one. */
function parseSessionOp(body: unknown) {
  if (!isRecord(body)) return undefined
  const { op, threadId, title, before, through, pinned, metadata } = body
  const { userId, role } = body
  if (typeof threadId !== 'string') return undefined
  switch (op) {
    case 'rename':
      return typeof title === 'string'
        ? { op: 'rename' as const, threadId, title }
        : undefined
    case 'update':
      if (title !== undefined && typeof title !== 'string') return undefined
      if (pinned !== undefined && typeof pinned !== 'boolean') return undefined
      if (
        metadata !== undefined &&
        (!isRecord(metadata) || Array.isArray(metadata))
      )
        return undefined
      return {
        op: 'update' as const,
        threadId,
        change: {
          ...(title !== undefined ? { title } : {}),
          ...(pinned !== undefined ? { pinned } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
        },
      }
    case 'delete':
      return { op: 'delete' as const, threadId }
    case 'fork':
      // Exactly one of `before` and `through`.
      if (typeof before === 'string' && through === undefined)
        return { op: 'fork' as const, threadId, at: { before } }
      if (typeof through === 'string' && before === undefined)
        return { op: 'fork' as const, threadId, at: { through } }
      return undefined
    case 'share':
      return typeof userId === 'string' && isRole(role)
        ? { op: 'share' as const, threadId, userId, role }
        : undefined
    case 'unshare':
      return typeof userId === 'string'
        ? { op: 'unshare' as const, threadId, userId }
        : undefined
    default:
      return undefined
  }
}

/** Base64url to bytes, or `undefined` for a value that is not base64url. */
function fromBase64url(value: string) {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return undefined
  }
}

/**
 * The bytes of a media file as a response, with `Range` support: 206 for a
 * slice, 416 for a range outside the file, and 404 for an id this thread
 * does not have.
 */
async function mediaResponse(
  request: Request,
  view: ObservedSession,
  id: string,
) {
  const record = await view.getMedia(id)
  if (!record) return json({ error: 'not found' }, 404)
  const range = parseRangeHeader(request.headers.get('Range'), record.size)
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...MEDIA_HEADERS, 'Content-Range': `bytes */${record.size}` },
    })
  }
  const bytes = await view.loadMedia({ id, range })
  const headers = {
    ...MEDIA_HEADERS,
    'Content-Type': record.mimeType,
    'Content-Length': String(bytes.byteLength),
  }
  if (!range) return new Response(bytes, { headers })
  const { offset, length } = resolveBlobRange(record.size, range)
  return new Response(bytes, {
    status: 206,
    headers: {
      ...headers,
      'Content-Range': `bytes ${offset}-${offset + length - 1}/${record.size}`,
    },
  })
}

/**
 * Who sends each request of a handler or a socket: the host's
 * `access.identify`, else the `openAccess` principal. Throws for a host
 * without access and without `openAccess`, and for a host with access and
 * `openAccess`. Resolves to `null` for a request that `identify` refuses.
 */
function requestUsers<P extends Principal>(
  call: string,
  host: HarnessHost<P>,
  openAccess: OpenAccess<P> | undefined,
) {
  const access = accessOf(host)
  if (access && openAccess !== undefined) {
    throw new Error(
      `${call}: the host has access, so access.identify reads the user of each request. Remove openAccess.`,
    )
  }
  if (!access && openAccess === undefined) {
    throw new Error(
      `${call} needs host access ({ identify, authorize }) or openAccess: true`,
    )
  }
  const fixed = openAccess === true ? undefined : openAccess?.principal
  return async (request: Request) => {
    if (!access) return { principal: fixed }
    const principal = await access.identify({ request })
    return principal === null ? null : { principal }
  }
}

/**
 * The view of `host.observe` for a read of the thread `threadId`, or
 * `undefined` for a thread with no index entry on a host with access: the
 * host refuses such a thread as it refuses a stranger, and a read of it is
 * not found. Throws `AccessDeniedError` for a stranger.
 */
async function observeToRead<P extends Principal>(
  host: HarnessHost<P>,
  harness: AnyHarness,
  { threadId, principal }: { threadId: string; principal: P | undefined },
) {
  const user = principal ? { principal } : {}
  try {
    return await host.observe(harness, { threadId, ...user })
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error
    // `sessions.get` refuses a stranger too, and has no entry to give for a
    // thread that does not exist. Only the refused path reads it.
    const entry = await host.sessions.get({ threadId, ...user })
    if (entry === undefined) return undefined
    throw error
  }
}

/** `event` is the revoke of `principal` on the thread `threadId`. */
const isRevokeOf = (
  event: HostEvent,
  principal: Principal | undefined,
  threadId: string,
) =>
  event.type === 'revoked' &&
  principal !== undefined &&
  event.principalId === principal.id &&
  event.tenantId === principal.tenantId &&
  event.threadId === threadId

/**
 * Call `onRevoke` when `host.revoke` (or `unshare`) takes the access of
 * `principal` to the thread. The watch ends when `signal` aborts.
 */
function watchRevoke<P extends Principal>(
  host: HarnessHost<P>,
  {
    principal,
    threadId,
    signal,
  }: { principal: P | undefined; threadId: string; signal: AbortSignal },
  onRevoke: () => void,
) {
  if (principal === undefined) return
  void (async () => {
    for await (const event of host.events({ signal })) {
      if (!isRevokeOf(event, principal, threadId)) continue
      onRevoke()
      return
    }
  })()
}

/**
 * A fetch handler for a harness. Mount it on a route that ends with any of
 * these paths:
 *
 * - `GET  .../capabilities`: the AG-UI capabilities document.
 * - `POST .../run`: standard AG-UI. One request is one prompt (or one
 *   `resume`), streamed as SSE. The turn runs as the request's `runId`, and a
 *   retry with the same `runId` runs once. On a durable host, each event id
 *   is its log cursor, and a retry with `Last-Event-ID` streams from there. The prompt keeps every content
 *   part of the last user message, and its `forwardedProps` are the input's
 *   `context`.
 * - `GET  .../run?threadId=`: the transcript, the running turn, and the
 *   waiting interrupts, as the `ChatHydrationResult` that a `ChatClient` with
 *   `persistence` reads.
 * - `GET  .../run?runId=` (or `X-Run-Id`): the chat turn with that run id, as
 *   SSE from its start, so a reloaded `ChatClient` joins it. Each event id is
 *   a cursor, so `Last-Event-ID` resumes it. On a durable host (`stores.log`
 *   and `stores.runs`), any instance finds the turn in the shared log.
 *   Without a log, 404 for a turn this host does not run.
 * - `GET  .../events?threadId=&from=`: the session stream as SSE. Each event id
 *   is a cursor, so `Last-Event-ID` resumes it.
 * - `POST .../control`: `{ threadId, input }`. Returns the receipt.
 * - `GET  .../snapshot?threadId=`: the session snapshot.
 * - `GET  .../transcript?threadId=`: the saved messages of the thread.
 * - `GET  .../agent-transcript?threadId=&subagentRunId=`: the saved messages
 *   of a child agent run of the thread. Empty for an unknown id or a child
 *   of another thread. 400 without `subagentRunId`.
 * - `GET  .../describe?threadId=`: the commands, settings, and tools. Only
 *   the commands in `expose.commands` and the config keys in `expose.config`.
 * - `POST .../media?threadId=&name=`: store the raw body as a media file of
 *   the thread, with `Content-Type` as its type. Returns the `MediaRecord`.
 *   413 when it is over `media.maxBytes`, 415 for a type the harness does not
 *   take.
 * - `GET  .../media-url?threadId=&id=`: `{ path, expiresAt }`, a signed path
 *   to the file, relative to the handler. It works for 1 hour, and only for
 *   the user that it was signed for: each request checks that user again.
 * - `GET  .../media?threadId=&id=[&exp=&sig=]`: the bytes, with `Range`
 *   support. A signed request needs no login, and a bad or expired
 *   signature is 403.
 * - `GET  .../sessions?limit=&cursor=&parentThreadId=`: one page of the
 *   session index, newest first: the sessions that `host.sessions.list`
 *   gives this principal. Default: top-level sessions only.
 * - `POST .../sessions`: change a session. The body is
 *   `{ op: 'rename', threadId, title }`, `{ op: 'update', threadId, title?,
 *   pinned?, metadata? }` (each field replaces the stored one, and the
 *   harness `metadataSchema` checks `metadata`. Without a schema, a client
 *   cannot write `metadata`: 403 `not_exposed`), `{ op: 'delete', threadId }`
 *   (it removes the index entry only), `{ op: 'fork', threadId, before }`
 *   or `{ op: 'fork', threadId, through }` with a message id, and with
 *   `membersOnly()`, `{ op: 'share', threadId, userId, role }` and
 *   `{ op: 'unshare', threadId, userId }`. Rename, update, fork, share, and
 *   unshare answer with the entry, delete with 204. 400
 *   (`invalid_metadata`, with `issues`) for metadata the schema refuses, 404
 *   for a thread with no entry, and 409 (`other_harness`) for an update or a
 *   fork of a thread that another harness runs.
 * - `GET  .../host-events`: the `host.events()` that this principal may
 *   read, as SSE: status changes, session index changes, and the revokes of
 *   this principal. First the current status of each open session.
 *
 * The `GET` routes of a thread, except `describe`, read with `host.observe`:
 * they open no session, mount no plugins, and write nothing. On a host with
 * no log, `GET events` of a thread whose session is not open on this
 * instance ends at once, and the client connects again.
 *
 * With host `access`, `access.identify` reads the user of each request
 * (`null` is 401), and the host checks each action: a refused action is 403.
 * A read of a thread with no entry is 404, and it does not start a session.
 * Only `GET run?threadId=` answers such a thread with an empty hydration, as
 * a `ChatClient` reads it before the first message.
 * The streams of a user close when `host.revoke` or `unshare` takes their
 * access. Each chat input runs as the principal of its request.
 *
 * Throws at the start for a host without `access` and without
 * `openAccess`, and for a host with both.
 *
 * @example
 * ```ts
 * const handler = createHarnessHandler({ host, harness: assistant })
 * ```
 */
export function createHarnessHandler<P extends Principal = Principal>(
  options: HarnessHandlerOptions<P>,
) {
  const { host, harness, media } = options
  const usersOf = requestUsers('createHarnessHandler', host, options.openAccess)
  const hasAccess = accessOf(host) !== undefined
  const durable = durableStoresOf(host)
  if (media === undefined && durable) {
    throw new Error(
      'createHarnessHandler needs media.secret on a durable host (stores.log): another instance must verify the media URLs this one signs. Set the same secret on every instance.',
    )
  }

  const openFor = (principal: P | undefined, threadId: string) =>
    host.open(harness, { threadId, ...(principal ? { principal } : {}) })

  /** The run store of a durable host, in the tenant of `principal`. */
  const runsOf = (principal: P | undefined) =>
    durable?.runs &&
    tenantStores({ runs: durable.runs }, principal?.tenantId).runs

  /** The view of a thread for a read route. See `observeToRead`. */
  const viewFor = (principal: P | undefined, threadId: string) =>
    observeToRead(host, harness, { threadId, principal })

  /**
   * Open a thread for `describe`, which needs its plugins. With access, a
   * thread with no entry is not found, so a read never starts a session:
   * `undefined`.
   */
  const openToRead = async (principal: P | undefined, threadId: string) => {
    const isMissing =
      hasAccess &&
      (await host.sessions.get({
        threadId,
        ...(principal ? { principal } : {}),
      })) === undefined
    return isMissing ? undefined : openFor(principal, threadId)
  }

  /** The stream watch that ends a stream of `principal` on its revoke. */
  const closeOnRevoke =
    (principal: P | undefined, threadId: string) => (reader: AbortController) =>
      watchRevoke(host, { principal, threadId, signal: reader.signal }, () =>
        reader.abort(),
      )

  /**
   * The answer of a route that opened `session`, and the release of that
   * handle when the answer is done. A stream answer calls `keep` for its
   * watch: the handle is released when the stream ends or the client leaves.
   */
  const withSession = async (
    session: HarnessSession,
    answer: (
      keep: (
        watch: (reader: AbortController) => void,
      ) => (reader: AbortController) => void,
    ) => Promise<Response> | Response,
  ) => {
    let isKept = false
    const keep =
      (watch: (reader: AbortController) => void) =>
      (reader: AbortController) => {
        isKept = true
        // Both stream helpers abort the reader when the stream ends.
        reader.signal.addEventListener('abort', () => void session.close(), {
          once: true,
        })
        watch(reader)
      }
    try {
      return await answer(keep)
    } finally {
      if (!isKept) void session.close()
    }
  }

  // ponytail: without `media.secret` (only allowed without a log store), a
  // random key per handler, so signed URLs stop working after a restart.
  const secret =
    media === undefined
      ? crypto.getRandomValues(new Uint8Array(32))
      : encoder.encode(media.secret)
  let key: Promise<CryptoKey> | undefined
  const mediaKey = () =>
    (key ??= crypto.subtle.importKey('raw', secret, HMAC, false, [
      'sign',
      'verify',
    ]))
  /** What a signed media URL holds: who may read which file, until when. */
  interface SignedMedia {
    tenantId: string
    threadId: string
    id: string
    userId: string
    exp: string
  }
  const signed = (media: SignedMedia) =>
    encoder.encode(
      [
        harness.name,
        media.tenantId,
        media.threadId,
        media.id,
        media.userId,
        media.exp,
      ].join('\n'),
    )
  const sign = async (media: SignedMedia) => {
    const signature = await crypto.subtle.sign(
      'HMAC',
      await mediaKey(),
      signed(media),
    )
    return base64url(new Uint8Array(signature))
  }

  /**
   * Serve a signed media URL. The URL names its user: the read is checked as
   * that user, so a user who lost access (unshare, revoke) is refused.
   */
  const serveSigned = async (request: Request, url: URL) => {
    const param = (name: string) => url.searchParams.get(name) ?? ''
    const payload: SignedMedia = {
      tenantId: param('tenantId'),
      threadId: param('threadId'),
      id: param('id'),
      userId: param('userId'),
      exp: param('exp'),
    }
    const signature = fromBase64url(param('sig'))
    const isValid =
      signature !== undefined &&
      Number(payload.exp) > Date.now() &&
      // `verify` compares in constant time.
      (await crypto.subtle.verify(
        'HMAC',
        await mediaKey(),
        signature,
        signed(payload),
      ))
    if (!isValid) return forbidden()
    const { tenantId, userId } = payload
    // A signed URL keeps the id and the tenant of its user, as the log does,
    // and `authorize` gets those. The other fields of the principal are not
    // in the URL.
    const user = userId
      ? ({ id: userId, ...(tenantId ? { tenantId } : {}) } as P)
      : undefined
    const view = await viewFor(user, payload.threadId)
    if (!view) return json({ error: 'not found' }, 404)
    return mediaResponse(request, view, payload.id)
  }

  /**
   * Stream the chat turn `runId` from its start: the `joinRun` of a
   * ChatClient after a reload. Each event has its cursor as `id`, so
   * `Last-Event-ID` resumes after it. A turn that ended gives the events the
   * feed still has.
   */
  const joinTurn = async (
    request: Request,
    principal: P | undefined,
    runId: string,
  ) => {
    // `offset=-1` is the start. A reconnect sends the last cursor it saw.
    const offset = new URL(request.url).searchParams.get('offset')
    const resumeFrom =
      request.headers.get('Last-Event-ID') ?? (offset === '-1' ? null : offset)
    const running = await sessionOfTurn(host, {
      harness,
      tenantId: principal?.tenantId,
      operationId: runId,
    })
    const turn = running?.operation(runId)
    if (running && turn) {
      const { threadId } = running
      // The view checks the read. The turn keeps its session busy, so the
      // session does not close on idle while the turn streams.
      const view = await viewFor(principal, threadId)
      if (!view) return json({ error: 'unknown run' }, 404)
      const startedCursor = running
        .snapshot()
        .activeOperations.find((item) => item.id === runId)?.startedCursor
      const from = resumeFrom ?? startedCursor ?? '0'
      return cursorResponse(
        (signal) => turn.events({ from, signal }),
        true,
        closeOnRevoke(principal, threadId),
      )
    }
    // Another instance runs the turn. A durable host finds its thread in the
    // run store, and its events in the shared log. Not a child run or an
    // agent run: only a chat turn of a thread.
    const record = await runsOf(principal)?.get(runId)
    const isChatTurn =
      record != null &&
      record.kind !== 'agent' &&
      record.parentRunId === undefined
    if (!record || !isChatTurn) return json({ error: 'unknown run' }, 404)
    const { threadId } = record
    const view = await viewFor(principal, threadId)
    if (!view) return json({ error: 'unknown run' }, 404)
    const entry = await view.entry()
    if (entry?.harness !== undefined && entry.harness !== harness.name) {
      return json({ error: 'unknown run' }, 404)
    }
    // ponytail: from the start of the log without a cursor. Store the
    // started position on the run record if long threads make this slow.
    return cursorResponse(
      (signal) =>
        followOperation(
          view.events({ from: resumeFrom ?? '0', signal }),
          runId,
        ),
      true,
      closeOnRevoke(principal, threadId),
    )
  }

  /**
   * The `host.events()` that `principal` may read. With access, a thread
   * needs the `read` action. The decision of each thread is kept for the
   * stream, until a revoke or an index change of that thread.
   */
  const watchedEvents = (principal: P | undefined) => {
    const user = principal ? { principal } : {}
    const decisions = new Map<string, Promise<boolean>>()
    const mayRead = (threadId: string) => {
      const known = decisions.get(threadId)
      if (known) return known
      const decision = host.sessions.get({ threadId, ...user }).then(
        (entry) => entry !== undefined,
        () => false,
      )
      decisions.set(threadId, decision)
      return decision
    }
    return async (event: HostEvent) => {
      const tenantId =
        event.type === 'session' || event.type === 'session-deleted'
          ? event.entry.tenantId
          : event.tenantId
      if (tenantId !== principal?.tenantId) return false
      if (event.type === 'revoked') {
        decisions.delete(event.threadId)
        // A user hears of their own revokes only.
        return event.principalId === principal?.id
      }
      if (!hasAccess) return true
      if (event.type === 'session') decisions.delete(event.threadId)
      if (event.type === 'session-deleted') {
        decisions.delete(event.threadId)
        // The entry is gone: decide on the removed one.
        const access = accessOf(host)
        return principal !== undefined && access !== undefined
          ? access.authorize({
              principal,
              action: 'read',
              session: event.entry,
            })
          : false
      }
      return mayRead(event.threadId)
    }
  }

  const handle = async (request: Request, principal: P | undefined) => {
    const url = new URL(request.url)
    const route = url.pathname.split('/').at(-1)
    const user = principal ? { principal } : {}

    if (request.method === 'GET' && route === 'capabilities') {
      return json(capabilitiesOf(harness))
    }

    if (request.method === 'POST' && route === 'run') {
      const params = await chatParamsFromRequestBody(await request.json())
      const message = lastUserInput(params.messages)
      const session = await openFor(principal, params.threadId)
      // The turn runs as the request's run id, so an AG-UI client matches
      // its events and interrupts. The run id is the input id too, so a
      // retried request runs once. It runs as this request's principal.
      const ids = { inputId: params.runId, runId: params.runId, ...user }
      const lastEventId = request.headers.get('Last-Event-ID')
      const watch = closeOnRevoke(principal, params.threadId)
      return withSession(session, async (keep) => {
        if (params.resume && params.resume.length > 0) {
          const answers = { resume: params.resume, ...ids }
          // Only the session class takes the run id. `host.open` gives one.
          const receipt = await (session instanceof SessionImpl
            ? session.resolveForRun(answers)
            : session.resolve(answers))
          if (receipt.status === 'rejected') {
            return json({ error: receipt.reason }, 409)
          }
          if (!receipt.operationId) return json({ error: 'rejected' }, 409)
          const { operationId } = receipt
          return cursorResponse(
            (signal) =>
              followOperation(
                session.events({
                  ...(durable && lastEventId ? { from: lastEventId } : {}),
                  signal,
                }),
                operationId,
              ),
            durable !== undefined,
            keep(watch),
          )
        }
        if (message === undefined) {
          return json({ error: 'no user message' }, 400)
        }
        // AG-UI `forwardedProps` are the input's context.
        const { forwardedProps } = params
        const operation = session.send(message, {
          ...ids,
          ...(Object.keys(forwardedProps).length > 0
            ? { context: forwardedProps }
            : {}),
        })
        // A turn that the host refused throws, and the answer is 403.
        const receipt = await turnReceipt(operation)
        if (receipt.status === 'rejected') {
          return json({ error: receipt.reason ?? 'rejected' }, 409)
        }
        // A durable host sends each log cursor as the event id. A client cut
        // off sends the same request with `Last-Event-ID`, maybe to another
        // instance: the run id finds the same turn, and it streams from
        // there. Without a log a cursor means nothing on another instance,
        // so no id.
        const from = (durable && lastEventId) || '0'
        return cursorResponse(
          (signal) => operation.events({ from, signal }),
          durable !== undefined,
          keep(watch),
        )
      })
    }

    if (request.method === 'GET' && route === 'run') {
      // The `joinRun` of a ChatClient after a reload names the run only.
      const runId = resolveResumeRunId(request)
      if (runId) return await joinTurn(request, principal, runId)
      const threadId = url.searchParams.get('threadId')
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      const view = await viewFor(principal, threadId)
      // A ChatClient hydrates a new thread before its first message, and a
      // non-OK answer is an error there. A new thread has nothing to load.
      if (!view) {
        return json({ messages: [], activeRun: null, interrupts: null })
      }
      return json(await hydration(view, runsOf(principal)))
    }

    if (request.method === 'GET' && route === 'events') {
      const threadId = url.searchParams.get('threadId')
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      const view = await viewFor(principal, threadId)
      if (!view) return json({ error: 'not found' }, 404)
      const from =
        request.headers.get('Last-Event-ID') ??
        url.searchParams.get('from') ??
        undefined
      // On a host with no log, a thread whose session is not open here has
      // nothing to stream: the stream ends, and the client connects again.
      return sseResponse(
        async function* (signal) {
          const events = view.events({ ...(from ? { from } : {}), signal })
          for await (const entry of events) {
            const frame: HostFrame = { type: 'harness.event', ...entry }
            yield { id: entry.cursor, data: frame }
          }
        },
        closeOnRevoke(principal, threadId),
      )
    }

    if (request.method === 'GET' && route === 'host-events') {
      const mayWatch = watchedEvents(principal)
      return sseResponse(async function* (signal) {
        for await (const event of host.events({ signal })) {
          if (await mayWatch(event)) yield { data: event }
        }
      })
    }

    if (request.method === 'POST' && route === 'control') {
      const body: unknown = await request.json()
      if (typeof body !== 'object' || body === null || !('threadId' in body)) {
        return json({ error: 'threadId is required' }, 400)
      }
      const threadId = body.threadId
      if (typeof threadId !== 'string')
        return json({ error: 'threadId is required' }, 400)
      const input = parseHarnessInput('input' in body ? body.input : undefined)
      const session = await openFor(principal, threadId)
      return withSession(session, async () =>
        json(await applyInput({ harness, session, input, ...user })),
      )
    }

    if (request.method === 'GET' && route === 'transcript') {
      const threadId = url.searchParams.get('threadId')
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      const view = await viewFor(principal, threadId)
      if (!view) return json({ error: 'not found' }, 404)
      return json(await view.transcript())
    }

    // The only read that opens the session: it needs the plugins.
    if (request.method === 'GET' && route === 'describe') {
      const threadId = url.searchParams.get('threadId')
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      const session = await openToRead(principal, threadId)
      if (!session) return json({ error: 'not found' }, 404)
      return withSession(session, () =>
        json(describeForClient(harness, session)),
      )
    }

    if (request.method === 'GET' && route === 'agent-transcript') {
      const threadId = url.searchParams.get('threadId')
      const subagentRunId = url.searchParams.get('subagentRunId')
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      if (!subagentRunId)
        return json({ error: 'subagentRunId is required' }, 400)
      const view = await viewFor(principal, threadId)
      if (!view) return json({ error: 'not found' }, 404)
      return json(await view.agentTranscript(subagentRunId))
    }

    if (request.method === 'GET' && route === 'snapshot') {
      const threadId = url.searchParams.get('threadId')
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      const view = await viewFor(principal, threadId)
      if (!view) return json({ error: 'not found' }, 404)
      return json(await view.snapshot())
    }

    if (request.method === 'GET' && route === 'sessions') {
      const limit = url.searchParams.get('limit')
      const cursor = url.searchParams.get('cursor')
      const parentThreadId = url.searchParams.get('parentThreadId')
      const isBadLimit =
        limit !== null &&
        !(Number.isInteger(Number(limit)) && Number(limit) > 0)
      if (isBadLimit)
        return json({ error: 'limit must be a positive integer' }, 400)
      const search = url.searchParams.get('search')
      // `metadata.<key>=<value>` asks for that exact metadata value.
      const metadata = Object.fromEntries(
        [...url.searchParams]
          .filter(([name]) => name.startsWith('metadata.'))
          .map(([name, value]) => [name.slice('metadata.'.length), value]),
      )
      // The host lists the entries of this harness in the tenant of this
      // principal, and only the ones that it may list.
      return json(
        await host.sessions.list({
          ...user,
          harness: harness.name,
          metadata,
          ...(limit ? { limit: Number(limit) } : {}),
          ...(cursor ? { cursor } : {}),
          ...(parentThreadId ? { parentThreadId } : {}),
          ...(search ? { search } : {}),
        }),
      )
    }

    if (request.method === 'POST' && route === 'sessions') {
      const op = parseSessionOp(await request.json())
      if (!op) return json({ error: 'not a valid sessions op' }, 400)
      const target = { threadId: op.threadId, ...user }
      const entry = await host.sessions.get(target)
      if (!entry) return json({ error: 'not found' }, 404)
      /** A changed entry, or 404 when the entry went away meanwhile. */
      const answer = (changed: SessionIndexEntry | undefined) =>
        changed ? json(changed) : json({ error: 'not found' }, 404)
      // The host can run more harnesses than this handler serves.
      const isOtherHarness =
        entry.harness !== undefined && entry.harness !== harness.name
      switch (op.op) {
        case 'rename':
          return answer(
            await host.sessions.rename({ ...target, title: op.title }),
          )
        case 'update': {
          if (isOtherHarness) return json({ error: 'other_harness' }, 409)
          // The schema is the contract for what a client may write. Without
          // one, metadata stays a server field.
          if (op.change.metadata !== undefined && !harness.metadataSchema)
            return json({ error: 'not_exposed' }, 403)
          try {
            return answer(
              await host.sessions.update({
                ...target,
                harness,
                update: op.change,
              }),
            )
          } catch (error) {
            if (error instanceof SessionMetadataError)
              return json(
                { error: 'invalid_metadata', issues: error.issues },
                400,
              )
            throw error
          }
        }
        case 'delete':
          await host.sessions.delete(target)
          return new Response(null, { status: 204 })
        case 'fork':
          if (isOtherHarness) return json({ error: 'other_harness' }, 409)
          return json(
            await host.sessions.fork({ ...target, harness, at: op.at }),
          )
        case 'share':
          return answer(
            await host.sessions.share({
              ...target,
              userId: op.userId,
              role: op.role,
            }),
          )
        case 'unshare':
          return answer(
            await host.sessions.unshare({ ...target, userId: op.userId }),
          )
      }
    }

    if (request.method === 'POST' && route === 'media') {
      const threadId = url.searchParams.get('threadId')
      const name = url.searchParams.get('name')
      if (!threadId || !name)
        return json({ error: 'threadId and name are required' }, 400)
      const session = await openFor(principal, threadId)
      return withSession(session, async () =>
        json(
          await session.putMedia({
            body: request.body ?? new Uint8Array(),
            mimeType: request.headers.get('Content-Type') ?? '',
            name,
          }),
        ),
      )
    }

    if (
      request.method === 'GET' &&
      (route === 'media' || route === 'media-url')
    ) {
      const threadId = url.searchParams.get('threadId')
      const id = url.searchParams.get('id')
      if (!threadId || !id)
        return json({ error: 'threadId and id are required' }, 400)
      const view = await viewFor(principal, threadId)
      if (!view) return json({ error: 'not found' }, 404)
      if (route === 'media') return mediaResponse(request, view, id)
      if (!(await view.getMedia(id))) {
        return json({ error: 'not found' }, 404)
      }
      const expiresAt = Date.now() + SIGNED_URL_TTL_MS
      const payload: SignedMedia = {
        tenantId: principal?.tenantId ?? '',
        threadId,
        id,
        userId: principal?.id ?? '',
        exp: String(expiresAt),
      }
      // An empty field stays out of the URL. The served URL reads it as ''.
      const fields = Object.entries(payload).filter(([, value]) => value !== '')
      const query = new URLSearchParams([
        ...fields,
        ['sig', await sign(payload)],
      ])
      return json({ path: `media?${query}`, expiresAt })
    }
    return json({ error: 'not found' }, 404)
  }

  return async (request: Request) => {
    const url = new URL(request.url)
    const isSignedMedia =
      request.method === 'GET' &&
      url.pathname.split('/').at(-1) === 'media' &&
      url.searchParams.has('sig')
    try {
      // Before `identify`: a signed URL is its own login.
      if (isSignedMedia) return await serveSigned(request, url)
      const user = await usersOf(request)
      if (!user) return json({ error: 'unauthorized' }, 401)
      return await handle(request, user.principal)
    } catch (error) {
      return failed(error)
    }
  }
}

/**
 * What a `ChatClient` with `persistence` reads when it loads a thread (a
 * `ChatHydrationResult`): the transcript, the running chat turn (the client
 * joins it with `GET run?runId=`), and the interrupts that the last turn
 * waits for. On a durable host, `runs` finds a turn that another instance
 * runs.
 */
async function hydration(view: ObservedSession, runs?: RunStore) {
  const { pendingInterrupts, activeOperations } = await view.snapshot()
  const [first] = pendingInterrupts
  const runId = first
    ? readInterruptBinding(first)?.interruptedRunId
    : undefined
  // Only a session that is open here runs operations.
  const session = liveSessionOf(view)
  const running = activeOperations.find(
    (item) =>
      item.kind === 'chat' &&
      session?.operation(item.id)?.status() === 'running',
  )
  const remote = running ? undefined : await runs?.findActiveRun(view.threadId)
  const runningId =
    running?.id ?? (remote?.kind !== 'agent' ? remote?.runId : undefined)
  return {
    messages: modelMessagesToUIMessages(await view.transcript()),
    activeRun: runningId ? { runId: runningId } : null,
    interrupts: runId ? { runId, pending: pendingInterrupts } : null,
  }
}

/** Session events of one operation, until it finishes. */
async function* followOperation(
  events: AsyncIterable<SessionEvent>,
  operationId: string,
) {
  for await (const entry of events) {
    if (entry.operationId !== operationId) continue
    yield entry
    if (
      entry.event.type === EventType.CUSTOM &&
      entry.event.name === 'harness.operation.finished'
    ) {
      return
    }
  }
}

export interface HarnessSocketOptions<P extends Principal = Principal> {
  host: HarnessHost<P>
  harness: AnyHarness
  socket: WebSocketLike
  /**
   * The upgrade request. With host `access`, `access.identify` reads the
   * user from it.
   */
  request: Request
  /** For a host without `access` only. See `HarnessHandlerOptions`. */
  openAccess?: OpenAccess<P>
}

/** The text of an error frame: a refused action is `forbidden`. */
const errorMessage = (error: unknown) =>
  error instanceof AccessDeniedError
    ? 'forbidden'
    : error instanceof Error
      ? error.message
      : String(error)

/**
 * Serve the session tier over one WebSocket. The first frame must be
 * `harness.subscribe`. The user comes from the upgrade `request`, with the
 * same rules as `createHarnessHandler`: a user that `identify` refuses gets
 * an `unauthorized` error frame and the socket closes. The host checks each
 * input. When `host.revoke` or `unshare` takes the access of the user, the
 * socket sends a `forbidden` error frame and closes.
 *
 * The subscribe and the snapshots read with `host.observe`, so they open no
 * session. The first input opens the session, and the socket holds it until
 * it closes. On a host with no log, a thread whose session is not open has
 * no events: the stream starts when the first input opens the session.
 *
 * Throws at the start for a host without `access` and without `openAccess`,
 * and for a host with both.
 *
 * @example
 * ```ts
 * handleHarnessSocket({ host, harness: assistant, socket, request })
 * ```
 */
export function handleHarnessSocket<P extends Principal = Principal>(
  options: HarnessSocketOptions<P>,
) {
  const { host, harness, socket, request } = options
  const usersOf = requestUsers('handleHarnessSocket', host, options.openAccess)
  const isDurable = durableStoresOf(host) !== undefined
  const reader = new AbortController()
  const who = usersOf(request).catch(() => null)
  // Set by the first subscribe, before its awaits, so a second subscribe is
  // refused and an input sent right after the subscribe waits for it. It
  // resolves to `undefined` when the host refused the thread. The view is
  // `undefined` for a thread with no index entry yet: its first input
  // makes it.
  let subscribed:
    | Promise<
        { threadId: string; view: ObservedSession | undefined } | undefined
      >
    | undefined
  /** The session that the first input opens. The socket holds it. */
  let held: Promise<HarnessSession> | undefined
  /** `held`, once it opened. */
  let holding: HarnessSession | undefined
  let onHeld: (session: HarnessSession | undefined) => void = () => {}
  const firstHeld = new Promise<HarnessSession | undefined>((resolve) => {
    onHeld = resolve
  })
  reader.signal.addEventListener('abort', () => onHeld(undefined), {
    once: true,
  })
  /** The held session, opened by the first input that needs it. */
  const hold = (threadId: string, principal: P | undefined) => {
    if (held) return held
    const opening = host
      .open(harness, { threadId, ...(principal ? { principal } : {}) })
      .then((session) => {
        // The socket holds the handle until it closes.
        const release = () => void session.close()
        if (reader.signal.aborted) release()
        else reader.signal.addEventListener('abort', release, { once: true })
        holding = session
        onHeld(session)
        return session
      })
    held = opening
    // A failed open holds nothing, so the next input opens again.
    opening.catch(() => {
      if (held === opening) held = undefined
    })
    return opening
  }
  /**
   * Send the events of the thread: the view first. A durable view follows
   * the log while the socket is open. On a host with no log, the view reads
   * the open session, and it ends when no session is open. Then the events
   * of the session that the first input opens come next. That session has a
   * new feed: its cursors start again. A view of the held session ends with
   * that session.
   */
  const stream = async (
    view: ObservedSession | undefined,
    from: Cursor | undefined,
  ) => {
    let cursor = from
    const forward = async (events: AsyncIterable<SessionEvent>) => {
      for await (const entry of events) {
        cursor = entry.cursor
        send({ type: 'harness.event', ...entry })
      }
    }
    const readOptions = () => ({
      ...(cursor ? { from: cursor } : {}),
      signal: reader.signal,
    })
    if (view) await forward(view.events(readOptions()))
    const isDone =
      reader.signal.aborted ||
      holding !== undefined ||
      (view !== undefined && isDurable)
    if (isDone) return
    const session = await firstHeld
    if (!session) return
    if (!isDurable) cursor = undefined
    await forward(session.events(readOptions()))
  }
  const send = (frame: HostFrame) => {
    try {
      socket.send(JSON.stringify(frame))
    } catch {
      reader.abort()
    }
  }
  const refuse = (message: 'unauthorized' | 'forbidden') => {
    send({ type: 'harness.error', message })
    socket.close(message === 'unauthorized' ? 4401 : 4403, message)
    reader.abort()
  }

  socket.addEventListener('close', () => reader.abort())
  socket.addEventListener('error', () => reader.abort())
  socket.addEventListener('message', (message) => {
    void (async () => {
      try {
        const user = await who
        if (!user) return refuse('unauthorized')
        const { principal } = user
        const frame = parseControlFrame(String(message.data))
        if (frame.type === 'harness.subscribe') {
          if (subscribed) throw new Error('Already subscribed.')
          const { threadId } = frame
          subscribed = observeToRead(host, harness, {
            threadId,
            principal,
          }).then(
            (view) => ({ threadId, view }),
            (error: unknown) => {
              if (!(error instanceof AccessDeniedError)) throw error
              return undefined
            },
          )
          const subscription = await subscribed
          if (!subscription) return refuse('forbidden')
          watchRevoke(
            host,
            { principal, threadId, signal: reader.signal },
            () => refuse('forbidden'),
          )
          send({
            type: 'harness.hello',
            v: HARNESS_PROTOCOL_VERSION,
            threadId: frame.threadId,
          })
          void stream(subscription.view, frame.from)
            .catch((error: unknown) =>
              send({ type: 'harness.error', message: errorMessage(error) }),
            )
            // The feed ended while the socket is open: close it, so the
            // client subscribes again.
            .finally(() => {
              if (!reader.signal.aborted) socket.close(1011, 'feed ended')
            })
          return
        }
        const subscription = await subscribed
        if (!subscription) throw new Error('Send harness.subscribe first.')
        if (frame.type === 'harness.snapshot') {
          // The held session, else the view: a snapshot opens nothing.
          const live = holding?.snapshot()
          const snapshot = live ?? (await subscription.view?.snapshot())
          if (!snapshot) throw new Error('not found')
          send({ type: 'harness.snapshot', snapshot })
          return
        }
        const session = await hold(subscription.threadId, principal)
        const receipt = await applyInput({
          harness,
          session,
          input: frame.input,
          ...(principal ? { principal } : {}),
        })
        send({
          type: 'harness.receipt',
          requestId: frame.requestId,
          ...receipt,
        })
      } catch (error) {
        send({ type: 'harness.error', message: errorMessage(error) })
      }
    })()
  })
}
