---
title: Connection Adapters
id: connection-adapters
order: 9
---


Connection adapters handle the communication between your client and server for streaming chat responses. TanStack AI provides built-in adapters and supports custom implementations.

## Built-in Adapters

### Server-Sent Events (SSE)

SSE is the recommended adapter for most use cases. It provides reliable streaming with automatic reconnection. On the server side, use [`toServerSentEventsStream()`](../api/ai#toserversenteventsstreamstream-abortcontroller) or [`toStreamResponse()`](../api/ai#tostreamresponsestream-init) to convert your chat stream to SSE format.

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});
```

**Options:**

```typescript
const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    headers: {
      Authorization: "Bearer token",
    },
  }),
});
```

**Dynamic values:**

You can use functions for dynamic URLs or options that are evaluated on each request:

```typescript
const { messages } = useChat({
  connection: fetchServerSentEvents(
    () => `/api/chat?user=${currentUserId}`,
    () => ({
      headers: { Authorization: `Bearer ${getToken()}` },
    })
  ),
});
```

**Custom fetch:**

You can also pass in a custom fetch client (for proxies, retries, or custom transports):

```typescript
const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    fetchClient: myCustomFetch,
  }),
});
```

### HTTP Stream

For environments that don't support SSE, use the HTTP stream adapter:

```typescript
import { useChat, fetchHttpStream } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchHttpStream("/api/chat"),
});
```

## Custom Adapters

For specialized use cases, you can create custom adapters to meet specific protocols or requirements:

```typescript
import { stream, type ConnectionAdapter } from "@tanstack/ai-react";
import type { StreamChunk, ModelMessage } from "@tanstack/ai";

const customAdapter: ConnectionAdapter = stream(
  async (messages: ModelMessage[], data?: Record<string, any>, signal?: AbortSignal) => {
    // Custom implementation
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, ...data }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Return async iterable of StreamChunk
    return processStream(response);
  }
);

const { messages } = useChat({
  connection: customAdapter,
});
```

## WebSocket Adapter Example

To create a WebSocket-based adapter:

```typescript
import { stream, type ConnectionAdapter } from "@tanstack/ai-react";
import type { StreamChunk, ModelMessage } from "@tanstack/ai";

function createWebSocketAdapter(url: string): ConnectionAdapter {
  return stream(async (messages: ModelMessage[], data?: Record<string, any>) => {
    return new ReadableStream<StreamChunk>({
      async start(controller) {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          ws.send(JSON.stringify({ messages, ...data }));
        };

        ws.onmessage = (event) => {
          const chunk = JSON.parse(event.data);
          controller.enqueue(chunk);
        };

        ws.onerror = (error) => {
          controller.error(error);
        };

        ws.onclose = () => {
          controller.close();
        };
      },
    });
  });
}

const { messages } = useChat({
  connection: createWebSocketAdapter("ws://localhost:8080/chat"),
});
```

## Adapter Interface

All adapters implement the `ConnectionAdapter` interface:

```typescript
interface ConnectionAdapter {
  connect(
    messages: UIMessage[] | ModelMessage[],
    data?: Record<string, any>,
    abortSignal?: AbortSignal
  ): AsyncIterable<StreamChunk>;
}
```

## Error Handling

Adapters should handle errors gracefully:

```typescript
const adapter = stream(async (messages, data, signal) => {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages, ...data }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return processStream(response);
  } catch (error) {
    if (error.name === "AbortError") {
      // Request was cancelled
      return;
    }
    throw error;
  }
});
```

## Authentication

Add authentication headers to adapters:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }),
});
```

For dynamic tokens, use a function:

```typescript
const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", () => ({
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })),
});
```

## Best Practices

- **Use SSE for most cases** - When possible, prefer the SSE adapter for it's reliable, well-supported capabilities
- **Handle reconnection** - Adapters should manage reconnections for transient network issues
- **Cancel on unmount** - When components unmount, cleanup connections to avoid memory leaks
- **Handle errors** - Provide meaningful error messages to users when requests fail
- **Support abort signals** - Adapters should allow for request cancellation via abort signals

## Next Steps

- [Streaming](./streaming) - Learn about streaming responses
- [API Reference](../api/ai-client) - Explore connection adapter APIs