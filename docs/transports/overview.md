---
title: Transports
id: transports-overview
order: 1
description: "Pick how your chat gets chunks from the server to useChat: SSE, HTTP stream, JSON, WebSockets, React Native, server functions, or your own transport."
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

A transport carries chunks from the server to `useChat`. Pick one from where the code runs: a web server, an edge runtime, a phone, or one process.

A transport is the one part of the chat that touches the network. You pick it with the `connection` option of `useChat`. Messages, tool calls, and UI updates work the same on every transport.

## Pick a transport

Start at the top. Use the first row that matches your app.

| Your app | Use | Page |
| --- | --- | --- |
| A normal HTTP server | `fetchServerSentEvents` | [Server-Sent Events](./sse) |
| A runtime or proxy that blocks SSE | `fetchHttpStream` | [HTTP Stream](./http-stream) |
| A host or proxy that buffers or breaks streams | `fetchJson` | [JSON](./json) |
| React Native or Expo | `xhrHttpStream` | [React Native](./react-native) |
| A TanStack Start server function, with no HTTP route | `fetcher` | [Server Functions](./server-functions#quick-setup) |

Not sure? Use SSE. It works in the most places, and it is the easiest to debug.

Less common cases:

| Your app | Use | Page |
| --- | --- | --- |
| A function that returns an `AsyncIterable<StreamChunk>` synchronously (in-process `chat()`, an RSC stream, tests) | `stream` | [Server Functions](./server-functions#in-process-streams) |
| An RPC framework, such as Cap'n Web, gRPC-Web, or tRPC | `rpcStream` | [Server Functions](./server-functions#rpc-clients-with-rpcstream) |
| One long-lived, resumable WebSocket for many runs | `webSocket` | [WebSockets](./websockets) |
| BroadcastChannel, postMessage, a shared worker, or a different persistent channel | Your own `subscribe` / `send` adapter | [Custom Transports](./custom#persistent-transports) |
| A different protocol, such as HTTP/3 | Your own `connect` adapter | [Custom Transports](./custom#request-scoped-adapters) |

To send headers, extra body data, or an auth token on any transport, see [Request Options](./request-options). To wrap `fetch` for auth refresh or retries, see [Wrap fetch](./request-options#wrap-fetch).

## Plug it in

Pass the transport to `useChat` as `connection`:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });

  return (
    <div>
      {messages.map((message) => (
        <p key={message.id}>
          {message.parts.map((part) =>
            part.type === "text" ? part.content : "",
          )}
        </p>
      ))}
      <button onClick={() => void sendMessage("Hello")}>Send</button>
    </div>
  );
}
```

To change transports, change only the `connection` line and the matching server helper. Each transport page shows both halves. For the full server and client path, see [Streaming](../chat/streaming).

## How it works

- **The server** runs `chat()` and writes its chunks in one format: SSE, NDJSON, JSON, or WebSocket frames.
- **The transport** reads that format and turns it back into `StreamChunk` events.
- **The chat client** processes those events the same way on every transport.

All transports produce the same `StreamChunk` events ([AG-UI Protocol](../migration/ag-ui-compliance)). Only the wire format changes.

Pick a row, send a message, and the reply streams into `messages`.

## Advanced

### Cancel a run

Every transport gets an `AbortSignal`. The `stop()` function from `useChat` triggers the signal and aborts the active run:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function StopButton() {
  const { stop, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });

  return (
    <button disabled={!isLoading} onClick={stop}>
      Stop
    </button>
  );
}
```

Who handles the signal:

- **Built-in transports** pass the signal to `fetch`.
- **Custom transports** must honor the signal themselves.
- **`SubscribeConnectionAdapter`**: the signal in `subscribe()` ends the full subscription (for example, on unmount). The signal in `send()` ends only the active send.

The fetch transports cancel the response body in these cases:

- Parsing fails.
- You exit the chunk iterator early.

A response that gets to its normal end keeps all of its chunks.

Custom cancellation hooks do not delay errors or early iterator returns. The transports release the reader lock, also when cancellation fails or stays pending.

### Errors

A transport throws on a transport error:

- An HTTP status that is not 2xx.
- A parse failure.
- A dropped socket.

The `ChatClient` catches the error. If no `RUN_ERROR` chunk came yet, the client emits one. Then it shows the error through `onError` and the `error` state:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function ChatError() {
  const { error } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
    onError: (err) => console.error("Chat failed:", err),
  });

  return error ? <p>{error.message}</p> : null;
}
```

If the connection drops in the middle of a line, the stream transports throw `StreamTruncatedError`.

In a custom transport, do not catch and hide an `AbortError`. Let it propagate, so that the client knows that the abort worked.

### Rules for a custom transport

- **Use `stream()` when you can.** If you control both sides and do not need HTTP, a server function takes less code than a custom adapter.
- **Use `subscribe` / `send` only for a persistent channel.** Then you handle reconnection, run correlation, and the connection lifecycle yourself.
- **Always honor `abortSignal`.** The client uses it to clean up on unmount and on `stop()`.
- **Emit `RUN_FINISHED` from the server.** Without it, the client does not know that the turn ended. See [Stream Events](../chat/stream-events).

For the full type signatures, see [API Reference: `@tanstack/ai-client`](../api/ai-client).
