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
  messages: Array<ModelMessage> | Array<UIMessage>
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
