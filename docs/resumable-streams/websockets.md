---
title: WebSockets
id: websockets
description: "Run resumable streams over one WebSocket for the whole chat. Use toWebSocketStream or toWebSocketResponse on the server and webSocket() in the client. The socket resumes after a drop."
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

`webSocket()` keeps one socket open for the conversation. A durable run reconnects on that socket.

Every turn goes over the socket, and a resume after a drop does not call the model again.

## Quick setup

### 1. Handle a turn on the server

`toWebSocketStream` reads each frame from the client, starts one `chat()` turn through `onRun`, and sends the chunks back:

```ts
// handle-chat-socket.ts
import { chat, memoryStream, toWebSocketStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { WebSocketLike } from '@tanstack/ai'

// Connect the per-turn AbortSignal from WsRunContext to the
// AbortController that chat() expects.
function abortControllerFromSignal(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  if (signal.aborted) controller.abort(signal.reason)
  else
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
    })
  return controller
}

// `socket` is a WHATWG-shaped server socket that you already accepted (see
// step 2) and `request` is the original handshake request.
export function handleChatSocket(socket: WebSocketLike, request: Request) {
  toWebSocketStream(socket, request, {
    // One durability log per turn, keyed by the runId of the frame.
    durability: (ctx) => memoryStream(ctx.request),
    onRun: ({ messages, threadId, runId, signal }) =>
      chat({
        adapter: openaiText('gpt-6.1-sol'),
        messages,
        threadId,
        runId,
        abortController: abortControllerFromSignal(signal),
      }),
  })
}
```

### 2. Accept the socket

How you accept the socket depends on where you host. See [Hosting on Node](#hosting-on-node) or [Hosting on Cloudflare](#hosting-on-cloudflare) below.

### 3. Connect from the client

```tsx
import { useChat, webSocket } from '@tanstack/ai-react'

const connection = webSocket('/api/chat-ws')

export function Chat() {
  const { messages, sendMessage } = useChat({ connection, threadId: 'support-chat' })
  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>{message.role}</div>
      ))}
      <button type="button" onClick={() => void sendMessage('Hello')}>
        Send
      </button>
    </div>
  )
}
```

`webSocket()` opens the socket on the first `sendMessage`, and uses it again for every later turn. The Solid, Vue, Svelte, and Angular packages export it too.

Everything else stays the same: `messages`, `sendMessage`, `stop()`, tool calls, and persistence work as with any other connection.

If the network drops during a reply, the server stops that reply. The client keeps the part it already got. See [Producer vs. socket lifecycle](#producer-vs-socket-lifecycle).

## How it works

One socket carries many turns:

1. The client opens the socket once.
2. Each user message becomes one JSON frame, with the same shape as the SSE or NDJSON `POST` body.
3. The server runs one `chat()` turn for each frame, and streams the chunks back over the same socket.
4. After `RUN_FINISHED`, the socket stays open for the next frame. It closes when the client closes it, an idle timeout fires, or the process aborts.

This page covers request and reply only. For pushes that the server starts by itself, you need your own framing on top.

## Hosting on Node

Plain Node has no global `WebSocketPair`, so it cannot accept a WebSocket upgrade by itself. Accept the socket yourself, then give it to `toWebSocketStream`:

1. Listen to the `upgrade` event of the HTTP server.
2. Accept the socket with `new WebSocketServer({ noServer: true })` from [`ws`](https://github.com/websockets/ws).
3. Pass the socket on. The `ws` socket already has the `send`, `close`, and `addEventListener` methods that `WebSocketLike` needs.

```ts ignore
import { WebSocketServer } from 'ws'
import { memoryStream, resumeWebSocketStream } from '@tanstack/ai'
import type { Plugin } from 'vite'
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
          // The `ws` socket satisfies WebSocketLike as it is. No adapter needed.
          const request = new Request(url)
          if (url.searchParams.get('offset') !== null) {
            resumeWebSocketStream(ws, { adapter: memoryStream(request) })
          } else {
            handleChatSocket(ws, request)
          }
        })
      })
    },
  }
}
```

The [`examples/ts-react-chat`](https://github.com/TanStack/ai/blob/main/examples/ts-react-chat/src/lib/websocket-chat-plugin.ts) WebSocket example and the e2e suite's [`durable-delivery-ws-plugin.ts`](https://github.com/TanStack/ai/blob/main/testing/e2e/src/lib/durable-delivery-ws-plugin.ts) use the same pattern.

Other runtimes follow the same steps: accept the socket of the platform, then call `toWebSocketStream` or `resumeWebSocketStream` with it.

- A socket from `Deno.upgradeWebSocket` is WHATWG-shaped and satisfies `WebSocketLike` directly.
- The Bun `ServerWebSocket` (handler-object API) needs a small adapter first.

## Hosting on Cloudflare

Cloudflare Workers and Durable Objects have a global `WebSocketPair`, so you do not upgrade by hand. `toWebSocketResponse` creates the pair, accepts the server half, connects it to `toWebSocketStream`, and returns the `101` upgrade `Response`:

```ts
import { chat, toWebSocketResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export default {
  fetch(request: Request): Response {
    return toWebSocketResponse(request, {
      onRun: ({ messages, threadId, runId }) =>
        chat({ adapter: openaiText('gpt-6.1-sol'), messages, threadId, runId }),
    })
  },
}
```

`resumeWebSocketResponse({ adapter })` is the matching read-only wrapper for a `?offset=` resume.

If you call either one in a runtime without `WebSocketPair` (Node, for example), it throws. The message points to its `*Stream` version. So you cannot ship the Cloudflare wrapper to a runtime that cannot upgrade a socket.

## Advanced

### The `onRun` context

`onRun` gets one `WsRunContext` for each frame from the client:

| Field | What it is |
| --- | --- |
| `messages` | The `UIMessage[]` or `ModelMessage[]` of the turn, read from the frame. |
| `threadId` / `runId` | The AG-UI ids for this turn. |
| `forwardedProps` | Any extra data that the client sent with the frame. |
| `request` | A synthetic `Request` for the turn, with `?runId=` in its URL. Use it to key a durability adapter. |
| `signal` | Aborts when the socket closes, or when this turn gets an `abort` frame. It does not abort other turns on the same socket. |

If a socket does not need to survive a drop, leave out `durability`. `toWebSocketStream` still sends the chunks, but it cannot replay them on reconnect.

### Client options

| Option | What it does |
| --- | --- |
| `protocols` | WebSocket subprotocols, passed to the `WebSocket` constructor as they are. |
| `body` | Static extra fields added to every outgoing `RunAgentInput` frame. Same as `body` on the HTTP connections. |
| `reconnect` | Reconnect limits (`maxAttempts`, `delayMs`). They work the same as on `fetchServerSentEvents`. See [Advanced](./advanced). |
| `WebSocketImpl` | Your own `WebSocket` implementation, for tests and non-browser runtimes. |

[Transports](../transports/overview) shows where `webSocket()` fits next to the other connections.

### Wire protocol

| Direction | Frame | Meaning |
| --- | --- | --- |
| Client to server | A `RunAgentInput`-shaped JSON object (same shape as the SSE or NDJSON `POST` body) | Start one `chat()` turn. |
| Client to server | `{ "type": "abort", "runId": "..." }` | Abort one running turn. |
| Server to client | `{ "id": "...", "chunk": <StreamChunk> }` | One chunk with a durability offset. Only when `durability` is set. |
| Server to client | A bare `StreamChunk` | One chunk with no offset. When `durability` is not set. |
| Server to client | `{ "type": "ping" }` | Heartbeat. `webSocket()` drops these. A hand-written client must ignore anything with `type: "ping"`. |

The two chunk shapes from the server cannot be confused. The envelope never has a top-level `type`, and every bare `StreamChunk` has one.

### Resume rides in the URL, not a header

SSE and NDJSON resume with the `Last-Event-ID` header, because a `fetch` or XHR request can set headers. The browser `WebSocket` constructor cannot set custom headers on the handshake. So the offset goes in the URL: `?runId=<id>&offset=<lastId>`.

`webSocket()` does this for you:

- A durable run sends envelopes with offsets. If the socket drops before the terminal chunk of that run (`RUN_FINISHED` or `RUN_ERROR`), the client opens the socket again at `?runId=&offset=`. It also removes the duplicate at the replay boundary. This is the same reconnect guarantee as `fetchServerSentEvents`.
- If a run never sent an offset (no `durability`), there is nothing to resume from. The drop shows as a connection error, and the client does not retry forever.

On the server, a URL with `?offset=` is a resume, not a new turn. Send it to `resumeWebSocketStream`. It replays the durability log, read-only, with no model call:

```ts
import { memoryStream, resumeWebSocketStream } from '@tanstack/ai'
import type { WebSocketLike } from '@tanstack/ai'

export function handleResumeSocket(socket: WebSocketLike, request: Request) {
  resumeWebSocketStream(socket, { adapter: memoryStream(request) })
}
```

If the request has no resume offset, `resumeWebSocketStream` closes the socket with code `1008`, because there is nothing to replay.

### Durability is per turn

One socket carries many turns, so you cannot make one durability adapter for the whole connection. Each turn needs its own log, keyed by the `runId` of that turn.

That is why `durability` in `toWebSocketStream` is a factory, not a value. It gets the per-turn `ctx` and reads `ctx.request`. The URL of that request already has the `?runId=` of the turn, and `memoryStream` and `durableStream` read it.

### Abort a turn

An `{ type: 'abort', runId }` frame aborts only the `onRun` work of that turn (`ctx.signal` fires). The socket stays open for the next turn.

The built-in `webSocket()` connection sends this frame when the abort signal of the run fires, for example on `stop()` in `useChat`. So the server stops the generation, and does not run the model call to the end for a client that stopped listening. A hand-written client must send the same frame to cancel a turn.

When the whole socket closes, every turn that still runs on it aborts.

### Heartbeat and idle timeout

`toWebSocketStream` sends a `{ type: 'ping' }` frame every `heartbeatMs` (default 30 seconds). This keeps the connection alive through proxies that drop idle sockets.

It closes the socket if no frame arrives from the client for `idleTimeoutMs` (default 5 minutes).

- A heartbeat does not count as activity. Only a frame from the client counts.
- The idle timeout never fires while a turn still streams. So a long generation, such as an agent loop longer than the timeout, is never cut off.

```ts
import { chat, toWebSocketStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { WebSocketLike } from '@tanstack/ai'

function handleChatSocket(socket: WebSocketLike, request: Request) {
  toWebSocketStream(socket, request, {
    onRun: ({ messages, threadId, runId }) =>
      chat({ adapter: openaiText('gpt-6.1-sol'), messages, threadId, runId }),
    heartbeatMs: 15_000,
    idleTimeoutMs: 60_000,
  })
}
```

### Producer vs. socket lifecycle

On a WebSocket, the producer is tied to the socket. When the socket closes or errors, `toWebSocketStream` aborts every turn on it. That abort stops the `chat()` call behind each turn. This is true with `memoryStream` and with `durableStream`.

So after a drop:

1. The server stops the reply.
2. The durability log keeps the chunks produced up to the drop, then ends with an abort `RUN_ERROR`.
3. A reconnect replays that partial reply. It does not continue the run.

To keep a reply going across a dropped connection, use SSE or NDJSON with `durableStream`. There the producer does not stop when the client goes away. See [memoryStream in production](./advanced#memorystream-in-production).
