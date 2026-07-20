import { WebSocketServer } from 'ws'
import {
  chat,
  memoryStream,
  resumeWebSocketStream,
  toWebSocketStream,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { Plugin } from 'vite'
import type { WebSocketLike } from '@tanstack/ai'

/**
 * A Vite dev-server plugin exposing a full-duplex WebSocket chat endpoint.
 * This app is served by Vite/Nitro on plain Node, which has no
 * `WebSocketPair`, so `toWebSocketResponse`/`resumeWebSocketResponse` (the
 * CF/Deno wrapper) can't be used here. Instead this hooks the underlying
 * Node http server's `upgrade` event directly — obtains a server socket via
 * `ws`'s `WebSocketServer({ noServer: true })`, and hands it to
 * `toWebSocketStream`/`resumeWebSocketStream`. Mirrors
 * `testing/e2e/src/lib/durable-delivery-ws-plugin.ts`, which uses the same
 * pattern for a provider-free harness.
 *
 * Wire protocol (client side is `webSocket('/api/chat-ws')` from
 * `@tanstack/ai-react`):
 * - Connect to `/api/chat-ws` and send one `RunAgentInput`-shaped JSON frame
 *   per turn to run the model — frames come back as `{ id, chunk }`
 *   envelopes (durable) plus periodic `{ type: 'ping' }` heartbeats.
 * - Connect to `/api/chat-ws?offset=<lastId>` to resume a dropped run: no
 *   input frame is sent, the durability log replays strictly after `offset`.
 */
const WS_PATH = '/api/chat-ws'

/**
 * `chat()` cancels via an `AbortController` it can read `.signal` off of, but
 * `WsRunContext` (the per-turn context `toWebSocketStream` hands `onRun`)
 * only carries the `AbortSignal` half — it aborts on socket close or an
 * `{ type: 'abort', runId }` control frame. Bridge the two by mirroring the
 * signal onto a fresh controller.
 */
function abortControllerFromSignal(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  if (signal.aborted) controller.abort()
  else
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  return controller
}

export function webSocketChatPlugin(): Plugin {
  return {
    name: 'websocket-chat-plugin',
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
              onRun: ({ messages, threadId, runId, signal }) =>
                chat({
                  adapter: openaiText('gpt-5.5'),
                  messages,
                  threadId,
                  runId,
                  abortController: abortControllerFromSignal(signal),
                }),
            })
          }
        })
      })
    },
  }
}
