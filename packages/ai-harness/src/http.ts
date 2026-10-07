import {
  EventType,
  chatParamsFromRequestBody,
  convertMessagesToModelMessages,
  isContentPart,
  modelMessagesToUIMessages,
  readInterruptBinding,
  resolveResumeRunId,
  toServerSentEventsResponse,
  toServerSentEventsStream,
} from '@tanstack/ai'
import { parseRangeHeader, resolveBlobRange } from '@tanstack/ai-persistence'
import { sessionOfTurn } from './host'
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
import type {
  ModelMessage,
  StreamChunk,
  UIMessage,
  WebSocketLike,
} from '@tanstack/ai'
import type { SessionIndexEntry } from '@tanstack/ai-persistence'
import type { AnyHarness } from './define'
import type { HarnessHost, HostEvent } from './host'
import type { HostFrame } from './protocol'
import type { HarnessSession } from './session'
import type { Principal, UserInput } from './types'

/**
 * Decide who sends a request. Return `null` to refuse it with 401. Every
 * endpoint calls it, except a signed media URL: the handler signs one only
 * for a principal that `authorize` and `canAccess` let in.
 */
export type Authorize = (
  request: Request,
) => Principal | null | Promise<Principal | null>

export interface HarnessHandlerOptions {
  host: HarnessHost
  harness: AnyHarness
  authorize: Authorize
  /**
   * May this principal use this thread? Default: yes. Use it to keep users
   * out of each other's threads.
   */
  canAccess?: (
    principal: Principal,
    threadId: string,
  ) => boolean | Promise<boolean>
  /**
   * The secret that signs media URLs (HMAC SHA-256). Default: a random key
   * per handler, so signed URLs stop working after a restart. Set it to keep
   * them working, and use the same value on every server behind one URL.
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
  const { op, threadId, title, before, through } = body
  if (typeof threadId !== 'string') return undefined
  switch (op) {
    case 'rename':
      return typeof title === 'string'
        ? { op: 'rename' as const, threadId, title }
        : undefined
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
 *   retry with the same `runId` runs once. The prompt keeps every content
 *   part of the last user message, and its `forwardedProps` are the input's
 *   `context`.
 * - `GET  .../run?threadId=`: the transcript, the running turn, and the
 *   waiting interrupts, as the `ChatHydrationResult` that a `ChatClient` with
 *   `persistence` reads.
 * - `GET  .../run?runId=` (or `X-Run-Id`): the chat turn with that run id, as
 *   SSE from its start, so a reloaded `ChatClient` joins it. Each event id is
 *   a cursor, so `Last-Event-ID` resumes it. 404 for a turn this host does
 *   not run.
 * - `GET  .../events?threadId=&from=`: the session stream as SSE. Each event id
 *   is a cursor, so `Last-Event-ID` resumes it.
 * - `POST .../control`: `{ threadId, input }`. Returns the receipt.
 * - `GET  .../snapshot?threadId=`: the session snapshot.
 * - `GET  .../transcript?threadId=`: the saved messages of the thread.
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
 *   `{ op: 'rename', threadId, title }`, `{ op: 'delete', threadId }` (it
 *   removes the index entry only), or `{ op: 'fork', threadId, before }` or
 *   `{ op: 'fork', threadId, through }` with a message id. Rename and fork
 *   answer with the entry, delete with 204. 403 when `canAccess` refuses
 *   the thread, 404 for a thread this principal does not own, and 409
 *   (`other_harness`) for a fork of a thread that another harness runs.
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
  const { host, harness, authorize } = options
  const canAccess = options.canAccess ?? (() => true)

  const openFor = async (principal: Principal, threadId: string) => {
    if (!(await canAccess(principal, threadId))) return null
    return host.open(harness, { threadId, principal })
  }

  // ponytail: without `mediaSecret`, a random key per handler, so signed URLs
  // stop working after a restart. Set `mediaSecret` to keep them.
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
    const session = await sessionOfTurn(host, harness, runId)
    const turn = session?.operation(runId)
    if (!session || !turn) return json({ error: 'unknown run' }, 404)
    if (!(await canAccess(principal, session.threadId))) {
      return json({ error: 'forbidden' }, 403)
    }
    // `offset=-1` is the start. A reconnect sends the last cursor it saw.
    const offset = new URL(request.url).searchParams.get('offset')
    const resumeFrom =
      request.headers.get('Last-Event-ID') ?? (offset === '-1' ? null : offset)
    const startedCursor = session
      .snapshot()
      .activeOperations.find((item) => item.id === runId)?.startedCursor
    const from = resumeFrom ?? startedCursor ?? '0'
    const reader = new AbortController()
    const events = turn.events({ from, signal: reader.signal })
    const cursors: Array<string> = []
    async function* chunks() {
      for await (const entry of events) {
        cursors.push(entry.cursor)
        yield entry.event
      }
    }
    return new Response(
      toServerSentEventsStream(chunks(), reader, (_chunk, index) =>
        cursors.at(index),
      ),
      { headers: SSE_HEADERS },
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
        if (params.resume && params.resume.length > 0) {
          const receipt = await session.resolve(params.resume, ids)
          if (receipt.status === 'rejected' || !receipt.operationId) {
            return json({ error: receipt.reason ?? 'rejected' }, 409)
          }
          // Not `request.signal`: some servers abort it once the body is
          // read. The response aborts this controller when the client leaves.
          const reader = new AbortController()
          const events = session.events({ signal: reader.signal })
          return toServerSentEventsResponse(
            followOperation(events, receipt.operationId),
            {
              abortController: reader,
            },
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
        const reader = new AbortController()
        return toServerSentEventsResponse(
          operation.stream({ signal: reader.signal }),
          {
            abortController: reader,
          },
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
        return json(await hydration(session))
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
        // The store keeps only this principal's entries. `canAccess` can
        // still refuse some of them.
        const page = await host.sessions.list({
          principal,
          ...(limit ? { limit: Number(limit) } : {}),
          ...(cursor ? { cursor } : {}),
          ...(parentThreadId ? { parentThreadId } : {}),
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
            const renamed = await host.sessions.rename(op.threadId, op.title)
            return renamed ? json(renamed) : json({ error: 'not found' }, 404)
          }
          case 'delete':
            await host.sessions.delete(op.threadId)
            return new Response(null, { status: 204 })
          case 'fork':
            // The host can run more harnesses than this handler serves.
            if (entry.harness !== undefined && entry.harness !== harness.name)
              return json({ error: 'other_harness' }, 409)
            return json(await host.sessions.fork(harness, op.threadId, op.at))
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
 * waits for.
 */
async function hydration(session: HarnessSession) {
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
  return {
    messages: modelMessagesToUIMessages(await session.transcript()),
    activeRun: running ? { runId: running.id } : null,
    interrupts: runId ? { runId, pending: pendingInterrupts } : null,
  }
}

/** Session events of one operation, until it finishes. */
async function* followOperation(
  events: AsyncIterable<{ operationId: string; event: StreamChunk }>,
  operationId: string,
) {
  for await (const entry of events) {
    if (entry.operationId !== operationId) continue
    yield entry.event
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
  canAccess?: (
    principal: Principal,
    threadId: string,
  ) => boolean | Promise<boolean>
}

/**
 * Serve the session tier over one WebSocket. The first frame must be
 * `harness.subscribe`. Authorize the upgrade request before you call this.
 */
export function handleHarnessSocket(options: HarnessSocketOptions): void {
  const { host, harness, socket, principal } = options
  const canAccess = options.canAccess ?? (() => true)
  const reader = new AbortController()
  let session: Awaited<ReturnType<HarnessHost['open']>> | undefined
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
          if (session) throw new Error('Already subscribed.')
          if (!(await canAccess(principal, frame.threadId))) {
            send({ type: 'harness.error', message: 'forbidden' })
            socket.close(4403, 'forbidden')
            return
          }
          session = await host.open(harness, {
            threadId: frame.threadId,
            principal,
          })
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
          return
        }
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
