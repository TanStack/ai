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
import { accessOf, sessionOfTurn } from './host'
import { activeRunIn } from './log-stores'
import { MediaError } from './media'
import {
  applyInput,
  capabilitiesOf,
  describeForClient,
  negotiateVersion,
  parseControlFrame,
  parseHarnessInput,
  requestIdOf,
  turnReceipt,
} from './protocol'
import { socketSender, sseStream, withHeartbeat } from './sse'
import { base64url, isRecord } from './utils'
import { SessionMetadataError } from './session-entry'
import { SessionImpl } from './session/harness-session'
import { liveSessionOf, storedRunsOf } from './session/observed-session'
import { wireFrame } from './wire'
import type { ModelMessage, UIMessage, WebSocketLike } from '@tanstack/ai'
import type { SessionIndexEntry, SessionMember } from '@tanstack/ai-persistence'
import type { AnyHarness } from './define'
import type { HarnessHost, HostEvent } from './host'
import type { ControlFrame, HarnessErrorCode, HostFrame } from './protocol'
import type { SseFrame } from './sse'
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
   * How the handler signs media URLs. Without it, the handler signs with a
   * random key of its own, so a signed URL works only on this server, and
   * only until it restarts. Set it when more than one server answers the
   * same URL, so each server verifies the URLs of the others.
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
 * The id of a request, for its error frames and its `X-Request-Id` answer
 * header. The rule: the `X-Request-Id` header of the request when it is a
 * short safe id (1 to 128 letters, digits, `-`, `_`, `.`, or `:`), else a
 * new UUID. So a proxy can trace a request, and a client cannot put other
 * text into the logs.
 */
function requestIdFor(request: Request) {
  const sent = request.headers.get('X-Request-Id')
  return sent !== null && /^[\w.:-]{1,128}$/.test(sent)
    ? sent
    : crypto.randomUUID()
}

/**
 * An SSE response from `sseStream`: pull-based, with a heartbeat and a close
 * for a slow client (see `sse.ts`). `watch` gets the reader: aborting it
 * ends the stream. When the stream ends or the client leaves, the reader
 * aborts.
 */
function sseResponse(
  frames: (signal: AbortSignal) => AsyncIterable<SseFrame>,
  requestId: string,
  watch?: (reader: AbortController) => void,
) {
  // Not `request.signal`: some servers abort it once the body is read.
  const reader = new AbortController()
  watch?.(reader)
  const body = sseStream({
    frames: (signal) => {
      // The watch ends with the stream.
      signal.addEventListener('abort', () => reader.abort(), { once: true })
      return frames(signal)
    },
    requestId,
    signal: reader.signal,
  })
  return new Response(body, { headers: SSE_HEADERS })
}

/** The protocol version that `?v=` asks for. See `negotiateVersion`. */
function versionOf(url: URL) {
  const v = url.searchParams.get('v')
  return negotiateVersion(v === null ? {} : { requested: Number(v) })
}

/**
 * The answer to a stream with a `?v=` that the host does not speak: an SSE
 * stream with one `unsupported_version` error frame. Then it closes.
 */
function versionRefused(
  error: Omit<
    Extract<HostFrame, { type: 'harness.error' }>,
    'type' | 'requestId'
  >,
  requestId: string,
) {
  const frame: HostFrame = { type: 'harness.error', requestId, ...error }
  return new Response(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`), {
    headers: SSE_HEADERS,
  })
}

/**
 * Session events as an AG-UI SSE response. Each event has its cursor as
 * `id`, so a client that loses the connection resumes with `Last-Event-ID`.
 * `watch` gets the reader, as in `sseResponse`. When the client leaves, the
 * read stops.
 */
function cursorResponse(
  read: (signal: AbortSignal) => AsyncIterable<SessionEvent>,
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
    withHeartbeat(
      toServerSentEventsStream(chunks(), reader, (_chunk, index) =>
        cursors.at(index),
      ),
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
 *   retry with the same `runId` runs once. Each event id is its log
 *   cursor, and a retry with `Last-Event-ID` streams from there. The prompt keeps every content
 *   part of the last user message, and its `forwardedProps` are the input's
 *   `context`.
 * - `GET  .../run?threadId=`: the transcript, the running turn, and the
 *   waiting interrupts, as the `ChatHydrationResult` that a `ChatClient` with
 *   `persistence` reads.
 * - `GET  .../run?runId=&threadId=` (or `X-Run-Id`): the chat turn with
 *   that run id, as SSE from its start, so a reloaded `ChatClient` joins it.
 *   Each event id is a cursor, so `Last-Event-ID` resumes it. Any instance
 *   finds the turn in the log of `threadId`. Without `threadId`, only the
 *   instance that runs the turn finds it, and another instance answers 400.
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
 *   (it deletes the thread and its child threads, as
 *   `host.sessions.delete` does), `{ op: 'fork', threadId, before }`
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
 * they open no session, mount no plugins, and write nothing.
 *
 * With host `access`, `access.identify` reads the user of each request
 * (`null` is 401), and the host checks each action: a refused action is 403.
 * A read of a thread with no entry is 404, and it does not start a session.
 * Only `GET run?threadId=` answers such a thread with an empty hydration, as
 * a `ChatClient` reads it before the first message.
 * The streams of a user close when `host.revoke` or `unshare` takes their
 * access. Each chat input runs as the principal of its request.
 *
 * Signed media URLs use `media.secret`. Without it, they work only on this
 * server (see `HarnessHandlerOptions.media`).
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
  if (media !== undefined && media.secret.length === 0) {
    throw new Error(
      'createHarnessHandler needs a media.secret that is not empty.',
    )
  }

  const openFor = (principal: P | undefined, threadId: string) =>
    host.open(harness, { threadId, ...(principal ? { principal } : {}) })

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

  // ponytail: without `media.secret`, a random key per handler, so a signed
  // URL works only on this server, until it restarts.
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
   * feed still has. `threadId` (from the query) names the log of the turn.
   */
  const joinTurn = async (
    request: Request,
    principal: P | undefined,
    runId: string,
  ) => {
    const { searchParams } = new URL(request.url)
    // `offset=-1` is the start. A reconnect sends the last cursor it saw.
    const offset = searchParams.get('offset')
    const resumeFrom =
      request.headers.get('Last-Event-ID') ?? (offset === '-1' ? null : offset)
    const named = searchParams.get('threadId')
    const running = await sessionOfTurn(host, {
      harness,
      tenantId: principal?.tenantId,
      operationId: runId,
    })
    const turn = running?.operation(runId)
    const isNamedThread = named === null || running?.threadId === named
    if (running && turn && isNamedThread) {
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
        closeOnRevoke(principal, threadId),
      )
    }
    // Another instance runs the turn: the log of the thread has its run
    // and its events. Not a child run or an agent run: only a chat turn of
    // the thread.
    if (!named) {
      return json(
        { error: 'threadId is required to join a run of another instance' },
        400,
      )
    }
    const threadId = named
    const view = await viewFor(principal, threadId)
    if (!view) return json({ error: 'unknown run' }, 404)
    const record = (await storedRunsOf(view)).get(runId)
    const isChatTurn =
      record !== undefined &&
      record.threadId === threadId &&
      record.kind !== 'agent' &&
      record.parentRunId === undefined
    if (!isChatTurn) return json({ error: 'unknown run' }, 404)
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

  const handle = async (
    request: Request,
    principal: P | undefined,
    requestId: string,
  ) => {
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
                  ...(lastEventId ? { from: lastEventId } : {}),
                  signal,
                }),
                operationId,
              ),
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
        // The host sends each log cursor as the event id. A client cut off
        // sends the same request with `Last-Event-ID`, maybe to another
        // instance: the run id finds the same turn, and it streams from
        // there.
        const from = lastEventId || '0'
        return cursorResponse(
          (signal) => operation.events({ from, signal }),
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
      return json(await hydration(view))
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
      const picked = versionOf(url)
      if ('error' in picked) return versionRefused(picked.error, requestId)
      const hello: HostFrame = { type: 'harness.hello', v: picked.v, threadId }
      return sseResponse(
        async function* (signal) {
          yield { data: JSON.stringify(hello) }
          const events = view.events({ ...(from ? { from } : {}), signal })
          // Each event goes out as an AG-UI wire chunk.
          for await (const entry of events) {
            yield { id: entry.cursor, data: wireFrame(entry) }
          }
        },
        requestId,
        closeOnRevoke(principal, threadId),
      )
    }

    if (request.method === 'GET' && route === 'host-events') {
      const picked = versionOf(url)
      if ('error' in picked) return versionRefused(picked.error, requestId)
      const mayWatch = watchedEvents(principal)
      // The hello of `host-events` names no thread.
      const hello = JSON.stringify({ type: 'harness.hello', v: picked.v })
      return sseResponse(async function* (signal) {
        yield { data: hello }
        for await (const event of host.events({ signal })) {
          if (await mayWatch(event)) yield { data: JSON.stringify(event) }
        }
      }, requestId)
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

  const answer = async (request: Request, requestId: string) => {
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
      return await handle(request, user.principal, requestId)
    } catch (error) {
      return failed(error)
    }
  }

  return async (request: Request) => {
    const requestId = requestIdFor(request)
    const response = await answer(request, requestId)
    // Every answer names its request, so a client can find it in the logs.
    response.headers.set('X-Request-Id', requestId)
    return response
  }
}

/**
 * What a `ChatClient` with `persistence` reads when it loads a thread (a
 * `ChatHydrationResult`): the transcript, the running chat turn (the client
 * joins it with `GET run?runId=`), and the interrupts that the last turn
 * waits for. The log has the turns that other instances run.
 */
async function hydration(view: ObservedSession) {
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
  const remote = running
    ? undefined
    : activeRunIn(await storedRunsOf(view), view.threadId)
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

/** The close code of a socket after an `unsupported_version` error frame. */
const UNSUPPORTED_VERSION_CLOSE_CODE = 4400

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
 * it closes.
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
  const reader = new AbortController()
  // The id of the upgrade request, with the rule of `requestIdFor`. An error
  // frame of the socket itself, or of a frame with no `requestId`, names it.
  const socketId = requestIdFor(request)
  const sender = socketSender({
    socket,
    requestId: socketId,
    signal: reader.signal,
  })
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
   * Send the events of the thread. The view follows the log while the socket
   * is open. A thread with no index entry has no view yet: then the events
   * of the session that the first input opens come.
   */
  const stream = async (
    view: ObservedSession | undefined,
    from: Cursor | undefined,
  ) => {
    let cursor = from
    // Each event goes out as an AG-UI wire chunk. The send waits while the
    // socket buffer is full, so a slow client stops the read of the log.
    const forward = async (events: AsyncIterable<SessionEvent>) => {
      for await (const entry of events) {
        cursor = entry.cursor
        if (!(await send(wireFrame(entry)))) return
      }
    }
    const readOptions = () => ({
      ...(cursor ? { from: cursor } : {}),
      signal: reader.signal,
    })
    if (view) {
      await forward(view.events(readOptions()))
      return
    }
    if (reader.signal.aborted || holding !== undefined) return
    const session = await firstHeld
    if (!session) return
    await forward(session.events(readOptions()))
  }
  /** Send a frame in order. False when the socket is gone. */
  const send = async (frame: HostFrame | string) => {
    if (await sender(frame)) return true
    reader.abort()
    return false
  }
  const fail = (code: HarnessErrorCode, message: string, requestId: string) =>
    void send({ type: 'harness.error', message, code, requestId })
  /**
   * Send a last error frame and close. It goes out at once, before the
   * frames that wait in the sender: the socket closes next.
   */
  const closeWith = (
    frame: Extract<HostFrame, { type: 'harness.error' }>,
    closeCode: number,
  ) => {
    try {
      socket.send(JSON.stringify(frame))
    } catch {
      // The socket is gone already.
    }
    socket.close(closeCode, frame.code)
    reader.abort()
  }
  const refuse = (message: 'unauthorized' | 'forbidden', requestId: string) =>
    closeWith(
      { type: 'harness.error', message, code: message, requestId },
      message === 'unauthorized' ? 4401 : 4403,
    )

  socket.addEventListener('close', () => reader.abort())
  socket.addEventListener('error', () => reader.abort())
  socket.addEventListener('message', (message) => {
    const data = String(message.data)
    // Read before the full parse, so a frame with a bad `input` still names
    // its request.
    const requestId = requestIdOf(data) ?? socketId
    void (async () => {
      try {
        const user = await who
        if (!user) return refuse('unauthorized', requestId)
        const { principal } = user
        let frame: ControlFrame
        try {
          frame = parseControlFrame(data)
        } catch (error) {
          return fail('invalid_frame', errorMessage(error), requestId)
        }
        if (frame.type === 'harness.subscribe') {
          if (subscribed)
            return fail('invalid_frame', 'Already subscribed.', requestId)
          const picked = negotiateVersion({ requested: frame.v })
          if ('error' in picked) {
            return closeWith(
              { type: 'harness.error', requestId, ...picked.error },
              UNSUPPORTED_VERSION_CLOSE_CODE,
            )
          }
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
          if (!subscription) return refuse('forbidden', requestId)
          watchRevoke(
            host,
            { principal, threadId, signal: reader.signal },
            () => refuse('forbidden', requestId),
          )
          void send({ type: 'harness.hello', v: picked.v, threadId })
          void stream(subscription.view, frame.from)
            // The close waits for this frame: it goes out first.
            .catch((error: unknown) =>
              send({
                type: 'harness.error',
                message: errorMessage(error),
                code: 'internal',
                requestId,
              }),
            )
            // The feed ended while the socket is open: close it, so the
            // client subscribes again.
            .finally(() => {
              if (!reader.signal.aborted) socket.close(1011, 'feed ended')
            })
          return
        }
        const subscription = await subscribed
        if (!subscription)
          return fail(
            'invalid_frame',
            'Send harness.subscribe first.',
            requestId,
          )
        if (frame.type === 'harness.snapshot') {
          // The held session, else the view: a snapshot opens nothing.
          const live = holding?.snapshot()
          const snapshot = live ?? (await subscription.view?.snapshot())
          if (!snapshot) throw new Error('not found')
          void send({ type: 'harness.snapshot', snapshot })
          return
        }
        const session = await hold(subscription.threadId, principal)
        const receipt = await applyInput({
          harness,
          session,
          input: frame.input,
          ...(principal ? { principal } : {}),
          ...(frame.traceparent ? { traceparent: frame.traceparent } : {}),
        })
        void send({
          type: 'harness.receipt',
          requestId: frame.requestId,
          ...receipt,
        })
      } catch (error) {
        const code =
          error instanceof AccessDeniedError ? 'forbidden' : 'internal'
        fail(code, errorMessage(error), requestId)
      }
    })()
  })
}
