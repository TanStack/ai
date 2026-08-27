import { chatParamsFromRequestBody } from './utilities/chat-params'
import { durableStreamSource, runErrorChunk } from './stream-to-response'
import { toWireChunk } from './strip-to-spec-middleware'
import { resolveDebugOption } from './logger/resolve'
import type { StreamDurability } from './stream-durability'
import type { DebugOption } from './logger/types'
import type { ModelMessage, StreamChunk, UIMessage } from './types'

export interface WebSocketLike {
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  addEventListener: {
    (type: 'message', handler: (ev: { data: unknown }) => void): void
    (type: 'close' | 'error', handler: () => void): void
  }
}

/** One inbound WS text frame, after JSON parse + shape discrimination. */
export type InboundFrame =
  | { kind: 'run'; input: unknown }
  | { kind: 'abort'; runId: string }

export function encodeWsFrame(
  chunk: StreamChunk,
  id: string | undefined,
): string {
  const wire = toWireChunk(chunk)
  return JSON.stringify(id === undefined ? wire : { id, chunk: wire })
}

export function decodeWsFrame(data: string): InboundFrame {
  const parsed: unknown = JSON.parse(data)
  const isInvalidParsed =
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { type?: unknown }).type === 'abort' &&
    typeof (parsed as { runId?: unknown }).runId === 'string'
  if (isInvalidParsed) {
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
  /** Synthetic per-turn request carrying `?runId=` so durability keys correctly. */
  request: Request
  /** Aborts on socket close or an `abort` control frame for this run. */
  signal: AbortSignal
}

export function buildTurnRequest(handshake: Request, runId: string): Request {
  const url = new URL(handshake.url)
  url.searchParams.set('runId', runId)
  url.searchParams.delete('offset')
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
  idleTimeoutMs?: number
  debug?: DebugOption
}

export function toWebSocketStream<TOffset extends string = string>(
  socket: WebSocketLike,
  request: Request,
  init: WebSocketStreamInit<TOffset>,
): void {
  const logger = resolveDebugOption(init.debug)
  const activeTurns = new Map<string, AbortController>()
  const earlyAborts = new Set<string>()
  const heartbeatMs = init.heartbeatMs ?? 30_000
  const idleTimeoutMs = init.idleTimeoutMs ?? 300_000
  let lastActivity = Date.now()
  let closed = false

  const heartbeat = setInterval(() => {
    try {
      socket.send(JSON.stringify({ type: 'ping' }))
    } catch {}
  }, heartbeatMs)
  const idle = setInterval(
    () => {
      const isEmptyActiveTurns =
        activeTurns.size === 0 && Date.now() - lastActivity > idleTimeoutMs
      if (isEmptyActiveTurns) {
        socket.close(1000, 'idle')
      }
    },
    Math.min(idleTimeoutMs, 30_000),
  )

  function teardown(): void {
    closed = true
    const turnControllers = activeTurns.values()
    for (const controller of turnControllers) controller.abort()
    activeTurns.clear()
    clearInterval(heartbeat)
    clearInterval(idle)
  }

  socket.addEventListener('close', teardown)
  socket.addEventListener('error', () => {
    logger.errors('WebSocket errored; aborting its turns')
    teardown()
    try {
      socket.close(1011, 'socket error')
    } catch {
      // socket already closing/closed — nothing to do
    }
  })

  socket.addEventListener('message', (event: { data: unknown }) => {
    if (typeof event.data !== 'string') return
    lastActivity = Date.now()

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
      const turn = activeTurns.get(frame.runId)
      if (turn) turn.abort()
      else earlyAborts.add(frame.runId)
      return
    }

    void handleInbound(frame.input)
  })

  function sendRunError(error: unknown): void {
    try {
      socket.send(encodeWsFrame(runErrorChunk(error), undefined))
    } catch {
      // Socket is CLOSING/CLOSED — the client sees onclose instead.
    }
  }

  async function handleInbound(input: unknown): Promise<void> {
    let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
    try {
      params = await chatParamsFromRequestBody(input)
    } catch (error) {
      logger.errors('Invalid inbound WS run frame; dropping it', { error })
      sendRunError(error)
      return
    }
    if (closed) return
    const turnAbort = new AbortController()
    activeTurns.get(params.runId)?.abort()
    activeTurns.set(params.runId, turnAbort)
    if (earlyAborts.delete(params.runId)) turnAbort.abort()
    const ctx: WsRunContext = {
      messages: params.messages,
      threadId: params.threadId,
      runId: params.runId,
      forwardedProps: params.forwardedProps,
      request: buildTurnRequest(request, params.runId),
      signal: turnAbort.signal,
    }
    try {
      if (init.durability) {
        const adapter = init.durability(ctx)
        const { source, getId } = durableStreamSource(
          init.onRun(ctx),
          adapter,
          {
            abortController: turnAbort,
            ...(init.batch === undefined ? {} : { batch: init.batch }),
            logger,
          },
        )
        for await (const chunk of source) {
          socket.send(encodeWsFrame(chunk, getId(chunk)))
        }
      } else {
        const chunks = init.onRun(ctx)
        for await (const chunk of chunks) {
          socket.send(encodeWsFrame(chunk, undefined))
        }
      }
    } catch (error) {
      // An aborted turn (socket close, abort frame, same-runId resubmit) is
      // expected teardown, not a turn failure — nothing to report.
      if (!turnAbort.signal.aborted) {
        logger.errors('WS turn failed', { error })
        sendRunError(error)
      }
    } finally {
      if (activeTurns.get(params.runId) === turnAbort) {
        activeTurns.delete(params.runId)
      }
    }
  }
}

function emptyDurableSource(): AsyncIterable<StreamChunk> {
  return (async function* () {})()
}

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
  // An `error` with no listener is an uncaught exception on `ws`; abort the
  // replay so the pump below stops instead of writing to a dead socket.
  socket.addEventListener('error', () => abortController.abort())
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
    try {
      socket.close(1000)
    } catch {
      // socket already closing/closed — nothing to do
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

export function toWebSocketResponse<TOffset extends string = string>(
  request: Request,
  init: WebSocketStreamInit<TOffset>,
): Response {
  const { client, server } = upgradeOrThrow('toWebSocketResponse')
  toWebSocketStream(server, request, init)
  return upgradeResponse(client)
}

export function resumeWebSocketResponse<
  TOffset extends string = string,
>(options: {
  adapter: StreamDurability<TOffset>
  batch?: number
  debug?: DebugOption
}): Response {
  const { client, server } = upgradeOrThrow('resumeWebSocketResponse')
  resumeWebSocketStream(server, options)
  return upgradeResponse(client)
}
