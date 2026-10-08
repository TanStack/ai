---
title: Transports
id: transports-overview
order: 1
description: "Pick how TanStack AI sends chat chunks from your server to useChat: SSE, HTTP stream, WebSockets, React Native, server functions, or your own transport."
keywords:
  - tanstack ai
  - transports
  - connection adapters
  - streaming transport
  - sse
  - http stream
  - websocket
  - server functions
  - cancellation
  - error handling
redirect_from:
  - /chat/connection-adapters
---

Your chat must get chunks from the server to the UI. The best way to do that depends on where your code runs: a web server, an edge runtime, a phone, or one process.

TanStack AI works with all of them. A connection adapter is the only part that touches the network. Chunk processing, messages, tool calls, and UI updates work the same on every transport.

Pass the adapter to `useChat` as `connection`:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});
```

For the full server and client path, see [Streaming](../chat/streaming).

## Pick a transport

| You have | Use | Page |
| --- | --- | --- |
| A normal HTTP server | `fetchServerSentEvents` | [Server-Sent Events](./sse) |
| A runtime or proxy that blocks SSE | `fetchHttpStream` | [HTTP Stream](./http-stream) |
| A host or proxy that buffers or breaks streams, or you want one response per run | `fetchJson` | [JSON](./json) |
| React Native or Expo | `xhrHttpStream` or `xhrServerSentEvents` | [React Native](./react-native) |
| A function that returns an `AsyncIterable<StreamChunk>` synchronously (in-process `chat()`, an RSC stream, tests) | `stream` | [Server Functions](./server-functions#in-process-streams) |
| An async function, such as a TanStack Start server function, that resolves to a `Response` or an `AsyncIterable<StreamChunk>` | `fetcher` | [Server Functions](./server-functions#async-functions-with-fetcher) |
| An RPC framework such as Cap'n Web, gRPC-Web, or tRPC | `rpcStream` | [Server Functions](./server-functions#rpc-clients-with-rpcstream) |
| One long-lived, resumable WebSocket for many runs | `webSocket` | [WebSockets](./websockets) |
| BroadcastChannel, postMessage, a shared worker, or a different persistent channel | Your own `subscribe` / `send` adapter | [Custom Transports](./custom#persistent-transports) |
| SSE with a wrapped `fetch` (auth refresh, retries) | `fetchServerSentEvents` with `fetchClient` | [Request Options](./request-options#wrap-fetch) |
| A different protocol, such as HTTP/3 | Your own `connect` adapter | [Custom Transports](./custom#request-scoped-adapters) |

All adapters produce the same `StreamChunk` events ([AG-UI Protocol](../migration/ag-ui-compliance)). The choice changes only the transport.

To send headers, a request body, or an auth token, see [Request Options](./request-options).

## Cancel a run

Every adapter gets an `AbortSignal`. The `stop()` function from `useChat` triggers the signal and aborts the active run:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { stop } = useChat({ connection: fetchServerSentEvents("/api/chat") });
stop(); // aborts the active stream
```

- **Built-in adapters** pass the signal to `fetch`.
- **Custom adapters** must honor the signal themselves.
- **`SubscribeConnectionAdapter`**: the signal in `subscribe()` ends the full subscription (for example, on unmount). The signal in `send()` ends only the active send.

The fetch adapters cancel the response body in these cases:

- Parsing fails.
- You exit the chunk iterator early.
- The SSE adapter receives a `[DONE]` marker.

A response that gets to its normal end keeps all of its chunks.

Custom cancellation hooks do not delay errors or early iterator returns. The adapters release the reader lock, also when cancellation fails or stays pending.

## Errors

An adapter throws on a transport error: an HTTP status that is not 2xx, a parse failure, or a dropped socket. The `ChatClient` catches the error. If no `RUN_ERROR` chunk was emitted yet, the client emits one. Then it shows the error through `onError` and the `error` state:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { error } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  onError: (err) => console.error("Chat failed:", err),
});
```

If the connection drops in the middle of a line, the stream adapters throw `StreamTruncatedError`.

Do not catch and hide an `AbortError` in a custom adapter. Let it propagate, so that the client knows the abort worked.

## Best practices

- **Start with SSE.** It works in the most places and is the easiest to debug. Change only when something blocks it.
- **Use `stream()` when you can.** If you control both sides and do not need HTTP, a server function takes less code than a custom adapter.
- **Use `subscribe` / `send` only for a persistent channel.** Then you must handle reconnection, run correlation, and the connection lifecycle yourself.
- **Always honor `abortSignal`.** The client uses it to clean up on unmount and on `stop()`.
- **Emit `RUN_FINISHED` from the server.** Without it, the client does not know that the turn ended. See [Stream Events](../chat/stream-events).

For the full type signatures, see [API Reference: `@tanstack/ai-client`](../api/ai-client).

Pick a row in the table and send a message. The reply streams into `messages` on every transport.
