---
title: Connection Adapters
id: connection-adapters
order: 3
description: "Pick and wire how StreamChunks reach ChatClient — SSE, HTTP stream, server functions, RPC, WebSockets."
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

If you need chunks from server → `ChatClient` / `useChat` → pick a connection adapter. Everything else (reassembly, tools, UI) is transport-agnostic.

## Pick a transport

| You have… | Use |
| --- | --- |
| Normal HTTP + default | [`fetchServerSentEvents`](#server-sent-events-sse) |
| SSE blocked (edge/proxy) | [`fetchHttpStream`](#http-streaming-ndjson) |
| React Native / Expo | [`xhrHttpStream`](#react-native-and-expo) (default); `xhrServerSentEvents` for SSE; `fetchHttpStream` only if streaming `fetch` works |
| Sync `AsyncIterable<StreamChunk>` (in-process `chat()`, RSC, tests) | [`stream`](#server-functions-and-direct-async-iterables) |
| Async fn → `Response` or iterable (TanStack Start server fn) | [`fetcher`](#server-functions-via-fetcher) |
| Cap'n Web / gRPC-Web / tRPC | [`rpcStream`](#rpc-streams) |
| Long-lived WebSocket / BroadcastChannel / shared worker | [Custom `subscribe` / `send`](#persistent-transports-websockets-and-friends) |
| SSE + custom fetch (auth refresh, retries) | [`fetchServerSentEvents` + `fetchClient`](#custom-fetch-client) |
| Other request-scoped transport | [Custom `connect`](#custom-request-scoped-adapters) |

All adapters yield the same `StreamChunk` events ([AG-UI Protocol](../migration/ag-ui-compliance)).

## Server-Sent Events (SSE)

Default. Pair with `toServerSentEventsResponse()` on the server.

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});
```

**Dynamic URL / headers** — pass functions for per-request values:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { currentUserId, getToken } from "./auth";

const { messages } = useChat({
  connection: fetchServerSentEvents(
    () => `/api/chat?user=${currentUserId}`,
    () => ({
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  ),
});
```

**Static body** — merged into AG-UI `forwardedProps`. Per-message `sendMessage` data wins:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    body: { provider: "openai", model: "gpt-5.5" },
  }),
});
```

> **Tip:** `body` and `forwardedProps` share the same wire field. Use `body` for static defaults; runtime values always win.

### Resumable SSE

`fetchServerSentEvents` tracks SSE `id:` values. On drop after an id, it reconnects with `Last-Event-ID` and de-duplicates replay. `joinRun(runId)` does a read-only GET with `offset=-1` and the run id.

Ids appear only when the server passes a durability adapter to `toServerSentEventsResponse`. Without ids → plain single fetch. See [Resumable Streams](../resumable-streams/overview).

**Must:** add a `GET` handler for `joinRun` (second tab / reload). `POST` = fresh runs + auto-reconnect; `GET` = replay only:

```typescript
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const stream = chat({ adapter: openaiText("gpt-5.5"), messages, threadId, runId });
  return toServerSentEventsResponse(stream, {
    durability: { adapter: memoryStream(request) },
  });
}

// joinRun hits GET ?offset=-1&runId=... (replay only)
export async function GET(request: Request) {
  return resumeServerSentEventsResponse({ adapter: memoryStream(request) });
}
```

`GET` does not call a provider — durability `resumeFrom()` replays the log. No resume offset → 400. Use `resumeHttpResponse` for NDJSON adapters.

`fetchHttpStream` / `xhrHttpStream` resume the same way over NDJSON (`{ id, chunk }` envelopes via `toHttpResponse`). `xhrServerSentEvents` resumes over SSE like `fetchServerSentEvents`.

## HTTP Streaming (NDJSON)

Use when SSE is stripped. Wire format: one JSON `StreamChunk` per line.

```typescript
import { useChat, fetchHttpStream } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchHttpStream("/api/chat"),
});
```

Server: `toHttpResponse(stream)` (or `JSON.stringify(chunk) + "\n"`). Options match `fetchServerSentEvents` (`url`, `headers`, `body`, `fetchClient`).

Pass a durability adapter to `toHttpResponse` for resumability — same guarantees as [Resumable SSE](#resumable-sse) over NDJSON.

## React Native and Expo

1. Point at an absolute backend URL your runtime can reach
2. Prefer `xhrHttpStream` + `toHttpResponse`
3. Keep provider SDKs off the mobile bundle

```typescript
const baseUrl =
  process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ??
  'http://127.0.0.1:8787'
const httpUrl = `${baseUrl}/chat/http`
const sseUrl = `${baseUrl}/chat/sse`
```

| Runtime | Host URL tip |
| --- | --- |
| iOS simulator | `localhost` / `127.0.0.1` |
| Android emulator | `10.0.2.2` for host machine |
| Physical device | LAN or tunnel |

**Preferred — XHR + NDJSON:**

```typescript
import { useChat, xhrHttpStream } from "@tanstack/ai-react";

const baseUrl = process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ?? 'http://127.0.0.1:8787';
const httpUrl = `${baseUrl}/chat/http`;

const chat = useChat({
  connection: xhrHttpStream(httpUrl),
});
```

**SSE via XHR** (server uses `toServerSentEventsResponse`):

```typescript
import { useChat, xhrServerSentEvents } from "@tanstack/ai-react";

const baseUrl = process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ?? 'http://127.0.0.1:8787';
const sseUrl = `${baseUrl}/chat/sse`;

const chat = useChat({
  connection: xhrServerSentEvents(sseUrl),
});
```

**`fetchHttpStream` only if** the RN runtime has streaming `fetch`, `Response.body.getReader()`, and `TextDecoder`. Missing any → `UnsupportedResponseStreamError`. Buffering polyfills do not count — switch to XHR adapters.

Full walkthrough: [Quick Start: React Native](../getting-started/quick-start-react-native). Resumability: [Resumable Streams](../resumable-streams/overview).

## Server functions and direct async iterables

If the factory returns `AsyncIterable<StreamChunk>` **synchronously** → `stream()`:

```typescript
import { useChat, stream } from "@tanstack/ai-react";
import { chatServerFn } from "./server/chat.server";

// chatServerFn must return AsyncIterable<StreamChunk> synchronously
const { messages } = useChat({
  connection: stream((messages, data) => chatServerFn({ messages, ...data })),
});
```

> **Tip:** TanStack Start server functions return a `Promise` → use [`fetcher`](#server-functions-via-fetcher), not `stream()`.

`stream()` is **request-scoped** (one factory call per `sendMessage`). For a long-lived multiplexed channel → [`subscribe` / `send`](#persistent-transports-websockets-and-friends).

Optional second arg: persistence handlers (`hydrate`, `hydrateGeneration`, `joinRun`). See [Generation Persistence](../persistence/generation-persistence#server-functions--direct).

## Server functions via `fetcher`

For **async** handlers (TanStack Start server fn → `Promise`). Provide `fetcher` **or** `connection`, not both.

**Server:**

```typescript ignore
// server/chat.server.ts
import { createServerFn } from "@tanstack/react-start";
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import type { UIMessage } from "@tanstack/ai";

export const chatFn = createServerFn({ method: "POST" })
  .inputValidator((data: { messages: Array<UIMessage> }) => data)
  .handler(({ data }) =>
    toServerSentEventsResponse(
      chat({ adapter: openaiText("gpt-5.5"), messages: data.messages }),
    ),
  );
```

**Client:**

```typescript
import { useChat } from "@tanstack/ai-react";
import { chatFn } from "./server/chat.server";

const { messages, sendMessage } = useChat({
  fetcher: ({ messages }, { signal }) => chatFn({ data: { messages }, signal }),
});
```

Fetcher input: `{ messages, data, threadId, runId }` + `AbortSignal`. Return:

1. `Response` — client parses SSE body
2. `AsyncIterable<StreamChunk>` — yielded directly

Sync and `Promise`-wrapped returns both work.

> **`fetcher` vs `stream()`:** about **async vs sync**, not Response-vs-iterable. `stream()` factory must return the iterable synchronously; server-fn `Promise`s need `fetcher` ([issue #509](https://github.com/TanStack/ai/issues/509)).

## RPC streams

Same behavior as `stream()`, clearer at RPC call sites:

```typescript
import { useChat, rpcStream } from "@tanstack/ai-react";
import { api } from "./rpc-client";

const { messages } = useChat({
  connection: rpcStream((messages, data) =>
    api.chat.stream({ messages, ...data }),
  ),
});
```

Optional persistence handlers: `{ hydrate, hydrateGeneration, joinRun }`.

## Persistent transports (WebSockets)

Open once, send/receive for the client lifetime. Implement `SubscribeConnectionAdapter`:

- `subscribe()` — once; long-lived async iterable of all chunks
- `send()` — once per user message; returns when the frame is written

Chunks between `send()` and next terminal (`RUN_FINISHED` / `RUN_ERROR`) belong to that run.

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
      const onAbort = () => deliver(null);
      abortSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        while (!abortSignal?.aborted) {
          // Drain queue before honoring close so trailing RUN_FINISHED is not dropped
          const buffered = queue.shift();
          if (buffered !== undefined) {
            yield buffered;
            continue;
          }
          if (closed) return;
          const chunk = await new Promise<StreamChunk | null>((resolve) => {
            pending = resolve;
          });
          if (chunk === null) return;
          yield chunk;
        }
      } finally {
        abortSignal?.removeEventListener("abort", onAbort);
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

> **Must:** server emits `RUN_FINISHED` (or `RUN_ERROR`) per run or the client waits forever. See [Streaming](./streaming).

**Choose persistent when any of:**

1. One connection multiplexes many runs
2. Server pushes outside request/response
3. Shared connection across tabs/workers

Otherwise prefer `fetchServerSentEvents` or `stream()`.

## Custom fetch client

Wrap `fetch` for auth refresh, retries, logging:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { refreshToken } from "./auth";

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

Same option on `fetchHttpStream`.

## Custom request-scoped adapters

Implement `ConnectConnectionAdapter` when built-ins do not fit but transport is still one-request-per-message:

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

Include `runContext` (`threadId`, `runId`, `clientTools`, `forwardedProps`) in the payload. Runtime synthesizes `RUN_FINISHED` if missing, or `RUN_ERROR` on throw.

## Adapter interface

Provide **either** `connect` **or** both `subscribe` + `send` — never both modes:

```typescript
import type { UIMessage } from "@tanstack/ai-client";
import type { ModelMessage, StreamChunk } from "@tanstack/ai";

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

`ChatClient` normalizes both via `normalizeConnectionAdapter()`.

## Auth

Static headers:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { token } from "./auth";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    headers: { Authorization: `Bearer ${token}` },
  }),
});
```

Per-request tokens — pass a function (called every send):

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { getToken } from "./auth";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", () => ({
    headers: { Authorization: `Bearer ${getToken()}` },
  })),
});
```

Cookies: automatic when `credentials` is `"same-origin"` (default) or `"include"`.

## Cancellation

Every adapter gets an `AbortSignal`. Built-ins pass it to `fetch`. `stop()` aborts the current run:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { stop } = useChat({ connection: fetchServerSentEvents("/api/chat") });
stop();
```

`SubscribeConnectionAdapter`: `subscribe` signal ends the subscription (unmount); `send` signal ends that send only.

## Errors

Throw on transport failures. Client emits `RUN_ERROR` and surfaces via `onError` / `error`:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { error } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  onError: (err) => console.error("Chat failed:", err),
});
```

Do not swallow `AbortError`.

## Must-do

1. Default to SSE unless something blocks it
2. Prefer `stream()` / `fetcher` when you control both sides
3. Use `subscribe`/`send` only when you need a persistent channel
4. Honor `abortSignal`
5. Emit `RUN_FINISHED` from the server

## Next

- [Streaming](./streaming)
- [AG-UI Client Compliance](../migration/ag-ui-compliance)
- [Cloudflare Adapter](../community-adapters/cloudflare)
- [API Reference: `@tanstack/ai-client`](../api/ai-client)
