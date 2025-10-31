# Stream Examples

## Using `for await` with Streams

### Basic SSE Stream

```typescript
import { createResponseStreamSource } from '@tanstack/ai-client';

const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello!' }),
});

const stream = createResponseStreamSource(response);

for await (const chunk of stream) {
  if (chunk.type === 'content') {
    console.log('Content:', chunk.content);
  }
}
```

### WebSocket Stream

```typescript
import type { StreamChunk } from '@tanstack/ai';

async function* createWebSocketStream(
  url: string
): AsyncGenerator<StreamChunk> {
  const ws = new WebSocket(url);
  const queue: StreamChunk[] = [];
  let resolver: ((chunk: StreamChunk | null) => void) | null = null;

  // Wait for connection
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

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
      console.error('Parse error:', error);
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
}

// Usage
const stream = createWebSocketStream('ws://localhost:3000/chat');

for await (const chunk of stream) {
  console.log('Chunk:', chunk);
}
```

### Combining Multiple Streams

```typescript
async function* combineStreams(
  ...sources: AsyncIterable<StreamChunk>[]
): AsyncGenerator<StreamChunk> {
  for (const source of sources) {
    for await (const chunk of source) {
      yield chunk;
    }
  }
}

// Usage
const stream1 = createResponseStreamSource(response1);
const stream2 = createResponseStreamSource(response2);

const combined = combineStreams(stream1, stream2);

for await (const chunk of combined) {
  console.log('Combined chunk:', chunk);
}
```

### Filtering Stream Chunks

```typescript
async function* filterContentChunks(
  source: AsyncIterable<StreamChunk>
): AsyncGenerator<StreamChunk> {
  for await (const chunk of source) {
    if (chunk.type === 'content') {
      yield chunk;
    }
  }
}

// Usage
const response = await fetch('/api/chat', { method: 'POST', body: ... });
const stream = createResponseStreamSource(response);
const contentOnly = filterContentChunks(stream);

for await (const chunk of contentOnly) {
  console.log('Content chunk:', chunk.content);
}
```

### Transforming Stream Chunks

```typescript
async function* mapStream<T, U>(
  source: AsyncIterable<T>,
  transform: (item: T) => U
): AsyncGenerator<U> {
  for await (const item of source) {
    yield transform(item);
  }
}

// Usage
const response = await fetch('/api/chat', { method: 'POST', body: ... });
const stream = createResponseStreamSource(response);

const uppercased = mapStream(stream, (chunk) => {
  if (chunk.type === 'content') {
    return { ...chunk, content: chunk.content.toUpperCase() };
  }
  return chunk;
});

for await (const chunk of uppercased) {
  console.log('Uppercased:', chunk);
}
```

### Collecting Stream Results

```typescript
async function collectStream(
  source: AsyncIterable<StreamChunk>
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  let content = '';
  const toolCalls = new Map<number, ToolCall>();

  for await (const chunk of source) {
    if (chunk.type === 'content') {
      content = chunk.content;
    } else if (chunk.type === 'tool_call') {
      toolCalls.set(chunk.index, {
        id: chunk.toolCall.id,
        type: 'function',
        function: {
          name: chunk.toolCall.function.name,
          arguments: chunk.toolCall.function.arguments,
        },
      });
    }
  }

  return {
    content,
    toolCalls: Array.from(toolCalls.values()),
  };
}

// Usage
const response = await fetch('/api/chat', { method: 'POST', body: ... });
const stream = createResponseStreamSource(response);
const result = await collectStream(stream);

console.log('Final result:', result);
```

### Error Handling

```typescript
async function* safeStream(
  source: AsyncIterable<StreamChunk>
): AsyncGenerator<StreamChunk> {
  try {
    for await (const chunk of source) {
      if (chunk.type === 'error') {
        throw new Error(chunk.error.message);
      }
      yield chunk;
    }
  } catch (error) {
    console.error('Stream error:', error);
    throw error;
  }
}

// Usage
try {
  const response = await fetch('/api/chat', { method: 'POST', body: ... });
  const stream = createResponseStreamSource(response);
  const safe = safeStream(stream);

  for await (const chunk of safe) {
    console.log('Chunk:', chunk);
  }
} catch (error) {
  console.error('Failed to process stream:', error);
}
```

### Rate Limiting

```typescript
async function* throttleStream(
  source: AsyncIterable<StreamChunk>,
  delayMs: number
): AsyncGenerator<StreamChunk> {
  for await (const chunk of source) {
    yield chunk;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

// Usage
const response = await fetch('/api/chat', { method: 'POST', body: ... });
const stream = createResponseStreamSource(response);
const throttled = throttleStream(stream, 100); // 100ms delay between chunks

for await (const chunk of throttled) {
  console.log('Throttled chunk:', chunk);
}
```

### Buffering

```typescript
async function* bufferStream(
  source: AsyncIterable<StreamChunk>,
  size: number
): AsyncGenerator<StreamChunk[]> {
  let buffer: StreamChunk[] = [];

  for await (const chunk of source) {
    buffer.push(chunk);
    if (buffer.length >= size) {
      yield buffer;
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    yield buffer;
  }
}

// Usage
const response = await fetch('/api/chat', { method: 'POST', body: ... });
const stream = createResponseStreamSource(response);
const buffered = bufferStream(stream, 5); // Buffer 5 chunks at a time

for await (const chunks of buffered) {
  console.log('Buffered chunks:', chunks);
}
```

### Taking First N Chunks

```typescript
async function* takeStream(
  source: AsyncIterable<StreamChunk>,
  count: number
): AsyncGenerator<StreamChunk> {
  let taken = 0;
  for await (const chunk of source) {
    if (taken >= count) break;
    yield chunk;
    taken++;
  }
}

// Usage
const response = await fetch('/api/chat', { method: 'POST', body: ... });
const stream = createResponseStreamSource(response);
const first10 = takeStream(stream, 10); // Only first 10 chunks

for await (const chunk of first10) {
  console.log('Chunk:', chunk);
}
```

### Retry Logic

```typescript
async function* retryStream(
  createSource: () => AsyncIterable<StreamChunk>,
  maxRetries: number = 3
): AsyncGenerator<StreamChunk> {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const source = createSource();
      for await (const chunk of source) {
        yield chunk;
      }
      break; // Success
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        throw error;
      }
      console.log(`Retry ${retries}/${maxRetries}...`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
    }
  }
}

// Usage
const stream = retryStream(
  () => createResponseStreamSource(
    fetch('/api/chat', { method: 'POST', body: ... })
  ),
  3
);

for await (const chunk of stream) {
  console.log('Chunk:', chunk);
}
```

