---
title: HTTP Stream Protocol
id: http-stream-protocol
description: "TanStack AI's HTTP streaming protocol spec using newline-delimited JSON (NDJSON) — an alternative to SSE for simpler line-based transport."
keywords:
  - tanstack ai
  - http stream
  - ndjson
  - newline-delimited json
  - streaming protocol
  - protocol spec
---

HTTP streaming with newline-delimited JSON (NDJSON) is a simpler protocol than SSE that sends one JSON object per line. It's useful when:

- SSE event prefixes add unwanted overhead
- You need more control over the streaming format
- Working in environments that don't support SSE well
- Building custom protocols on top of the stream

This protocol is **less common** than SSE for TanStack AI applications, but supported for flexibility.

This document describes how TanStack AI transmits [AG-UI events](./chunk-definitions) over raw HTTP streaming (newline-delimited JSON), an alternative to Server-Sent Events.

---

## Protocol Specification

### HTTP Request

**Method:** `POST`

**Headers:**
```http
Content-Type: application/json
```

**Body:** The current `@tanstack/ai-client` POSTs an AG-UI `RunAgentInput` object — `threadId`, `runId`, `messages`, `tools`, `forwardedProps`, etc. The legacy `data` field is still emitted alongside `forwardedProps` as a deprecation bridge. See [Migrating to AG-UI Client-to-Server Compliance](../migration/ag-ui-compliance) for the full wire shape.

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
Content-Type: application/x-ndjson
Transfer-Encoding: chunked
```

Or alternatively:
```http
Content-Type: application/json
Transfer-Encoding: chunked
```

**Body:** Stream of newline-delimited JSON, one [AG-UI event](./chunk-definitions) per line

---

## Stream Format

Each [AG-UI event](./chunk-definitions) is transmitted as a single line of JSON followed by a newline (`\n`):

```
{JSON_ENCODED_EVENT}\n
```

### Key Points

1. **One JSON object per line**
2. **Each line ends with `\n`**
3. **No prefixes** (unlike SSE's `data:` prefix)
4. **No blank lines between events** (unlike SSE's `\n\n`)
5. **Stream ends when connection closes** (no `[DONE]` marker — `RUN_FINISHED` is the terminal event)

### Examples

#### Text Content

```json
{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":"Hello","timestamp":1701234567890}
{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":" world","timestamp":1701234567891}
{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":"!","timestamp":1701234567892}
```

#### Tool Call

A tool call streams as `TOOL_CALL_START` → `TOOL_CALL_ARGS` → `TOOL_CALL_END`, optionally followed by `TOOL_CALL_RESULT`:

```json
{"type":"TOOL_CALL_START","toolCallId":"call_xyz","toolCallName":"get_weather","timestamp":1701234567893}
{"type":"TOOL_CALL_ARGS","toolCallId":"call_xyz","delta":"{\"location\":\"SF\"}","timestamp":1701234567894}
{"type":"TOOL_CALL_END","toolCallId":"call_xyz","toolCallName":"get_weather","timestamp":1701234567895}
{"type":"TOOL_CALL_RESULT","messageId":"msg_2","toolCallId":"call_xyz","content":"{\"temperature\":72,\"conditions\":\"sunny\"}","timestamp":1701234567896}
```

#### Run Completion

```json
{"type":"RUN_FINISHED","runId":"run_123","timestamp":1701234567897,"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":15,"totalTokens":25}}
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
{"type":"RUN_STARTED","runId":"run_123","timestamp":1701234567889}
{"type":"TEXT_MESSAGE_START","messageId":"msg_1","role":"assistant","timestamp":1701234567890}
{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":"The","timestamp":1701234567890}
{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":" weather is sunny","timestamp":1701234567891}
{"type":"TEXT_MESSAGE_END","messageId":"msg_1","timestamp":1701234567893}
{"type":"RUN_FINISHED","runId":"run_123","timestamp":1701234567894,"finishReason":"stop"}
```

### 4. Stream Completion

`RUN_FINISHED` is the terminal event of a successful run; the server then closes the connection. No special marker is sent (neither transport uses a `[DONE]` sentinel).

---

## Error Handling

### Server-Side Errors

If an error occurs during generation, TanStack AI's HTTP-stream helpers emit a `RUN_ERROR` event, then close the connection:

```json
{"type":"RUN_ERROR","timestamp":1701234567895,"error":{"message":"Rate limit exceeded","code":"rate_limit_exceeded"}}
```

> **Canonical shape.** The AG-UI-canonical form carries `message` and `code` at the top level of the event. The wire emitter still nests them under `error` (shown above) as a backward-compatibility bridge; new consumers should prefer the top-level fields. See [Chunk Definitions → RUN_ERROR](./chunk-definitions#run_error).

### Connection Errors

Unlike SSE, HTTP streaming does not provide automatic reconnection:
- Client must detect connection drops
- Client must implement retry logic
- Use exponential backoff for retries

---

## Implementation

### Server-Side (Node.js/TypeScript)

#### Using TanStack AI

TanStack AI provides built-in NDJSON helpers — `toHttpResponse(stream, init?)` returns a ready-to-return `Response`, and `toHttpStream(stream, abortController?)` returns the raw `ReadableStream` if you need to set your own headers or wrap it. Both are exported from `@tanstack/ai`, emit one AG-UI event per line, close the connection when the stream ends (`RUN_FINISHED` is terminal), and emit a `RUN_ERROR` event on a thrown error.

```typescript
import { chat, toHttpResponse } from '@tanstack/ai';
import { openaiText } from '@tanstack/ai-openai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
  });

  // Emits newline-delimited AG-UI events; sets NDJSON-friendly defaults.
  return toHttpResponse(stream);
}
```

If you need the raw stream (e.g. to add custom headers), use `toHttpStream`:

```typescript
import { chat, toHttpStream } from '@tanstack/ai';
import { openaiText } from '@tanstack/ai-openai';

export async function POST(request: Request) {
  const { messages } = await request.json();
  const abortController = new AbortController();

  const stream = chat({ adapter: openaiText('gpt-5.5'), messages });

  return new Response(toHttpStream(stream, abortController), {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
```

#### Using Express.js

```typescript
import express from 'express';
import { chat } from '@tanstack/ai';
import { openaiText } from '@tanstack/ai-openai';

const app = express();
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    const stream = chat({
      adapter: openaiText('gpt-5.5'),
      messages,
    });

    for await (const chunk of stream) {
      res.write(JSON.stringify(chunk) + '\n');
    }
  } catch (error: any) {
    const errorEvent = {
      type: 'RUN_ERROR',
      timestamp: Date.now(),
      error: { message: error.message },
    };
    res.write(JSON.stringify(errorEvent) + '\n');
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
1. Makes a POST request with the AG-UI `RunAgentInput` body
2. Reads the response body as a stream
3. Splits by newlines
4. Parses each line as JSON
5. Yields `StreamChunk` (AG-UI event) objects

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
| Completion marker | ❌ No (close connection after `RUN_FINISHED`) | ❌ No (close connection after `RUN_FINISHED`) |
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
{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":"Hello","timestamp":1701234567890}
{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":" there","timestamp":1701234567891}
{"type":"RUN_FINISHED","runId":"run_123","timestamp":1701234567892,"finishReason":"stop"}
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
3. **Less Common** - SSE is more standard for streaming

(Both transports rely on connection close after `RUN_FINISHED`; neither uses a `[DONE]` marker.)

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

- [Chunk Definitions](./chunk-definitions) - StreamChunk type reference
- [SSE Protocol](./sse-protocol) - Recommended protocol (with auto-reconnect)
- [Connection Adapters Guide](../chat/connection-adapters) - Client implementation
- [JSON Lines Specification](http://jsonlines.org/)
- [NDJSON Specification](http://ndjson.org/)
