---
title: Streaming
id: streaming-responses
order: 2
description: "Stream AI responses in real time with TanStack AI — async iterable chunks, chunk strategies, and partial JSON for responsive chat UIs."
keywords:
  - tanstack ai
  - streaming
  - streaming responses
  - real-time ai
  - async iterable
  - chunks
  - partial json
---

TanStack AI supports streaming responses for real-time chat experiences. Streaming allows you to display responses as they're generated, rather than waiting for the complete response.

## How Streaming Works

When you use `chat()`, it returns an async iterable stream of chunks:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages,
});

// Stream contains chunks as they arrive
for await (const chunk of stream) {
  console.log(chunk); // Process each chunk
}
```

## Server-Side Streaming

Convert the stream to an HTTP response using `toServerSentEventsResponse`:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
  });

  // Convert to HTTP response with proper headers
  return toServerSentEventsResponse(stream);
}
```

## Client-Side Streaming

The `useChat` hook automatically handles streaming:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages, sendMessage, isLoading } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});

// Messages update in real-time as chunks arrive
messages.forEach((message) => {
  // Message content updates incrementally
});
```

## Stream Events (AG-UI Protocol)

TanStack AI implements the [AG-UI Protocol](https://docs.ag-ui.com/introduction) for streaming. Stream events contain different types of data:

### AG-UI Events

- **RUN_STARTED** - Emitted when a run begins
- **TEXT_MESSAGE_START/CONTENT/END** - Text content streaming lifecycle
- **TOOL_CALL_START/ARGS/END** - Tool invocation lifecycle
- **STEP_STARTED/STEP_FINISHED** - Thinking/reasoning steps
- **RUN_FINISHED** - Run completion with finish reason and usage
- **RUN_ERROR** - Error occurred during the run

> **Tip:** Some models expose their internal reasoning as thinking content that streams before the response. See [Thinking & Reasoning](./thinking-content).

### Thinking Chunks

Adapters emit reasoning as both the canonical `REASONING_MESSAGE_*` events and the older `STEP_STARTED` / `STEP_FINISHED` events. Rather than parsing those raw events yourself, read the reconciled `ThinkingPart` from `message.parts` — the stream processor merges both event families into a single part for you:

```typescript
for (const part of message.parts) {
  if (part.type === "thinking") {
    console.log("Thinking:", part.content); // Accumulated thinking content
  }
}
```

Thinking content is automatically converted to `ThinkingPart` in `UIMessage` objects. It is UI-only and excluded from messages sent back to the model. See [Thinking & Reasoning](./thinking-content) for the full rendering pattern.

## Connection Adapters

TanStack AI provides connection adapters for different streaming protocols:

### Server-Sent Events (SSE)

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});
```

### HTTP Stream

```typescript
import { useChat, fetchHttpStream } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchHttpStream("/api/chat"),
});
```

### Custom Stream

For a fully custom request, use the `fetcher` transport. The fetcher receives the request input plus an `AbortSignal`, and returns a `Response` (whose SSE body the client parses) or an `AsyncIterable<StreamChunk>`. It may return that value synchronously, as a `Promise`, or as an `async function*`:

```typescript
const { messages } = useChat({
  fetcher: ({ messages, data }, { signal }) =>
    fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages, ...data }),
      signal,
    }),
});
```

> **Note:** The lower-level `stream()` connection adapter takes a factory that must return an `AsyncIterable<StreamChunk>` **synchronously** (e.g. a generator) — it does not accept an `async (...) => {...}` function that returns a `Promise`. Prefer the `fetcher` transport above unless you specifically need the connection adapter.

## Monitoring Stream Progress

You can monitor stream progress with callbacks:

```typescript
const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  onChunk: (chunk) => {
    console.log("Received chunk:", chunk);
  },
  onFinish: (message) => {
    console.log("Stream finished:", message);
  },
});
```

## Cancelling Streams

Cancel ongoing streams:

```typescript
const { stop } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});

// Cancel the current stream
stop();
```

Calling `stop()` aborts the underlying fetch; the resulting `AbortError` is expected and normal. This differs from a connection being cut mid-line: a truncated stream throws a `StreamTruncatedError` and moves the client into its `error` state. See [Connection Adapters](./connection-adapters) for the underlying behavior.

On the server, pass an `AbortController` to `toServerSentEventsResponse(stream, { abortController })` so the chat run is cancelled when the client disconnects:

```typescript
const abortController = new AbortController();
return toServerSentEventsResponse(stream, { abortController });
```

## Best Practices

1. **Handle loading states** - Use `isLoading` to show loading indicators
2. **Handle errors** - Check `error` state for stream failures
3. **Cancel on unmount** - Clean up streams when components unmount
4. **Optimize rendering** - Batch updates if needed for performance
5. **Show progress** - Display partial content as it streams

## Next Steps

- [Connection Adapters](./connection-adapters) - Learn about different connection types
- [API Reference](../api/ai) - Explore streaming APIs
