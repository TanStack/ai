---
title: Connection Adapters
id: connection-adapters
order: 3
description: "Connect TanStack AI clients to SSE, NDJSON, server functions, RPC, or subscription transports."
keywords:
  - tanstack ai
  - connection adapters
  - sse
  - server-sent events
  - ndjson
  - websocket
---

# Connection Adapters

A connection adapter owns the client-to-server transport. Pass exactly one of
`connection` or `fetcher` to `useChat`.

| Adapter | Server response | Resume support |
| --- | --- | --- |
| `fetchServerSentEvents` | `text/event-stream` | Yes, when SSE events carry durability-owned `id:` values |
| `fetchHttpStream` | newline-delimited JSON | No |
| `stream` | `ReadableStream` or `AsyncIterable` | No built-in reconnect |
| `rpcStream` | application RPC stream | Defined by the RPC implementation |
| custom `subscribe` / `send` | WebSocket or another persistent transport | Defined by the adapter |

NDJSON is only an HTTP framing format. It is not tied to the sandbox harness
and does not provide resumable offsets. Delivery resumability is currently an
SSE feature.

## Server-Sent Events

Create a server endpoint that returns `toServerSentEventsResponse(...)`:

```ts
// app/api/chat/route.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
  })

  return toServerSentEventsResponse(stream)
}
```

Connect from React:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <button onClick={() => void chat.sendMessage('Hello')}>
      Send
    </button>
  )
}
```

The adapter sends AG-UI `RunAgentInput`, parses each SSE `data:` event, and
passes the event to the chat client. `stop()` aborts the active request.

### Headers and dynamic options

The URL may be static or resolved for each request. Options may also be static,
synchronous, or asynchronous, which supports rotating credentials.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

declare function getAccessToken(): Promise<string>

export function AuthenticatedChat() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat', async () => ({
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
      },
      credentials: 'include',
      body: { model: 'gpt-5.5' },
    })),
  })

  return <button onClick={() => void chat.sendMessage('Hello')}>Send</button>
}
```

Static adapter `body` values form the base request data. Hook
`forwardedProps`, then per-send data, take precedence over the same keys.

### Resumable SSE

`fetchServerSentEvents` watches SSE `id:` values. If a connection drops after
receiving an id, it reconnects with `Last-Event-ID` and de-duplicates the
replayed prefix. `joinRun(runId)` performs a read-only GET with `offset=-1` and
the run id.

The ids are opaque tokens owned by the server durability adapter. The chat
client does not create, parse, or persist those offsets. See
[Delivery Durability](../persistence/delivery-durability).

## NDJSON over HTTP

Return `toHttpResponse(...)` from the server:

```ts
// app/api/chat-ndjson/route.ts
import { chat, chatParamsFromRequest, toHttpResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  return toHttpResponse(
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: params.messages,
      threadId: params.threadId,
      runId: params.runId,
      ...(params.resume ? { resume: params.resume } : {}),
    }),
  )
}
```

Use the matching client adapter:

```tsx
import { fetchHttpStream, useChat } from '@tanstack/ai-react'

export function NdjsonChat() {
  const chat = useChat({
    connection: fetchHttpStream('/api/chat-ndjson'),
  })

  return <button onClick={() => void chat.sendMessage('Hello')}>Send</button>
}
```

`fetchHttpStream` parses one JSON event per line. It honors request aborts but
does not reconnect and does not use resume offsets.

## Direct fetchers and server functions

Use `fetcher` when the framework can call a server function directly. Return a
`Response` with SSE or an `AsyncIterable<StreamChunk>`.

```tsx
import { useChat } from '@tanstack/ai-react'
import { runChat } from './server-functions'

export function ServerFunctionChat() {
  const chat = useChat({
    fetcher: ({ messages, threadId, runId, resume }, { signal }) =>
      runChat({ messages, threadId, runId, resume, signal }),
  })

  return <button onClick={() => void chat.sendMessage('Hello')}>Send</button>
}
```

The hook supplies an `AbortSignal`; forward it so `stop()` reaches the server
function or provider.

## Custom adapters

Implement `connect` for request/response transports:

```ts
import type {
  ConnectConnectionAdapter,
} from '@tanstack/ai-client'
import type { StreamChunk } from '@tanstack/ai'

declare function callRpc(input: {
  messages: unknown
  signal: AbortSignal
}): AsyncIterable<StreamChunk>

const connection: ConnectConnectionAdapter = {
  connect(messages, _data, signal) {
    if (!signal) {
      throw new TypeError('An AbortSignal is required.')
    }
    return callRpc({ messages, signal })
  },
}
```

Use `subscribe` plus `send` for a persistent transport such as a WebSocket.
The subscription yields server events continuously; `send` starts or resumes a
run. If the transport offers replay, its adapter owns that protocol and its
offsets.

## Errors and cancellation

Connection adapters throw on non-successful HTTP responses and malformed
stream data. `useChat` exposes the resulting `error` and calls `onError`.
Calling `stop()` aborts the current client request. For durable SSE, the server
also terminalizes the durability log during a caught cancellation or error;
literal process death requires an external lease or reaper. See
[Delivery Durability](../persistence/delivery-durability#process-death).
