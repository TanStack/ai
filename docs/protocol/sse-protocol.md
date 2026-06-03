---
title: Server-Sent Events (SSE) Protocol
id: sse-protocol
description: "TanStack AI's Server-Sent Events protocol spec — the recommended streaming transport for chat and media generations, with auto-reconnection."
keywords:
  - tanstack ai
  - sse
  - server-sent events
  - streaming protocol
  - protocol spec
  - eventsource
---

Server-Sent Events (SSE) is a standard HTTP-based protocol for server-to-client streaming. It provides:

- ✅ **Automatic reconnection** - Browser handles connection drops
- ✅ **Event-driven** - Native browser EventSource API
- ✅ **Simple protocol** - Text-based, easy to debug
- ✅ **Wide support** - Works in all modern browsers
- ✅ **Efficient** - Single long-lived HTTP connection

This document describes how TanStack AI transmits [AG-UI events](./chunk-definitions) over Server-Sent Events (SSE), the recommended protocol for most use cases.

## Protocol Specification

### HTTP Request

**Method:** `POST`

**Headers:**
```http
Content-Type: application/json
```

**Body:** The current `@tanstack/ai-client` POSTs an AG-UI `RunAgentInput` object — `threadId`, `runId`, `messages`, `tools`, `forwardedProps`, etc. The legacy `data` field is still emitted alongside `forwardedProps` as a deprecation bridge. See [Migrating to AG-UI Client-to-Server Compliance](../migration/ag-ui-compliance) for the full wire shape and migration tiers.

```json
{
  "threadId": "thread-abc",
  "runId": "run-123",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "tools": [],
  "forwardedProps": {
    // Optional client-supplied options
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

**Body:** Stream of SSE events — each event is a single [AG-UI event](./chunk-definitions) JSON object.

---

## SSE Format

Each [AG-UI event](./chunk-definitions) is transmitted as an SSE event with the following format:

```
data: {JSON_ENCODED_EVENT}\n\n
```

### Key Points

1. **Each event starts with `data: `**
2. **Followed by the JSON-encoded AG-UI event**
3. **Ends with double newline `\n\n`**
4. **No event names or IDs** (not required for our use case)

### Examples

#### Text Content

```
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":"Hello","timestamp":1701234567890}\n\n
```

#### Tool Call

A tool call streams as a `TOOL_CALL_START` → `TOOL_CALL_ARGS` → `TOOL_CALL_END` sequence, optionally followed by a `TOOL_CALL_RESULT` once the tool runs:

```
data: {"type":"TOOL_CALL_START","toolCallId":"call_xyz","toolCallName":"get_weather","timestamp":1701234567891}\n\n
data: {"type":"TOOL_CALL_ARGS","toolCallId":"call_xyz","delta":"{\"location\":\"SF\"}","timestamp":1701234567892}\n\n
data: {"type":"TOOL_CALL_END","toolCallId":"call_xyz","toolCallName":"get_weather","timestamp":1701234567893}\n\n
data: {"type":"TOOL_CALL_RESULT","messageId":"msg_2","toolCallId":"call_xyz","content":"{\"temperature\":72,\"conditions\":\"sunny\"}","timestamp":1701234567894}\n\n
```

#### Run Completion

`RUN_FINISHED` is the terminal event of a successful run:

```
data: {"type":"RUN_FINISHED","runId":"run_123","timestamp":1701234567895,"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":5,"totalTokens":15}}\n\n
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

### 3. Server Streams Events

The server sends multiple `data:` events as the run progresses:

```
data: {"type":"RUN_STARTED","runId":"run_123","timestamp":1701234567889}\n\n
data: {"type":"TEXT_MESSAGE_START","messageId":"msg_1","role":"assistant","timestamp":1701234567890}\n\n
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":"The","timestamp":1701234567890}\n\n
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":" weather","timestamp":1701234567891}\n\n
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":" is sunny","timestamp":1701234567892}\n\n
data: {"type":"TEXT_MESSAGE_END","messageId":"msg_1","timestamp":1701234567893}\n\n
data: {"type":"RUN_FINISHED","runId":"run_123","timestamp":1701234567894,"finishReason":"stop"}\n\n
```

### 4. Stream Completion

`RUN_FINISHED` is the terminal event of a successful run. There is **no** `[DONE]` sentinel — after `RUN_FINISHED` the server simply closes the connection, and the client treats connection close as end-of-stream.

---

## Error Handling

### Server-Side Errors

If an error occurs during generation, TanStack AI's SSE helpers emit a `RUN_ERROR` event, then close the connection:

```
data: {"type":"RUN_ERROR","timestamp":1701234567895,"error":{"message":"Rate limit exceeded","code":"rate_limit_exceeded"}}\n\n
```

> **Canonical shape.** The AG-UI-canonical form carries `message` and `code` at the top level of the event. The wire emitter still nests them under `error` (shown above) as a backward-compatibility bridge; new consumers should prefer the top-level fields. See [Chunk Definitions → RUN_ERROR](./chunk-definitions#run_error).

### Connection Errors

SSE provides automatic reconnection:
- Browser automatically reconnects on connection drop
- Server can send `retry:` field to control reconnection delay
- Client can handle `error` events from EventSource

---

## Implementation

### Server-Side (Node.js/TypeScript)

TanStack AI provides `toServerSentEventsStream()` and `toServerSentEventsResponse()` utilities:

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai';
import { openaiText } from '@tanstack/ai-openai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
  });

  // Automatically converts StreamChunks to SSE format
  return toServerSentEventsResponse(stream);
}
```

**What `toServerSentEventsResponse()` does:**
1. Creates a `ReadableStream` from the async iterable
2. Wraps each AG-UI event as `data: {JSON}\n\n`
3. On the stream ending, closes the connection (no `[DONE]` marker — `RUN_FINISHED` is the terminal event)
4. Sets proper SSE headers
5. On a thrown error, emits a `RUN_ERROR` event and closes the connection

### Client-Side (Browser/Node.js)

TanStack AI provides `fetchServerSentEvents()` connection adapter:

```typescript
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react';

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
});
```

**What `fetchServerSentEvents()` does:**
1. Makes a POST request with the AG-UI `RunAgentInput` body
2. Reads the response body as a stream
3. Parses SSE format (`data:` prefix)
4. Deserializes each line into an AG-UI event
5. Yields `StreamChunk` (AG-UI event) objects
6. Ends when the connection closes (after `RUN_FINISHED`)

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
        for await (const chunk of chat({ adapter: openaiText('gpt-5.5'), messages })) {
          const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        }
        // No [DONE] marker — the stream's RUN_FINISHED event is terminal.
        controller.close();
      } catch (error) {
        const errorEvent = {
          type: 'RUN_ERROR',
          timestamp: Date.now(),
          error: { message: (error as Error).message },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
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

      const event = JSON.parse(data);
      // Handle the AG-UI event...
      // (RUN_FINISHED signals the run is complete; the stream ends on close)
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
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":"Hello","timestamp":1701234567890}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":" there","timestamp":1701234567891}

data: {"type":"RUN_FINISHED","runId":"run_123","timestamp":1701234567892,"finishReason":"stop"}
```

The connection closes after `RUN_FINISHED` — there is no `[DONE]` line.

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
2. **Treat `RUN_FINISHED` as terminal** - There is no `[DONE]` marker; close the connection after it
3. **Handle errors gracefully** - Emit a `RUN_ERROR` event before closing
4. **Use compression** - Enable gzip/brotli at the reverse proxy level
5. **Set timeouts** - Prevent hanging connections
6. **Monitor connection count** - Watch for connection leaks

---

## See Also

- [Chunk Definitions](./chunk-definitions) - StreamChunk type reference
- [HTTP Stream Protocol](./http-stream-protocol) - Alternative protocol
- [Connection Adapters Guide](../chat/connection-adapters) - Client implementation
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
