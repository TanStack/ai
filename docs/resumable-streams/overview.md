---
title: Resumable Streams
id: overview
description: "Reconnect to a running AI response after a refresh or a dropped connection, without a second model call. Add a durability adapter and a GET handler."
keywords:
  - resumable streams
  - resume stream
  - reconnect sse
  - reconnect ndjson
  - delivery durability
  - durable streams
  - last-event-id
---

A resumable stream keeps the reply log when the connection drops. A refresh continues that reply and does not call the model again.

The server records every chunk in a log. The client reconnects and gets only the chunks it missed.

## Quick setup

### 1. Record the stream on the server

Pass a durability adapter to the response, and add a `GET` handler that replays the log:

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: memoryStream(request) },
  })
}

export async function GET(request: Request) {
  // Replays the run from the durability log. No model call happens here.
  return resumeServerSentEventsResponse({ adapter: memoryStream(request) })
}
```

`memoryStream(request)` keeps the log in process memory. It needs no setup, and it is good for development.

### 2. Use any HTTP connection in the client

You do not wire anything. `useChat` reconnects by itself:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
  })
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

Send a long prompt. While the reply streams, turn the network off in your browser dev tools, then turn it on again. The reply continues from where it stopped.

## How it works

- The durability adapter writes every chunk to an ordered log before it sends the chunk.
- Each event gets an opaque offset.
- On reconnect, the client sends the last offset it got. The server replays the log from there.

The log is kept per **run**: one execution from `RUN_STARTED` to `RUN_FINISHED`, not a whole conversation. If threads and runs are new to you, see [Threads and runs](../chat/stream-events#threads-and-runs).

This is the delivery layer. It resumes a live stream. To keep the conversation after a reload or on another device, you need persistence, which is a separate layer. See [Persistence](../persistence/overview). Most apps use both.

## Guard one-time side effects

On a dropped connection, the client reconnects with the same `POST`. The log replays, so the model does not run again. But other work in your handler runs a second time. Examples are a save of the user message, a new run row, or a usage count.

`resumeFrom()` tells you which case you have. It returns the offset on a reconnect, and `null` on a new request. Make the adapter once, check it, then use it for the response:

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
// Your own one-time side effects.
import { countUsage, saveUserMessage } from './db'

export async function POST(request: Request) {
  const durability = memoryStream(request)
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  // null on a new request, an offset on a reconnect. Do one-time work once.
  if (durability.resumeFrom() === null) {
    await saveUserMessage(threadId, messages)
    await countUsage(runId)
  }

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: durability },
  })
}
```

## Pick an adapter for production

`memoryStream` works in one process only. In production, requests reach many processes, so use a shared log:

| Adapter | Package | Use it for |
| --- | --- | --- |
| `memoryStream(request)` | `@tanstack/ai` | Development, one process |
| `durableStream(request, options)` | `@tanstack/ai-durable-stream` | Production, on a [Durable Streams](https://durablestreams.com) backend |
| `upstashStream(request)` | `@upstash/agentkit-tanstack-ai` | Upstash Redis Streams. A third-party adapter, see [Upstash](../community-adapters/upstash#resumable-streams) |

To change adapters, replace `memoryStream(request)`. The rest of the code stays the same.

For a different store (Redis, Postgres, a queue), implement the four-method `StreamDurability` interface. See [Custom Durability Adapter](./custom-adapter).

## Other transports

Each response helper has a matching resume helper for the `GET`:

| Response helper | Format | Resume helper | Client connection |
| --- | --- | --- | --- |
| `toServerSentEventsResponse` | SSE | `resumeServerSentEventsResponse` | `fetchServerSentEvents` or `xhrServerSentEvents` |
| `toHttpResponse` | NDJSON | `resumeHttpResponse` | `fetchHttpStream` or `xhrHttpStream` |
| `toJsonResponse` | One JSON body per request | `resumeJsonResponse` | `fetchJson` |

- The XHR connections work the same way, for runtimes without streaming `fetch`.
- With `fetchJson`, the client polls until the run ends. See [JSON](../transports/json#long-runs-and-reloads).

## Use one WebSocket for the whole chat

SSE and NDJSON open one connection per turn. For one socket that stays open for the full conversation, use `toWebSocketStream` on the server (or `toWebSocketResponse` on Cloudflare), with the `webSocket()` connection in the client:

```ts
import { chat, memoryStream, toWebSocketStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { WebSocketLike } from '@tanstack/ai'

// `socket` is a server socket that you already accepted (see WebSockets for
// Node and Cloudflare) and `request` is the handshake request.
export function handleChatSocket(socket: WebSocketLike, request: Request) {
  toWebSocketStream(socket, request, {
    durability: (ctx) => memoryStream(ctx.request),
    onRun: ({ messages, threadId, runId }) =>
      chat({ adapter: openaiText('gpt-6.1-sol'), messages, threadId, runId }),
  })
}
```

```tsx
import { useChat, webSocket } from '@tanstack/ai-react'

const connection = webSocket('/api/chat-ws')

export function Chat() {
  const { sendMessage } = useChat({ connection, threadId: 'support-chat' })
  return <button onClick={() => void sendMessage('Hello')}>Send</button>
}
```

A dropped socket opens again with the last offset and replays only what is missing. But closing the socket stops the run on the server, so the replay ends at the drop. The reply does not continue. [WebSockets](./websockets) covers the wire protocol, reconnects, and hosting.

## Let another host take over a sandbox run

The `GET` above only *replays*. The `POST` that started the run produces the chunks, so if that host stops, the log stops growing.

A sandboxed coding agent does work that outlives the request that started it. For that case, the same `GET` can take the run over and keep it going. Pass `driver: sandboxRunDriver({ ... })` next to the adapter. See [Takeover & Detached Runs](../sandbox/takeover).

## Advanced

[Advanced](./advanced) covers these topics:

- The durability contract, and how terminal events and errors work.
- Reconnect tuning.
- How to attach to a run by id.
- Cloudflare deployment, and what happens when a process stops in production.
