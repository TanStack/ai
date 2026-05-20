---
title: Connection Adapters
id: connection-adapters
order: 3
description: "Connection adapters bridge your client and server in TanStack AI — SSE, HTTP streaming, server functions, RPC, and persistent transports like WebSockets via subscribe/send."
keywords:
  - tanstack ai
  - connection adapters
  - sse
  - server-sent events
  - http stream
  - websocket
  - rpc
  - server functions
  - streaming transport
  - fetchServerSentEvents
  - subscribe send
---

A **connection adapter** is the piece that decides _how_ chunks get from your server to the `ChatClient` (and through it, to your framework's `useChat`). Everything else in TanStack AI — chunk processing, message reassembly, tool calls, UI updates — is transport-agnostic. The adapter is the only thing that touches the network.

This page covers every supported transport, when to pick which, and how to build a custom one.

## Pick a Transport

| You have… | Use |
| --- | --- |
| A normal HTTP server and want the default | [`fetchServerSentEvents`](#server-sent-events-sse) |
| An environment that blocks SSE (some edge runtimes, RN, strict proxies) | [`fetchHttpStream`](#http-streaming-ndjson) |
| A TanStack Start (or other) server function that already returns an async iterable | [`stream`](#server-functions-and-direct-async-iterables) |
| An RPC framework like Cap'n Web, gRPC-Web, or tRPC | [`rpcStream`](#rpc-streams) |
| A single long-lived WebSocket (or BroadcastChannel, postMessage, shared worker) serving many runs | [Custom `subscribe` / `send` adapter](#persistent-transports-websockets-and-friends) |
| Standard SSE but with custom fetch wrapping (auth refresh, retries) | [`fetchServerSentEvents` with `fetchClient`](#custom-fetch-client) |
| Something else entirely (HTTP/3, Server-Sent Events over a different protocol, etc.) | [Custom `connect` adapter](#custom-request-scoped-adapters) |

All adapters produce the same `StreamChunk` events ([AG-UI Protocol](../migration/ag-ui-compliance)) — the choice is purely about transport.

## Server-Sent Events (SSE)

The default. SSE is well-supported across browsers, transparent through most proxies, and easy to debug. Pair it with `toServerSentEventsResponse()` on the server.

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});
```

**Dynamic URL and headers.** Pass functions when the value depends on per-request state (current user, fresh token):

```typescript
const { messages } = useChat({
  connection: fetchServerSentEvents(
    () => `/api/chat?user=${currentUserId}`,
    () => ({
      headers: { Authorization: `Bearer ${getToken()}` },
    })
  ),
});
```

**Static body.** Anything in `options.body` is merged into the AG-UI `forwardedProps` payload sent to your server. Per-message data passed to `sendMessage` wins over this:

```typescript
fetchServerSentEvents("/api/chat", {
  body: { provider: "openai", model: "gpt-5.1" },
});
```

> **Tip:** `body` and `forwardedProps` populate the same wire field. Use `body` for static defaults, the `forwardedProps` constructor option (or per-`sendMessage` `data`) for dynamic values. Runtime values always win.

## HTTP Streaming (NDJSON)

For environments that don't speak SSE — some edge runtimes, certain mobile WebViews, or anywhere a proxy strips `text/event-stream` — use raw newline-delimited JSON. The wire format is one JSON `StreamChunk` per line:

```typescript
import { useChat, fetchHttpStream } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchHttpStream("/api/chat"),
});
```

Server-side, write each chunk as `JSON.stringify(chunk) + "\n"` to the response body. Options (`url`, `headers`, `body`, `fetchClient`, dynamic functions) match `fetchServerSentEvents` exactly.

## Server Functions and Direct Async Iterables

When your client can call into your server without going over HTTP — TanStack Start server functions, RSC streams, in-process tests — skip the transport entirely. `stream()` takes a factory that returns an `AsyncIterable<StreamChunk>` and wires it straight into the client:

```typescript
import { stream } from "@tanstack/ai-client";
import { useChat } from "@tanstack/ai-react";
import { chatServerFn } from "./server/chat.server";

const { messages } = useChat({
  connection: stream(async function* (messages, data) {
    yield* await chatServerFn({ messages, ...data });
  }),
});
```

The factory receives the conversation messages plus any per-request `data` you passed to `sendMessage`. Return any async iterable that yields `StreamChunk` objects — a generator, the output of `chat()` on the server, a transformed stream, anything.

> **Tip:** `stream()` is **request-scoped**. The factory is invoked once per `sendMessage`, the iterable runs to completion, and the connection closes. If you need a single long-lived channel that multiplexes many sends — for example a WebSocket — use [`subscribe` / `send`](#persistent-transports-websockets-and-friends) instead.

## RPC Streams

`rpcStream()` is identical in behavior to `stream()` but reads better at call sites that hand off to an RPC client. Use it when integrating with Cap'n Web, gRPC-Web, tRPC subscriptions, or any RPC framework that already returns an async iterable:

```typescript
import { rpcStream } from "@tanstack/ai-client";
import { api } from "./rpc-client";

const connection = rpcStream((messages, data) =>
  api.chat.stream({ messages, ...data })
);
```

## Persistent Transports (WebSockets and Friends)

A persistent transport — WebSocket, BroadcastChannel, postMessage between iframes, a shared worker — is fundamentally different from request/response. You open the channel **once**, then send and receive over it for the lifetime of the client. `stream()`/`connect()` can't model this cleanly because they assume one async iterable per request.

For these cases, implement the `SubscribeConnectionAdapter` interface directly:

```typescript
import type {
  SubscribeConnectionAdapter,
  RunAgentInputContext,
  StreamChunk,
} from "@tanstack/ai-client";

interface SubscribeConnectionAdapter {
  subscribe(abortSignal?: AbortSignal): AsyncIterable<StreamChunk>;
  send(
    messages: UIMessage[] | ModelMessage[],
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
    runContext?: RunAgentInputContext,
  ): Promise<void>;
}
```

- `subscribe()` is called **once** by the `ChatClient` and returns a long-lived async iterable of every chunk the channel produces.
- `send()` is called **once per user message** to push a request frame onto the channel. It returns when the frame has been written — chunks arrive separately through `subscribe()`.

The runtime correlates them: chunks emitted on the subscription queue between `send()` and the next terminal event (`RUN_FINISHED` / `RUN_ERROR`) are attributed to that run.

### WebSocket example

```typescript
import type {
  SubscribeConnectionAdapter,
  StreamChunk,
} from "@tanstack/ai-client";

function websocketConnection(url: string): SubscribeConnectionAdapter {
  const ws = new WebSocket(url);
  const queue: StreamChunk[] = [];
  const waiters: Array<(chunk: StreamChunk | null) => void> = [];
  const ready = new Promise<void>((resolve) => {
    ws.addEventListener("open", () => resolve(), { once: true });
  });

  ws.addEventListener("message", (event) => {
    const chunk: StreamChunk = JSON.parse(event.data);
    const waiter = waiters.shift();
    if (waiter) waiter(chunk);
    else queue.push(chunk);
  });

  ws.addEventListener("close", () => {
    while (waiters.length) waiters.shift()!(null);
  });

  return {
    async *subscribe(abortSignal) {
      while (!abortSignal?.aborted) {
        const chunk = queue.shift() ?? (await new Promise<StreamChunk | null>(
          (resolve) => {
            const onAbort = () => resolve(null);
            waiters.push((c) => {
              abortSignal?.removeEventListener("abort", onAbort);
              resolve(c);
            });
            abortSignal?.addEventListener("abort", onAbort, { once: true });
          },
        ));
        if (chunk === null) return;
        yield chunk;
      }
    },

    async send(messages, data, _abortSignal, runContext) {
      await ready;
      ws.send(
        JSON.stringify({
          threadId: runContext?.threadId,
          runId: runContext?.runId,
          messages,
          data,
        }),
      );
    },
  };
}

const { messages } = useChat({
  connection: websocketConnection("wss://example.com/chat"),
});
```

> **Tip:** Your server is responsible for emitting `RUN_FINISHED` (or `RUN_ERROR`) at the end of each run. Without it, the client will not know the assistant turn has ended and will wait indefinitely. See [Streaming](./streaming) for the full event lifecycle.

### When to choose persistent over request-scoped

Pick `subscribe` / `send` when **any** of these are true:

- A single connection multiplexes many runs (chat thread keeps the socket open across messages).
- The server pushes chunks outside of a request (presence updates, server-initiated tool calls, broadcast notifications).
- You want to share one connection across multiple tabs (BroadcastChannel) or workers.

Otherwise, prefer `fetchServerSentEvents` or `stream()` — they're simpler and require no connection lifecycle management.

## Custom Fetch Client

If you're keeping SSE or HTTP streaming but need to wrap `fetch` — for auth refresh, retries, logging, or routing through an edge proxy — pass a `fetchClient`:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  let response = await fetch(input, init);
  if (response.status === 401) {
    await refreshToken();
    response = await fetch(input, init);
  }
  return response;
}

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    fetchClient: authedFetch,
  }),
});
```

The `fetchClient` must satisfy the standard `fetch` signature. `fetchHttpStream` accepts the same option.

## Custom Request-Scoped Adapters

When none of the built-ins fit but the transport is still request-scoped (one request per user message), implement `ConnectConnectionAdapter` directly. This is the lowest-level escape hatch short of going persistent:

```typescript
import type {
  ConnectConnectionAdapter,
  StreamChunk,
} from "@tanstack/ai-client";

const myAdapter: ConnectConnectionAdapter = {
  async *connect(messages, data, abortSignal, runContext) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: runContext?.threadId,
        runId: runContext?.runId,
        messages,
        ...data,
      }),
      ...(abortSignal ? { signal: abortSignal } : {}),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    for await (const chunk of parseMyFormat(response)) {
      yield chunk as StreamChunk;
    }
  },
};
```

`runContext` carries `threadId`, `runId`, `clientTools`, and `forwardedProps`. Include them in your request payload so the server can build an AG-UI-compliant response. If your `connect` stream completes without emitting `RUN_FINISHED`, the runtime synthesizes one for you; if it throws, a `RUN_ERROR` is synthesized.

## The Adapter Interface

A `ConnectionAdapter` is a union — provide **either** `connect`, **or** both `subscribe` and `send`. Never both modes.

```typescript
export interface RunAgentInputContext {
  threadId: string;
  runId: string;
  parentRunId?: string;
  clientTools?: Array<{ name: string; description: string; parameters: unknown }>;
  forwardedProps?: Record<string, unknown>;
}

export interface ConnectConnectionAdapter {
  connect(
    messages: UIMessage[] | ModelMessage[],
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
    runContext?: RunAgentInputContext,
  ): AsyncIterable<StreamChunk>;
}

export interface SubscribeConnectionAdapter {
  subscribe(abortSignal?: AbortSignal): AsyncIterable<StreamChunk>;
  send(
    messages: UIMessage[] | ModelMessage[],
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
    runContext?: RunAgentInputContext,
  ): Promise<void>;
}

export type ConnectionAdapter =
  | ConnectConnectionAdapter
  | SubscribeConnectionAdapter;
```

Internally, `ChatClient` normalizes both shapes to a single `subscribe`/`send` pair via `normalizeConnectionAdapter()`. If you provide `connect`, it gets wrapped in an async queue; if you provide `subscribe` + `send` natively, they're used as-is.

## Authentication

Static headers go in `options.headers`:

```typescript
fetchServerSentEvents("/api/chat", {
  headers: { Authorization: `Bearer ${token}` },
});
```

For tokens that change per request (refresh tokens, short-lived JWTs), pass a function:

```typescript
fetchServerSentEvents("/api/chat", () => ({
  headers: { Authorization: `Bearer ${getToken()}` },
}));
```

Cookies are sent automatically when `credentials` is `"same-origin"` (default) or `"include"`.

## Cancellation

Every adapter — built-in or custom — receives an `AbortSignal`. Built-ins propagate it to `fetch`; custom adapters must honor it themselves. `useChat`'s `stop()` aborts the current run by triggering the signal:

```typescript
const { stop } = useChat({ connection: fetchServerSentEvents("/api/chat") });
stop(); // aborts the active stream
```

For `SubscribeConnectionAdapter`, the signal in `subscribe()` ends the entire subscription (component unmount); the signal in `send()` ends just the in-flight send.

## Error Handling

Adapters should throw on transport errors (HTTP non-2xx, parse failures, dropped sockets). The `ChatClient` catches the throw, emits a `RUN_ERROR` chunk if none has been emitted yet, and surfaces it via `onError` / the `error` state:

```typescript
const { error } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  onError: (err) => console.error("Chat failed:", err),
});
```

Don't swallow `AbortError` — let it propagate so the client knows the abort succeeded.

## Best Practices

- **Default to SSE.** It's the most compatible and the easiest to debug. Switch only when something blocks it.
- **Use `stream()` when you can.** If you control both sides and don't need HTTP semantics, server functions are faster to wire up than building a custom adapter.
- **Reach for `subscribe`/`send` only when you need persistence.** WebSockets are powerful but require you to handle reconnection, run correlation, and lifecycle yourself.
- **Always honor `abortSignal`.** It's how the client cleans up on unmount and on `stop()`.
- **Emit `RUN_FINISHED` from the server.** Without it, the client never knows the turn ended.

## Next Steps

- [Streaming](./streaming) — the full event lifecycle and `StreamChunk` types
- [AG-UI Client Compliance](../migration/ag-ui-compliance) — the wire protocol your server emits
- [Cloudflare Adapter](../community-adapters/cloudflare) — example of a custom `fetchClient` in production
- [API Reference: `@tanstack/ai-client`](../api/ai-client) — full type signatures
