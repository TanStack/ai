# @tanstack/ai-client

Framework-agnostic headless client for TanStack AI chat functionality.

## Overview

`@tanstack/ai-client` provides a headless `ChatClient` class that manages chat state and streaming AI interactions without any framework dependencies. This makes it ideal for:

- Building custom framework integrations
- Server-side usage
- Testing and automation
- Any JavaScript/TypeScript environment

**Note:** The backend should use `@tanstack/ai`'s `chat()` method which **automatically handles tool execution in a loop**. The client receives tool execution events via the stream.

## Installation

```bash
pnpm add @tanstack/ai-client
# or
npm install @tanstack/ai-client
# or
yarn add @tanstack/ai-client
```

## Basic Usage

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

// Create a client instance
const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
  onLoadingChange: (isLoading) => {
    console.log("Loading state:", isLoading);
  },
  onErrorChange: (error) => {
    console.log("Error:", error);
  },
});

// Send a message
await client.sendMessage("Hello, AI!");

// Get current messages
const messages = client.getMessages();

// Append a message manually
await client.append({
  role: "user",
  content: "Another message",
});

// Reload the last response
await client.reload();

// Stop the current response
client.stop();

// Clear all messages
client.clear();
```

## Connection Adapters

Connection adapters provide a flexible way to connect to different types of streaming backends.

### `fetchServerSentEvents(url, options?)`

For Server-Sent Events (SSE) format - the standard for HTTP streaming:

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

**Use when:** Your backend uses `toStreamResponse()` from `@tanstack/ai`

**Format expected:** Server-Sent Events with `data:` prefix
```
data: {"type":"content","delta":"Hello","content":"Hello",...}
data: {"type":"content","delta":" world","content":"Hello world",...}
data: {"type":"done","finishReason":"stop",...}
data: [DONE]
```

### `fetchHttpStream(url, options?)`

For raw HTTP streaming with newline-delimited JSON:

```typescript
import { ChatClient, fetchHttpStream } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchHttpStream("/api/chat", {
    headers: { "Authorization": "Bearer token" }
  }),
});

await client.sendMessage("Hello!");
```

**Use when:** Your backend streams newline-delimited JSON directly

**Format expected:** Newline-delimited JSON
```
{"type":"content","delta":"Hello","content":"Hello",...}
{"type":"content","delta":" world","content":"Hello world",...}
{"type":"done","finishReason":"stop",...}
```

### `stream(factory)`

For direct async iterables - use with server functions or in-memory streams:

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

**Use when:**
- TanStack Start server functions
- Direct access to streaming functions
- Testing with mock streams

**Benefits:**
- ✅ No HTTP overhead
- ✅ Perfect for server components
- ✅ Easy to test with mocks

### Custom Adapters

You can create custom connection adapters for special scenarios:

```typescript
import type { ConnectionAdapter } from "@tanstack/ai-client";

// Example: WebSocket connection adapter
function createWebSocketAdapter(url: string): ConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      const ws = new WebSocket(url);
      
      // Handle abort signal
      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          ws.close();
        });
      }
      
      return new Promise((resolve, reject) => {
        ws.onopen = () => {
          ws.send(JSON.stringify({ messages, data }));
        };
        
        ws.onmessage = (event) => {
          // Check if aborted before processing
          if (abortSignal?.aborted) {
            ws.close();
            return;
          }
          
          const chunk = JSON.parse(event.data);
          // Yield chunks as they arrive
        };
        
        ws.onerror = (error) => reject(error);
        ws.onclose = () => resolve();
      });
    },
  };
}

// Use it
const client = new ChatClient({
  connection: createWebSocketAdapter("wss://api.example.com/chat"),
});
```

## Stream Processor

The stream processor provides configurable text chunking strategies to control UI update frequency and improve user experience.

### Default Behavior

By default, `ChatClient` uses immediate chunking (every chunk updates the UI):

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});

await client.sendMessage("Hello!");
```

### Using Chunk Strategies

#### Punctuation Strategy

Update the UI only when punctuation is encountered (smoother for reading):

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  PunctuationStrategy,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new PunctuationStrategy(),
  },
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});

await client.sendMessage("Tell me a story.");
```

#### Batch Strategy

Update the UI every N chunks (reduces update frequency):

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  BatchStrategy,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new BatchStrategy(10), // Update every 10 chunks
  },
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});

await client.sendMessage("Explain quantum physics.");
```

#### Combining Strategies

Use `CompositeStrategy` to combine multiple strategies (OR logic):

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  CompositeStrategy,
  PunctuationStrategy,
  BatchStrategy,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new CompositeStrategy([
      new PunctuationStrategy(), // Update on punctuation
      new BatchStrategy(20), // OR every 20 chunks
    ]),
  },
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});
```

#### Custom Chunk Strategy

Create your own strategy for fine-grained control:

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  type ChunkStrategy,
} from "@tanstack/ai-client";

class CustomStrategy implements ChunkStrategy {
  private wordCount = 0;

  shouldEmit(chunk: string, accumulated: string): boolean {
    // Count words in the chunk
    const words = chunk.split(/\s+/).filter((w) => w.length > 0);
    this.wordCount += words.length;

    // Emit every 5 words
    if (this.wordCount >= 5) {
      this.wordCount = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.wordCount = 0;
  }
}

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new CustomStrategy(),
  },
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});
```

### Built-in Strategies

| Strategy                 | When it Emits                             | Best For                     |
| ------------------------ | ----------------------------------------- | ---------------------------- |
| `ImmediateStrategy`      | Every chunk                               | Default, real-time feel      |
| `PunctuationStrategy`    | When chunk contains `. , ! ? ; :`         | Natural reading flow         |
| `BatchStrategy(N)`       | Every N chunks                            | Reducing update frequency    |
| `WordBoundaryStrategy`   | When chunk ends with whitespace           | Preventing word cuts         |
| `DebounceStrategy(ms)`   | After ms of silence                       | High-frequency streams       |
| `CompositeStrategy([])`  | When ANY sub-strategy emits (OR)          | Combining multiple rules     |
| Custom `ChunkStrategy`   | Your custom `shouldEmit()` logic          | Fine-grained control         |

### Parallel Tool Calls

The stream processor automatically handles multiple parallel tool calls:

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    // Use any chunk strategy
  },
  onMessagesChange: (messages) => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.toolCalls) {
      console.log("Tool calls in progress:", lastMessage.toolCalls);
      // Can have multiple tool calls streaming simultaneously!
    }
  },
});

await client.sendMessage("Get weather in Paris and Tokyo");
```

### Custom Stream Parser

For handling non-standard stream formats:

```typescript
import {
  ChatClient,
  stream,
  type StreamParser,
  type StreamChunk,
} from "@tanstack/ai-client";

class CustomParser implements StreamParser {
  async *parse(source: AsyncIterable<any>): AsyncIterable<StreamChunk> {
    for await (const chunk of source) {
      // Custom parsing logic for your stream format
      if (chunk.message) {
        yield {
          type: "text",
          content: chunk.message,
        };
      }

      if (chunk.tool) {
        yield {
          type: "tool-call-delta",
          toolCallIndex: chunk.tool.index,
          toolCall: {
            id: chunk.tool.id,
            function: {
              name: chunk.tool.name,
              arguments: chunk.tool.args,
            },
          },
        };
      }
    }
  }
}

const client = new ChatClient({
  connection: stream(async (messages) => {
    // Your custom stream source
    return customStreamGenerator(messages);
  }),
  streamProcessor: {
    parser: new CustomParser(),
  },
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});
```

## Working with Streams Directly

Connection adapters return async iterables of `StreamChunk` objects, which you can iterate over directly if needed:

```typescript
import type { StreamChunk } from '@tanstack/ai';
import { fetchServerSentEvents } from '@tanstack/ai-client';

const connection = fetchServerSentEvents('/api/chat');

// Get the stream directly
const stream = connection.connect(messages, data);

// Iterate over chunks
for await (const chunk of stream) {
  if (chunk.type === 'content') {
    console.log('Content:', chunk.content);
  } else if (chunk.type === 'tool_call') {
    console.log('Tool call:', chunk.toolCall);
  }
}
```

### Custom Connection Adapter Example

You can create custom connection adapters for any transport protocol. Here's a WebSocket example:

```typescript
import type { ConnectionAdapter, StreamChunk } from '@tanstack/ai-client';

function createWebSocketAdapter(url: string): ConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      const ws = new WebSocket(url);
      
      // Handle abort signal
      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          ws.close();
        });
      }
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });
      
      // Send messages
      ws.send(JSON.stringify({ messages, data }));
      
      // Yield chunks as they arrive
      const queue: StreamChunk[] = [];
      let resolver: ((chunk: StreamChunk | null) => void) | null = null;

      ws.onmessage = (event) => {
        try {
          const chunk: StreamChunk = JSON.parse(event.data);
          if (abortSignal?.aborted) {
            ws.close();
            return;
          }
          if (resolver) {
            resolver(chunk);
            resolver = null;
          } else {
            queue.push(chunk);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        if (resolver) {
          resolver(null);
        }
      };

      try {
        while (true) {
          if (queue.length > 0) {
            yield queue.shift()!;
          } else {
            const chunk = await new Promise<StreamChunk | null>((resolve) => {
              resolver = resolve;
            });
            if (chunk === null) break;
            yield chunk;
          }
        }
      } finally {
        ws.close();
      }
    },
  };
}

// Use it
const client = new ChatClient({
  connection: createWebSocketAdapter("wss://api.example.com/chat"),
});
```

## API Reference

### `ChatClient`

The main class for managing chat interactions.

#### Constructor Options

```typescript
interface ChatClientOptions {
  // Connection adapter (required)
  connection: ConnectionAdapter;

  // Initial messages
  initialMessages?: UIMessage[];

  // Unique chat identifier
  id?: string;

  // Callbacks
  onResponse?: (response: Response) => void | Promise<void>;
  onChunk?: (chunk: StreamChunk) => void;
  onFinish?: (message: UIMessage) => void;
  onError?: (error: Error) => void;
  onMessagesChange?: (messages: UIMessage[]) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onErrorChange?: (error: Error | undefined) => void;

  // Stream processor configuration
  streamProcessor?: {
    chunkStrategy?: ChunkStrategy;
    parser?: StreamParser;
  };

  // Request configuration (for legacy api option)
  api?: string;
  headers?: Record<string, string> | Headers;
  body?: Record<string, any>;
  credentials?: "omit" | "same-origin" | "include";
  fetch?: typeof fetch;
}
```

#### Methods

- `sendMessage(content: string): Promise<void>` - Send a text message
- `append(message: Message | UIMessage): Promise<void>` - Append any message
- `reload(): Promise<void>` - Reload the last assistant response
- `stop(): void` - Stop the current streaming response
- `clear(): void` - Clear all messages
- `getMessages(): UIMessage[]` - Get current messages
- `getIsLoading(): boolean` - Get loading state
- `getError(): Error | undefined` - Get current error
- `setMessagesManually(messages: UIMessage[]): void` - Manually set messages

## Framework Integration

This package is used by framework-specific packages like `@tanstack/ai-react`, which provide hooks and components for their respective frameworks.

### Example: Custom React Hook

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";
import { useState, useRef, useCallback } from "react";

function useCustomChat(options) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const clientRef = useRef(null);

  if (!clientRef.current) {
    clientRef.current = new ChatClient({
      connection: fetchServerSentEvents("/api/chat"),
      ...options,
      onMessagesChange: setMessages,
      onLoadingChange: setIsLoading,
    });
  }

  const sendMessage = useCallback((content) => {
    return clientRef.current.sendMessage(content);
  }, []);

  return { messages, isLoading, sendMessage };
}
```

### With React

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

## Backend Example

Your backend should use `@tanstack/ai`'s `chat()` method with automatic tool execution:

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  // chat() automatically executes tools in a loop
  const stream = chat({
    adapter: openai(),
    model: "gpt-4o",
    messages,
    tools: [weatherTool], // Tools are auto-executed when called
    agentLoopStrategy: maxIterations(5), // Control loop behavior
  });

  // Stream includes tool_call and tool_result chunks
  return toStreamResponse(stream);
}
```

The client will receive:

- `content` chunks - text from the model
- `tool_call` chunks - when model calls a tool (auto-executed by SDK)
- `tool_result` chunks - results from tool execution (auto-emitted by SDK)
- `done` chunk - conversation complete

## License

MIT
