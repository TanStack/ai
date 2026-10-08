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

Some places do not let SSE through: some edge runtimes, some mobile WebViews, or a proxy that strips `text/event-stream`. Stream newline-delimited JSON (NDJSON) instead. Each line is one JSON `StreamChunk`.

## 1. Return NDJSON from the server

Wrap the `chat()` stream with `toHttpResponse()`:

```typescript
import { chat, chatParamsFromRequest, toHttpResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: openaiText("gpt-5.6"),
    messages,
    threadId,
    runId,
  });
  return toHttpResponse(stream);
}
```

To write the response yourself, write each chunk as `JSON.stringify(chunk) + "\n"` to the response body.

## 2. Connect from the client

Pass `fetchHttpStream()` to `useChat`:

```typescript
import { useChat, fetchHttpStream } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchHttpStream("/api/chat"),
});
```

`fetchHttpStream` takes the same options as `fetchServerSentEvents`: `url`, `headers`, `body`, `fetchClient`, and dynamic functions. See [Request Options](./request-options).

On React Native, use `xhrHttpStream` with the same server. See [React Native](./react-native).

## Resume a dropped stream

Pass a durability adapter to `toHttpResponse`. Then each line becomes an `{ id, chunk }` envelope, and the client can continue a reply:

- **Reconnect.** A dropped connection reconnects with `Last-Event-ID`. The adapter removes the replayed chunks that it already has.
- **`joinRun(runId)`.** It attaches to a run that already exists.

Add a `GET` handler for `joinRun`, with `resumeHttpResponse`:

```typescript
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
  const stream = chat({ adapter: openaiText("gpt-5.6"), messages, threadId, runId });
  return toHttpResponse(stream, {
    durability: { adapter: memoryStream(request) },
  });
}

// joinRun hits GET ?offset=-1&runId=... (replay only, no messages sent).
export async function GET(request: Request) {
  return resumeHttpResponse({ adapter: memoryStream(request) });
}
```

`xhrHttpStream` resumes the same way. The guarantees are the same as [resumable SSE](./sse#resume-a-dropped-stream), over NDJSON.

Send a message. Each chunk arrives as one JSON line, and the reply streams into `messages`.
