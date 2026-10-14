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
import { durableStoresOf, sessionOfTurn } from './host'
import { MediaError } from './media'
import { base64url } from './oauth'
import {
  HARNESS_PROTOCOL_VERSION,
  applyInput,
  capabilitiesOf,
  describeForClient,
  parseControlFrame,
  parseHarnessInput,
} from './protocol'
import { isRecord } from './utils'
import { SessionMetadataError } from './session-entry'
import type {
  ModelMessage,
  RunStore,
  UIMessage,
  WebSocketLike,
} from '@tanstack/ai'
import type { SessionIndexEntry } from '@tanstack/ai-persistence'
import type { AnyHarness } from './define'
import type { HarnessHost, HostEvent } from './host'
import type { HostFrame } from './protocol'
import type { HarnessSession } from './session/index'
import type { Principal, SessionEvent, UserInput } from './types'

/**
 * Decide who sends a request. Return `null` to refuse it with 401. Every
 * endpoint calls it, except a signed media URL: the handler signs one only
 * for a principal that `authorize` and `canAccess` let in.
 */
export type Authorize = (
  request: Request,
) => Principal | null | Promise<Principal | null>

/** May this principal use this thread? */
export type CanAccess = (
  principal: Principal,
  threadId: string,
) => boolean | Promise<boolean>

export interface HarnessHandlerOptions {
  host: HarnessHost
  harness: AnyHarness
  authorize: Authorize
  /**
   * May this principal use this thread? Required: use it to keep users out
   * of each other's threads. Pass `() => true` to let every principal use
   * every thread.
   */
  canAccess: CanAccess
  /**
   * The secret that signs media URLs (HMAC SHA-256). Use the same value on
   * every server behind one URL. Required on a durable host (`stores.log`),
   * where another instance can serve the next request. Without a log store,
   * the default is a random key per handler, so signed URLs stop working
   * after a restart.
   */
  mediaSecret?: string
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

/**
 * An SSE response: one event per frame, with `data` as JSON and `id` when
 * the frame has one. When the client leaves, `signal` aborts.
 */
function sseResponse(
  frames: (
    signal: AbortSignal,
  ) => AsyncIterable<{ id?: string; data: unknown }>,
) {
  // Not `request.signal`: some servers abort it once the body is read.
  const reader = new AbortController()
  const body = new ReadableStream<Uint8Array>({
    cancel: () => reader.abort(),
    async start(controller) {
      try {
        for await (const { id, data } of frames(reader.signal)) {
          const idLine = id === undefined ? '' : `id: ${id}\n`
          controller.enqueue(
            encoder.encode(`${idLine}data: ${JSON.stringify(data)}\n\n`),
          )
        }
      } finally {
        if (!reader.signal.aborted) controller.close()
      }
    },
  })
  return new Response(body, { headers: SSE_HEADERS })
}

/**
 * Session events as an AG-UI SSE response. With `withIds`, each event has its
 * cursor as `id`, so a client that loses the connection resumes with
 * `Last-Event-ID`. When the client leaves, the read stops.
 */
function cursorResponse(
  read: (signal: AbortSignal) => AsyncIterable<SessionEvent>,
  withIds: boolean,
) {
  // Not `request.signal`: some servers abort it once the body is read.
  const reader = new AbortController()
  const cursors: Array<string> = []
  async function* chunks() {
    for await (const entry of read(reader.signal)) {
      cursors.push(entry.cursor)
      yield entry.event
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

/** A handler error as JSON: a `MediaError` keeps its status, the rest is 400. */
const failed = (error: unknown) =>
  error instanceof MediaError
    ? json({ error: error.message }, error.status)
    : json(
        { error: error instanceof Error ? error.message : String(error) },
        400,
      )

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

/** A `POST sessions` body, or `undefined` when it is not a valid one. */
function parseSessionOp(body: unknown) {
  if (!isRecord(body)) return undefined
  const { op, threadId, title, before, through, pinned, metadata } = body
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
    default:
      return undefined
  }
}

/**
 * The entry belongs to `principal`: the same id, and the same tenant when
 * the principal has one. The same rule as the `principal` filter of the
 * index `list`, so a user changes only the sessions the user can list.
 */
function isOwnedBy(entry: SessionIndexEntry, principal: Principal) {
  const owner = entry.principal
  if (!owner || owner.id !== principal.id) return false
  return (
    principal.tenantId === undefined || owner.tenantId === principal.tenantId
  )
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
  session: HarnessSession,
  id: string,
) {
  const record = await session.getMedia(id)
  if (!record) return json({ error: 'not found' }, 404)
  const range = parseRangeHeader(request.headers.get('Range'), record.size)
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...MEDIA_HEADERS, 'Content-Range': `bytes */${record.size}` },
    })
  }
  const bytes = await session.loadMedia(id, range)
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
 *   to the file, relative to the handler. It works for 1 hour.
 * - `GET  .../media?threadId=&id=[&exp=&sig=]`: the bytes, with `Range`
 *   support. A signed request needs no `authorize`, and a bad or expired
 *   signature is 403.
 * - `GET  .../sessions?limit=&cursor=&parentThreadId=`: one page of the
 *   session index, newest first. Only the sessions of this principal that
 *   `canAccess` lets in. Default: top-level sessions only.
 * - `POST .../sessions`: change a session of this principal. The body is
 *   `{ op: 'rename', threadId, title }`, `{ op: 'update', threadId, title?,
 *   pinned?, metadata? }` (each field replaces the stored one, and the
 *   harness `metadataSchema` checks `metadata`. Without a schema, a client
 *   cannot write `metadata`: 403 `not_exposed`), `{ op: 'delete', threadId }`
 *   (it removes the index entry only), or `{ op: 'fork', threadId, before }`
 *   or `{ op: 'fork', threadId, through }` with a message id. Rename,
 *   update, and fork answer with the entry, delete with 204. 400
 *   (`invalid_metadata`, with `issues`) for metadata the schema refuses, 403
 *   when `canAccess` refuses the thread, 404 for a thread this principal
 *   does not own, and 409 (`other_harness`) for an update or a fork of a
 *   thread that another harness runs.
 * - `GET  .../host-events`: the `host.events()` of this principal as SSE:
 *   status changes and session index changes. First the current status of
 *   each open session. Only the threads that `canAccess` lets in and that
 *   this principal owns in the session index, so it needs `stores.sessions`.
 *
 * Each chat input runs as the principal that `authorize` returned for its
 * request, not as the one that opened the session first.
 */
export function createHarnessHandler(
  options: HarnessHandlerOptions,
): (request: Request) => Promise<Response> {
  const { host, harness, authorize, canAccess } = options
  const durable = durableStoresOf(host)
  if (options.mediaSecret === undefined && durable) {
    throw new Error(
      'createHarnessHandler needs mediaSecret on a durable host (stores.log): another instance must verify the media URLs this one signs. Set the same secret on every instance.',
    )
  }

  const openFor = async (principal: Principal, threadId: string) => {
    if (!(await canAccess(principal, threadId))) return null
    return host.open(harness, { threadId, principal })
  }

  // ponytail: without `mediaSecret` (only allowed without a log store), a
  // random key per handler, so signed URLs stop working after a restart.
  const secret =
    options.mediaSecret === undefined
      ? crypto.getRandomValues(new Uint8Array(32))
      : encoder.encode(options.mediaSecret)
  let key: Promise<CryptoKey> | undefined
  const mediaKey = () =>
    (key ??= crypto.subtle.importKey('raw', secret, HMAC, false, [
      'sign',
      'verify',
    ]))
  const signed = (threadId: string, id: string, exp: string) =>
    encoder.encode(`${threadId}\n${id}\n${exp}`)
  const sign = async (threadId: string, id: string, exp: string) => {
    const signature = await crypto.subtle.sign(
      'HMAC',
      await mediaKey(),
      signed(threadId, id, exp),
    )
    return base64url(new Uint8Array(signature))
  }

  /** Serve a signed media URL. The signature was made after `canAccess` passed. */
  const serveSigned = async (request: Request, url: URL) => {
    const param = (name: string) => url.searchParams.get(name) ?? ''
    const threadId = param('threadId')
    const id = param('id')
    const exp = param('exp')
    const signature = fromBase64url(param('sig'))
    const isValid =
      signature !== undefined &&
      Number(exp) > Date.now() &&
      // `verify` compares in constant time.
      (await crypto.subtle.verify(
        'HMAC',
        await mediaKey(),
        signature,
        signed(threadId, id, exp),
      ))
    if (!isValid) return json({ error: 'forbidden' }, 403)
    return mediaResponse(request, await host.open(harness, { threadId }), id)
  }

  /**
   * Stream the chat turn `runId` from its start: the `joinRun` of a
   * ChatClient after a reload. Each event has its cursor as `id`, so
   * `Last-Event-ID` resumes after it. A turn that ended gives the events the
   * feed still has.
   */
  const joinTurn = async (
    request: Request,
    principal: Principal,
    runId: string,
  ) => {
    // `offset=-1` is the start. A reconnect sends the last cursor it saw.
    const offset = new URL(request.url).searchParams.get('offset')
    const resumeFrom =
      request.headers.get('Last-Event-ID') ?? (offset === '-1' ? null : offset)
    const session = await sessionOfTurn(host, harness, runId)
    const turn = session?.operation(runId)
    if (session && turn) {
      if (!(await canAccess(principal, session.threadId))) {
        return json({ error: 'forbidden' }, 403)
      }
      const startedCursor = session
        .snapshot()
        .activeOperations.find((item) => item.id === runId)?.startedCursor
      const from = resumeFrom ?? startedCursor ?? '0'
      return cursorResponse((signal) => turn.events({ from, signal }), true)
    }
    // Another instance runs the turn. A durable host finds its thread in the
    // run store, and its events in the shared log. Not a child run or an
    // agent run: only a chat turn of a thread.
    const record = await durable?.runs?.get(runId)
    const isChatTurn =
      record != null &&
      record.kind !== 'agent' &&
      record.parentRunId === undefined
    if (!record || !isChatTurn) return json({ error: 'unknown run' }, 404)
    const { threadId } = record
    if (!(await canAccess(principal, threadId))) {
      return json({ error: 'forbidden' }, 403)
    }
    const entry = await host.sessions.get(threadId)
    if (entry?.harness !== undefined && entry.harness !== harness.name) {
      return json({ error: 'unknown run' }, 404)
    }
    const shared = await host.open(harness, { threadId, principal })
    // ponytail: from the start of the log without a cursor. Store the
    // started position on the run record if long threads make this slow.
    return cursorResponse(
      (signal) =>
        followOperation(
          shared.events({ from: resumeFrom ?? '0', signal }),
          runId,
        ),
      true,
    )
  }

  return async (request) => {
    const url = new URL(request.url)
    const route = url.pathname.split('/').at(-1)
    const isSignedMedia =
      request.method === 'GET' &&
      route === 'media' &&
      url.searchParams.has('sig')
    // Before `authorize`: a signed URL is its own permission.
    if (isSignedMedia) return serveSigned(request, url).catch(failed)
    const principal = await authorize(request)
    if (!principal) return json({ error: 'unauthorized' }, 401)

    try {
      if (request.method === 'GET' && route === 'capabilities') {
        return json(capabilitiesOf(harness))
      }

      if (request.method === 'POST' && route === 'run') {
        const params = await chatParamsFromRequestBody(await request.json())
        const message = lastUserInput(params.messages)
        const session = await openFor(principal, params.threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        // The turn runs as the request's run id, so an AG-UI client matches
        // its events and interrupts. The run id is the input id too, so a
        // retried request runs once. It runs as this request's principal.
        const ids = { inputId: params.runId, runId: params.runId, principal }
        const lastEventId = request.headers.get('Last-Event-ID')
        if (params.resume && params.resume.length > 0) {
          const receipt = await session.resolve(params.resume, ids)
          if (receipt.status === 'rejected' || !receipt.operationId) {
            return json({ error: receipt.reason ?? 'rejected' }, 409)
          }
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
          )
        }
        if (message === undefined)
          return json({ error: 'no user message' }, 400)
        // AG-UI `forwardedProps` are the input's context.
        const { forwardedProps } = params
        const operation = session.prompt(message, {
          ...ids,
          ...(Object.keys(forwardedProps).length > 0
            ? { context: forwardedProps }
            : {}),
        })
        const receipt = await operation.receipt
        if (receipt.status === 'rejected') {
          return json({ error: receipt.reason ?? 'rejected' }, 409)
        }
        // A durable host sends each log cursor as the event id. A client cut
        // off sends the same request with `Last-Event-ID`, maybe to another
        // instance: the run id finds the same turn, and it streams from there.
        // Without a log a cursor means nothing on another instance, so no id.
        const from = (durable && lastEventId) || '0'
        return cursorResponse(
          (signal) => operation.events({ from, signal }),
          durable !== undefined,
        )
      }

      if (request.method === 'GET' && route === 'run') {
        // The `joinRun` of a ChatClient after a reload names the run only.
        const runId = resolveResumeRunId(request)
        if (runId) return await joinTurn(request, principal, runId)
        const threadId = url.searchParams.get('threadId')
        if (!threadId) return json({ error: 'threadId is required' }, 400)
        const session = await openFor(principal, threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        return json(await hydration(session, durable?.runs))
      }

      if (request.method === 'GET' && route === 'events') {
        const threadId = url.searchParams.get('threadId')
        if (!threadId) return json({ error: 'threadId is required' }, 400)
        const session = await openFor(principal, threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        const from =
          request.headers.get('Last-Event-ID') ??
          url.searchParams.get('from') ??
          undefined
        return sseResponse(async function* (signal) {
          const events = session.events({ ...(from ? { from } : {}), signal })
          for await (const entry of events) {
            const frame: HostFrame = { type: 'harness.event', ...entry }
            yield { id: entry.cursor, data: frame }
          }
        })
      }

      if (request.method === 'GET' && route === 'host-events') {
        // The same rule as `POST sessions`: `canAccess`, and the owner in
        // the index. A deleted entry comes with the event.
        const mayWatch = async (event: HostEvent) => {
          if (!(await canAccess(principal, event.threadId))) return false
          const entry =
            event.type === 'status'
              ? await host.sessions.get(event.threadId)
              : event.entry
          return entry !== undefined && isOwnedBy(entry, principal)
        }
        return sseResponse(async function* (signal) {
          for await (const event of host.events({ signal })) {
            if (await mayWatch(event)) yield { data: event }
          }
        })
      }

      if (request.method === 'POST' && route === 'control') {
        const body: unknown = await request.json()
        if (
          typeof body !== 'object' ||
          body === null ||
          !('threadId' in body)
        ) {
          return json({ error: 'threadId is required' }, 400)
        }
        const threadId = body.threadId
        if (typeof threadId !== 'string')
          return json({ error: 'threadId is required' }, 400)
        const input = parseHarnessInput(
          'input' in body ? body.input : undefined,
        )
        const session = await openFor(principal, threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        return json(await applyInput(harness, session, input, principal))
      }

      if (
        request.method === 'GET' &&
        (route === 'transcript' || route === 'describe')
      ) {
        const threadId = url.searchParams.get('threadId')
        if (!threadId) return json({ error: 'threadId is required' }, 400)
        const session = await openFor(principal, threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        return json(
          route === 'transcript'
            ? await session.transcript()
            : describeForClient(harness, session),
        )
      }

      if (request.method === 'GET' && route === 'agent-transcript') {
        const threadId = url.searchParams.get('threadId')
        const subagentRunId = url.searchParams.get('subagentRunId')
        if (!threadId) return json({ error: 'threadId is required' }, 400)
        if (!subagentRunId)
          return json({ error: 'subagentRunId is required' }, 400)
        const session = await openFor(principal, threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        return json(await session.agentTranscript(subagentRunId))
      }

      if (request.method === 'GET' && route === 'snapshot') {
        const threadId = url.searchParams.get('threadId')
        if (!threadId) return json({ error: 'threadId is required' }, 400)
        const session = await openFor(principal, threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        return json(session.snapshot())
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
            .filter(([key]) => key.startsWith('metadata.'))
            .map(([key, value]) => [key.slice('metadata.'.length), value]),
        )
        // The store keeps only this principal's entries of this harness.
        // `canAccess` can still refuse some of them.
        const page = await host.sessions.list({
          principal,
          harness: harness.name,
          metadata,
          ...(limit ? { limit: Number(limit) } : {}),
          ...(cursor ? { cursor } : {}),
          ...(parentThreadId ? { parentThreadId } : {}),
          ...(search ? { search } : {}),
        })
        const allowed = await Promise.all(
          page.entries.map(async (entry) =>
            canAccess(principal, entry.threadId),
          ),
        )
        return json({
          ...page,
          entries: page.entries.filter((_entry, index) => allowed[index]),
        })
      }

      if (request.method === 'POST' && route === 'sessions') {
        const op = parseSessionOp(await request.json())
        if (!op) return json({ error: 'not a valid sessions op' }, 400)
        if (!(await canAccess(principal, op.threadId)))
          return json({ error: 'forbidden' }, 403)
        // The session of another user answers as a missing one, so its
        // thread id tells the caller nothing.
        const entry = await host.sessions.get(op.threadId)
        if (!entry || !isOwnedBy(entry, principal))
          return json({ error: 'not found' }, 404)
        switch (op.op) {
          case 'rename': {
            const renamed = await host.sessions.rename({
              threadId: op.threadId,
              title: op.title,
            })
            return renamed ? json(renamed) : json({ error: 'not found' }, 404)
          }
          case 'update': {
            // The host can run more harnesses than this handler serves.
            if (entry.harness !== undefined && entry.harness !== harness.name)
              return json({ error: 'other_harness' }, 409)
            // The schema is the contract for what a client may write. Without
            // one, metadata stays a server field.
            if (op.change.metadata !== undefined && !harness.metadataSchema)
              return json({ error: 'not_exposed' }, 403)
            try {
              const updated = await host.sessions.update({
                harness,
                threadId: op.threadId,
                update: op.change,
              })
              return updated ? json(updated) : json({ error: 'not found' }, 404)
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
            await host.sessions.delete(op.threadId)
            return new Response(null, { status: 204 })
          case 'fork':
            // The host can run more harnesses than this handler serves.
            if (entry.harness !== undefined && entry.harness !== harness.name)
              return json({ error: 'other_harness' }, 409)
            return json(
              await host.sessions.fork({
                harness,
                threadId: op.threadId,
                at: op.at,
              }),
            )
        }
      }

      if (request.method === 'POST' && route === 'media') {
        const threadId = url.searchParams.get('threadId')
        const name = url.searchParams.get('name')
        if (!threadId || !name)
          return json({ error: 'threadId and name are required' }, 400)
        const session = await openFor(principal, threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        const record = await session.putMedia(
          request.body ?? new Uint8Array(),
          { mimeType: request.headers.get('Content-Type') ?? '', name },
        )
        return json(record)
      }

      if (
        request.method === 'GET' &&
        (route === 'media' || route === 'media-url')
      ) {
        const threadId = url.searchParams.get('threadId')
        const id = url.searchParams.get('id')
        if (!threadId || !id)
          return json({ error: 'threadId and id are required' }, 400)
        const session = await openFor(principal, threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        if (route === 'media') return await mediaResponse(request, session, id)
        if (!(await session.getMedia(id)))
          return json({ error: 'not found' }, 404)
        const expiresAt = Date.now() + SIGNED_URL_TTL_MS
        const exp = String(expiresAt)
        const query = new URLSearchParams({
          threadId,
          id,
          exp,
          sig: await sign(threadId, id, exp),
        })
        return json({ path: `media?${query}`, expiresAt })
      }
    } catch (error) {
      return failed(error)
    }
    return json({ error: 'not found' }, 404)
  }
}

/**
 * What a `ChatClient` with `persistence` reads when it loads a thread (a
 * `ChatHydrationResult`): the transcript, the running chat turn (the client
 * joins it with `GET run?runId=`), and the interrupts that the last turn
 * waits for. On a durable host, `runs` finds a turn that another instance
 * runs.
 */
async function hydration(session: HarnessSession, runs?: RunStore) {
  const { pendingInterrupts, activeOperations } = session.snapshot()
  const [first] = pendingInterrupts
  const runId = first
    ? readInterruptBinding(first)?.interruptedRunId
    : undefined
  const running = activeOperations.find(
    (item) =>
      item.kind === 'chat' &&
      session.operation(item.id)?.status() === 'running',
  )
  const remote = running
    ? undefined
    : await runs?.findActiveRun(session.threadId)
  const runningId =
    running?.id ?? (remote?.kind !== 'agent' ? remote?.runId : undefined)
  return {
    messages: modelMessagesToUIMessages(await session.transcript()),
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

export interface HarnessSocketOptions {
  host: HarnessHost
  harness: AnyHarness
  socket: WebSocketLike
  /** The principal your upgrade handler authorized. */
  principal: Principal
  /** May this principal use this thread? Pass `() => true` to allow all. */
  canAccess: CanAccess
}

/**
 * Serve the session tier over one WebSocket. The first frame must be
 * `harness.subscribe`. Authorize the upgrade request before you call this.
 */
export function handleHarnessSocket(options: HarnessSocketOptions): void {
  const { host, harness, socket, principal, canAccess } = options
  const reader = new AbortController()
  // Set by the first subscribe, before its awaits, so a second subscribe is
  // refused and an input sent right after the subscribe waits for the open.
  let opened:
    | Promise<Awaited<ReturnType<HarnessHost['open']>> | undefined>
    | undefined
  const send = (frame: HostFrame) => {
    try {
      socket.send(JSON.stringify(frame))
    } catch {
      reader.abort()
    }
  }

  socket.addEventListener('close', () => reader.abort())
  socket.addEventListener('error', () => reader.abort())
  socket.addEventListener('message', (message) => {
    void (async () => {
      try {
        const frame = parseControlFrame(String(message.data))
        if (frame.type === 'harness.subscribe') {
          if (opened) throw new Error('Already subscribed.')
          const { threadId } = frame
          opened = (async () =>
            (await canAccess(principal, threadId))
              ? host.open(harness, { threadId, principal })
              : undefined)()
          const session = await opened
          if (!session) {
            send({ type: 'harness.error', message: 'forbidden' })
            socket.close(4403, 'forbidden')
            return
          }
          send({
            type: 'harness.hello',
            v: HARNESS_PROTOCOL_VERSION,
            threadId: frame.threadId,
          })
          const events = session.events({
            ...(frame.from ? { from: frame.from } : {}),
            signal: reader.signal,
          })
          void (async () => {
            for await (const entry of events)
              send({ type: 'harness.event', ...entry })
          })()
            .catch((error: unknown) =>
              send({
                type: 'harness.error',
                message: error instanceof Error ? error.message : String(error),
              }),
            )
            // The feed ended while the socket is open: close it, so the
            // client subscribes again.
            .finally(() => {
              if (!reader.signal.aborted) socket.close(1011, 'feed ended')
            })
          return
        }
        const session = await opened
        if (!session) throw new Error('Send harness.subscribe first.')
        if (frame.type === 'harness.snapshot') {
          send({ type: 'harness.snapshot', snapshot: session.snapshot() })
          return
        }
        const receipt = await applyInput(
          harness,
          session,
          frame.input,
          principal,
        )
        send({
          type: 'harness.receipt',
          requestId: frame.requestId,
          ...receipt,
        })
      } catch (error) {
        send({
          type: 'harness.error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })()
  })
}
