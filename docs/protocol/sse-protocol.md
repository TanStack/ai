---
title: Server-Sent Events (SSE) Protocol
id: sse-protocol
---

Server-Sent Events (SSE) is a standard HTTP-based protocol for server-to-client streaming. It provides:

- ✅ **Automatic reconnection** - Browser handles connection drops
- ✅ **Event-driven** - Native browser EventSource API
- ✅ **Simple protocol** - Text-based, easy to debug
- ✅ **Wide support** - Works in all modern browsers
- ✅ **Efficient** - Single long-lived HTTP connection

This document describes how TanStack AI transmits StreamChunks over Server-Sent Events (SSE), the recommended protocol for most use cases.

## Protocol Specification

### HTTP Request

**Method:** `POST`

**Headers:**
```http
Content-Type: application/json
```

**Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "data": {
    // Optional additional data
  }
}
```

### HTTP Response

**Status:** `200 OK`

**Headers:**
```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Body:** Stream of SSE events

---

## SSE Format

Each StreamChunk is transmitted as an SSE event with the following format:

```
data: {JSON_ENCODED_CHUNK}\n\n
```

### Key Points

1. **Each event starts with `data: `**
2. **Followed by the JSON-encoded chunk**
3. **Ends with double newline `\n\n`**
4. **No event names or IDs** (not required for our use case)

### Examples

#### Content Chunk

```
data: {"type":"content","id":"chatcmpl-abc123","model":"gpt-4o","timestamp":1701234567890,"delta":"Hello","content":"Hello","role":"assistant"}\n\n
```

#### Tool Call Chunk

```
data: {"type":"tool_call","id":"chatcmpl-abc123","model":"gpt-4o","timestamp":1701234567891,"toolCall":{"id":"call_xyz","type":"function","function":{"name":"get_weather","arguments":"{\"location\":\"SF\"}"}},"index":0}\n\n
```

#### Done Chunk

```
data: {"type":"done","id":"chatcmpl-abc123","model":"gpt-4o","timestamp":1701234567892,"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":5,"totalTokens":15}}\n\n
```

---

## Stream Lifecycle

### 1. Client Initiates Connection

```typescript
// Client code
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ messages }),
});
```

### 2. Server Sends Response Header

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### 3. Server Streams Chunks

The server sends multiple `data:` events as chunks are generated:

```
data: {"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567890,"delta":"The","content":"The"}\n\n
data: {"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567891,"delta":" weather","content":"The weather"}\n\n
data: {"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567892,"delta":" is","content":"The weather is"}\n\n
data: {"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567893,"delta":" sunny","content":"The weather is sunny"}\n\n
data: {"type":"done","id":"msg_1","model":"gpt-4o","timestamp":1701234567894,"finishReason":"stop"}\n\n
```

### 4. Stream Completion

After the final chunk, the server sends a completion marker:

```
data: [DONE]\n\n
```

Then closes the connection.

---

## Error Handling

### Server-Side Errors

If an error occurs during generation, send an error chunk:

```
data: {"type":"error","id":"msg_1","model":"gpt-4o","timestamp":1701234567895,"error":{"message":"Rate limit exceeded","code":"rate_limit_exceeded"}}\n\n
```

Then close the connection.

### Connection Errors

SSE provides automatic reconnection:
- Browser automatically reconnects on connection drop
- Server can send `retry:` field to control reconnection delay
- Client can handle `error` events from EventSource

---

## Implementation

### Server-Side (Node.js/TypeScript)

TanStack AI provides `toServerSentEventsStream()` and `toStreamResponse()` utilities:

```typescript
import { chat, toStreamResponse } from '@tanstack/ai';
import { openai } from '@tanstack/ai-openai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openai(),
    messages,
    model: 'gpt-4o',
  });

  // Automatically converts StreamChunks to SSE format
  return toStreamResponse(stream);
}
```

**What `toStreamResponse()` does:**
1. Creates a `ReadableStream` from the async iterable
2. Wraps each chunk as `data: {JSON}\n\n`
3. Sends `data: [DONE]\n\n` at the end
4. Sets proper SSE headers
5. Handles errors and cleanup

### Client-Side (Browser/Node.js)

TanStack AI provides `fetchServerSentEvents()` connection adapter:

```typescript
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react';

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
});
```

**What `fetchServerSentEvents()` does:**
1. Makes POST request with messages
2. Reads response body as stream
3. Parses SSE format (`data:` prefix)
4. Deserializes JSON chunks
5. Yields StreamChunk objects
6. Stops on `[DONE]` marker

### Manual Implementation (Advanced)

If you need custom handling:

#### Server
```typescript
export async function POST(request: Request) {
  const { messages } = await request.json();
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of chat({ ... })) {
          const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        const errorChunk = {
          type: 'error',
          error: { message: error.message }
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

#### Client
```typescript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      const chunk = JSON.parse(data);
      // Handle chunk...
    }
  }
}
```

---

## Debugging

### Inspecting SSE Traffic

**Browser DevTools:**
1. Open Network tab
2. Look for requests with `text/event-stream` type
3. View response as it streams in

**cURL:**
```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

The `-N` flag disables buffering to see real-time output.

**Example Output:**
```
data: {"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567890,"delta":"Hello","content":"Hello"}

data: {"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567891,"delta":" there","content":"Hello there"}

data: {"type":"done","id":"msg_1","model":"gpt-4o","timestamp":1701234567892,"finishReason":"stop"}

data: [DONE]
```

---

## Advantages of SSE

1. **Built-in Reconnection** - Browser handles connection drops automatically
2. **Simpler than WebSocket** - No handshake, just HTTP
3. **Server-to-Client Only** - Matches chat streaming use case perfectly
4. **Wide Browser Support** - Works everywhere (except IE11)
5. **Proxy-Friendly** - Works through most HTTP proxies
6. **Easy to Debug** - Plain text format, visible in DevTools

---

## Limitations

1. **One-Way Communication** - Server to client only (fine for streaming responses)
2. **HTTP/1.1 Connection Limits** - Browsers limit concurrent connections per domain (6-8)
3. **No Binary Data** - Text-only (not an issue for JSON chunks)
4. **HTTP/2 Streams** - Can be more efficient but SSE works fine

---

## Best Practices

1. **Always set proper headers** - `Content-Type`, `Cache-Control`, `Connection`
2. **Send `[DONE]` marker** - Helps client know when to close
3. **Handle errors gracefully** - Send error chunk before closing
4. **Use compression** - Enable gzip/brotli at the reverse proxy level
5. **Set timeouts** - Prevent hanging connections
6. **Monitor connection count** - Watch for connection leaks

---

## See Also

- [Chunk Definitions](./chunk-definitions.md) - StreamChunk type reference
- [HTTP Stream Protocol](./http-stream-protocol.md) - Alternative protocol
- [Connection Adapters Guide](../guides/connection-adapters.md) - Client implementation
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
