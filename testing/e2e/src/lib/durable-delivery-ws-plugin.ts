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
 * Cloudflare wrapper) can't be used here. Instead this hooks the underlying
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
 * - `?dropAfter=<n>` (fresh runs only) simulates a mid-run connection drop for
 *   the client-adapter reconnect e2e: the server closes the socket after
 *   forwarding n frames while the run keeps producing into the durability
 *   log, so the client's auto-reconnect can replay the remainder.
 */
const WS_PATH = '/api/durable-delivery-ws'

/**
 * Wrap a socket so the client sees the connection drop after `dropAfter`
 * outbound frames. Later frames are swallowed BY DESIGN (they're the "frames
 * lost to a dead connection" half of the simulation) while the producer keeps
 * appending them to the durability log; once the terminal frame has been
 * produced (the log is complete) the socket closes, so the client's
 * auto-reconnect deterministically replays the full remainder from the log.
 */
function dropAfterSocket(ws: WebSocketLike, dropAfter: number): WebSocketLike {
  let sent = 0
  const addEventListener: WebSocketLike['addEventListener'] = (
    type: 'message' | 'close' | 'error',
    handler: (ev: { data: unknown }) => void,
  ) => {
    if (type === 'message') ws.addEventListener(type, handler)
    else ws.addEventListener(type, () => handler({ data: undefined }))
  }
  return {
    send: (data) => {
      sent += 1
      if (sent <= dropAfter) {
        ws.send(data)
        return
      }
      if (data.includes('RUN_FINISHED')) ws.close()
    },
    close: (code, reason) => ws.close(code, reason),
    addEventListener,
  }
}

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
          // `ws`'s socket satisfies WebSocketLike structurally — no adapter
          // (and no runtime guard) needed.
          const request = new Request(url)
          if (url.searchParams.get('offset') !== null) {
            resumeWebSocketStream(ws, {
              adapter: memoryStream(request),
            })
          } else {
            const dropAfter = Number(url.searchParams.get('dropAfter'))
            toWebSocketStream(
              dropAfter > 0 ? dropAfterSocket(ws, dropAfter) : ws,
              request,
              {
                durability: (ctx) => memoryStream(ctx.request),
                onRun: ({ runId, threadId }) => fixedRun(threadId, runId),
              },
            )
          }
        })
      })
    },
  }
}
