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
  - fetcher
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
| An environment that blocks SSE (some edge runtimes, strict proxies) | [`fetchHttpStream`](#http-streaming-ndjson) |
| React Native or Expo | [`xhrHttpStream`](#react-native-and-expo) by default, [`xhrServerSentEvents`](#react-native-and-expo) for SSE, or [`fetchHttpStream`](#http-streaming-ndjson) only when streaming `fetch` is available |
| Code that **synchronously** returns an `AsyncIterable<StreamChunk>` (in-process `chat()`, an RSC stream, tests) | [`stream`](#server-functions-and-direct-async-iterables) |
| An **async** call — a TanStack Start server function or any `Promise`-returning function — resolving to a `Response` or an `AsyncIterable<StreamChunk>` | [`fetcher`](#server-functions-via-fetcher) |
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
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents(
    () => `/api/chat?user=${currentUserId}`,
    () => ({
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  ),
});
```

**Static body.** Anything in `options.body` is merged into the AG-UI `forwardedProps` payload sent to your server. Per-message data passed to `sendMessage` wins over this:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    body: { provider: "openai", model: "gpt-5.1" },
  }),
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

## React Native and Expo

You have a native app that needs to call your own backend rather than a
same-origin browser route. Use `useChat` from `@tanstack/ai-react` with an
explicit chat transport and an absolute URL. By the end of this section, the
client adapter and server response helper will be paired correctly for React
Native or Expo.

```typescript
const baseUrl =
  process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ??
  'http://127.0.0.1:8787'
const httpUrl = `${baseUrl}/chat/http`
const sseUrl = `${baseUrl}/chat/sse`
```

Use the URL your runtime can reach. iOS simulators can often use `localhost` or
`127.0.0.1`, Android emulators commonly use `10.0.2.2` to reach the host
machine, and physical devices need a LAN or tunneled URL.

Prefer `xhrHttpStream()` for Expo and React Native. It pairs with
`toHttpResponse()` and reads newline-delimited JSON through incremental XHR
progress events:

```typescript
import { useChat, xhrHttpStream } from "@tanstack/ai-react";

const chat = useChat({
  connection: xhrHttpStream(httpUrl),
});
```

Use `xhrServerSentEvents()` when your server returns `text/event-stream` via
`toServerSentEventsResponse()`:

```typescript
import { useChat, xhrServerSentEvents } from "@tanstack/ai-react";

const chat = useChat({
  connection: xhrServerSentEvents(sseUrl),
});
```

Only use `fetchHttpStream()` if your exact React Native runtime exposes
streaming `fetch` responses, `Response.body.getReader()`, and `TextDecoder`.
The server still returns newline-delimited JSON with `toHttpResponse()`:

```typescript
import { useChat, fetchHttpStream } from "@tanstack/ai-react";

const chat = useChat({
  connection: fetchHttpStream(httpUrl),
});
```

If one of those fetch-streaming APIs is missing, `fetchHttpStream()` throws
`UnsupportedResponseStreamError`. A polyfill that buffers the response does not
make fetch streaming compatible; the adapter needs incremental bytes. Switch to
`xhrHttpStream()` or `xhrServerSentEvents()` instead.

Keep provider SDKs and server helpers on your backend. The React Native bundle
should import hooks and connection adapters, not OpenAI/Anthropic/Gemini SDKs,
React DOM UI, devtools UI, or other framework packages. For a complete mobile
walkthrough, see [Quick Start: React Native](../getting-started/quick-start-react-native).

## Server Functions and Direct Async Iterables

When your client can call into your server without going over HTTP — RSC streams, in-process tests, a direct in-process `chat()` call — skip the transport entirely. `stream()` takes a factory that returns an `AsyncIterable<StreamChunk>` **synchronously** and wires it straight into the client. (A [TanStack Start](https://tanstack.com/start) server function returns a `Promise`, so it needs [`fetcher`](#server-functions-via-fetcher), not `stream()` — see the next section.)

```typescript
import { useChat, stream } from "@tanstack/ai-react";
import { chatServerFn } from "./server/chat.server";

// `chatServerFn` is an in-process server-side function that synchronously
// returns an AsyncIterable<StreamChunk> — e.g. the result of
// `chat({ adapter, model, messages })` on the server.
const { messages } = useChat({
  connection: stream((messages, data) => chatServerFn({ messages, ...data })),
});
```

The factory receives the conversation messages plus any per-request `data` you passed to `sendMessage`. Return any async iterable that yields `StreamChunk` objects — a generator, the output of `chat()` on the server, a transformed stream, anything.

> **Tip:** `stream()` is **request-scoped**. The factory is invoked once per `sendMessage`, the iterable runs to completion, and the connection closes. If you need a single long-lived channel that multiplexes many sends — for example a WebSocket — use [`subscribe` / `send`](#persistent-transports-websockets-and-friends) instead.

## Server Functions via `fetcher`

When you call into your server with an **async** function — the universal case for a [TanStack Start](https://tanstack.com/start) server function, which always returns a `Promise` — use the top-level `fetcher` option instead of a connection adapter. `fetcher` is a sibling of `connection` (provide exactly one), and it accepts a plain async function. It mirrors the `fetcher` option on the [generation hooks](../media/generation-hooks). The most common shape is a handler that ends with `toServerSentEventsResponse(...)` and resolves to a `Response`:

```typescript
// server/chat.server.ts
import { createServerFn } from "@tanstack/react-start";
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import type { UIMessage } from "@tanstack/ai";

export const chatFn = createServerFn({ method: "POST" })
  .inputValidator((data: { messages: Array<UIMessage> }) => data)
  .handler(({ data }) =>
    toServerSentEventsResponse(
      chat({ adapter: openaiText("gpt-5.1"), messages: data.messages }),
    ),
  );
```

```typescript
import { useChat } from "@tanstack/ai-react";
import { chatFn } from "./server/chat.server";

const { messages, sendMessage } = useChat({
  fetcher: ({ messages }, { signal }) => chatFn({ data: { messages }, signal }),
});
```

The fetcher receives `{ messages, data, threadId, runId }` plus an `AbortSignal` (triggered by `stop()` or when a send is superseded). Return a `Response` — whose SSE body the chat client parses for you — **or** an `AsyncIterable<StreamChunk>`, which is yielded directly. If your server function returns the stream itself (instead of wrapping it in a `Response`), the fetcher handles that too. Sync and `Promise`-wrapped returns are both accepted.

> **Tip:** The choice between `fetcher` and [`stream()`](#server-functions-and-direct-async-iterables) is about **async vs sync**, not `Response`-vs-iterable — both can yield an `AsyncIterable<StreamChunk>`. `stream()`'s factory must return that iterable **synchronously**, so a server-function call (which returns a `Promise`) won't typecheck there — that's the gap `fetcher` fills ([issue #509](https://github.com/TanStack/ai/issues/509)). Use `stream()` when you can hand back an async iterable synchronously (in-process `chat()`, an RPC client, tests); use `fetcher` for anything you have to `await`. Both normalize to the same request-scoped adapter, so `stop()`/abort, error handling, and tool calls behave identically.

## RPC Streams

`rpcStream()` is identical in behavior to `stream()` but reads better at call sites that hand off to an RPC client. Use it when integrating with Cap'n Web, gRPC-Web, tRPC subscriptions, or any RPC framework that already returns an async iterable:

```typescript
import { useChat, rpcStream } from "@tanstack/ai-react";
import { api } from "./rpc-client";

// `api.chat.stream` is your RPC method; it must return an AsyncIterable<StreamChunk>.
const { messages } = useChat({
  connection: rpcStream((messages, data) =>
    api.chat.stream({ messages, ...data }),
  ),
});
```

## Persistent Transports (WebSockets and Friends)

A persistent transport — WebSocket, BroadcastChannel, postMessage between iframes, a shared worker — is fundamentally different from request/response. You open the channel **once**, then send and receive over it for the lifetime of the client. `stream()`/`connect()` can't model this cleanly because they assume one async iterable per request.

For these cases, implement the `SubscribeConnectionAdapter` interface directly. The shape (full definition in [The Adapter Interface](#the-adapter-interface)):

```typescript
import type { SubscribeConnectionAdapter } from "@tanstack/ai-react";

// subscribe(abortSignal?): AsyncIterable<StreamChunk>   — long-lived
// send(messages, data?, abortSignal?, runContext?): Promise<void> — one per user message
```

- `subscribe()` is called **once** by the `ChatClient` and returns a long-lived async iterable of every chunk the channel produces.
- `send()` is called **once per user message** to push a request frame onto the channel. It returns when the frame has been written — chunks arrive separately through `subscribe()`.

The runtime correlates them: chunks emitted on the subscription queue between `send()` and the next terminal event (`RUN_FINISHED` / `RUN_ERROR`) are attributed to that run.

### WebSocket example

```typescript
import { useChat, type SubscribeConnectionAdapter } from "@tanstack/ai-react";
import type { StreamChunk } from "@tanstack/ai";

function websocketConnection(url: string): SubscribeConnectionAdapter {
  const ws = new WebSocket(url);
  const queue: Array<StreamChunk> = [];
  let pending: ((chunk: StreamChunk | null) => void) | null = null;
  let closed = false;

  const ready = new Promise<void>((resolve) => {
    ws.addEventListener("open", () => resolve(), { once: true });
  });

  function deliver(chunk: StreamChunk | null) {
    const resolve = pending;
    if (resolve) {
      pending = null;
      resolve(chunk);
    } else if (chunk !== null) {
      queue.push(chunk);
    }
  }

  ws.addEventListener("message", (event) => {
    const chunk: StreamChunk = JSON.parse(event.data);
    deliver(chunk);
  });
  ws.addEventListener("close", () => {
    closed = true;
    deliver(null);
  });

  return {
    async *subscribe(abortSignal) {
      while (!abortSignal?.aborted && !closed) {
        const buffered = queue.shift();
        if (buffered !== undefined) {
          yield buffered;
          continue;
        }
        const chunk = await new Promise<StreamChunk | null>((resolve) => {
          pending = resolve;
          abortSignal?.addEventListener("abort", () => resolve(null), {
            once: true,
          });
        });
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
import { useChat, type ConnectConnectionAdapter } from "@tanstack/ai-react";
import type { StreamChunk } from "@tanstack/ai";

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
    if (!response.body) throw new Error("Response has no body");

    // Example: newline-delimited JSON. Replace this loop with whatever
    // framing your wire format uses, yielding one `StreamChunk` per event.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          const chunk: StreamChunk = JSON.parse(line);
          yield chunk;
        }
      }
    }
  },
};

const { messages } = useChat({ connection: myAdapter });
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
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    headers: { Authorization: `Bearer ${token}` },
  }),
});
```

For tokens that change per request (refresh tokens, short-lived JWTs), pass a function — it's called on every send, so the header always reflects the latest token:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", () => ({
    headers: { Authorization: `Bearer ${getToken()}` },
  })),
});
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
