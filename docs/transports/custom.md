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

A custom connection adapter reads your protocol and writes chunks into `useChat`. Pick the shape from the channel:

- **`connect`**: one request per user message. See [Request-scoped adapters](#request-scoped-adapters).
- **`subscribe` / `send`**: one channel that stays open for many messages. See [Persistent transports](#persistent-transports).

Check the [built-in transports](./overview#pick-a-transport) first. A server function with `stream()` takes less code than a custom adapter.

## Request-scoped adapters

If your transport makes one request per user message, implement `ConnectConnectionAdapter`.

### 1. Write the adapter

This adapter posts an AG-UI request body and reads newline-delimited JSON back. Replace the `fetch` call and the read loop with your own protocol:

```typescript
// my-adapter.ts
import type { ConnectConnectionAdapter } from "@tanstack/ai-react";
import { restoreInboundChunk, uiMessagesToWire } from "@tanstack/ai/client";

export const myAdapter: ConnectConnectionAdapter = {
  async *connect(messages, data, abortSignal, runContext) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...runContext.headers,
      },
      body: JSON.stringify({
        threadId: runContext.threadId,
        runId: runContext.runId,
        ...(runContext.resume ? { resume: runContext.resume } : {}),
        state: {},
        messages: uiMessagesToWire(messages),
        tools: runContext.clientTools ?? [],
        context: [],
        forwardedProps: { ...runContext.forwardedProps, ...data },
      }),
      ...(abortSignal ? { signal: abortSignal } : {}),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error("Response has no body");

    // Newline-delimited JSON: one chunk per line.
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
          yield restoreInboundChunk(JSON.parse(line));
        }
      }
    }
  },
};
```

Copy `runContext.headers` onto the request headers, not into the body. If your `connect` drops them, it drops BYOK keys (`x-byok-*`). See [Bring Your Own Key](../advanced/byok).

### 2. Pass it to `useChat`

```tsx
import { useChat } from "@tanstack/ai-react";
import { myAdapter } from "./my-adapter";

export function Chat() {
  const { messages, sendMessage } = useChat({ connection: myAdapter, threadId: "support-chat" });

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

### 3. Return NDJSON from the server

The body is a valid AG-UI `RunAgentInput`, so the standard server helpers read it:

```typescript
// api/chat.ts
import { chat, chatParamsFromRequest, toHttpResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
  });
  return toHttpResponse(stream);
}
```

Click Send. The chunks from your adapter stream into `messages` like any built-in transport.

## Persistent transports

A WebSocket, a BroadcastChannel, postMessage between iframes, or a shared worker works in a different way from request and response. You open the channel once. Then you send and receive on it for the full life of the client. `connect` cannot model this, because it expects one async iterable per request.

For a resumable WebSocket, use the built-in [`webSocket()`](./websockets) transport. For other persistent channels, implement `SubscribeConnectionAdapter`:

- **`subscribe(abortSignal?)`**: the `ChatClient` calls it once. It returns a long-lived async iterable of every chunk that the channel produces.
- **`send(messages, data, abortSignal, runContext)`**: the `ChatClient` calls it once per user message, to put a request frame on the channel. It returns when the frame is written. The chunks arrive separately through `subscribe()`.

The runtime connects the two. The chunks that arrive between `send()` and the next terminal event (`RUN_FINISHED` or `RUN_ERROR`) belong to that run.

### Custom WebSocket example

If `webSocket()` does not fit (a different wire format, no need for resume, or a server that you do not control), write the adapter yourself:

```tsx
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
          threadId: runContext.threadId,
          runId: runContext.runId,
          messages,
          data,
        }),
      );
    },
  };
}

const connection = websocketConnection("wss://example.com/chat");

export function Chat() {
  const { messages, sendMessage } = useChat({ connection, threadId: "support-chat" });

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

> [!WARNING]
> Make sure that your server emits `RUN_FINISHED` (or `RUN_ERROR`) at the end of each run. Without it, the client does not know that the assistant turn ended, and it waits forever. See [Stream Events](../chat/stream-events).

## How it works

The chat client gives your adapter a `runContext` on each send:

- `threadId`, `runId`, `clientTools`, `forwardedProps`: put these in your request payload, so that the server can build an AG-UI-compliant response.
- `parentRunId` and `resume`: set on a child run and on a run that answers an interrupt.
- `headers`: copy these onto the request headers, not into the body.

The built-in fetch and XHR transports copy `runContext.headers`. `stream()` and `rpcStream()` do not, because a server function call has no request headers. They pass the rest of the run as the 4th factory argument.

`restoreInboundChunk` rebuilds the TanStack fields of a chunk after the wire, such as token usage. The built-in transports call it on every chunk.

The runtime adds the terminal event of a `connect` stream for you:

- If your `connect` stream completes with no `RUN_FINISHED`, the runtime adds one.
- If your `connect` stream throws, the runtime adds a `RUN_ERROR`.

## Advanced

### When to use a persistent transport

If one or more of these is true, use `subscribe` / `send`:

- One connection carries many runs (the chat thread keeps the socket open across messages).
- The server pushes chunks outside of a request (presence updates, server-initiated tool calls, broadcast notifications).
- You want to share one connection across tabs (BroadcastChannel) or workers.

In other cases, use `fetchServerSentEvents` or `stream()`. They are simpler, and you do not manage a connection lifecycle.

### The adapter interface

A `ConnectionAdapter` is a union. Give it `connect`, or give it both `subscribe` and `send`. Never give it both modes.

```typescript
import type { RunAgentResumeItem, UIMessage } from "@tanstack/ai-client";
import type { ModelMessage, StreamChunk } from "@tanstack/ai";

export interface RunAgentInputContext {
  threadId: string;
  runId: string;
  parentRunId?: string;
  resume?: Array<RunAgentResumeItem>;
  clientTools?: Array<{ name: string; description: string; parameters: unknown }>;
  forwardedProps?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface ConnectConnectionAdapter {
  connect(
    messages: UIMessage[] | ModelMessage[],
    data: Record<string, any> | undefined,
    abortSignal: AbortSignal | undefined,
    runContext: RunAgentInputContext,
  ): AsyncIterable<StreamChunk>;
}

export interface SubscribeConnectionAdapter {
  subscribe(abortSignal?: AbortSignal): AsyncIterable<StreamChunk>;
  send(
    messages: UIMessage[] | ModelMessage[],
    data: Record<string, any> | undefined,
    abortSignal: AbortSignal | undefined,
    runContext: RunAgentInputContext,
  ): Promise<void>;
}

export type ConnectionAdapter =
  | ConnectConnectionAdapter
  | SubscribeConnectionAdapter;
```

Both shapes can also carry optional persistence members:

- `hydrate`: loads a stored chat thread.
- `joinRun`: replays a run by id.
- `hydrateGeneration`: on `connect` adapters only, loads the last run of a generation.

The built-in fetch, JSON, and XHR transports have them. See [Server Functions: Persistence handlers](./server-functions#persistence-handlers).

Internally, `ChatClient` changes both shapes to one `subscribe` / `send` pair with `normalizeConnectionAdapter()`:

- **`connect`**: the client wraps it in an async queue. The wrapped `send()` waits until the active subscriber processes all events or exits.
- **`subscribe` + `send`**: the client uses them as they are.
