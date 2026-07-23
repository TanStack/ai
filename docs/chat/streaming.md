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
  messages: [{ role: "user", content: "Hello!" }],
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
- **CUSTOM** - Namespaced extension events (sandbox file changes, Code Mode progress, structured-output completion, and your own `emitCustomEvent` calls) — see the [Custom Events Reference](../protocol/custom-events) for the full typed taxonomy and how to narrow `chunk.value` with a plain `if`
- **RUN_FINISHED** - Run completion with finish reason and usage
- **RUN_ERROR** - Error occurred during the run

> **Tip:** Some models expose their internal reasoning as thinking content that streams before the response. See [Thinking & Reasoning](./thinking-content).

### Type-Safe Tool Call Events

When you pass typed tools (defined with `toolDefinition()` and Zod schemas) to `chat()`, the stream chunks automatically carry type information for tool call events. Prefer the AG-UI field `toolCallName` (or the deprecated `toolName` alias) — both narrow to the union of your tool name literals. The `input` field on `TOOL_CALL_END` is typed as the union of your tool input schemas (typically set on the adapter-emitted END once arguments are complete):

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const weatherTool = toolDefinition({
  name: "get_weather",
  description: "Get weather for a location",
  inputSchema: z.object({
    location: z.string(),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
});

const messages = [
  { role: "user" as const, content: "What's the weather in Paris?" },
];

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  tools: [weatherTool],
});

for await (const chunk of stream) {
  // `'type' in chunk` is required for control-flow narrowing across the
  // StreamChunk union (AG-UI event types from `@ag-ui/core` use Zod
  // passthrough, which otherwise hides the discriminant from property access).
  if ("type" in chunk && chunk.type === "TOOL_CALL_END") {
    chunk.toolCallName; // ✅ typed as "get_weather" (not string)
    chunk.input; // ✅ typed as { location: string; unit?: "celsius" | "fahrenheit" } | undefined
  }
}
```

Without typed tools, names default to `string` and `input`/`output` default to `unknown` — the same behavior as before. The type narrowing is automatic when you use `toolDefinition()` with Zod schemas.

When multiple tools are provided, tool call events form a **discriminated union** — checking `toolCallName` (or `toolName`) narrows `input` / `output` to that specific tool's type:

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const weatherTool = toolDefinition({
  name: "get_weather",
  description: "Get weather for a location",
  inputSchema: z.object({
    location: z.string(),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
});

const searchTool = toolDefinition({
  name: "search",
  description: "Search the web",
  inputSchema: z.object({ query: z.string() }),
});

const messages = [
  { role: "user" as const, content: "Find the weather for Paris" },
];

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  tools: [weatherTool, searchTool],
});

for await (const chunk of stream) {
  if ("type" in chunk && chunk.type === "TOOL_CALL_END") {
    if (chunk.toolCallName === "get_weather") {
      // ✅ input is narrowed to { location: string; unit?: "celsius" | "fahrenheit" }
      console.log(`Weather in ${chunk.input?.location}`);
    }
    if (chunk.toolCallName === "search") {
      // ✅ input is narrowed to { query: string }
      console.log(`Searched for: ${chunk.input?.query}`);
    }
  }
}
```

> **Tip:** The typed stream type is exported as `TypedStreamChunk<TTools>`. The default (no type args) matches `ChatStream`: standard chunks plus the known framework `CUSTOM` event union. Free-form `emitCustomEvent` names still flow at runtime; cast to `StreamChunk` if you need to read them.

### Thinking Chunks

Adapters emit reasoning as both the canonical `REASONING_MESSAGE_*` events and the older `STEP_STARTED` / `STEP_FINISHED` events. Rather than parsing those raw events yourself, read the reconciled `ThinkingPart` from `message.parts` — the stream processor merges both event families into a single part for you:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});

for (const message of messages) {
  for (const part of message.parts) {
    if (part.type === "thinking") {
      console.log("Thinking:", part.content); // Accumulated thinking content
    }
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
import { useChat } from "@tanstack/ai-react";

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
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

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
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { stop } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});

// Cancel the current stream
stop();
```

Calling `stop()` aborts the underlying fetch; the resulting `AbortError` is expected and normal. This differs from a connection being cut mid-line: a truncated stream throws a `StreamTruncatedError` and moves the client into its `error` state. See [Connection Adapters](./connection-adapters) for the underlying behavior.

On the server, pass an `AbortController` to `toServerSentEventsResponse(stream, { abortController })` so the chat run is cancelled when the client disconnects:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();
  const stream = chat({ adapter: openaiText("gpt-5.5"), messages });

  const abortController = new AbortController();
  return toServerSentEventsResponse(stream, { abortController });
}
```

## Queueing Messages

By default, calling `sendMessage` while a stream is already in flight **queues** the message instead of dropping it — it sends automatically once the current run settles **successfully**. Configure this with the `queue` option, which accepts a `QueueConfig` object, a plain shorthand string, or a strategy function:

```tsx group=queueing-messages
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages, queue, sendMessage, cancelQueued, isLoading } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  queue: { whenBusy: "queue", drain: "fifo", maxSize: 5 },
});
```

- **`whenBusy`** — what happens to a send that arrives while the client is busy (streaming, claiming a send, or draining the queue):
  - `"queue"` (default) — hold the message; it sends once the run settles **successfully**. Clear the composer once the message appears in `queue` or `messages`.
  - `"drop"` — ignore the send (promise still resolves; does not throw). The message never appears in `queue` or `messages` — keep the composer text and show feedback if you want the user to retry.
  - `"interrupt"` — abort the current stream and send the new message immediately. Unlike `stop()`, this does **not** clear already-queued messages — they still drain after the interrupting send succeeds.
- **`drain`** — how queued items leave the queue: `"fifo"` (default) sends them one at a time in order; `"batch"` merges everything currently queued into a single send once the run settles successfully (string contents joined with `\n`, multimodal content concatenated in order; when sending via `ChatClient` with per-message `body`, the last item's `body` wins — framework hooks do not forward per-send `body`).
- **`maxSize`** — caps how many messages can be queued (`0` means never queue).
- **`onOverflow`** — `"reject"` (default) silently ignores a send once `maxSize` is reached (does not throw); `"drop-oldest"` evicts the oldest queued item to make room.

You can also pass a plain `WhenBusy` string (e.g. `queue: "interrupt"`) as shorthand for `{ whenBusy: "interrupt" }`, or a `QueueStrategy` function for per-send action control. Strategy form always drains FIFO (no `batch`); actions are `'queue' | 'drop' | 'interrupt'` (no concurrent streams). Per-call `whenBusy` overrides both config and strategy.

### When the queue drains vs flushes

- **Drain (auto-send)** — only after a **successful** stream settle (including after tool continuations finish).
- **Flush (discard without sending)** — on **error/abort of the active generation** (user `stop()`, real stream errors), `clear()`, `unsubscribe()`, and `reload()`. Interrupt aborts the old run without flushing; remaining items drain after a **successful** interrupting turn.
- **`interrupt` does not flush** — existing queued items remain and drain after the interrupting turn succeeds.

`useChat` exposes the pending queue as `queue` so you can render it distinctly from `messages`, along with `cancelQueued(id)` to cancel an item before it sends:

```tsx group=queueing-messages
function PendingQueue() {
  return (
    <>
      {queue.map((q) => (
        <div key={q.id} className="pending">
          {typeof q.content === "string" ? q.content : "[attachment]"}
          <button onClick={() => cancelQueued(q.id)}>Cancel</button>
        </div>
      ))}
    </>
  );
}
```

Override the configured policy for a single send with the second argument to `sendMessage`:

```tsx group=queueing-messages
sendMessage("Never mind, do this instead", { whenBusy: "interrupt" });
```

> **Note:** This is a default-behavior change — messages sent while streaming used to be silently dropped. They are now queued unless you opt into `queue: "drop"` (or `{ whenBusy: "drop" }`) to restore the old behavior, or `queue: "interrupt"`.

## Best Practices

1. **Handle loading states** - Use `isLoading` to show loading indicators
2. **Handle errors** - Check `error` state for stream failures
3. **Cancel on unmount** - Clean up streams when components unmount
4. **Optimize rendering** - Batch updates if needed for performance
5. **Show progress** - Display partial content as it streams
6. **Render queued messages distinctly** - Use `queue` to show pending sends separately from `messages`

## Next Steps

- [Connection Adapters](./connection-adapters) - Learn about different connection types
- [API Reference](../api/ai) - Explore streaming APIs
