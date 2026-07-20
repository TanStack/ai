import { chatParamsFromRequestBody } from './utilities/chat-params'
import { durableStreamSource } from './stream-to-response'
import { resolveDebugOption } from './logger/resolve'
import type { StreamDurability } from './stream-durability'
import type { DebugOption } from './logger/types'
import type { ModelMessage, StreamChunk, UIMessage } from './types'

/**
 * The minimal WHATWG WebSocket surface the core needs. Cloudflare
 * `WebSocketPair` server sockets and Deno sockets already satisfy it; `ws`
 * (Node) and Bun `ServerWebSocket` get a ~10-line adapter at the call site.
 */
export interface WebSocketLike {
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  addEventListener: (
    type: 'message' | 'close' | 'error',
    handler: (ev: any) => void,
  ) => void
  readonly bufferedAmount?: number
}

/** One inbound WS text frame, after JSON parse + shape discrimination. */
export type InboundFrame =
  | { kind: 'run'; input: unknown }
  | { kind: 'abort'; runId: string }

/**
 * Encode one server→client frame. Durable frames carry the opaque offset in an
 * `{ id, chunk }` envelope (identical to the NDJSON wire); non-durable frames
 * are the bare chunk. Unambiguous because a bare chunk always has a top-level
 * `type` and the envelope never does.
 */
export function encodeWsFrame(
  chunk: StreamChunk,
  id: string | undefined,
): string {
  return JSON.stringify(id === undefined ? chunk : { id, chunk })
}

/**
 * Decode one client→server frame. An `{ type: 'abort', runId }` object is a
 * control frame; anything else is treated as a `RunAgentInput` and validated
 * downstream by `chatParamsFromRequestBody`.
 */
export function decodeWsFrame(data: string): InboundFrame {
  const parsed: unknown = JSON.parse(data)
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { type?: unknown }).type === 'abort' &&
    typeof (parsed as { runId?: unknown }).runId === 'string'
  ) {
    return { kind: 'abort', runId: (parsed as { runId: string }).runId }
  }
  return { kind: 'run', input: parsed }
}

/** Per-turn context for one inbound `run` frame on a conversation-scoped socket. */
export interface WsRunContext {
  messages: Array<UIMessage | ModelMessage>
  threadId: string
  runId: string
  forwardedProps?: Record<string, unknown>
  /** Non-null when this socket opened as a reconnect (carried `?offset`). */
  resumeOffset: string | null
  /** Synthetic per-turn request carrying `?runId=` so durability keys correctly. */
  request: Request
  /** Aborts on socket close or an `abort` control frame for this run. */
  signal: AbortSignal
}

/**
 * Build the synthetic per-turn request. A conversation-scoped socket multiplexes
 * many runs; each turn's durability adapter must key on the frame's `runId`,
 * which we carry in the URL query (`memoryStream`/`durableStream` already read
 * `?runId` / `?offset` there). Headers are copied from the handshake so
 * auth/cookies survive.
 */
export function buildTurnRequest(
  handshake: Request,
  runId: string,
  offset: string | null,
): Request {
  const url = new URL(handshake.url)
  url.searchParams.set('runId', runId)
  if (offset !== null) url.searchParams.set('offset', offset)
  return new Request(url, { headers: handshake.headers })
}

export interface WebSocketStreamInit<TOffset extends string = string> {
  /** Build a fresh chat() stream for each inbound RunAgentInput frame. */
  onRun: (ctx: WsRunContext) => AsyncIterable<StreamChunk>
  /** Per-TURN durability factory, keyed by the frame's runId via ctx.request. */
  durability?: (ctx: WsRunContext) => StreamDurability<TOffset>
  /** Chunks buffered per durability append (default 32). */
  batch?: number
  /** Heartbeat ping interval in ms (default 30_000). */
  heartbeatMs?: number
  /** Close after this many ms without any inbound frame (default 300_000). */
  idleTimeoutMs?: number
  debug?: DebugOption
}

/**
 * Run a full-duplex, conversation-scoped chat over an already-accepted server
 * socket. Each inbound RunAgentInput frame starts one chat() turn (via onRun)
 * whose chunks are pumped back as frames; the socket stays open across turns
 * (pending client-tool resubmit, next user message) until close/abort/idle.
 */
export function toWebSocketStream<TOffset extends string = string>(
  socket: WebSocketLike,
  request: Request,
  init: WebSocketStreamInit<TOffset>,
): void {
  const logger = resolveDebugOption(init.debug)
  const activeTurns = new Map<string, AbortController>()
  const heartbeatMs = init.heartbeatMs ?? 30_000
  const idleTimeoutMs = init.idleTimeoutMs ?? 300_000
  let lastActivity = Date.now()

  const heartbeat = setInterval(() => {
    socket.send(JSON.stringify({ type: 'ping' }))
  }, heartbeatMs)
  const idle = setInterval(
    () => {
      if (Date.now() - lastActivity > idleTimeoutMs) socket.close(1000, 'idle')
    },
    Math.min(idleTimeoutMs, 30_000),
  )

  socket.addEventListener('close', () => {
    for (const controller of activeTurns.values()) controller.abort()
    activeTurns.clear()
    clearInterval(heartbeat)
    clearInterval(idle)
  })

  socket.addEventListener('message', (event: { data: unknown }) => {
    if (typeof event.data !== 'string') return
    lastActivity = Date.now()

    // Inbound frames are client-controlled: a malformed frame (bad JSON, or
    // valid JSON that isn't an AG-UI RunAgentInput/abort shape) must be
    // dropped, not crash the socket or leak an unhandled rejection.
    let frame: InboundFrame
    try {
      frame = decodeWsFrame(event.data)
    } catch (error) {
      logger.errors('Failed to decode inbound WS frame; dropping it', {
        error,
      })
      return
    }

    if (frame.kind === 'abort') {
      activeTurns.get(frame.runId)?.abort()
      return
    }

    handleInbound(frame.input).catch((error: unknown) => {
      logger.errors('Failed to handle inbound WS run frame; dropping it', {
        error,
      })
    })
  })

  async function handleInbound(input: unknown): Promise<void> {
    const params = await chatParamsFromRequestBody(input)
    const turnAbort = new AbortController()
    activeTurns.set(params.runId, turnAbort)
    const ctx: WsRunContext = {
      messages: params.messages,
      threadId: params.threadId,
      runId: params.runId,
      forwardedProps: params.forwardedProps,
      resumeOffset: null,
      request: buildTurnRequest(request, params.runId, null),
      signal: turnAbort.signal,
    }
    try {
      if (init.durability) {
        const adapter = init.durability(ctx)
        const { source, getId } = durableStreamSource(init.onRun(ctx), adapter, {
          abortController: turnAbort,
          ...(init.batch === undefined ? {} : { batch: init.batch }),
          logger,
        })
        for await (const chunk of source) {
          socket.send(encodeWsFrame(chunk, getId(chunk)))
        }
      } else {
        for await (const chunk of init.onRun(ctx)) {
          socket.send(encodeWsFrame(chunk, undefined))
        }
      }
    } finally {
      // Only delete if this turn still owns the entry: a duplicate in-flight
      // runId (e.g. a client resubmitting before the first turn finished)
      // would otherwise let the OLDER turn's cleanup delete the NEWER turn's
      // still-active controller (TOCTOU).
      if (activeTurns.get(params.runId) === turnAbort) {
        activeTurns.delete(params.runId)
      }
    }
  }
}

/**
 * A resume is served entirely from the durability log, so there is no
 * producer to iterate. This empty source satisfies `durableStreamSource`'s
 * signature; on a resume it replays from the log and never touches this.
 * Mirrors the private helper of the same name in `stream-to-response.ts`.
 */
function emptyDurableSource(): AsyncIterable<StreamChunk> {
  return (async function* () {})()
}

/**
 * Read-only replay of a run's durability log over a socket (mirrors
 * `resumeServerSentEventsResponse`). The adapter captures the offset from the
 * request (`?offset`/`Last-Event-ID`); no model runs. Closes 1008 when there
 * is nothing to resume.
 */
export function resumeWebSocketStream<TOffset extends string = string>(
  socket: WebSocketLike,
  options: {
    adapter: StreamDurability<TOffset>
    batch?: number
    debug?: DebugOption
  },
): void {
  const logger = resolveDebugOption(options.debug)
  if (options.adapter.resumeFrom() === null) {
    socket.close(1008, 'no resume offset')
    return
  }
  const abortController = new AbortController()
  socket.addEventListener('close', () => abortController.abort())
  const { source, getId } = durableStreamSource(
    emptyDurableSource(),
    options.adapter,
    {
      abortController,
      ...(options.batch === undefined ? {} : { batch: options.batch }),
      logger,
    },
  )
  void (async () => {
    for await (const chunk of source) {
      socket.send(encodeWsFrame(chunk, getId(chunk)))
    }
  })().catch((error: unknown) => {
    logger.errors('resume websocket replay failed', { error })
    try {
      socket.close(1011, 'resume failed')
    } catch {
      // socket already closing/closed — nothing to do
    }
  })
}

interface WebSocketPairCtor {
  new (): { 0: unknown; 1: WebSocketLike & { accept?: () => void } }
}

function upgradeOrThrow(helper: string): {
  client: unknown
  server: WebSocketLike
} {
  const Pair = (globalThis as { WebSocketPair?: WebSocketPairCtor })
    .WebSocketPair
  if (!Pair) {
    throw new Error(
      `${helper} requires a runtime with WebSocketPair (Cloudflare Workers/Durable Objects). ` +
        `On other runtimes upgrade the socket yourself and call ${helper.replace('Response', 'Stream')}.`,
    )
  }
  const pair = new Pair()
  const server = pair[1]
  server.accept?.()
  return { client: pair[0], server }
}

function upgradeResponse(client: unknown): Response {
  return new Response(null, {
    status: 101,
    // Cloudflare-specific field; typed loosely to avoid a DOM lib dependency.
    webSocket: client,
  } as ResponseInit & { webSocket: unknown })
}

/**
 * Cloudflare/Deno wrapper: creates a `WebSocketPair`, accepts the server
 * socket, delegates to {@link toWebSocketStream}, and returns the 101
 * upgrade `Response` carrying the client socket. Throws when the runtime has
 * no `WebSocketPair` (e.g. Node) — upgrade the socket yourself and call
 * {@link toWebSocketStream} directly there.
 */
export function toWebSocketResponse<TOffset extends string = string>(
  request: Request,
  init: WebSocketStreamInit<TOffset>,
): Response {
  const { client, server } = upgradeOrThrow('toWebSocketResponse')
  toWebSocketStream(server, request, init)
  return upgradeResponse(client)
}

/**
 * Cloudflare/Deno wrapper: creates a `WebSocketPair`, accepts the server
 * socket, delegates to {@link resumeWebSocketStream}, and returns the 101
 * upgrade `Response` carrying the client socket. Throws when the runtime has
 * no `WebSocketPair` (e.g. Node) — upgrade the socket yourself and call
 * {@link resumeWebSocketStream} directly there.
 *
 * @example
 * ```ts
 * resumeWebSocketResponse({ adapter: memoryStream(request) })
 * ```
 */
export function resumeWebSocketResponse<TOffset extends string = string>(
  options: {
    adapter: StreamDurability<TOffset>
    batch?: number
    debug?: DebugOption
  },
): Response {
  const { client, server } = upgradeOrThrow('resumeWebSocketResponse')
  resumeWebSocketStream(server, options)
  return upgradeResponse(client)
}
