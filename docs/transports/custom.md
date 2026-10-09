---
title: Custom Transports
id: transports-custom
order: 8
description: "Build your own TanStack AI connection adapter: a request-scoped connect adapter, or a persistent subscribe/send adapter for WebSockets, BroadcastChannel, and workers."
keywords:
  - tanstack ai
  - custom connection adapter
  - ConnectConnectionAdapter
  - SubscribeConnectionAdapter
  - subscribe send
  - persistent transport
  - websocket
  - runContext
---

No built-in transport fits your protocol. Write your own connection adapter. There are two shapes:

- **`connect`**: one request per user message. See [Request-scoped adapters](#request-scoped-adapters).
- **`subscribe` / `send`**: one channel that stays open for many messages. See [Persistent transports](#persistent-transports).

## Request-scoped adapters

If your transport makes one request per user message, implement `ConnectConnectionAdapter`. This is the lowest-level option before a persistent transport:

```typescript
import { useChat, type ConnectConnectionAdapter } from "@tanstack/ai-react";
import type { StreamChunk } from "@tanstack/ai";

const myAdapter: ConnectConnectionAdapter = {
  async *connect(messages, data, abortSignal, runContext) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...runContext?.headers,
      },
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

`runContext` has these fields:

- `threadId`, `runId`, `clientTools`, `forwardedProps`: put these in your JSON payload, so that the server can build an AG-UI-compliant response.
- `headers`: copy these onto the POST request headers, not into the body.

The built-in fetch and XHR adapters copy `runContext.headers`. `stream()` and `rpcStream()` do not, because they never get `runContext`. If your custom `connect` does not copy `headers`, it drops BYOK keys (`x-byok-*`). See [Bring Your Own Key](../advanced/byok).

The runtime adds the terminal event for you:

- If your `connect` stream completes with no `RUN_FINISHED`, the runtime adds one.
- If your `connect` stream throws, the runtime adds a `RUN_ERROR`.

## Persistent transports

A WebSocket, a BroadcastChannel, postMessage between iframes, or a shared worker works in a different way from request and response. You open the channel once. Then you send and receive on it for the full life of the client. `connect` cannot model this, because it expects one async iterable per request.

For a resumable WebSocket, use the built-in [`webSocket()`](./websockets) adapter. For other persistent channels, implement `SubscribeConnectionAdapter` (full definition in [The adapter interface](#the-adapter-interface)):

```typescript
import type { SubscribeConnectionAdapter } from "@tanstack/ai-react";

// subscribe(abortSignal?): AsyncIterable<StreamChunk>   (long-lived)
// send(messages, data?, abortSignal?, runContext?): Promise<void>   (one per user message)
```

- **`subscribe()`**: the `ChatClient` calls it once. It returns a long-lived async iterable of every chunk that the channel produces.
- **`send()`**: the `ChatClient` calls it once per user message, to put a request frame on the channel. It returns when the frame is written. The chunks arrive separately through `subscribe()`.

The runtime connects the two. The chunks that arrive between `send()` and the next terminal event (`RUN_FINISHED` or `RUN_ERROR`) belong to that run.

### Custom WebSocket example

If `webSocket()` does not fit (a different wire format, no need for resume, or a server that you do not control), write the adapter yourself:

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
      // Register the abort listener once (not per-iteration) so it can't
      // accumulate on a long-lived socket.
      const onAbort = () => deliver(null);
      abortSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        while (!abortSignal?.aborted) {
          // Drain buffered chunks BEFORE honoring `closed`: a burst of messages
          // followed by a close event (common within one macrotask) must still
          // deliver the queued chunks (including a trailing RUN_FINISHED),
          // otherwise the client would hang waiting for a terminal it dropped.
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

> **Tip:** Your server must emit `RUN_FINISHED` (or `RUN_ERROR`) at the end of each run. Without it, the client does not know that the assistant turn ended, and it waits forever. See [Stream Events](../chat/stream-events) for the full event lifecycle.

### When to use a persistent transport

Use `subscribe` / `send` if one or more of these is true:

- One connection carries many runs (the chat thread keeps the socket open across messages).
- The server pushes chunks outside of a request (presence updates, server-initiated tool calls, broadcast notifications).
- You want to share one connection across tabs (BroadcastChannel) or workers.

In other cases, use `fetchServerSentEvents` or `stream()`. They are simpler, and you do not manage a connection lifecycle.

## The adapter interface

A `ConnectionAdapter` is a union. Give it `connect`, or give it both `subscribe` and `send`. Never give it both modes.

```typescript
import type { UIMessage } from "@tanstack/ai-client";
import type { ModelMessage, StreamChunk } from "@tanstack/ai";

export interface RunAgentInputContext {
  threadId: string;
  runId: string;
  parentRunId?: string;
  clientTools?: Array<{ name: string; description: string; parameters: unknown }>;
  forwardedProps?: Record<string, unknown>;
  headers?: Record<string, string>;
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

Internally, `ChatClient` changes both shapes to one `subscribe` / `send` pair with `normalizeConnectionAdapter()`:

- **`connect`**: the client wraps it in an async queue. The wrapped `send()` waits until the active subscriber processes all events or exits.
- **`subscribe` + `send`**: the client uses them as they are.

Pass your adapter as `connection` and send a message. The chunks from your transport stream into `messages` like any built-in adapter.
