---
name: ai-core/ag-ui-protocol
description: >
  Server-side AG-UI streaming protocol implementation: StreamChunk event
  types (RUN_STARTED, TEXT_MESSAGE_START/CONTENT/END, TOOL_CALL_START/ARGS/END,
  RUN_FINISHED, RUN_ERROR, STEP_STARTED/STEP_FINISHED, STATE_SNAPSHOT/DELTA,
  CUSTOM), toServerSentEventsStream() for SSE format, toHttpStream() for
  NDJSON format. For backends serving AG-UI events without client packages.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/protocol/chunk-definitions.md'
  - 'TanStack/ai:docs/protocol/sse-protocol.md'
  - 'TanStack/ai:docs/protocol/http-stream-protocol.md'
---

# AG-UI Protocol

This skill builds on ai-core. Read it first for critical rules.

## Setup — Server Endpoint Producing AG-UI Events via SSE

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-5.2'),
    messages,
  })
  return toServerSentEventsResponse(stream)
}
```

`chat()` returns an `AsyncIterable<StreamChunk>`. Each `StreamChunk` is a
typed AG-UI event (discriminated union on `type`). The `toServerSentEventsResponse()`
helper encodes that iterable into an SSE-formatted `Response` with correct headers.

## Core Patterns

### 1. SSE Format — toServerSentEventsStream / toServerSentEventsResponse

**Wire format:** Each event is `data: <JSON>\n\n`. Stream ends with `data: [DONE]\n\n`.

```typescript
import {
  chat,
  toServerSentEventsStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Option A: Get a ReadableStream (manual Response construction)
const abortController = new AbortController()
const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  abortController,
})
const sseStream = toServerSentEventsStream(stream, abortController)

const response = new Response(sseStream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  },
})

// Option B: Use the helper (sets headers automatically)
const response2 = toServerSentEventsResponse(stream, { abortController })
// Default headers: Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive
```

**Default response headers set by `toServerSentEventsResponse()`:**

| Header          | Value               |
| --------------- | ------------------- |
| `Content-Type`  | `text/event-stream` |
| `Cache-Control` | `no-cache`          |
| `Connection`    | `keep-alive`        |

Custom headers merge on top (user headers override defaults):

```typescript
toServerSentEventsResponse(stream, {
  headers: {
    'X-Accel-Buffering': 'no', // Disable nginx buffering
    'Cache-Control': 'no-store', // Override default
  },
  abortController,
})
```

**Error handling:** If the stream throws, a `RUN_ERROR` event is emitted
automatically before the stream closes. If the `abortController` is already
aborted, the error event is suppressed and the stream closes silently.

### 2. HTTP Stream (NDJSON) — toHttpStream / toHttpResponse

**Wire format:** Each event is `<JSON>\n` (newline-delimited JSON, no SSE prefix, no `[DONE]` marker).

```typescript
import { chat, toHttpStream, toHttpResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Option A: Get a ReadableStream
const abortController = new AbortController()
const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  abortController,
})
const ndjsonStream = toHttpStream(stream, abortController)

const response = new Response(ndjsonStream, {
  headers: {
    'Content-Type': 'application/x-ndjson',
  },
})

// Option B: Use the helper (does NOT set headers automatically)
const response2 = toHttpResponse(stream, { abortController })
// Note: toHttpResponse does NOT set Content-Type automatically.
// You should pass headers explicitly:
const response3 = toHttpResponse(stream, {
  headers: { 'Content-Type': 'application/x-ndjson' },
  abortController,
})
```

**Client-side pairing:** SSE endpoints are consumed by `fetchServerSentEvents()`.
HTTP stream endpoints are consumed by `fetchHttpStream()`. Both are connection
adapters from `@tanstack/ai-react` (or the framework-specific package).

### 3. AG-UI Event Types Reference

All events extend `BaseAGUIEvent` which carries `type`, `timestamp`, optional
`model`, and optional `rawEvent`.

| Event Type             | Description                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `RUN_STARTED`          | First event in a stream. Carries `runId` and optional `threadId`.                                                           |
| `TEXT_MESSAGE_START`   | New text message begins. Carries `messageId` and `role`.                                                                    |
| `TEXT_MESSAGE_CONTENT` | Incremental text token. Carries `messageId` and `delta` (the new text).                                                     |
| `TEXT_MESSAGE_END`     | Text message complete. Carries `messageId`.                                                                                 |
| `TOOL_CALL_START`      | Tool invocation begins. Carries `toolCallId`, `toolName`, and `index`.                                                      |
| `TOOL_CALL_ARGS`       | Incremental tool arguments JSON. Carries `toolCallId` and `delta`.                                                          |
| `TOOL_CALL_END`        | Tool call arguments complete. Carries `toolCallId` and `toolName`.                                                          |
| `STEP_STARTED`         | Thinking/reasoning step begins. Carries `stepId` and optional `stepType`.                                                   |
| `STEP_FINISHED`        | Thinking step complete. Carries `stepId`, `delta`, and optional `content`.                                                  |
| `MESSAGES_SNAPSHOT`    | Full conversation transcript snapshot. Carries `messages: Array<UIMessage>`.                                                |
| `STATE_SNAPSHOT`       | Full application state snapshot. Carries `state: Record<string, unknown>`.                                                  |
| `STATE_DELTA`          | Incremental state update. Carries `delta: Record<string, unknown>`.                                                         |
| `CUSTOM`               | Extension point. Carries `name` (string) and optional `value` (unknown).                                                    |
| `RUN_FINISHED`         | Stream complete. Carries `runId` and `finishReason` (`'stop'` / `'length'` / `'content_filter'` / `'tool_calls'` / `null`). |
| `RUN_ERROR`            | Error during stream. Carries optional `runId` and `error: { message, code? }`.                                              |

**Typical event sequence for a text-only response:**

```
RUN_STARTED -> TEXT_MESSAGE_START -> TEXT_MESSAGE_CONTENT (repeated) -> TEXT_MESSAGE_END -> RUN_FINISHED
```

**Typical event sequence with tool calls:**

```
RUN_STARTED -> TEXT_MESSAGE_START -> TEXT_MESSAGE_CONTENT* -> TEXT_MESSAGE_END
            -> TOOL_CALL_START -> TOOL_CALL_ARGS* -> TOOL_CALL_END
            -> RUN_FINISHED (finishReason: 'tool_calls')
```

**Type aliases:** `StreamChunk` is an alias for `AGUIEvent` (the discriminated
union of all event interfaces). `StreamChunkType` is an alias for `AGUIEventType`
(the string union of all event type literals).

## Common Mistakes

### MEDIUM: Proxy buffering breaks SSE streaming

Reverse proxies (nginx, Cloudflare, AWS ALB) buffer SSE responses by default,
causing events to arrive in batches instead of streaming token-by-token.

Fix: Set proxy-bypass headers on the response.

```typescript
toServerSentEventsResponse(stream, {
  headers: {
    'X-Accel-Buffering': 'no', // nginx
    'X-Content-Type-Options': 'nosniff', // Some CDNs
  },
  abortController,
})
```

For Cloudflare Workers, SSE streams automatically. For Cloudflare proxied
origins, ensure "Response Buffering" is disabled in the dashboard.

Source: docs/protocol/sse-protocol.md

### MEDIUM: Assuming all AG-UI events arrive in every response

Not all event types appear in every stream:

- `STEP_STARTED` / `STEP_FINISHED` only appear with thinking-enabled models
  (e.g., `o3`, `claude-sonnet-4-5` with extended thinking). Standard models
  skip these entirely.
- `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` only appear when
  the model invokes tools. A text-only response has none.
- `STATE_SNAPSHOT` / `STATE_DELTA` only appear when server code explicitly
  emits them for stateful agent workflows.
- `MESSAGES_SNAPSHOT` only appears when the server explicitly sends a
  full transcript snapshot.
- `CUSTOM` events are application-defined and never emitted by default.

Code that expects a fixed sequence (e.g., always waiting for `STEP_FINISHED`
before processing text) will hang or break on models that don't emit those events.

Source: docs/protocol/chunk-definitions.md

## Tension

HIGH Tension: AG-UI protocol compliance vs. internal message format -- TanStack
AI's `UIMessage` format (parts-based) diverges from AG-UI spec (content-based).
Full compliance would require a different message structure.

## Cross-References

- See also: `ai-core/custom-backend-integration/SKILL.md` -- Custom backends must implement SSE or HTTP stream format to work with TanStack AI client connection adapters.
