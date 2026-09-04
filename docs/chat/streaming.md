---
title: Streaming
id: streaming-responses
order: 2
description: "Show AI tokens in the UI as they arrive. Server stream, client useChat, cancel, and callbacks."
keywords:
  - tanstack ai
  - streaming
  - streaming responses
  - real-time ai
  - async iterable
  - chunks
  - useChat
---

You send a message. The UI sits still until the model is done. That wait feels broken.

Stream the reply. Tokens show up as the model writes them.

## 1. Send the stream from the server

Call `chat()`. Then wrap the result with `toServerSentEventsResponse`:

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

`chatParamsFromRequest` reads the AG-UI body that `useChat` sends. If the body is invalid, it throws a `Response` with status 400. If your framework does not map a thrown `Response` to HTTP 400, catch it and return it.

## 2. Render with `useChat`

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === "text" ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim() === "") {
            return;
          }
          sendMessage(input);
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        {isLoading ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </>
  );
}
```

`messages` updates as chunks arrive. `isLoading` is `true` while the run is in flight.

The shared `ChatClient` processes ready chunks in order without inserting a task between each chunk. It yields after bounded processing work to keep the main thread responsive.

The same pattern works in every UI framework. See [Quick Start](../getting-started/quick-start).

If SSE is blocked, pick another transport on [Connection Adapters](./connection-adapters).

## 3. Cancel a run

Call `stop()`. The client aborts the fetch.

Pass the same `AbortController` to `chat()` and `toServerSentEventsResponse` so the server stops the model too:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const abortController = new AbortController();

  const stream = chat({
    adapter: openaiText("gpt-5.6"),
    messages,
    threadId,
    runId,
    abortController,
  });

  return toServerSentEventsResponse(stream, { abortController });
}
```

`AbortError` from `stop()` is expected. Pending client-tool work for that turn does not resume. A later `addToolResult()` for that turn is ignored.

A dropped connection mid-line throws `StreamTruncatedError`. The client then moves to `error`. See [Connection Adapters](./connection-adapters).

## Later

- **No HTTP.** Iterate `chat()` yourself. Branch on `chunk.type === "TEXT_MESSAGE_CONTENT"`. Then read `chunk.delta`.
- **Callbacks.** `onChunk` fires on each event. `onFinish` fires with the completed message.
- **Send while a reply is in flight.** Messages wait in `queue` by default. See [Message Queue](./queueing).
- **Event types, thread ids, and tool parts.** See [Stream Events](./stream-events).
- **Thinking tokens or a refresh mid-stream.** See [Thinking and Reasoning](./thinking-content) and [Resumable Streams](../resumable-streams/overview).

Send a message. Text grows in the UI as tokens arrive.
