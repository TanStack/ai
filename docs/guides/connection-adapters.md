# Connection Adapters

Connection adapters handle the communication between your client and server for streaming chat responses. TanStack AI provides built-in adapters and supports custom implementations.

## Built-in Adapters

### Server-Sent Events (SSE)

SSE is the recommended adapter for most use cases. It provides reliable streaming with automatic reconnection:

```typescript
import { fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});
```

**Options:**

```typescript
fetchServerSentEvents("/api/chat", {
  headers: {
    Authorization: "Bearer token",
  },
  method: "POST",
})
```

### HTTP Stream

For environments that don't support SSE:

```typescript
import { fetchHttpStream } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchHttpStream("/api/chat"),
});
```

## Custom Adapters

Create custom adapters for specific protocols or requirements:

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

Here's an example of a WebSocket adapter:

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
import { fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }),
});
```

## Best Practices

1. **Use SSE for most cases** - It's reliable and well-supported
2. **Handle reconnection** - Built-in adapters handle this automatically
3. **Cancel on unmount** - Clean up connections when components unmount
4. **Handle errors** - Provide meaningful error messages
5. **Support abort signals** - Allow cancellation of in-flight requests

## Next Steps

- [Streaming](./streaming) - Learn about streaming responses
- [API Reference](../api/ai-client) - Explore connection adapter APIs

