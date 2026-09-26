import {
  EventType,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  HARNESS_PROTOCOL_VERSION,
  applyInput,
  capabilitiesOf,
  parseControlFrame,
  parseHarnessInput,
} from './protocol'
import type { StreamChunk, WebSocketLike } from '@tanstack/ai'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'
import type { HostFrame } from './protocol'
import type { Principal } from './types'

/**
 * Decide who sends a request. Return `null` to refuse it with 401. Every
 * endpoint calls it, so there is no unauthenticated route.
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
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** The text of the last user message of an AG-UI request. */
function lastUserText(messages: ReadonlyArray<unknown>): string | undefined {
  const message = messages.findLast(
    (entry) => isRecord(entry) && entry.role === 'user',
  )
  if (!isRecord(message)) return undefined
  if (typeof message.content === 'string') return message.content
  const parts = Array.isArray(message.parts) ? message.parts : []
  return parts
    .map((part: unknown) =>
      isRecord(part) && part.type === 'text' && typeof part.content === 'string'
        ? part.content
        : '',
    )
    .join('')
}

/**
 * A fetch handler for a harness. Mount it on a route that ends with any of
 * these paths:
 *
 * - `GET  .../capabilities`: the AG-UI capabilities document.
 * - `POST .../run`: standard AG-UI. One request is one prompt, streamed as SSE.
 * - `GET  .../events?threadId=&from=`: the session stream as SSE. Each event id
 *   is a cursor, so `Last-Event-ID` resumes it.
 * - `POST .../control`: `{ threadId, input }`. Returns the receipt.
 * - `GET  .../snapshot?threadId=`: the session snapshot.
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

  return async (request) => {
    const principal = await authorize(request)
    if (!principal) return json({ error: 'unauthorized' }, 401)
    const url = new URL(request.url)
    const route = url.pathname.split('/').at(-1)

    try {
      if (request.method === 'GET' && route === 'capabilities') {
        return json(capabilitiesOf(harness))
      }

      if (request.method === 'POST' && route === 'run') {
        const params = await chatParamsFromRequestBody(await request.json())
        const message = lastUserText(params.messages)
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
        const encoder = new TextEncoder()
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

      if (request.method === 'GET' && route === 'snapshot') {
        const threadId = url.searchParams.get('threadId')
        if (!threadId) return json({ error: 'threadId is required' }, 400)
        const session = await openFor(principal, threadId)
        if (!session) return json({ error: 'forbidden' }, 403)
        return json(session.snapshot())
      }
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : String(error) },
        400,
      )
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
