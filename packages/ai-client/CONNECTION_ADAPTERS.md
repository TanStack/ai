# Connection Adapters

Connection adapters provide a flexible way to connect `ChatClient` to different types of streaming backends. Instead of being hardcoded to fetch and API endpoints, you can now use adapters for different scenarios.

## Overview

A connection adapter is an object with a `connect()` method that returns an `AsyncIterable<StreamChunk>`:

```typescript
interface ConnectionAdapter {
  connect(
    messages: any[],
    data?: Record<string, any>
  ): AsyncIterable<StreamChunk>;
  
  abort?(): void; // Optional abort support
}
```

## Built-in Adapters

### `fetchServerSentEvents(url, options?)`

For Server-Sent Events (SSE) format - the HTTP streaming standard.

**When to use:** Your backend uses `toStreamResponse()` from `@tanstack/ai`

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat", {
    headers: {
      "Authorization": "Bearer token",
      "X-Custom-Header": "value"
    },
    credentials: "include", // "omit" | "same-origin" | "include"
  }),
});

await client.sendMessage("Hello!");
```

**Format expected:** Server-Sent Events with `data:` prefix

```
data: {"type":"content","delta":"Hello","content":"Hello",...}
data: {"type":"content","delta":" world","content":"Hello world",...}
data: {"type":"done","finishReason":"stop",...}
data: [DONE]
```

### `fetchHttpStream(url, options?)`

For raw HTTP streaming with newline-delimited JSON.

**When to use:** Your backend streams newline-delimited JSON directly (custom streaming)

```typescript
import { ChatClient, fetchHttpStream } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchHttpStream("/api/chat", {
    headers: { "Authorization": "Bearer token" }
  }),
});

await client.sendMessage("Hello!");
```

**Format expected:** Newline-delimited JSON

```
{"type":"content","delta":"Hello","content":"Hello",...}
{"type":"content","delta":" world","content":"Hello world",...}
{"type":"done","finishReason":"stop",...}
```

### `stream(factory)`

For direct async iterables - use with server functions or in-memory streams.

**When to use:**
- TanStack Start server functions
- Direct access to streaming functions
- Testing with mock streams

```typescript
import { ChatClient, stream } from "@tanstack/ai-client";
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const client = new ChatClient({
  connection: stream((messages, data) => {
    // Return an async iterable directly
    return chat({
      adapter: openai(),
      model: "gpt-4o",
      messages,
    });
  }),
});

await client.sendMessage("Hello!");
```

**Benefits:**
- ✅ No HTTP overhead
- ✅ Perfect for server components
- ✅ Easy to test with mocks

## With React

All connection adapters work seamlessly with `useChat`:

```typescript
import { useChat } from "@tanstack/ai-react";
import { fetchServerSentEvents, fetchHttpStream, stream } from "@tanstack/ai-client";

// SSE connection
function ChatSSE() {
  const chat = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });
  
  return <ChatUI {...chat} />;
}

// HTTP stream connection
function ChatHTTP() {
  const chat = useChat({
    connection: fetchHttpStream("/api/chat"),
  });
  
  return <ChatUI {...chat} />;
}

// Direct stream connection (server functions)
function ChatDirect() {
  const chat = useChat({
    connection: stream((messages) => myServerFunction({ messages })),
  });
  
  return <ChatUI {...chat} />;
}
```

## Custom Adapters

You can create custom connection adapters for special scenarios:

```typescript
import type { ConnectionAdapter } from "@tanstack/ai-client";

// Example: WebSocket connection adapter
function createWebSocketAdapter(url: string): ConnectionAdapter {
  let ws: WebSocket | null = null;
  
  return {
    async *connect(messages, data) {
      ws = new WebSocket(url);
      
      return new Promise((resolve, reject) => {
        ws.onopen = () => {
          ws.send(JSON.stringify({ messages, data }));
        };
        
        ws.onmessage = (event) => {
          const chunk = JSON.parse(event.data);
          // Yield chunks as they arrive
        };
        
        ws.onerror = (error) => reject(error);
        ws.onclose = () => resolve();
      });
    },
    
    abort() {
      if (ws) {
        ws.close();
        ws = null;
      }
    },
  };
}

// Use it
const client = new ChatClient({
  connection: createWebSocketAdapter("wss://api.example.com/chat"),
});
```

## Benefits

✅ **Flexibility** - Support SSE, HTTP streams, WebSockets, server functions, etc.

✅ **Testability** - Easy to mock with custom adapters

✅ **Type Safety** - Full TypeScript support

✅ **Extensible** - Create custom adapters for any streaming scenario

