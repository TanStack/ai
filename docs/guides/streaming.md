---
title: Streaming
id: streaming-responses
order: 7
---

TanStack AI supports streaming responses for real-time chat experiences. Streaming allows you to display responses as they're generated, rather than waiting for the complete response.

## How Streaming Works

When you use `chat()`, it returns an async iterable stream of chunks:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
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
    adapter: openaiText("gpt-5.2"),
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

### Thinking Chunks

Thinking/reasoning is represented by AG-UI events `STEP_STARTED` and `STEP_FINISHED`. They stream separately from the final response text:

```typescript
for await (const chunk of stream) {
  if (chunk.type === "STEP_FINISHED") {
    console.log("Thinking:", chunk.content); // Accumulated thinking content
    console.log("Delta:", chunk.delta); // Incremental thinking token
  }
}
```

Thinking content is automatically converted to `ThinkingPart` in `UIMessage` objects. It is UI-only and excluded from messages sent back to the model.

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

```typescript
import { stream } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: stream(async (messages, data, signal) => {
    // Custom streaming implementation
    const response = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages, ...data }),
      signal,
    });
    // Return async iterable
    return processStream(response);
  }),
});
```

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

## Best Practices

1. **Handle loading states** - Use `isLoading` to show loading indicators
2. **Handle errors** - Check `error` state for stream failures
3. **Cancel on unmount** - Clean up streams when components unmount
4. **Optimize rendering** - Batch updates if needed for performance
5. **Show progress** - Display partial content as it streams

## Next Steps

- [Connection Adapters](./connection-adapters) - Learn about different connection types
- [API Reference](../api/ai) - Explore streaming APIs
