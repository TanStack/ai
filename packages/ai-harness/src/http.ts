import {
  EventType,
  chatParamsFromRequestBody,
  convertMessagesToModelMessages,
  isContentPart,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { parseRangeHeader, resolveBlobRange } from '@tanstack/ai-persistence'
import { MediaError } from './media'
import { base64url } from './oauth'
import {
  HARNESS_PROTOCOL_VERSION,
  applyInput,
  capabilitiesOf,
  parseControlFrame,
  parseHarnessInput,
} from './protocol'
import type {
  ModelMessage,
  StreamChunk,
  UIMessage,
  WebSocketLike,
} from '@tanstack/ai'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

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
 * - `POST .../run`: standard AG-UI. One request is one prompt, streamed as SSE.
 *   The prompt keeps every content part of the last user message.
 * - `GET  .../events?threadId=&from=`: the session stream as SSE. Each event id
 *   is a cursor, so `Last-Event-ID` resumes it.
 * - `POST .../control`: `{ threadId, input }`. Returns the receipt.
 * - `GET  .../snapshot?threadId=`: the session snapshot.
 * - `GET  .../transcript?threadId=`: the saved messages of the thread.
 * - `GET  .../describe?threadId=`: the commands, settings, and tools.
 * - `POST .../media?threadId=&name=`: store the raw body as a media file of
 *   the thread, with `Content-Type` as its type. Returns the `MediaRecord`.
 *   413 when it is over `media.maxBytes`, 415 for a type the harness does not
 *   take.
 * - `GET  .../media-url?threadId=&id=`: `{ path, expiresAt }`, a signed path
 *   to the file, relative to the handler. It works for 1 hour.
 * - `GET  .../media?threadId=&id=[&exp=&sig=]`: the bytes, with `Range`
 *   support. A signed request needs no `authorize`, and a bad or expired
 *   signature is 403.
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
        if (params.resume && params.resume.length > 0) {
          const receipt = await session.resolve(params.resume)
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
        const operation = session.prompt(message)
        const reader = new AbortController()
        return toServerSentEventsResponse(
          operation.stream({ signal: reader.signal }),
          {
            abortController: reader,
          },
        )
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
        // Stops when the client cancels the response stream.
        const reader = new AbortController()
        const body = new ReadableStream<Uint8Array>({
          cancel: () => reader.abort(),
          async start(controller) {
            try {
              for await (const entry of session.events({
                ...(from ? { from } : {}),
                signal: reader.signal,
              })) {
                const frame: HostFrame = { type: 'harness.event', ...entry }
                controller.enqueue(
                  encoder.encode(
                    `id: ${entry.cursor}\ndata: ${JSON.stringify(frame)}\n\n`,
                  ),
                )
              }
            } finally {
              if (!reader.signal.aborted) controller.close()
            }
          },
        })
        return new Response(body, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
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
        return json(await applyInput(harness, session, input))
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
            : session.describe(),
        )
      }

      if (request.method === 'GET' && route === 'snapshot') {
        const threadId = url.searchParams.get('threadId')
        if (!threadId) return json({ error: 'threadId is required' }, 400)
        const session = await openFor(principal, threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        return json(session.snapshot())
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
        const receipt = await applyInput(harness, session, frame.input)
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
