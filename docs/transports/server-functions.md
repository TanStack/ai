---
title: Server Functions
id: transports-server-functions
order: 6
description: "Call your server code directly from useChat with stream(), fetcher, or rpcStream(): TanStack Start server functions, RSC streams, RPC clients, and tests."
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
| Returns an `AsyncIterable<StreamChunk>` synchronously (in-process `chat()`, an RSC stream, tests) | [`stream()`](#in-process-streams) |
| Returns a `Promise`, such as a [TanStack Start](https://tanstack.com/start) server function | [`fetcher`](#async-functions-with-fetcher) |
| Is an RPC method that returns an async iterable | [`rpcStream()`](#rpc-clients-with-rpcstream) |

The choice depends on whether your function is sync or async. Both `stream()` and `fetcher` can yield an `AsyncIterable<StreamChunk>`. A server function returns a `Promise`, so it does not type-check in `stream()`. All three become the same request-scoped adapter. So `stop()`, abort, errors, and tool calls work the same.

## In-process streams

`stream()` takes a factory that returns an `AsyncIterable<StreamChunk>` synchronously. It connects that iterable straight to the client:

```typescript
import { useChat, stream } from "@tanstack/ai-react";
import { chatServerFn } from "./server/chat.server";

// `chatServerFn` is an in-process server-side function that synchronously
// returns an AsyncIterable<StreamChunk>, for example the result of
// `chat()` on the server.
const { messages } = useChat({
  connection: stream((messages, data) => chatServerFn({ messages, ...data })),
});
```

The factory gets the conversation messages and the per-request `data` that you passed to `sendMessage`. Return any async iterable that yields `StreamChunk` objects: a generator, the output of `chat()`, or a transformed stream.

`stream()` is request-scoped. For each `sendMessage`, it calls the factory once, runs the iterable to its end, and closes the connection. For one long-lived channel that carries many sends, see [Custom Transports](./custom#persistent-transports).

`stream()` takes an optional second argument with persistence handlers. These let server-driven persistence (`persistence: true`) work without an HTTP endpoint. Each one is usually a one-line call into your server:

- `hydrate`: restores a chat thread.
- `hydrateGeneration`: restores the last run of a generation.
- `joinRun`: replays a run that is still in flight.

For the full wiring, see [Generation Persistence](../persistence/generation-persistence#server-functions--direct).

## Async functions with `fetcher`

A [TanStack Start](https://tanstack.com/start) server function always returns a `Promise`. Pass it as the top-level `fetcher` option, not as a `connection`. Give `useChat` exactly one of `fetcher` or `connection`. The option works like `fetcher` on the [generation hooks](../media/generation-hooks).

The most common server function ends with `toServerSentEventsResponse(...)` and resolves to a `Response`:

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
      chat({ adapter: openaiText("gpt-5.6"), messages: data.messages }),
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

The fetcher gets `{ messages, data, threadId, runId }` and an `AbortSignal`. The signal fires on `stop()`, or when a new send replaces the active one. Return one of these:

- **A `Response`**: the chat client parses its SSE body for you.
- **An `AsyncIterable<StreamChunk>`**: the client reads it directly. Use this when your server function returns the stream itself, not a `Response`.

The fetcher can return the value directly or in a `Promise`.

> **Tip:** The generation hooks (`useGenerateImage` and the others) also accept `hydrateGeneration` and `joinRun` options next to their `fetcher`. So `persistence: true` hydrates and rejoins through server functions, with no HTTP route. See [Generation Persistence: Server functions / direct](../persistence/generation-persistence#server-functions--direct).

## RPC clients with `rpcStream`

`rpcStream()` works the same as `stream()`. The name reads better when you call an RPC client. Use it with Cap'n Web, gRPC-Web, tRPC subscriptions, or any RPC framework that returns an async iterable:

```typescript
import { useChat, rpcStream } from "@tanstack/ai-react";
import { api } from "./rpc-client";

// `api.chat.stream` is your RPC method. It must return an AsyncIterable<StreamChunk>.
const { messages } = useChat({
  connection: rpcStream((messages, data) =>
    api.chat.stream({ messages, ...data }),
  ),
});
```

Like `stream()`, `rpcStream()` takes an optional second argument with persistence handlers (`{ hydrate, hydrateGeneration, joinRun }`). Then server-driven persistence works over RPC. Each handler is usually a one-line RPC call.

Call `sendMessage("Hello")`. The reply streams into `messages`, and your app has no chat route of its own.
