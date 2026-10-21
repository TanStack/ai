---
title: HTTP Stream
id: transports-http-stream
order: 3
description: "Stream chat chunks as newline-delimited JSON with fetchHttpStream and toHttpResponse when SSE is blocked, and resume a stream after the connection drops."
keywords:
  - tanstack ai
  - http stream
  - ndjson
  - newline-delimited json
  - fetchHttpStream
  - toHttpResponse
  - resumeHttpResponse
---

Your runtime or proxy does not let SSE through. Some edge runtimes and mobile WebViews block it, and some proxies strip `text/event-stream`. Stream newline-delimited JSON (NDJSON) instead: one JSON `StreamChunk` per line.

## Quick setup

### 1. Return NDJSON from the server

Wrap the `chat()` stream with `toHttpResponse()`:

```typescript
// api/chat.ts
import { chat, chatParamsFromRequest, toHttpResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
  });
  return toHttpResponse(stream);
}
```

### 2. Connect from the client

Pass `fetchHttpStream()` to `useChat`:

```tsx
import { useChat, fetchHttpStream } from "@tanstack/ai-react";

export function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchHttpStream("/api/chat"),
  });

  return (
    <div>
      {messages.map((message) => (
        <p key={message.id}>
          {message.parts.map((part) =>
            part.type === "text" ? part.content : "",
          )}
        </p>
      ))}
      <button onClick={() => void sendMessage("Hello")}>Send</button>
    </div>
  );
}
```

Click Send. Each chunk arrives as one JSON line, and the reply streams into `messages`.

`fetchHttpStream` takes the same options as `fetchServerSentEvents`: `headers`, `body`, `credentials`, `fetchClient`, and dynamic functions. See [Request Options](./request-options).

On React Native, use `xhrHttpStream` with the same server. See [React Native](./react-native).

## How it works

1. `sendMessage` posts the messages to `/api/chat`.
2. `toHttpResponse()` writes each chunk as `JSON.stringify(chunk) + "\n"`.
3. `fetchHttpStream()` splits the body on newlines and parses each line into a chunk.

To write the response yourself, write each chunk in that same line format to the response body.

## Advanced

### Resume a dropped stream

Pass a durability adapter to `toHttpResponse`. Then each line becomes an `{ id, chunk }` envelope, and the client can continue a reply:

- **Reconnect.** A dropped connection reconnects with `Last-Event-ID`. The transport removes the replayed chunks that it already has.
- **`joinRun(runId)`.** It attaches to a run that already exists.

Add a `GET` handler for `joinRun`, with `resumeHttpResponse`:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  resumeHttpResponse,
  toHttpResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
  });
  return toHttpResponse(stream, {
    durability: { adapter: memoryStream(request) },
  });
}

// joinRun hits GET ?offset=-1&runId=... (replay only, no messages sent).
export async function GET(request: Request) {
  return resumeHttpResponse({ adapter: memoryStream(request) });
}
```

The client from step 2 needs no change. `xhrHttpStream` resumes the same way.

The guarantees are the same as [resumable SSE](./sse#resume-a-dropped-stream), over NDJSON. To pick a durability adapter for production, see [Resumable Streams](../resumable-streams/overview).
