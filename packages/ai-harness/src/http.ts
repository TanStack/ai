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
import {
  accessOf,
  isSharedHost,
  loggerOf,
  presenceOf,
  sessionOfTurn,
  tenantEventsOf,
} from './host'
import { tenantOfHostEvent } from './host-event-bus'
import { activeRunIn } from './log-stores'
import { MediaError } from './media'
import { maxBodyBytesOf, readBodyText, storeInlineMedia } from './inline-media'
import { createMediaSigner } from './media-signing'
import {
  applyInput,
  capabilitiesOf,
  describeForClient,
  HARNESS_PROTOCOL_VERSION,
  versionError,
  parseControlFrame,
  parseHarnessInput,
  requestIdOf,
  retriedMessage,
  turnReceipt,
} from './protocol'
import { socketSender, sseStream, streamValues, withHeartbeat } from './sse'
import { base64url, isRecord } from './utils'
import { SessionMetadataError } from './session-entry'
import { SessionImpl, scrubbedBy } from './session/harness-session'
import {
  liveSessionOf,
  mediaStoreOf,
  storedRunOf,
  storedRunsOf,
} from './session/observed-session'
import { wireFrame } from './wire'
import type { ModelMessage, UIMessage, WebSocketLike } from '@tanstack/ai'
import type { SessionIndexEntry, SessionMember } from '@tanstack/ai-persistence'
import type { AnyHarness } from './define'
import type { HarnessHost, HostEvent, PresenceEndReason } from './host'
import type { InlineMediaRefusal } from './inline-media'
import type { MediaSignerOptions } from './media-signing'
import type { ControlFrame, HarnessErrorCode, HostFrame } from './protocol'
import type { HarnessStreamOptions, SseFrame, StreamValues } from './sse'
import type { HarnessSession } from './session/index'
import type { ObservedSession } from './session/observed-session'
import type { Cursor, HarnessUser, SessionEvent, UserInput } from './types'

/**
 * Who a handler or a socket serves when its host has no `access`. Only for
 * a host without `access`: a host with `access` reads the user of each
 * request with `getUser`, so leave `openAccess` out there.
 *
 * - `true`: each request runs with no user, in the default tenant.
 * - `{ user }`: each request runs as that one user, for example the local
 *   user of a CLI.
 */
export type OpenAccess<U extends HarnessUser = HarnessUser> = true | { user: U }

export interface HarnessHandlerOptions<U extends HarnessUser = HarnessUser> {
  /**
   * The host. With `access`, `access.getUser` reads the user of each
   * request, and the host checks each action.
   */
  host: HarnessHost<U>
  harness: AnyHarness
  /**
   * For a host without `access` only: who the requests run as. Without
   * host access and without this option, the handler throws at the start,
   * so a server never serves every thread to everyone by mistake.
   */
  openAccess?: OpenAccess<U>
  /**
   * How the handler signs media URLs (HMAC SHA-256). Without it, the handler
   * signs with a random key of its own, so a signed URL works only on this
   * server, and only until it restarts. Set it when more than one server
   * answers the same URL, so each server verifies the URLs of the others.
   * On a host with `ownership` options it is required, else the handler
   * throws at the start. Without it on another host, the first handler
   * warns once.
   *
   * - `{ secret }`: one key. Use the same value on every server.
   * - `{ keys }`: to rotate keys. The first key signs, and every key
   *   verifies, so a URL that an old key signed works until it expires.
   *
   * Each key must be at least 32 bytes (UTF-8). A shorter key throws at the
   * start.
   */
  media?: MediaSignerOptions
  /**
   * Set `true` when the app also serves `handleHarnessSocket`, so the
   * capabilities say that clients can use a WebSocket. Default `false`.
   */
  socket?: boolean
  /**
   * The values of the SSE streams: the heartbeat, the slow-client close, and
   * the queue size. A value that you do not set keeps its default. See
   * `HarnessStreamOptions`.
   */
  stream?: HarnessStreamOptions
}

/** How long a signed media URL works. */
const SIGNED_URL_TTL_MS = 60 * 60 * 1000

/** The most bytes one answer to an open-ended `Range` (`bytes=N-`) sends. */
const OPEN_RANGE_MAX_BYTES = 8 * 1024 * 1024

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
 * aborts. `onSlow` runs before the close for a slow client.
 */
function sseResponse(
  frames: (signal: AbortSignal) => AsyncIterable<SseFrame>,
  requestId: string,
  stream: StreamValues,
  watch?: (reader: AbortController) => void,
  onSlow?: () => void,
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
    stream,
    ...(onSlow ? { onSlow } : {}),
  })
  return new Response(body, { headers: SSE_HEADERS })
}

/** The error of a `?v=` that asks for another version. See `versionError`. */
function versionOf(url: URL) {
  const v = url.searchParams.get('v')
  return versionError(v === null ? undefined : Number(v))
}

/**
 * The answer to a stream with a `?v=` that the host does not speak: an SSE
 * stream with one `unsupported_version` error frame. Then it closes.
 */
function versionRefused(
  error: NonNullable<ReturnType<typeof versionError>>,
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
  stream: StreamValues,
  watch?: (reader: AbortController) => void,
) {
  // Not `request.signal`: some servers abort it once the body is read.
  const reader = new AbortController()
  watch?.(reader)
  // The stream encodes each event right after it pulls it, before the next
  // pull, so the cursor of the last event is the only one it needs.
  let cursor: string | undefined
  async function* chunks() {
    try {
      for await (const entry of read(reader.signal)) {
        cursor = entry.cursor
        yield entry.event
      }
    } finally {
      // The watch ends with the stream.
      reader.abort()
    }
  }
  return new Response(
    withHeartbeat(
      toServerSentEventsStream(chunks(), reader, () => cursor),
      { heartbeatMs: stream.heartbeatMs },
    ),
    { headers: SSE_HEADERS },
  )
}

/**
 * The status of a content part that `storeInlineMedia` refused: 413 for too
 * many bytes, 415 for a kind the harness does not take, else 400.
 */
const REFUSAL_STATUS: Record<InlineMediaRefusal, number> = {
  media_too_large: 413,
  media_not_allowed: 415,
  media_invalid: 400,
  media_url_not_allowed: 400,
}

/** True when `text` is more than `limit` bytes as UTF-8. */
function isOverLimit(text: string, limit: number) {
  // A UTF-16 code unit is 1 to 3 bytes, so only some texts need encoding.
  if (text.length > limit) return true
  if (text.length * 3 <= limit) return false
  return encoder.encode(text).byteLength > limit
}

/**
 * A handler error as JSON: a refused action is 403, a `MediaError` keeps its
 * status (413 for a body over `media.maxBodyBytes`), the rest is 400.
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
  value === 'owner' ||
  value === 'member' ||
  value === 'viewer' ||
  value === 'operator'

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
  const record = await view.getMedia({ id })
  if (!record) return json({ error: 'not found' }, 404)
  const asked = parseRangeHeader(request.headers.get('Range'), record.size)
  if (asked === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...MEDIA_HEADERS, 'Content-Range': `bytes */${record.size}` },
    })
  }
  // A range with no end (`bytes=N-`) gets at most OPEN_RANGE_MAX_BYTES. A
  // 206 may send less than was asked: the client asks again for the rest.
  const range =
    asked && asked.length === undefined
      ? {
          offset: asked.offset,
          length: Math.min(OPEN_RANGE_MAX_BYTES, record.size - asked.offset),
        }
      : asked
  const length = range
    ? resolveBlobRange(record.size, range).length
    : record.size
  // A stream, so a big file is not held in memory.
  const body =
    (await mediaStoreOf(view)?.open(id, range)) ??
    (await view.loadMedia({ id, range }))
  const headers = {
    ...MEDIA_HEADERS,
    'Content-Type': record.mimeType,
    'Content-Length': String(length),
  }
  if (!range) return new Response(body, { headers })
  const { offset } = range
  return new Response(body, {
    status: 206,
    headers: {
      ...headers,
      'Content-Range': `bytes ${offset}-${offset + length - 1}/${record.size}`,
    },
  })
}

/**
 * Who sends each request of a server of `host`: the host's
 * `access.getUser`, else the `openAccess` user. The HTTP handler, the
 * socket, and `createHarnessMcpServer` share it, so the rule stays one rule.
 * Throws for a host without access and without `openAccess`, and for a host
 * with access and `openAccess`. `of` resolves to `null` for a request that
 * `getUser` refuses. `fixed` is the user of a host without access.
 *
 * @param call - The name of the caller, for the errors.
 */
export function requestUsers<U extends HarnessUser>(
  call: string,
  host: HarnessHost<U>,
  openAccess: OpenAccess<U> | undefined,
) {
  if (host.hasAccess && openAccess !== undefined) {
    throw new Error(
      `${call}: the host has access, so access.getUser reads the user of each request. Remove openAccess.`,
    )
  }
  if (!host.hasAccess && openAccess === undefined) {
    throw new Error(
      `${call} needs host access ({ getUser, rules }) or openAccess: true or { user }.`,
    )
  }
  const fixed = openAccess === true ? undefined : openAccess?.user
  const of = async (
    request: Request,
  ): Promise<{ user: U | undefined } | null> => {
    if (!host.hasAccess) return { user: fixed }
    const user = await host.getUserOfRequest({ request })
    return user === null ? null : { user }
  }
  return { fixed, of }
}

/**
 * The view of `host.observe` for a read of the thread `threadId`, or
 * `undefined` for a thread with no index entry on a host with access: the
 * host refuses such a thread as it refuses a stranger, and a read of it is
 * not found. Throws `AccessDeniedError` for a stranger.
 */
async function observeToRead<U extends HarnessUser>(
  host: HarnessHost<U>,
  harness: AnyHarness,
  { threadId, user }: { threadId: string; user: U | undefined },
) {
  const asUser = user ? { user } : {}
  try {
    return await host.observe(harness, { threadId, ...asUser })
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error
    // `sessions.get` refuses a stranger too, and has no entry to give for a
    // thread that does not exist. Only the refused path reads it.
    const entry = await host.sessions.get({ threadId, ...asUser })
    if (entry === undefined) return undefined
    throw error
  }
}

/** `event` is the revoke of `user` on the thread `threadId`. */
const isRevokeOf = (
  event: HostEvent,
  user: HarnessUser | undefined,
  threadId: string,
) =>
  event.type === 'revoked' &&
  user !== undefined &&
  event.userId === user.id &&
  event.tenantId === user.tenantId &&
  event.threadId === threadId

/**
 * Call `onRevoke` when `host.revoke` (or `unshare`) takes the access of
 * `user` to the thread. The watch ends when `signal` aborts.
 */
function watchRevoke<U extends HarnessUser>(
  host: HarnessHost<U>,
  {
    user,
    threadId,
    signal,
  }: { user: U | undefined; threadId: string; signal: AbortSignal },
  onRevoke: () => void,
) {
  if (user === undefined) return
  const isRevoke = (event: HostEvent) => isRevokeOf(event, user, threadId)
  // Only the revokes of this user, from the bus of its tenant: the
  // filter runs before the queue, so other events cost this watch nothing,
  // and the first revoke ends the watch, so its queue does not fill.
  // A host that `createHarnessHost` did not make has `host.events()`.
  const readTenant = tenantEventsOf(host)
  const events = readTenant
    ? readTenant({ tenantId: user.tenantId, filter: isRevoke, signal })
    : host.events({ signal })
  void (async () => {
    for await (const event of events) {
      if (!isRevoke(event)) continue
      onRevoke()
      return
    }
  })()
}

/** A handler without `media` warned already. One warning per process. */
let warnedMediaKey = false

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
 * - `GET  .../agent-transcript?threadId=&subagentRunId=` (or `&runId=`): the
 *   saved messages of a child agent run of the thread. Empty for an unknown
 *   id or a child of another thread. 400 without `subagentRunId` or `runId`.
 * - `GET  .../describe?threadId=`: the commands, settings, and tools. Only
 *   the commands in `expose.commands` and the config keys in `expose.config`.
 * - `POST .../media?threadId=&name=`: store the raw body as a media file of
 *   the thread, with `Content-Type` as its type. Returns the `MediaRecord`.
 *   413 when it is over `media.maxBytes`, 415 for a type the harness does not
 *   take.
 * - `GET  .../media-url?threadId=&id=`: `{ path, expiresAt }`, a signed path
 *   to the file, relative to the handler. It works for 1 hour.
 * - `GET  .../media?threadId=&id=[&tenantId=&exp=&sig=]`: the bytes, with
 *   `Range` support. A bad or expired signature is 403. A signed request
 *   still needs a user from `getUser`, or a guest from `access.getGuestUser`
 *   (401 without one), and it needs the `read` action on the thread, in
 *   the tenant of the URL.
 * - `GET  .../sessions?limit=&cursor=&parentThreadId=`: one page of the
 *   session index, newest first: the sessions that `host.sessions.list`
 *   gives this user. Default: top-level sessions only.
 * - `POST .../sessions`: change a session. The body is
 *   `{ op: 'rename', threadId, title }`, `{ op: 'update', threadId, title?,
 *   pinned?, metadata? }` (each field replaces the stored one, and the
 *   harness `metadataSchema` checks `metadata`. Without a schema, a client
 *   cannot write `metadata`: 403 `not_exposed`), `{ op: 'delete', threadId }`
 *   (it deletes the thread and its child threads, as
 *   `host.sessions.delete` does), `{ op: 'fork', threadId, before }`
 *   or `{ op: 'fork', threadId, through }` with a message id, and with
 *   `access.rules.members`, `{ op: 'share', threadId, userId, role }` and
 *   `{ op: 'unshare', threadId, userId }`. Rename, update, fork, share, and
 *   unshare answer with the entry, delete with 204. 400
 *   (`invalid_metadata`, with `issues`) for metadata the schema refuses, 404
 *   for a thread with no entry, and 409 (`other_harness`) for an update or a
 *   fork of a thread that another harness runs.
 * - `GET  .../host-events`: the `host.events()` that this user may
 *   read, as SSE: status changes, session index changes, and the revokes of
 *   this user. First the current status of each open session.
 *
 * The `GET` routes of a thread, except `describe`, read with `host.observe`:
 * they open no session, mount no plugins, and write nothing.
 *
 * With host `access`, `access.getUser` reads the user of each request
 * (`null` is 401), and the host checks each action: a refused action is 403.
 * A read of a thread with no entry is 404, and it does not start a session.
 * Only `GET run?threadId=` answers such a thread with an empty hydration, as
 * a `ChatClient` reads it before the first message.
 * The streams of a user close when `host.revoke` or `unshare` takes their
 * access. Each chat input runs as the user of its request.
 *
 * Signed media URLs use the keys of `media`. Without it, they work only on
 * this server (see `HarnessHandlerOptions.media`), so it is required on a
 * host with `ownership` options. A URL of a deleted file is 404.
 *
 * A request body over `media.maxBodyBytes` (default 32 MiB) is 413. Inline
 * media of `POST run` goes to the media store, as in `POST control`. A
 * refused part is 413 (`media_too_large`), 415 (`media_not_allowed`), or
 * 400 (`media_invalid`, `media_url_not_allowed`), with the reason as
 * `error`.
 *
 * `stream` sets the values of the SSE streams (see `HarnessStreamOptions`).
 *
 * Throws at the start for a host without `access` and without
 * `openAccess`, for a host with both, for a `stream` value that is not a
 * finite number above 0, and without `media` on a host with `ownership`
 * options.
 *
 * @example
 * ```ts
 * const handler = createHarnessHandler({ host, harness: assistant })
 * ```
 */
export function createHarnessHandler<U extends HarnessUser = HarnessUser>(
  options: HarnessHandlerOptions<U>,
) {
  const { host, harness, media } = options
  const usersOf = requestUsers(
    'createHarnessHandler',
    host,
    options.openAccess,
  ).of
  const { hasAccess } = host
  const stream = streamValues('createHarnessHandler', options.stream)
  if (media === undefined && isSharedHost(host)) {
    throw new Error(
      'createHarnessHandler needs media ({ secret } or { keys }) on a host with ownership options: another instance must verify the media URLs that this one signs. Set the same keys on every instance.',
    )
  }
  // ponytail: the handler cannot tell a log store that many instances
  // share, so a host without ownership gets one warning, not an error.
  if (media === undefined && !warnedMediaKey) {
    warnedMediaKey = true
    loggerOf(host).warn(
      '[@tanstack/ai-harness] createHarnessHandler has no media ({ secret } or { keys }), so it signs media URLs with a random key of its own. When more than one instance serves this host, set the same media.secret on every instance, else a media URL works only on the instance that signed it.',
    )
  }

  const openFor = (user: U | undefined, threadId: string) =>
    host.open(harness, { threadId, ...(user ? { user } : {}) })

  /**
   * `openFor` for `POST run`, which passes its run id. Only the session class
   * takes it, and `host.open` gives a handle of that class.
   */
  const openForRun = async (user: U | undefined, threadId: string) => {
    const session = await openFor(user, threadId)
    if (session instanceof SessionImpl) return session
    throw new Error(
      'The host gave a session of another copy of @tanstack/ai-harness. Install one copy of the package.',
    )
  }

  /** The view of a thread for a read route. See `observeToRead`. */
  const viewFor = (user: U | undefined, threadId: string) =>
    observeToRead(host, harness, { threadId, user })

  /**
   * Open a thread for `describe`, which needs its plugins. With access, a
   * thread with no entry is not found, so a read never starts a session:
   * `undefined`.
   */
  const openToRead = async (user: U | undefined, threadId: string) => {
    const isMissing =
      hasAccess &&
      (await host.sessions.get({
        threadId,
        ...(user ? { user } : {}),
      })) === undefined
    return isMissing ? undefined : openFor(user, threadId)
  }

  /** The stream watch that ends a stream of `user` on its revoke. */
  const closeOnRevoke =
    (user: U | undefined, threadId: string) => (reader: AbortController) =>
      watchRevoke(host, { user, threadId, signal: reader.signal }, () =>
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
    } catch (error) {
      // The answer is a frame that leaves the session: no secret of it.
      throw scrubbedBy(session, error)
    } finally {
      if (!isKept) void session.close()
    }
  }

  // ponytail: without `media`, a random key per handler, so a signed URL
  // works only on this server, until it restarts.
  const signer = createMediaSigner(
    media ?? { secret: base64url(crypto.getRandomValues(new Uint8Array(32))) },
  )
  /**
   * A request body as JSON, read up to `media.maxBodyBytes`. A bigger body is
   * a `MediaError` with 413.
   */
  const readJson = async (request: Request): Promise<unknown> =>
    JSON.parse(await readBodyText(request, harness.media))
  /** What a signed media URL holds: which file of which tenant, until when. */
  interface SignedMedia {
    tenantId: string
    threadId: string
    id: string
    exp: string
  }
  // The harness name is in the signed text, so a URL works only for this
  // harness.
  const signed = (media: SignedMedia) =>
    [harness.name, media.tenantId, media.threadId, media.id, media.exp].join(
      '\n',
    )
  const sign = (media: SignedMedia) => signer.sign(signed(media))

  /**
   * Serve a signed media URL. The signature proves only that this handler
   * made the URL. `getUser` reads the user of the request, as on the other
   * routes, else `access.getGuestUser` gives a guest. The read is checked as
   * that user, so a user who lost access (unshare, revoke) is refused.
   * A user of another tenant is refused too.
   */
  const serveSigned = async (request: Request, url: URL) => {
    const param = (name: string) => url.searchParams.get(name) ?? ''
    const payload: SignedMedia = {
      tenantId: param('tenantId'),
      threadId: param('threadId'),
      id: param('id'),
      exp: param('exp'),
    }
    const isValid =
      Number(payload.exp) > Date.now() &&
      // `verify` compares in constant time.
      (await signer.verify(signed(payload), param('sig')))
    if (!isValid) return forbidden()
    const caller = await usersOf(request)
    // Only here, after the signature: a guest reaches no other route.
    const guest = caller
      ? null
      : await accessOf(host)?.getGuestUser?.({
          tenantId: payload.tenantId === '' ? undefined : payload.tenantId,
        })
    if (!caller && !guest) return json({ error: 'unauthorized' }, 401)
    const user = caller ? caller.user : (guest ?? undefined)
    if ((user?.tenantId ?? '') !== payload.tenantId) return forbidden()
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
    user: U | undefined,
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
      tenantId: user?.tenantId,
      operationId: runId,
    })
    const turn = running?.operation(runId)
    const isNamedThread = named === null || running?.threadId === named
    if (running && turn && isNamedThread) {
      const { threadId } = running
      // The view checks the read. The turn keeps its session busy, so the
      // session does not close on idle while the turn streams.
      const view = await viewFor(user, threadId)
      if (!view) return json({ error: 'unknown run' }, 404)
      const startedCursor = running
        .snapshot()
        .activeOperations.find((item) => item.id === runId)?.startedCursor
      const from = resumeFrom ?? startedCursor ?? '0'
      return cursorResponse(
        (signal) => turn.events({ from, signal }),
        stream,
        closeOnRevoke(user, threadId),
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
    const view = await viewFor(user, threadId)
    if (!view) return json({ error: 'unknown run' }, 404)
    const { record, start } = await storedRunOf(view, runId)
    const isChatTurn =
      record !== undefined &&
      record.threadId === threadId &&
      record.kind !== 'agent' &&
      record.parentRunId === undefined
    if (!isChatTurn) return json({ error: 'unknown run' }, 404)
    const entry = await view.indexEntry()
    if (entry?.harness !== undefined && entry.harness !== harness.name) {
      return json({ error: 'unknown run' }, 404)
    }
    // Without a cursor, from the start of the run: its first input record.
    return cursorResponse(
      (signal) =>
        followOperation(
          view.events({ from: resumeFrom ?? start ?? '0', signal }),
          runId,
        ),
      stream,
      closeOnRevoke(user, threadId),
    )
  }

  /**
   * The `host.events()` that `user` may read. With access, a thread
   * needs the `read` action. The decision of each thread is kept for the
   * stream, until a revoke or a delete of that thread. A revoke of this
   * user drops every kept decision: the child threads of the revoked
   * thread are read through it. An index change of the thread drops only a
   * decision that is not `true` (for example after a share), so the index
   * changes of each turn read no store. `accepts` reads no store, so the
   * host event bus runs it before the queue. `mayWatch` runs after the
   * queue.
   */
  const watchedEvents = (user: U | undefined) => {
    const asUser = user ? { user } : {}
    const decisions = new Map<string, Promise<boolean>>()
    /** The threads whose kept decision is `true`. */
    const readable = new Set<string>()
    const forget = (threadId: string) => {
      decisions.delete(threadId)
      readable.delete(threadId)
    }
    const mayRead = (threadId: string) => {
      const known = decisions.get(threadId)
      if (known) return known
      const decision: Promise<boolean> = host.sessions
        .get({ threadId, ...asUser })
        .then(
          (entry) => {
            // A revoke while the read ran dropped this decision.
            const isKept = decisions.get(threadId) === decision
            if (entry !== undefined && isKept) readable.add(threadId)
            return entry !== undefined
          },
          () => false,
        )
      decisions.set(threadId, decision)
      return decision
    }
    const accepts = (event: HostEvent) => {
      if (tenantOfHostEvent(event) !== user?.tenantId) return false
      if (event.type === 'revoked') {
        // A user hears of their own revokes only.
        const isOwn = event.userId === user?.id
        // ponytail: all of them, not only the children of the thread.
        if (isOwn) {
          decisions.clear()
          readable.clear()
        } else {
          forget(event.threadId)
        }
        return isOwn
      }
      if (event.type === 'session-deleted') forget(event.threadId)
      // A user who may read the thread keeps that until a revoke.
      if (event.type === 'session' && !readable.has(event.threadId)) {
        forget(event.threadId)
      }
      return true
    }
    const mayWatch = async (event: HostEvent) => {
      if (!hasAccess || event.type === 'revoked') return true
      // A transfer names two threads: the user must read both.
      if (event.type === 'transferred') {
        const reads = await Promise.all([
          mayRead(event.from.threadId),
          mayRead(event.to.threadId),
        ])
        return reads.every(Boolean)
      }
      if (event.type === 'session-deleted') {
        // A child is read through its root, which the parent still reaches:
        // the purge removes the children first.
        const parent = event.entry.parentThreadId
        if (parent !== undefined) return mayRead(parent)
        // The entry of a root is gone: decide on the removed one.
        const access = accessOf(host)
        return user !== undefined && access !== undefined
          ? access.rules.isAllowed({
              user,
              action: 'read',
              session: event.entry,
            })
          : false
      }
      return mayRead(event.threadId)
    }
    return { accepts, mayWatch }
  }

  const handle = async (
    request: Request,
    user: U | undefined,
    requestId: string,
  ) => {
    const url = new URL(request.url)
    const route = url.pathname.split('/').at(-1)
    const asUser = user ? { user } : {}

    if (request.method === 'GET' && route === 'capabilities') {
      return json(capabilitiesOf(harness, { socket: options.socket === true }))
    }

    if (request.method === 'POST' && route === 'run') {
      const params = await chatParamsFromRequestBody(await readJson(request))
      const message = lastUserInput(params.messages)
      const session = await openForRun(user, params.threadId)
      // The turn runs as the request's run id, so an AG-UI client matches
      // its events and interrupts. The run id is the input id too, so a
      // retried request runs once. It runs as this request's user.
      const ids = { inputId: params.runId, runId: params.runId, ...asUser }
      const lastEventId = request.headers.get('Last-Event-ID')
      const watch = closeOnRevoke(user, params.threadId)
      return withSession(session, async (keep) => {
        if (params.resume && params.resume.length > 0) {
          const answers = { resume: params.resume, ...ids }
          const receipt = await session.resolveForRun(answers)
          if (receipt.status === 'rejected') {
            return json({ error: receipt.reason }, 409)
          }
          if (!receipt.operationId) return json({ error: 'rejected' }, 409)
          const { operationId } = receipt
          // Without a cursor, from the start of the resumed run, not from
          // the start of the log.
          const from =
            lastEventId ??
            session
              .snapshot()
              .activeOperations.find((item) => item.id === operationId)
              ?.startedCursor
          return cursorResponse(
            (signal) =>
              followOperation(
                session.events({ ...(from ? { from } : {}), signal }),
                operationId,
              ),
            stream,
            keep(watch),
          )
        }
        if (message === undefined) {
          return json({ error: 'no user message' }, 400)
        }
        // Inline bytes go to the media store, and the message keeps a
        // `harness-media:` reference, as `POST control` does. A retried run
        // stores no media again.
        const retry = retriedMessage(session, params.runId, message)
        const checked =
          retry !== undefined
            ? { parts: retry }
            : Array.isArray(message)
              ? await storeInlineMedia(message, {
                  options: harness.media,
                  putMedia: (upload) => session.putMedia(upload),
                })
              : { parts: message }
        if ('refused' in checked) {
          return json(
            { error: checked.refused },
            REFUSAL_STATUS[checked.refused],
          )
        }
        // AG-UI `forwardedProps` are the input's context.
        const { forwardedProps } = params
        // The span of the turn links the `traceparent` of the caller.
        const traceparent = request.headers.get('traceparent')
        const sent = {
          ...ids,
          ...(Object.keys(forwardedProps).length > 0
            ? { context: forwardedProps }
            : {}),
          ...(traceparent ? { traceparent } : {}),
        }
        const operation = session.sendForRun(checked.parts, sent)
        // A turn that the host refused throws, and the answer is 403.
        const receipt = await turnReceipt(operation)
        if (receipt.status === 'rejected') {
          return json({ error: receipt.reason ?? 'rejected' }, 409)
        }
        // The host sends each log cursor as the event id. A client cut off
        // sends the same request with `Last-Event-ID`, maybe to another
        // instance: the run id finds the same turn, and it streams from
        // there.
        // Without it, the operation reads from its own start.
        return cursorResponse(
          (signal) =>
            operation.events({
              ...(lastEventId ? { from: lastEventId } : {}),
              signal,
            }),
          stream,
          keep(watch),
        )
      })
    }

    if (request.method === 'GET' && route === 'run') {
      // The `joinRun` of a ChatClient after a reload names the run only.
      const runId = resolveResumeRunId(request)
      if (runId) return await joinTurn(request, user, runId)
      const threadId = url.searchParams.get('threadId')
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      const view = await viewFor(user, threadId)
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
      const view = await viewFor(user, threadId)
      if (!view) return json({ error: 'not found' }, 404)
      const from =
        request.headers.get('Last-Event-ID') ??
        url.searchParams.get('from') ??
        undefined
      const refused = versionOf(url)
      if (refused) return versionRefused(refused, requestId)
      const hello: HostFrame = {
        type: 'harness.hello',
        v: HARNESS_PROTOCOL_VERSION,
        threadId,
      }
      let isRevoked = false
      // A slow client is an error too.
      let isFailed = false
      return sseResponse(
        async function* (signal) {
          const left = presenceOf(host)?.connect({
            ...connectionOf(user, threadId, harness),
            transport: 'sse',
            resumed: from !== undefined,
          })
          try {
            yield { data: JSON.stringify(hello) }
            const events = view.events({ ...(from ? { from } : {}), signal })
            // Each event goes out as an AG-UI wire chunk.
            for await (const entry of events) {
              yield { id: entry.cursor, data: wireFrame(entry) }
            }
          } catch (error) {
            // The view ends its read on a revoke too.
            if (error instanceof AccessDeniedError) isRevoked = true
            else isFailed = true
            throw error
          } finally {
            left?.(isRevoked ? 'revoked' : isFailed ? 'error' : 'closed')
          }
        },
        requestId,
        stream,
        (reader) =>
          watchRevoke(host, { user, threadId, signal: reader.signal }, () => {
            isRevoked = true
            reader.abort()
          }),
        () => {
          isFailed = true
        },
      )
    }

    if (request.method === 'GET' && route === 'host-events') {
      const refused = versionOf(url)
      if (refused) return versionRefused(refused, requestId)
      const { accepts, mayWatch } = watchedEvents(user)
      // The events of the user's tenant only, from the host event bus.
      // A host that `createHarnessHost` did not make has `host.events()`.
      const readTenant = tenantEventsOf(host)
      // The hello of `host-events` names no thread.
      const hello = JSON.stringify({
        type: 'harness.hello',
        v: HARNESS_PROTOCOL_VERSION,
      })
      return sseResponse(
        async function* (signal) {
          yield { data: hello }
          const events = readTenant
            ? readTenant({
                tenantId: user?.tenantId,
                filter: accepts,
                signal,
              })
            : host.events({ signal })
          for await (const event of events) {
            if (!readTenant && !accepts(event)) continue
            if (await mayWatch(event)) yield { data: JSON.stringify(event) }
          }
        },
        requestId,
        stream,
      )
    }

    if (request.method === 'POST' && route === 'control') {
      const body = await readJson(request)
      if (typeof body !== 'object' || body === null || !('threadId' in body)) {
        return json({ error: 'threadId is required' }, 400)
      }
      const threadId = body.threadId
      if (typeof threadId !== 'string')
        return json({ error: 'threadId is required' }, 400)
      const input = parseHarnessInput('input' in body ? body.input : undefined)
      const session = await openFor(user, threadId)
      const traceparent = request.headers.get('traceparent')
      const traced = traceparent ? { traceparent } : {}
      return withSession(session, async () =>
        json(
          await applyInput({ harness, session, input, ...asUser, ...traced }),
        ),
      )
    }

    if (request.method === 'GET' && route === 'transcript') {
      const threadId = url.searchParams.get('threadId')
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      const view = await viewFor(user, threadId)
      if (!view) return json({ error: 'not found' }, 404)
      return json(await view.transcript())
    }

    // The only read that opens the session: it needs the plugins.
    if (request.method === 'GET' && route === 'describe') {
      const threadId = url.searchParams.get('threadId')
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      const session = await openToRead(user, threadId)
      if (!session) return json({ error: 'not found' }, 404)
      return withSession(session, () =>
        json(describeForClient(harness, session)),
      )
    }

    if (request.method === 'GET' && route === 'agent-transcript') {
      const threadId = url.searchParams.get('threadId')
      const subagentRunId = url.searchParams.get('subagentRunId')
      const runId = url.searchParams.get('runId')
      const run = subagentRunId
        ? { subagentRunId }
        : runId
          ? { runId }
          : undefined
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      if (!run)
        return json({ error: 'subagentRunId or runId is required' }, 400)
      const view = await viewFor(user, threadId)
      if (!view) return json({ error: 'not found' }, 404)
      return json(await view.agentTranscript(run))
    }

    if (request.method === 'GET' && route === 'snapshot') {
      const threadId = url.searchParams.get('threadId')
      if (!threadId) return json({ error: 'threadId is required' }, 400)
      const view = await viewFor(user, threadId)
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
      // user, and only the ones that it may list.
      return json(
        await host.sessions.list({
          ...asUser,
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
      const op = parseSessionOp(await readJson(request))
      if (!op) return json({ error: 'not a valid sessions op' }, 400)
      const target = { threadId: op.threadId, ...asUser }
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
      const session = await openFor(user, threadId)
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
      const view = await viewFor(user, threadId)
      if (!view) return json({ error: 'not found' }, 404)
      if (route === 'media') return mediaResponse(request, view, id)
      if (!(await view.getMedia({ id }))) {
        return json({ error: 'not found' }, 404)
      }
      const expiresAt = Date.now() + SIGNED_URL_TTL_MS
      const payload: SignedMedia = {
        tenantId: user?.tenantId ?? '',
        threadId,
        id,
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
      // A bad signature is 403 before `getUser` runs.
      if (isSignedMedia) return await serveSigned(request, url)
      const caller = await usersOf(request)
      if (!caller) return json({ error: 'unauthorized' }, 401)
      return await handle(request, caller.user, requestId)
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
  const { pendingWaits, activeOperations } = await view.snapshot()
  const pendingInterrupts = pendingWaits.flatMap(({ interrupt, turn }) =>
    interrupt && turn ? [interrupt] : [],
  )
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

export interface HarnessSocketOptions<U extends HarnessUser = HarnessUser> {
  host: HarnessHost<U>
  harness: AnyHarness
  socket: WebSocketLike
  /**
   * The upgrade request. With host `access`, `access.getUser` reads the
   * user from it.
   */
  request: Request
  /** For a host without `access` only. See `HarnessHandlerOptions`. */
  openAccess?: OpenAccess<U>
  /**
   * The values of the socket: the heartbeat, the slow-client close, and the
   * buffer size. A value that you do not set keeps its default. See
   * `HarnessStreamOptions`.
   */
  stream?: HarnessStreamOptions
}

/** The close code of a socket after an `unsupported_version` error frame. */
const UNSUPPORTED_VERSION_CLOSE_CODE = 4400

/** What the presence hooks get of a stream of `user` on `threadId`. */
const connectionOf = <U extends HarnessUser>(
  user: U | undefined,
  threadId: string,
  harness: AnyHarness,
) => ({
  ...(user ? { user } : {}),
  threadId,
  ...(user?.tenantId !== undefined ? { tenantId: user.tenantId } : {}),
  harness: harness.name,
})

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
 * same rules as `createHarnessHandler`: a user that `getUser` refuses gets
 * an `unauthorized` error frame and the socket closes. The host checks each
 * input. When `host.revoke` or `unshare` takes the access of the user, the
 * socket sends a `forbidden` error frame and closes.
 *
 * The subscribe and the snapshots read with `host.observe`, so they open no
 * session. The first input opens the session, and the socket holds it until
 * it closes.
 *
 * `stream` sets the values of the socket (see `HarnessStreamOptions`).
 *
 * A frame over `media.maxBodyBytes` gets an error frame, and the socket
 * closes with 1009. Your WebSocket server has read the whole frame by then,
 * so this check saves only the parse. The memory cap is the frame limit of
 * your server, for example `maxPayload` of `ws`. Set it to
 * `media.maxBodyBytes` or lower.
 *
 * Throws at the start for a host without `access` and without `openAccess`,
 * for a host with both, and for a `stream` value that is not a finite number
 * above 0.
 *
 * @example
 * ```ts
 * handleHarnessSocket({ host, harness: assistant, socket, request })
 * ```
 */
export function handleHarnessSocket<U extends HarnessUser = HarnessUser>(
  options: HarnessSocketOptions<U>,
) {
  const { host, harness, socket, request } = options
  const usersOf = requestUsers(
    'handleHarnessSocket',
    host,
    options.openAccess,
  ).of
  const values = streamValues('handleHarnessSocket', options.stream)
  const reader = new AbortController()
  // The id of the upgrade request, with the rule of `requestIdFor`. An error
  // frame of the socket itself, or of a frame with no `requestId`, names it.
  const socketId = requestIdFor(request)
  /** Why the socket ends, for `presence.onDisconnect`. */
  let endReason: PresenceEndReason = 'closed'
  const sender = socketSender({
    socket,
    requestId: socketId,
    signal: reader.signal,
    stream: values,
    // A slow client is an error too.
    onSlow: () => {
      if (endReason === 'closed') endReason = 'error'
    },
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
  const hold = (threadId: string, user: U | undefined) => {
    if (held) return held
    const opening = host
      .open(harness, { threadId, ...(user ? { user } : {}) })
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
  socket.addEventListener('error', () => {
    if (endReason === 'closed') endReason = 'error'
    reader.abort()
  })
  const frameLimit = maxBodyBytesOf(harness.media)
  // The frames of the socket run one after another, as the stdio worker
  // runs them: an input with media to store does not let a later input
  // reach the session first.
  let frames = Promise.resolve()
  socket.addEventListener('message', (message) => {
    const data = String(message.data)
    // A frame over `media.maxBodyBytes` is not parsed, so its error frame
    // names the socket. The socket closes with 1009 (message too big). The
    // server read the frame already: its own frame limit caps the memory.
    if (isOverLimit(data, frameLimit)) {
      closeWith(
        {
          type: 'harness.error',
          message: `The frame is bigger than the limit of ${frameLimit} bytes.`,
          code: 'invalid_frame',
          requestId: socketId,
        },
        1009,
      )
      return
    }
    // Read before the full parse, so a frame with a bad `input` still names
    // its request.
    const requestId = requestIdOf(data) ?? socketId
    frames = frames.then(async () => {
      try {
        const caller = await who
        if (!caller) return refuse('unauthorized', requestId)
        const { user } = caller
        let frame: ControlFrame
        try {
          frame = parseControlFrame(data)
        } catch (error) {
          return fail('invalid_frame', errorMessage(error), requestId)
        }
        if (frame.type === 'harness.subscribe') {
          if (subscribed)
            return fail('invalid_frame', 'Already subscribed.', requestId)
          const refused = versionError(frame.v)
          if (refused) {
            return closeWith(
              { type: 'harness.error', requestId, ...refused },
              UNSUPPORTED_VERSION_CLOSE_CODE,
            )
          }
          const { threadId } = frame
          subscribed = observeToRead(host, harness, {
            threadId,
            user,
          }).then(
            (view) => ({ threadId, view }),
            (error: unknown) => {
              if (!(error instanceof AccessDeniedError)) throw error
              return undefined
            },
          )
          const subscription = await subscribed
          if (!subscription) return refuse('forbidden', requestId)
          watchRevoke(host, { user, threadId, signal: reader.signal }, () => {
            endReason = 'revoked'
            refuse('forbidden', requestId)
          })
          const left = reader.signal.aborted
            ? undefined
            : presenceOf(host)?.connect({
                ...connectionOf(user, threadId, harness),
                transport: 'websocket',
                resumed: frame.from !== undefined,
              })
          if (left)
            reader.signal.addEventListener('abort', () => left(endReason), {
              once: true,
            })
          void send({
            type: 'harness.hello',
            v: HARNESS_PROTOCOL_VERSION,
            threadId,
          })
          void stream(subscription.view, frame.from)
            // The close waits for this frame: it goes out first.
            .catch((error: unknown) => {
              // The view ends its read on a revoke too.
              if (endReason === 'closed')
                endReason =
                  error instanceof AccessDeniedError ? 'revoked' : 'error'
              return send({
                type: 'harness.error',
                message: errorMessage(scrubbedBy(holding, error)),
                code: 'internal',
                requestId,
              })
            })
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
        const session = await hold(subscription.threadId, user)
        const receipt = await applyInput({
          harness,
          session,
          input: frame.input,
          ...(user ? { user } : {}),
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
        // The held session scrubs its secrets. Before the first input,
        // no session is open, so there is none to scrub.
        fail(code, errorMessage(scrubbedBy(holding, error)), requestId)
      }
    })
  })
}
