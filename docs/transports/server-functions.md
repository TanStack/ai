---
title: Server Functions
id: transports-server-functions
order: 6
description: "Call your server code directly from useChat with fetcher, stream(), or rpcStream(): TanStack Start server functions, RSC streams, RPC clients, and tests."
keywords:
  - tanstack ai
  - server functions
  - tanstack start
  - fetcher
  - stream
  - rpcStream
  - rpc
  - async iterable
---

Your client can call your server code directly, so you do not want to write an HTTP route for chat. Hand that function to `useChat`. Pick the helper from what your function returns:

| Your function | Use |
| --- | --- |
| Returns a `Promise`, such as a [TanStack Start](https://tanstack.com/start) server function | [`fetcher`](#quick-setup) |
| Returns an `AsyncIterable<StreamChunk>` synchronously (in-process `chat()`, an RSC stream, tests) | [`stream()`](#in-process-streams) |
| Is an RPC method that returns an async iterable | [`rpcStream()`](#rpc-clients-with-rpcstream) |

All three become the same request-scoped transport. So `stop()`, abort, errors, and tool calls work the same.

## Quick setup

This setup uses a TanStack Start server function.

### 1. Write the server function

End the server function with `toServerSentEventsResponse(...)`. It resolves to a `Response`:

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
      chat({ adapter: openaiText("gpt-6.1-sol"), messages: data.messages }),
    ),
  );
```

### 2. Pass it to `useChat` as `fetcher`

Use the top-level `fetcher` option, not `connection`:

```tsx
import { useChat } from "@tanstack/ai-react";
import { chatFn } from "./server/chat.server";

export function Chat() {
  const { messages, sendMessage } = useChat({
    fetcher: ({ messages }, { signal }) =>
      chatFn({ data: { messages }, signal }),
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

Click Send. The reply streams into `messages`, and your app has no chat route of its own.

## How it works

1. `sendMessage` calls your fetcher with the messages and an `AbortSignal`.
2. The server function runs `chat()` and returns an SSE `Response`.
3. The chat client parses the SSE body, the same as with `fetchServerSentEvents`.

The choice of helper depends on whether your function is sync or async. Both `stream()` and `fetcher` can give back an `AsyncIterable<StreamChunk>`. A server function returns a `Promise`, so it does not type-check in `stream()`.

## In-process streams

`stream()` takes a factory that returns an `AsyncIterable<StreamChunk>` synchronously. It connects that iterable straight to the client.

On the server side, return the result of `chat()`:

```typescript
// server/chat.server.ts
import { chat } from "@tanstack/ai";
import type { ModelMessage, UIMessage } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export function chatServerFn(input: {
  messages: Array<UIMessage> | Array<ModelMessage>;
}) {
  return chat({ adapter: openaiText("gpt-6.1-sol"), messages: input.messages });
}
```

Then pass the factory to `stream()`:

```typescript
import { useChat, stream } from "@tanstack/ai-react";
import { chatServerFn } from "./server/chat.server";

export function useInProcessChat() {
  return useChat({
    connection: stream((messages, data) => chatServerFn({ messages, ...data })),
  });
}
```

The factory gets these arguments:

- `messages`: the conversation messages.
- `data`: the per-request data that you passed to `sendMessage`.

Return any async iterable that yields `StreamChunk` objects: a generator, the output of `chat()`, or a transformed stream.

`stream()` is request-scoped. For each `sendMessage`, it calls the factory once, runs the iterable to its end, and closes the connection. For one long-lived channel that carries many sends, see [Custom Transports](./custom#persistent-transports).

## RPC clients with `rpcStream`

`rpcStream()` works the same as `stream()`. The name reads better when you call an RPC client. Use it with Cap'n Web, gRPC-Web, tRPC subscriptions, or any RPC framework that returns an async iterable:

```typescript
import { useChat, rpcStream } from "@tanstack/ai-react";
import { api } from "./rpc-client";

// `api.chat.stream` is your RPC method. It must return an AsyncIterable<StreamChunk>.
export function useRpcChat() {
  return useChat({
    connection: rpcStream((messages, data) =>
      api.chat.stream({ messages, ...data }),
    ),
  });
}
```

## Advanced

### Async functions with `fetcher`

Give `useChat` exactly one of `fetcher` or `connection`. The option works like `fetcher` on the [generation hooks](../media/generation-hooks).

The fetcher gets two arguments:

- **Input**: `{ messages, data, threadId, runId }`. A child run also gets `parentRunId`. A resumed run also gets `resume`.
- **Options**: `{ signal, headers }`. The signal fires on `stop()`, or when a new send replaces the active one. `headers` holds extra request headers for this run, such as BYOK keys.

Return one of these:

- **A `Response`**: the chat client parses its SSE body for you.
- **An `AsyncIterable<StreamChunk>`**: the client reads it directly. Use this when your server function returns the stream itself, not a `Response`.

The fetcher can return the value directly or in a `Promise`.

### Persistence handlers

`stream()` and `rpcStream()` take an optional second argument with persistence handlers. With them, server-driven persistence (`persistence: true`) works with no HTTP endpoint. Each one is usually a one-line call into your server:

- `hydrate`: restores a chat thread.
- `hydrateGeneration`: restores the last run of a generation.
- `joinRun`: replays a run that is still in flight.

The generation hooks (`useGenerateImage` and the others) also accept `hydrateGeneration` and `joinRun` options next to their `fetcher`. So `persistence: true` hydrates and rejoins through server functions too.

For the full wiring, see [Generation Persistence: Server functions / direct](../persistence/generation-persistence#server-functions--direct).
