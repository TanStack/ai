# Connection Adapters - Complete Guide

## Overview

Connection adapters provide a flexible, pluggable way to connect `ChatClient` and `useChat` to different types of streaming backends. Instead of being hardcoded to fetch and API endpoints, you can now use adapters for any streaming scenario.

## Why Connection Adapters?

**Before (Hardcoded):**
- ❌ Locked to HTTP fetch
- ❌ Locked to specific API format
- ❌ Hard to test
- ❌ Can't use with server functions
- ❌ Can't customize streaming logic

**After (Adapters):**
- ✅ Support any streaming source
- ✅ Easy to test with mocks
- ✅ Works with server functions
- ✅ Extensible for custom scenarios
- ✅ **Backward compatible**

## Built-in Adapters

### `fetchServerSentEvents(url, options?)`

**For:** HTTP APIs using Server-Sent Events format

**When to use:**
- Your backend uses `toStreamResponse()` from `@tanstack/ai`
- Standard HTTP streaming API
- Most common use case

**Example:**
```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

function Chat() {
  const chat = useChat({
    connection: fetchServerSentEvents("/api/chat", {
      headers: { "Authorization": "Bearer token" },
      credentials: "include",
    }),
  });
  
  return <ChatUI {...chat} />;
}
```

**Server format expected:**
```
data: {"type":"content","delta":"Hello","content":"Hello",...}
data: {"type":"content","delta":" world","content":"Hello world",...}
data: {"type":"done","finishReason":"stop",...}
data: [DONE]
```

### `fetchHttpStream(url, options?)`

**For:** HTTP APIs using raw newline-delimited JSON

**When to use:**
- Your backend streams newline-delimited JSON directly
- Custom streaming format
- Not using SSE

**Example:**
```typescript
import { useChat, fetchHttpStream } from "@tanstack/ai-react";

function Chat() {
  const chat = useChat({
    connection: fetchHttpStream("/api/chat", {
      headers: { "X-Custom-Header": "value" },
    }),
  });
  
  return <ChatUI {...chat} />;
}
```

**Server format expected:**
```
{"type":"content","delta":"Hello","content":"Hello",...}
{"type":"content","delta":" world","content":"Hello world",...}
{"type":"done","finishReason":"stop",...}
```

### `stream(factory)`

**For:** Direct async iterables (no HTTP)

**When to use:**
- TanStack Start server functions
- Server-side rendering
- Testing with mock streams
- Direct function calls

**Example with Server Function:**
```typescript
import { useChat, stream } from "@tanstack/ai-react";
import { serverChatFunction } from "./server";

function Chat() {
  const chat = useChat({
    connection: stream((messages, data) => 
      serverChatFunction({ messages, data })
    ),
  });
  
  return <ChatUI {...chat} />;
}
```

**Server function:**
```typescript
// server.ts
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export async function* serverChatFunction({ 
  messages 
}: { 
  messages: Message[] 
}) {
  yield* chat({
    adapter: openai(),
    model: "gpt-4o",
    messages,
  });
}
```

**Example with Mock for Testing:**
```typescript
import { ChatClient, stream } from "@tanstack/ai-client";

const mockStream = stream(async function* (messages) {
  yield { type: "content", delta: "Hello", content: "Hello" };
  yield { type: "content", delta: " world", content: "Hello world" };
  yield { type: "done", finishReason: "stop" };
});

const client = new ChatClient({ connection: mockStream });
```

## Custom Adapters

You can create custom connection adapters for any streaming scenario:

### WebSocket Example

```typescript
import type { ConnectionAdapter } from "@tanstack/ai-client";
import type { StreamChunk } from "@tanstack/ai";

function createWebSocketAdapter(url: string): ConnectionAdapter {
  let ws: WebSocket | null = null;
  
  return {
    async *connect(messages, data) {
      ws = new WebSocket(url);
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        ws!.onopen = resolve;
        ws!.onerror = reject;
      });
      
      // Send messages
      ws.send(JSON.stringify({ messages, data }));
      
      // Yield chunks as they arrive
      const queue: StreamChunk[] = [];
      let resolveNext: ((chunk: StreamChunk) => void) | null = null;
      let done = false;
      
      ws.onmessage = (event) => {
        const chunk = JSON.parse(event.data);
        if (resolveNext) {
          resolveNext(chunk);
          resolveNext = null;
        } else {
          queue.push(chunk);
        }
        
        if (chunk.type === "done") {
          done = true;
          ws!.close();
        }
      };
      
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          yield await new Promise<StreamChunk>((resolve) => {
            resolveNext = resolve;
          });
        }
      }
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
const chat = useChat({
  connection: createWebSocketAdapter("wss://api.example.com/chat"),
});
```

### GraphQL Subscription Example

```typescript
function createGraphQLSubscriptionAdapter(
  client: GraphQLClient,
  subscription: string
): ConnectionAdapter {
  let unsubscribe: (() => void) | null = null;
  
  return {
    async *connect(messages, data) {
      const observable = client.subscribe({
        query: subscription,
        variables: { messages, data },
      });
      
      const queue: StreamChunk[] = [];
      let resolveNext: ((chunk: StreamChunk) => void) | null = null;
      let done = false;
      
      unsubscribe = observable.subscribe({
        next: (result) => {
          const chunk = result.data.chatStream;
          if (resolveNext) {
            resolveNext(chunk);
            resolveNext = null;
          } else {
            queue.push(chunk);
          }
          
          if (chunk.type === "done") {
            done = true;
          }
        },
        error: (error) => {
          throw error;
        },
      }).unsubscribe;
      
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          yield await new Promise<StreamChunk>((resolve) => {
            resolveNext = resolve;
          });
        }
      }
    },
    
    abort() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  };
}
```

## Use Cases

### 1. Standard HTTP API

```typescript
const chat = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});
```

### 2. Authenticated API

```typescript
const chat = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    headers: {
      "Authorization": `Bearer ${token}`,
      "X-User-ID": userId,
    },
    credentials: "include",
  }),
});
```

### 3. TanStack Start Server Function

```typescript
// No HTTP overhead, direct function call
const chat = useChat({
  connection: stream((messages) => serverChat({ messages })),
});
```

### 4. WebSocket Real-time

```typescript
const chat = useChat({
  connection: createWebSocketAdapter("wss://api.example.com/chat"),
});
```

### 5. Testing with Mocks

```typescript
const mockAdapter = stream(async function* (messages) {
  yield { type: "content", delta: "Test", content: "Test" };
  yield { type: "done", finishReason: "stop" };
});

const client = new ChatClient({ connection: mockAdapter });
// Easy to test without real API!
```

## Benefits

### 1. Flexibility

Support any streaming source:
- ✅ HTTP (SSE or raw)
- ✅ WebSockets
- ✅ GraphQL subscriptions
- ✅ Server functions
- ✅ gRPC streams
- ✅ Custom protocols

### 2. Testability

Easy to test with mock adapters:

```typescript
const mockConnection = stream(async function* () {
  yield { type: "content", delta: "Hello", content: "Hello" };
  yield { type: "done", finishReason: "stop" };
});

const client = new ChatClient({ connection: mockConnection });
```

### 3. Type Safety

Full TypeScript support with proper types:

```typescript
interface ConnectionAdapter {
  connect(
    messages: any[],
    data?: Record<string, any>
  ): AsyncIterable<StreamChunk>;
  abort?(): void;
}
```

### 4. Performance

Direct streams bypass HTTP overhead:

```typescript
// No HTTP serialization/deserialization
const chat = useChat({
  connection: stream((messages) => directServerFunction(messages)),
});
```

## Advanced Examples

### Retry Logic

```typescript
function createRetryAdapter(
  baseAdapter: ConnectionAdapter,
  maxRetries: number = 3
): ConnectionAdapter {
  return {
    async *connect(messages, data) {
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          yield* baseAdapter.connect(messages, data);
          return; // Success
        } catch (error) {
          lastError = error as Error;
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
      }
      
      throw lastError;
    },
    
    abort() {
      baseAdapter.abort?.();
    },
  };
}

// Use it
const chat = useChat({
  connection: createRetryAdapter(
    fetchServerSentEvents("/api/chat"),
    3
  ),
});
```

### Caching Adapter

```typescript
function createCachingAdapter(
  baseAdapter: ConnectionAdapter
): ConnectionAdapter {
  const cache = new Map<string, StreamChunk[]>();
  
  return {
    async *connect(messages, data) {
      const cacheKey = JSON.stringify(messages);
      
      if (cache.has(cacheKey)) {
        // Replay from cache
        for (const chunk of cache.get(cacheKey)!) {
          yield chunk;
        }
        return;
      }
      
      // Cache chunks as they arrive
      const chunks: StreamChunk[] = [];
      for await (const chunk of baseAdapter.connect(messages, data)) {
        chunks.push(chunk);
        yield chunk;
      }
      
      cache.set(cacheKey, chunks);
    },
    
    abort() {
      baseAdapter.abort?.();
    },
  };
}
```

### Logging Adapter

```typescript
function createLoggingAdapter(
  baseAdapter: ConnectionAdapter,
  logger: (message: string, data: any) => void
): ConnectionAdapter {
  return {
    async *connect(messages, data) {
      logger("Connection started", { messages, data });
      
      try {
        for await (const chunk of baseAdapter.connect(messages, data)) {
          logger("Chunk received", chunk);
          yield chunk;
        }
        logger("Connection complete", {});
      } catch (error) {
        logger("Connection error", error);
        throw error;
      }
    },
    
    abort() {
      logger("Connection aborted", {});
      baseAdapter.abort?.();
    },
  };
}

// Use it
const chat = useChat({
  connection: createLoggingAdapter(
    fetchServerSentEvents("/api/chat"),
    console.log
  ),
});
```

## Best Practices

### 1. Use Built-in Adapters When Possible

```typescript
// ✅ Good - use built-in adapter
const chat = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});

// ❌ Avoid - custom adapter for standard SSE
const chat = useChat({
  connection: { 
    connect: async function* () { /* reimplementing SSE */ }
  },
});
```

### 2. Compose Adapters

```typescript
const chat = useChat({
  connection: createLoggingAdapter(
    createRetryAdapter(
      fetchServerSentEvents("/api/chat"),
      3
    ),
    console.log
  ),
});
```

### 3. Handle Errors Gracefully

```typescript
const connection: ConnectionAdapter = {
  async *connect(messages, data) {
    try {
      yield* fetchServerSentEvents("/api/chat").connect(messages, data);
    } catch (error) {
      // Emit error chunk instead of throwing
      yield {
        type: "error",
        error: { message: error.message, code: "CONNECTION_ERROR" },
      };
    }
  },
};
```

### 4. Implement Abort Support

```typescript
function createCustomAdapter(url: string): ConnectionAdapter {
  let abortController: AbortController | null = null;
  
  return {
    async *connect(messages, data) {
      abortController = new AbortController();
      
      const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify({ messages, data }),
        signal: abortController.signal,
      });
      
      // ... stream processing
    },
    
    abort() {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
    },
  };
}
```

## Testing

### Unit Testing ChatClient

```typescript
import { ChatClient, stream } from "@tanstack/ai-client";
import { describe, it, expect } from "vitest";

describe("ChatClient with mock adapter", () => {
  it("should process messages", async () => {
    const mockAdapter = stream(async function* (messages) {
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Hello");
      
      yield { type: "content", delta: "Hi", content: "Hi" };
      yield { type: "done", finishReason: "stop" };
    });
    
    const client = new ChatClient({ connection: mockAdapter });
    
    await client.sendMessage("Hello");
    
    expect(client.getMessages()).toHaveLength(2);
    expect(client.getMessages()[1].content).toBe("Hi");
  });
});
```

### Integration Testing with React

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { useChat, stream } from "@tanstack/ai-react";

test("useChat with mock adapter", async () => {
  const mockAdapter = stream(async function* () {
    yield { type: "content", delta: "Test", content: "Test" };
    yield { type: "done", finishReason: "stop" };
  });
  
  const { result } = renderHook(() => 
    useChat({ connection: mockAdapter })
  );
  
  await result.current.sendMessage("Hello");
  
  await waitFor(() => {
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe("Test");
  });
});
```

## Reference

### ConnectionAdapter Interface

```typescript
interface ConnectionAdapter {
  /**
   * Connect and return a stream of chunks
   * @param messages - The conversation messages
   * @param data - Additional data to send
   * @returns AsyncIterable of StreamChunks
   */
  connect(
    messages: any[],
    data?: Record<string, any>
  ): AsyncIterable<StreamChunk>;
  
  /**
   * Optional: Abort the current connection
   */
  abort?(): void;
}
```

### FetchConnectionOptions

```typescript
interface FetchConnectionOptions {
  headers?: Record<string, string> | Headers;
  credentials?: RequestCredentials; // "omit" | "same-origin" | "include"
  signal?: AbortSignal;
}
```

## See Also

- 📖 [ChatClient API](../packages/ai-client/README.md)
- 📖 [useChat Hook](../packages/ai-react/README.md)
- 📖 [Tool Execution Loop](TOOL_EXECUTION_LOOP.md)
- 📖 [Connection Adapters Examples](../packages/ai-client/CONNECTION_ADAPTERS.md)

