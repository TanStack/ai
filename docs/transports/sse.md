---
title: Server-Sent Events
id: transports-sse
order: 2
description: "Stream chat chunks over Server-Sent Events with fetchServerSentEvents and toServerSentEventsResponse, and resume a stream after the connection drops."
keywords:
  - tanstack ai
  - sse
  - server-sent events
  - fetchServerSentEvents
  - toServerSentEventsResponse
  - resumeServerSentEventsResponse
  - resumable sse
  - Last-Event-ID
---

You have a normal HTTP server and you want the chat reply to stream. Use Server-Sent Events (SSE). It is the default transport. It works in all browsers, it passes through most proxies, and it is easy to debug.

## 1. Return SSE from the server

Wrap the `chat()` stream with `toServerSentEventsResponse()`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: openaiText("gpt-5.6"),
    messages,
    threadId,
    runId,
  });
  return toServerSentEventsResponse(stream);
}
```

## 2. Connect from the client

Pass `fetchServerSentEvents()` to `useChat`:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});
```

To add headers, a dynamic URL, or extra body data, see [Request Options](./request-options).

## Resume a dropped stream

A connection can drop in the middle of a reply. If the server sends SSE `id:` values, `fetchServerSentEvents` can continue the reply:

- **Reconnect.** If the connection drops after an id arrived, the adapter reconnects with `Last-Event-ID`. It removes the replayed chunks that it already has.
- **`joinRun(runId)`.** It sends a read-only GET with `offset=-1` and the run id. The server replays an in-flight or finished run from the start.

The ids appear only when the server passes a durability adapter to `toServerSentEventsResponse`. The ids are opaque tokens that the durability adapter owns. The chat client does not create, parse, or store them. Without ids, the adapter does one plain fetch.

Add a `GET` handler next to `POST`, so that `joinRun` works in a second tab or after a reload:

- **`POST`** starts new runs. It also gets the automatic reconnects, because the adapter sends the same body again with `Last-Event-ID`.
- **`GET`** replays a known run from the start.

```typescript
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const stream = chat({ adapter: openaiText("gpt-5.6"), messages, threadId, runId });
  return toServerSentEventsResponse(stream, {
    durability: { adapter: memoryStream(request) },
  });
}

// joinRun hits GET ?offset=-1&runId=... (replay only, no messages sent).
export async function GET(request: Request) {
  return resumeServerSentEventsResponse({ adapter: memoryStream(request) });
}
```

The `GET` handler does not call a provider. On a replay, `resumeFrom()` on the durability adapter is not null (it comes from `?offset`). So the handler replays the log. If the request has no resume offset, `resumeServerSentEventsResponse` returns a 400.

Other adapters resume the same way:

- `xhrServerSentEvents` uses the same `id:` lines. See [React Native](./react-native).
- `fetchHttpStream` and `xhrHttpStream` resume over NDJSON. See [HTTP Stream](./http-stream#resume-a-dropped-stream).

To pick a durability adapter for production, see [Resumable Streams](../resumable-streams/overview).

Send a message and turn off the network for a moment. When the network comes back, the reply continues with no duplicate text.
