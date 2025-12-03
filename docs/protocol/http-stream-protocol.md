---
title: HTTP Stream Protocol
id: http-stream-protocol
---

HTTP streaming with newline-delimited JSON (NDJSON) is a simpler protocol than SSE that sends one JSON object per line. It's useful when:

- SSE event prefixes add unwanted overhead
- You need more control over the streaming format
- Working in environments that don't support SSE well
- Building custom protocols on top of the stream

This protocol is **less common** than SSE for TanStack AI applications, but supported for flexibility.

This document describes how TanStack AI transmits StreamChunks over raw HTTP streaming (newline-delimited JSON), an alternative to Server-Sent Events.

---

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
Content-Type: application/x-ndjson
Transfer-Encoding: chunked
```

Or alternatively:
```http
Content-Type: application/json
Transfer-Encoding: chunked
```

**Body:** Stream of newline-delimited JSON chunks

---

## Stream Format

Each StreamChunk is transmitted as a single line of JSON followed by a newline (`\n`):

```
{JSON_ENCODED_CHUNK}\n
```

### Key Points

1. **One JSON object per line**
2. **Each line ends with `\n`**
3. **No prefixes** (unlike SSE's `data:` prefix)
4. **No blank lines between chunks** (unlike SSE's `\n\n`)
5. **Stream ends when connection closes** (no `[DONE]` marker)

### Examples

#### Content Chunks

```json
{"type":"content","id":"chatcmpl-abc123","model":"gpt-4o","timestamp":1701234567890,"delta":"Hello","content":"Hello","role":"assistant"}
{"type":"content","id":"chatcmpl-abc123","model":"gpt-4o","timestamp":1701234567891,"delta":" world","content":"Hello world","role":"assistant"}
{"type":"content","id":"chatcmpl-abc123","model":"gpt-4o","timestamp":1701234567892,"delta":"!","content":"Hello world!","role":"assistant"}
```

#### Tool Call

```json
{"type":"tool_call","id":"chatcmpl-abc123","model":"gpt-4o","timestamp":1701234567893,"toolCall":{"id":"call_xyz","type":"function","function":{"name":"get_weather","arguments":"{\"location\":\"SF\"}"}},"index":0}
{"type":"tool_result","id":"chatcmpl-abc123","model":"gpt-4o","timestamp":1701234567894,"toolCallId":"call_xyz","content":"{\"temperature\":72,\"conditions\":\"sunny\"}"}
```

#### Stream Completion

```json
{"type":"done","id":"chatcmpl-abc123","model":"gpt-4o","timestamp":1701234567895,"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":15,"totalTokens":25}}
```

---

## Stream Lifecycle

### 1. Client Initiates Connection

```typescript
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
Content-Type: application/x-ndjson
Transfer-Encoding: chunked
```

### 3. Server Streams Chunks

The server sends newline-delimited JSON:

```json
{"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567890,"delta":"The","content":"The"}
{"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567891,"delta":" weather","content":"The weather"}
{"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567892,"delta":" is","content":"The weather is"}
{"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567893,"delta":" sunny","content":"The weather is sunny"}
{"type":"done","id":"msg_1","model":"gpt-4o","timestamp":1701234567894,"finishReason":"stop"}
```

### 4. Stream Completion

Server closes the connection. No special marker needed (unlike SSE's `[DONE]`).

---

## Error Handling

### Server-Side Errors

If an error occurs during generation, send an error chunk:

```json
{"type":"error","id":"msg_1","model":"gpt-4o","timestamp":1701234567895,"error":{"message":"Rate limit exceeded","code":"rate_limit_exceeded"}}
```

Then close the connection.

### Connection Errors

Unlike SSE, HTTP streaming does not provide automatic reconnection:
- Client must detect connection drops
- Client must implement retry logic
- Use exponential backoff for retries

---

## Implementation

### Server-Side (Node.js/TypeScript)

#### Using TanStack AI (Custom Stream)

TanStack AI doesn't provide a built-in NDJSON formatter, but you can create one easily:

```typescript
import { chat } from '@tanstack/ai';
import { openai } from '@tanstack/ai-openai';

export async function POST(request: Request) {
  const { messages } = await request.json();
  const encoder = new TextEncoder();

  const stream = chat({
    adapter: openai(),
    messages,
    model: 'gpt-4o',
  });

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          // Send as newline-delimited JSON
          const line = JSON.stringify(chunk) + '\n';
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      } catch (error: any) {
        const errorChunk = {
          type: 'error',
          error: {
            message: error.message || 'Unknown error',
            code: error.code,
          },
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorChunk) + '\n'));
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  });
}
```

#### Using Express.js

```typescript
import express from 'express';
import { chat } from '@tanstack/ai';
import { openai } from '@tanstack/ai-openai';

const app = express();
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    const stream = chat({
      adapter: openai(),
      messages,
      model: 'gpt-4o',
    });

    for await (const chunk of stream) {
      res.write(JSON.stringify(chunk) + '\n');
    }
  } catch (error: any) {
    const errorChunk = {
      type: 'error',
      error: { message: error.message },
    };
    res.write(JSON.stringify(errorChunk) + '\n');
  } finally {
    res.end();
  }
});
```

### Client-Side (Browser/Node.js)

TanStack AI provides `fetchHttpStream()` connection adapter:

```typescript
import { useChat, fetchHttpStream } from '@tanstack/ai-react';

const { messages, sendMessage } = useChat({
  connection: fetchHttpStream('/api/chat'),
});
```

**What `fetchHttpStream()` does:**
1. Makes POST request with messages
2. Reads response body as stream
3. Splits by newlines
4. Parses each line as JSON
5. Yields StreamChunk objects

### Manual Implementation (Advanced)

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
  
  // Keep incomplete line in buffer
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const chunk = JSON.parse(line);
        // Handle chunk...
        console.log(chunk);
      } catch (error) {
        console.warn('Failed to parse chunk:', line);
      }
    }
  }
}

// Process any remaining data in buffer
if (buffer.trim()) {
  try {
    const chunk = JSON.parse(buffer);
    console.log(chunk);
  } catch (error) {
    console.warn('Failed to parse final chunk:', buffer);
  }
}
```

---

## Comparison: HTTP Stream vs SSE

| Feature | HTTP Stream (NDJSON) | Server-Sent Events (SSE) |
|---------|---------------------|--------------------------|
| Format | `{json}\n` | `data: {json}\n\n` |
| Overhead | Lower (no prefixes) | Higher (`data:` prefix) |
| Auto-reconnect | ❌ No | ✅ Yes |
| Browser API | ❌ No (manual) | ✅ Yes (EventSource) |
| Completion marker | ❌ No (close connection) | ✅ Yes (`[DONE]`) |
| Debugging | Easy (plain JSON lines) | Easy (plain text) |
| Use case | Custom protocols, lower overhead | Standard streaming, reconnection needed |

**Recommendation:** Use SSE (`fetchServerSentEvents`) for most applications. Use HTTP streaming when you need lower overhead or have specific protocol requirements.

---

## Debugging

### Inspecting HTTP Stream Traffic

**Browser DevTools:**
1. Open Network tab
2. Look for POST request to `/api/chat`
3. View response as it streams in

**cURL:**
```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

The `-N` flag disables buffering to see real-time output.

**Example Output:**
```json
{"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567890,"delta":"Hello","content":"Hello"}
{"type":"content","id":"msg_1","model":"gpt-4o","timestamp":1701234567891,"delta":" there","content":"Hello there"}
{"type":"done","id":"msg_1","model":"gpt-4o","timestamp":1701234567892,"finishReason":"stop"}
```

### Validating NDJSON

Each line must be valid JSON. Test with:

```bash
# Validate each line
curl -N http://localhost:3000/api/chat | while read line; do
  echo "$line" | jq . > /dev/null || echo "Invalid JSON: $line"
done
```

---

## Advantages of HTTP Streaming

1. **Lower Overhead** - No `data:` prefixes or double newlines
2. **Simpler Protocol** - Just JSON + newline
3. **Flexible** - Easy to extend or modify
4. **Standard Format** - NDJSON is widely used

---

## Disadvantages vs SSE

1. **No Auto-Reconnect** - Must implement manually
2. **No Browser API** - Can't use EventSource
3. **No Completion Marker** - Must rely on connection close
4. **Less Common** - SSE is more standard for streaming

---

## Best Practices

1. **Use `\n` consistently** - Don't mix `\r\n` and `\n`
2. **Set proper Content-Type** - Use `application/x-ndjson` or `application/json`
3. **Handle partial lines** - Buffer incomplete data
4. **Validate JSON** - Catch parsing errors gracefully
5. **Flush regularly** - Don't buffer chunks server-side
6. **Implement retry logic** - Client should handle connection drops

---

## Alternative: JSON Lines (.jsonl)

HTTP streaming in TanStack AI follows the [JSON Lines](http://jsonlines.org/) specification (also called NDJSON):

- One JSON value per line
- Each line is terminated with `\n`
- UTF-8 encoding
- File extension: `.jsonl` or `.ndjson`

This makes streams compatible with standard NDJSON tools and libraries.

---

## See Also

- [Chunk Definitions](./chunk-definitions.md) - StreamChunk type reference
- [SSE Protocol](./sse-protocol) - Recommended protocol (with auto-reconnect)
- [Connection Adapters Guide](../guides/connection-adapters.md) - Client implementation
- [JSON Lines Specification](http://jsonlines.org/)
- [NDJSON Specification](http://ndjson.org/)
