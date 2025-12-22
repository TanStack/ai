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
  adapter: openaiText("gpt-4o"),
  messages,
});

// Stream contains chunks as they arrive
for await (const chunk of stream) {
  console.log(chunk); // Process each chunk
}
```

## Server-Side Streaming

Convert the stream to an HTTP response using `toStreamResponse`:

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-4o"),
    messages,
  });

  // Convert to HTTP response with proper headers
  return toStreamResponse(stream);
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

## Stream Chunks

Stream chunks contain different types of data:

- **Content chunks** - Text content being generated
- **Thinking chunks** - Model's internal reasoning process (when supported)
- **Tool call chunks** - When the model calls a tool
- **Tool result chunks** - Results from tool execution
- **Done chunks** - Stream completion

### Thinking Chunks

Thinking chunks represent the model's reasoning process. They stream separately from the final response text:

```typescript
for await (const chunk of stream) {
  if (chunk.type === "thinking") {
    console.log("Thinking:", chunk.content); // Accumulated thinking content
    console.log("Delta:", chunk.delta); // Incremental thinking token
  }
}
```

Thinking chunks are automatically converted to `ThinkingPart` in `UIMessage` objects. They are UI-only and excluded from messages sent back to the model.

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
