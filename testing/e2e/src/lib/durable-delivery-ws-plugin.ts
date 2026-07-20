import { WebSocketServer } from 'ws'
import {
  memoryStream,
  resumeWebSocketStream,
  toWebSocketStream,
} from '@tanstack/ai'
import { fixedRun } from '../routes/api.durable-delivery'
import type { Plugin } from 'vite'
import type { WebSocketLike } from '@tanstack/ai'

/**
 * A Vite dev-server plugin exposing a WebSocket arm of the provider-free
 * delivery-durability harness (see `api.durable-delivery.ts` for the SSE/
 * NDJSON arms — same `fixedRun` sequence, same `memoryStream` durability
 * sink). The e2e app is served by Vite/Nitro on plain Node, which has no
 * `WebSocketPair`, so `toWebSocketResponse`/`resumeWebSocketResponse` (the
 * CF/Deno wrapper) can't be used here. Instead this hooks the underlying
 * Node http server's `upgrade` event directly — the same pattern
 * `examples/ts-group-chat/chat-server/vite-plugin.ts` uses for its Cap'n Web
 * socket — obtains a server socket via `ws`'s `WebSocketServer({ noServer:
 * true })`, and hands it to `toWebSocketStream`/`resumeWebSocketStream`.
 *
 * Exempt from the aimock policy: this streams the same fixed AG-UI sequence
 * as the SSE/NDJSON arms and never reaches an LLM provider's HTTP layer.
 *
 * Wire protocol (mirrors `stream-to-websocket.ts`):
 * - Connect to `/api/durable-delivery-ws?runId=<id>` and send one
 *   `RunAgentInput`-shaped JSON frame to start a fresh run — frames come back
 *   as `{ id, chunk }` envelopes (durable) or bare chunks, plus periodic
 *   `{ type: 'ping' }` heartbeats to ignore.
 * - Connect to `/api/durable-delivery-ws?runId=<id>&offset=<lastId>` to
 *   resume: no input frame is sent, the log replays strictly after `offset`.
 */
const WS_PATH = '/api/durable-delivery-ws'

export function durableDeliveryWebSocketPlugin(): Plugin {
  return {
    name: 'durable-delivery-websocket-plugin',
    enforce: 'pre',
    configureServer(server) {
      if (!server.httpServer) return
      const wss = new WebSocketServer({ noServer: true })

      server.httpServer.on('upgrade', (req, socket, head) => {
        const url = new URL(
          req.url ?? '/',
          `http://${req.headers.host ?? 'localhost'}`,
        )
        if (url.pathname !== WS_PATH) return

        wss.handleUpgrade(req, socket, head, (ws) => {
          const request = new Request(url)
          // `ws`'s WebSocket implements the WHATWG send/close/addEventListener/
          // bufferedAmount surface `WebSocketLike` needs.
          const socketLike = ws as unknown as WebSocketLike

          if (url.searchParams.get('offset') !== null) {
            resumeWebSocketStream(socketLike, {
              adapter: memoryStream(request),
            })
          } else {
            toWebSocketStream(socketLike, request, {
              durability: (ctx) => memoryStream(ctx.request),
              onRun: ({ runId, threadId }) => fixedRun(threadId, runId),
            })
          }
        })
      })
    },
  }
}
