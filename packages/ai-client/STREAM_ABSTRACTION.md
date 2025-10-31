# Stream Abstraction

The `stream.ts` module provides a transport-agnostic abstraction for processing streaming AI responses. This allows you to handle different transport protocols (SSE, WebSocket, etc.) with a unified interface.

## Architecture

The stream abstraction is built around three core concepts:

1. **StreamSource** - An interface representing any source of streaming data
2. **StreamEvent** - Typed events that can be emitted during streaming
3. **StreamEventHandlers** - Callbacks for handling different event types

## StreamSource Type

```typescript
type StreamSource = AsyncIterable<StreamChunk>;
```

A `StreamSource` is simply an async iterable that yields `StreamChunk` objects. This means you can use `for await` to iterate over chunks:

```typescript
const source = createResponseStreamSource(response);

for await (const chunk of source) {
  console.log('Chunk:', chunk);
}
```

This design works with:
- Async generators
- Any object with `[Symbol.asyncIterator]`
- Fetch API Response bodies (via `createResponseStreamSource`)
- WebSocket connections
- Server-Sent Events (SSE)
- Any custom streaming mechanism

### Creating Stream Sources

#### From a Fetch Response (SSE)

```typescript
import { createResponseStreamSource } from '@tanstack/ai-client';

const response = await fetch('/api/chat', { method: 'POST', body: ... });
const source = createResponseStreamSource(response);

// You can now iterate over chunks
for await (const chunk of source) {
  console.log('Chunk:', chunk);
}
```

#### Custom Stream Source (WebSocket Example)

```typescript
import type { StreamChunk } from '@tanstack/ai';

async function* createWebSocketStreamSource(
  ws: WebSocket
): AsyncGenerator<StreamChunk> {
  const queue: StreamChunk[] = [];
  let resolver: ((chunk: StreamChunk | null) => void) | null = null;

  ws.onmessage = (event) => {
    try {
      const chunk: StreamChunk = JSON.parse(event.data);
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
      resolver = null;
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
}

// Usage
const ws = new WebSocket('ws://localhost:3000/chat');
const source = createWebSocketStreamSource(ws);

for await (const chunk of source) {
  console.log('WebSocket chunk:', chunk);
}
```

## Stream Events

The stream processor emits typed events:

```typescript
type StreamEvent =
  | { type: "content"; content: string }
  | { type: "tool_call"; index: number; toolCall: ToolCall }
  | { type: "error"; error: Error }
  | { type: "chunk"; chunk: StreamChunk };
```

## Processing Streams

### Using `for await` Directly

```typescript
import { createResponseStreamSource } from '@tanstack/ai-client';

const response = await fetch('/api/chat', { method: 'POST', body: ... });
const source = createResponseStreamSource(response);

let content = '';
const toolCalls: Map<number, ToolCall> = new Map();

for await (const chunk of source) {
  if (chunk.type === 'content') {
    content = chunk.content;
    console.log('Content update:', content);
  } else if (chunk.type === 'tool_call') {
    console.log('Tool call:', chunk.toolCall);
    toolCalls.set(chunk.index, chunk.toolCall);
  }
}

console.log('Final content:', content);
console.log('Tool calls:', Array.from(toolCalls.values()));
```

### Using `processStream` Helper

```typescript
import { processStream, createResponseStreamSource } from '@tanstack/ai-client';

const response = await fetch('/api/chat', { method: 'POST', body: ... });
const source = createResponseStreamSource(response);

const result = await processStream(source, {
  onContent: (content) => {
    console.log('Content update:', content);
  },
  onToolCall: (index, toolCall) => {
    console.log('Tool call:', toolCall);
  },
  onError: (error) => {
    console.error('Stream error:', error);
  },
  onChunk: (chunk) => {
    console.log('Raw chunk:', chunk);
  },
});

console.log('Final result:', result);
// { content: "...", toolCalls: [...] }
```

### Using in Custom Implementations

```typescript
class CustomChatClient {
  async chat(message: string) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });

    const source = createResponseStreamSource(response);
    
    // Track state updates
    const messages: Message[] = [];
    let currentMessage: Message = {
      role: 'assistant',
      content: '',
    };

    const result = await processStream(source, {
      onContent: (content) => {
        // Update UI with streaming content
        currentMessage.content = content;
        this.updateUI(currentMessage);
      },
      onToolCall: (index, toolCall) => {
        // Handle tool calls
        this.executeToolCall(toolCall);
      },
    });

    // Final message is ready
    messages.push({
      role: 'assistant',
      content: result.content,
      toolCalls: result.toolCalls,
    });

    return messages;
  }
}
```

## Advanced: Custom Transport Protocols

The abstraction makes it easy to support different transport protocols:

### Example: Server-Sent Events (Built-in)

```typescript
const response = await fetch('/api/chat');
const source = createResponseStreamSource(response);
const result = await processStream(source, handlers);
```

### Example: WebSocket

```typescript
const ws = new WebSocket('ws://localhost:3000/chat');
const source = createWebSocketStreamSource(ws);
const result = await processStream(source, handlers);
```

### Example: Polling

```typescript
async function* createPollingStreamSource(
  url: string,
  interval: number
): AsyncGenerator<StreamChunk> {
  let lastId = 0;

  while (true) {
    const response = await fetch(`${url}?since=${lastId}`);
    const data = await response.json();

    if (data.done) break;

    lastId = data.id;
    
    if (data.chunk) {
      yield data.chunk as StreamChunk;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// Usage
const source = createPollingStreamSource('/api/poll', 100);

for await (const chunk of source) {
  console.log('Polled chunk:', chunk);
}
```

## Parsing Stream Chunks

The `parseStreamChunk` function handles SSE format:

```typescript
import { parseStreamChunk } from '@tanstack/ai-client';

const chunk = `data: {"type":"content","content":"Hello"}
data: {"type":"content","content":"Hello World"}`;

const lines = parseStreamChunk(chunk);
// ['{"type":"content","content":"Hello"}', '{"type":"content","content":"Hello World"}']
```

## Type Safety

All stream operations are fully typed:

```typescript
import type { 
  StreamSource, 
  StreamEventHandlers, 
  StreamResult,
  ToolCall,
} from '@tanstack/ai-client';

// Your custom handler
const handlers: StreamEventHandlers = {
  onContent: (content: string) => {
    // content is typed as string
  },
  onToolCall: (index: number, toolCall: ToolCall) => {
    // toolCall is fully typed
    console.log(toolCall.function.name);
  },
};

// Result is typed
const result: StreamResult = await processStream(source, handlers);
result.content; // string
result.toolCalls; // ToolCall[] | undefined
```

## Benefits

✅ **Transport Agnostic** - Works with any streaming mechanism  
✅ **Type Safe** - Full TypeScript support  
✅ **Composable** - Easy to create custom stream sources  
✅ **Testable** - Mock stream sources for testing  
✅ **Flexible** - Support for SSE, WebSocket, polling, etc.  
✅ **Separation of Concerns** - Stream logic independent of chat client  

## Future Extensions

This abstraction makes it easy to add support for:
- WebRTC data channels
- GraphQL subscriptions
- Custom binary protocols
- Compression/decompression
- Retry/reconnection logic
- Rate limiting
- Progress tracking

