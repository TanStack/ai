---
title: WebSockets
id: websockets
description: "Run resumable streams over one full-duplex WebSocket instead of a request per turn: toWebSocketStream/toWebSocketResponse on the server, webSocket() on the client, resume via a URL query, and hosting on Node or Cloudflare."
keywords:
  - websocket transport
  - toWebSocketStream
  - toWebSocketResponse
  - resumeWebSocketStream
  - resumeWebSocketResponse
  - full-duplex chat
  - conversation-scoped socket
  - websocket reconnect
  - websocket heartbeat
---

# WebSockets

SSE and NDJSON open one connection per turn. A WebSocket is different: one
socket stays open for the whole conversation, carries every turn, and lets the
server push chunks without waiting on a request. Reach for it when you want a
persistent channel instead of a request-per-message model: a WebSocket
gateway you already run, a mobile client that wants to avoid repeated
handshakes, or a UI that needs the server to push outside of a reply (this page
only covers the request/reply case; server-initiated pushes need your own
framing on top).

By the end of this page you can run a chat turn over a socket that resumes
after a drop, without re-running the model.

## The shape of it

One socket, many turns:

1. The client opens the socket once.
2. Each user message becomes one JSON frame sent over the socket (the same
   shape as the SSE/NDJSON POST body).
3. The server runs one `chat()` turn per frame and streams the chunks back
   over the same socket.
4. The socket stays open after `RUN_FINISHED` (waiting for the next frame)
   until the client closes it, an idle timeout fires, or the process aborts.

## Server: `onRun`

Pair the socket you already accepted with `toWebSocketStream`. It decodes
inbound frames, starts one `chat()` turn per frame through `onRun`, and pumps
the resulting chunks back out:

```ts
import { chat, memoryStream, toWebSocketStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { WebSocketLike } from '@tanstack/ai'

// Bridge the per-turn AbortSignal WsRunContext hands you into the
// AbortController chat() expects.
function abortControllerFromSignal(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  if (signal.aborted) controller.abort()
  else signal.addEventListener('abort', () => controller.abort(), { once: true })
  return controller
}

// `socket` is a WHATWG-shaped server socket you already accepted (see
// "Hosting" below for where it comes from on Node vs Cloudflare) and
// `request` is the original handshake request.
export function handleChatSocket(socket: WebSocketLike, request: Request) {
  toWebSocketStream(socket, request, {
    // Per-turn durability, keyed by the frame's runId (see "Durability is
    // per turn" below).
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
```

`onRun` receives one `WsRunContext` per inbound frame:

| Field | What it is |
| --- | --- |
| `messages` | The turn's `UIMessage[]` / `ModelMessage[]`, decoded from the frame. |
| `threadId` / `runId` | The AG-UI identifiers for this turn. |
| `forwardedProps` | Any extra data the client sent with the frame. |
| `resumeOffset` | Always `null` for a fresh turn on this socket (a resume goes through `resumeWebSocketStream` instead, see below). |
| `request` | A synthetic per-turn `Request` carrying `?runId=` in its URL, for keying a durability adapter. |
| `signal` | Aborts when the socket closes, or when this turn receives an `abort` frame (see below). It does not abort other turns on the same socket. |

Skip `durability` entirely for a socket that doesn't need to survive a drop.
`toWebSocketStream` still pumps chunks, it just can't replay them on
reconnect.

## Client: `webSocket()`

`webSocket()` is a `SubscribeConnectionAdapter` for `useChat` (also exported
from `@tanstack/ai-solid`, `@tanstack/ai-vue`, `@tanstack/ai-svelte`, and
`@tanstack/ai-angular`). It opens the socket lazily on the first
`sendMessage`, and reuses it for every later turn in the conversation:

```tsx
import { useChat, webSocket } from '@tanstack/ai-react'

const connection = webSocket('/api/chat-ws')

export function Chat() {
  const { messages, sendMessage } = useChat({ connection })

  return <button onClick={() => void sendMessage('Hello')}>Send</button>
}
```

Nothing else changes: `messages`, `sendMessage`, `stop()`, tool calls, and
persistence all work the same as with any other connection adapter. See
[Connection Adapters](../chat/connection-adapters) for the full option set
(`protocols`, `body`, `reconnect`, `WebSocketImpl`).

## Wire protocol

| Direction | Frame | Meaning |
| --- | --- | --- |
| Client → server | A `RunAgentInput`-shaped JSON object (same shape as the SSE/NDJSON POST body) | Start one `chat()` turn. |
| Client → server | `{ "type": "abort", "runId": "…" }` | Abort one in-flight turn (see below). |
| Server → client | `{ "id": "…", "chunk": <StreamChunk> }` | One chunk, tagged with a durability offset (only when `durability` is configured). |
| Server → client | A bare `StreamChunk` | One chunk, untagged (no `durability` configured). |
| Server → client | `{ "type": "ping" }` | Heartbeat. `webSocket()` drops these automatically; a hand-rolled client should ignore anything with `type: "ping"`. |

The two server→client shapes are unambiguous: the envelope never has a
top-level `type`, and every bare `StreamChunk` does.

## Resume rides in the URL, not a header

SSE and NDJSON resume with the `Last-Event-ID` header, because a `fetch`/XHR
request can set arbitrary headers before it opens. A browser's `WebSocket`
constructor cannot set custom headers on the handshake, so the offset instead
rides in the URL: `?runId=<id>&offset=<lastId>`.

`webSocket()` handles this for you. If the socket drops before a run's
terminal chunk (`RUN_FINISHED` / `RUN_ERROR`) and that run was durable
(offset-tagged envelopes), it reopens at `?runId=&offset=` and de-dupes the
replayed boundary, the same reconnect guarantee `fetchServerSentEvents` gives
you, just carried differently on the wire. A run that never emitted an offset
(no `durability` configured) has nothing to resume from: the drop surfaces as
a connection error instead of retrying forever.

On the server, a URL carrying `?offset=` is a resume, not a fresh turn. Route
it to `resumeWebSocketStream`, a read-only replay of the durability log with
no model call:

```ts
import { memoryStream, resumeWebSocketStream } from '@tanstack/ai'
import type { WebSocketLike } from '@tanstack/ai'

export function handleResumeSocket(socket: WebSocketLike, request: Request) {
  resumeWebSocketStream(socket, { adapter: memoryStream(request) })
}
```

`resumeWebSocketStream` closes the socket with code `1008` if the request
carries no resume offset: there's nothing to replay.

## Durability is per turn

A conversation-scoped socket carries many turns, so its durability adapter
can't be built once for the whole connection. Each turn needs its own log,
keyed by that turn's `runId`. That's why `durability` in `toWebSocketStream`
is a factory, not a value: it receives the per-turn `ctx` and reads
`ctx.request`, whose URL already carries that turn's `?runId=`
(`memoryStream`/`durableStream` key off it automatically).

## Abort a turn

An `{ type: 'abort', runId }` frame aborts only that turn's `onRun` iteration
(`ctx.signal` fires); the socket itself stays open for the next turn. This is
a protocol-level primitive: the built-in `webSocket()` client adapter does not
send this frame on `stop()` today, so `stop()` only stops the client from
processing further chunks for that run locally, without telling the server to
cancel the model call. If you need the server to actually stop generating,
send the frame yourself over a reference to the socket, or drive the protocol
directly the way the e2e suite's raw-`WebSocket` tests do.

Closing the whole socket aborts every turn still in flight on it.

## Heartbeat and idle timeout

`toWebSocketStream` sends a `{ type: 'ping' }` frame every `heartbeatMs`
(default 30 seconds) to keep the connection alive through proxies that drop
idle sockets. It closes the socket if no inbound frame arrives for
`idleTimeoutMs` (default 5 minutes); a heartbeat itself doesn't count as
activity, only a client-sent frame does:

```ts
import { chat, toWebSocketStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { WebSocketLike } from '@tanstack/ai'

function handleChatSocket(socket: WebSocketLike, request: Request) {
  toWebSocketStream(socket, request, {
    onRun: ({ messages, threadId, runId }) =>
      chat({ adapter: openaiText('gpt-5.5'), messages, threadId, runId }),
    heartbeatMs: 15_000,
    idleTimeoutMs: 60_000,
  })
}
```

## Hosting on Node

Plain Node (and anywhere else without a global `WebSocketPair`) has no
built-in way to accept a WebSocket upgrade, so you do it yourself and hand the
result to `toWebSocketStream`. The pattern: hook the HTTP server's `upgrade`
event, accept the socket with [`ws`](https://github.com/websockets/ws)'s
`WebSocketServer({ noServer: true })`, and pass the resulting socket straight
through. `ws`'s socket already implements the `send`/`close`/
`addEventListener`/`bufferedAmount` surface `WebSocketLike` needs:

```ts ignore
import { WebSocketServer } from 'ws'
import { memoryStream, resumeWebSocketStream, toWebSocketStream } from '@tanstack/ai'
import type { Plugin } from 'vite'
import type { WebSocketLike } from '@tanstack/ai'
import { handleChatSocket } from './handle-chat-socket'

const WS_PATH = '/api/chat-ws'

export function webSocketChatPlugin(): Plugin {
  return {
    name: 'websocket-chat-plugin',
    configureServer(server) {
      if (!server.httpServer) return
      const wss = new WebSocketServer({ noServer: true })

      server.httpServer.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
        if (url.pathname !== WS_PATH) return

        wss.handleUpgrade(req, socket, head, (ws) => {
          const request = new Request(url)
          const socketLike = ws as unknown as WebSocketLike

          if (url.searchParams.get('offset') !== null) {
            resumeWebSocketStream(socketLike, { adapter: memoryStream(request) })
          } else {
            handleChatSocket(socketLike, request)
          }
        })
      })
    },
  }
}
```

This is the same pattern used by the working
[`examples/ts-react-chat`](https://github.com/TanStack/ai/blob/main/examples/ts-react-chat/src/lib/websocket-chat-plugin.ts)
WebSocket example and by the e2e suite's
[`durable-delivery-ws-plugin.ts`](https://github.com/TanStack/ai/blob/main/testing/e2e/src/lib/durable-delivery-ws-plugin.ts).
Bun's `ServerWebSocket` and Deno's `Deno.upgradeWebSocket` need the same shape
of adapter: accept the platform's socket, then call `toWebSocketStream` /
`resumeWebSocketStream` with it.

## Hosting on Cloudflare

Cloudflare Workers (and Durable Objects) expose a global `WebSocketPair`, so
you don't upgrade anything by hand. `toWebSocketResponse` creates the pair,
accepts the server half, wires it to `toWebSocketStream`, and returns the 101
upgrade `Response` for you:

```ts
import { chat, toWebSocketResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export default {
  fetch(request: Request): Response {
    return toWebSocketResponse(request, {
      onRun: ({ messages, threadId, runId }) =>
        chat({ adapter: openaiText('gpt-5.5'), messages, threadId, runId }),
    })
  },
}
```

`resumeWebSocketResponse({ adapter })` is the matching read-only wrapper for a
`?offset=` resume. Both throw with a message pointing at their `*Stream`
counterpart if called somewhere without `WebSocketPair` (Node, for instance),
so there's no way to accidentally ship the Cloudflare wrapper to a runtime
that can't upgrade a socket itself.

## Producer vs. socket lifecycle

The same caveat that applies to SSE and NDJSON applies here: with
`memoryStream`, the run's producer and the delivery socket live in the same
process. If that socket drops, the `chat()` call backing it aborts too, so
reconnecting only replays what was already logged rather than resuming a run
still in progress. `durableStream` decouples the two (the producer runs
against a backend, not the client's socket), so a drop there can reconnect to
a run that's still actively producing. See
[memoryStream in production](./advanced#memorystream-in-production) for the
full explanation. It applies to WebSockets exactly as written there.

## Next steps

- [Overview](./overview): the durability adapter contract this transport
  reuses.
- [Advanced](./advanced): reconnection bounding, offset ownership, and
  Cloudflare Durable Streams deployment, shared across every transport.
- [Connection Adapters](../chat/connection-adapters): where `webSocket()`
  fits among the other client adapters.
