---
title: Streaming
id: streaming-responses
order: 2
description: "Show the reply in the UI while the model writes it. Stream from the server, render with useChat, and cancel a run."
keywords:
  - tanstack ai
  - streaming
  - streaming responses
  - real-time ai
  - async iterable
  - chunks
  - useChat
---

`chat()` returns each token while the model writes the reply. `useChat` renders those tokens. Call `stop()` to cancel the run.


## Quick setup

### 1. Send the stream from the server

Call `chat()`. Then wrap the result with `toServerSentEventsResponse`:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
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

  return toServerSentEventsResponse(stream);
}
```

### 2. Render the stream with `useChat`

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
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

Send a message. The text grows in the UI while the tokens arrive.

The same pattern works in every UI framework. See [Quick Start](../getting-started/quick-start) for your framework.

## How it works

- `chatParamsFromRequest` reads the AG-UI body that `useChat` sends.
- `chat()` returns a stream of events. `toServerSentEventsResponse` writes them to the response as Server-Sent Events.
- `useChat` reads the events and updates `messages` after each chunk. `isLoading` is `true` while the run is in progress.

If your network blocks SSE, pick another transport on [Transports](../transports/overview).

## Cancel a run

Call `stop()` on the client. The client aborts the fetch.

To stop the model on the server too, give the same `AbortController` to `chat()` and to `toServerSentEventsResponse`:

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
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    abortController,
  });

  return toServerSentEventsResponse(stream, { abortController });
}
```

After `stop()`:

- An `AbortError` is expected.
- Pending client-tool work for that turn does not continue.
- A later `addToolResult()` for that turn has no effect.

## Where to go next

- **The user sends while a reply streams.** By default, the message waits in `queue`. See [Message Queue](./queueing).
- **You need the event types, the thread ids, or the tool parts.** See [Stream Events](./stream-events).
- **The model thinks before it answers.** See [Thinking and Reasoning](./thinking-content).
- **A page refresh must not lose the stream.** See [Resumable Streams](../resumable-streams/overview).

## Advanced

### Stream without HTTP

You can iterate `chat()` yourself. Branch on `chunk.type`, then read `chunk.delta`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
});

for await (const chunk of stream) {
  if (chunk.type === "TEXT_MESSAGE_CONTENT") {
    process.stdout.write(chunk.delta);
  }
}
```

### Client callbacks

`useChat` takes two callbacks for the stream:

- `onChunk`: runs for each event.
- `onFinish`: runs with the completed message.

### A bad request body

If the body is not valid, `chatParamsFromRequest` throws a `Response` with status 400. If your framework does not send a thrown `Response` as the HTTP reply, catch it and return it.

### Backpressure

The response stream pauses `chat()` when its output queue is full. It reads more chunks when the client reads the queued data. `toHttpResponse` with NDJSON does the same.

A response with `durability` does not pause. Its run keeps writing to the log.

### Main-thread work on the client

The shared `ChatClient` processes the chunks that are ready in order. It does not add a task between each chunk. After a fixed amount of work, it yields to keep the main thread responsive.

### A stream that ends too early

- **The connection drops in the middle of a line.** The client throws `StreamTruncatedError` and moves to `error`. See [Transports: Errors](../transports/overview#errors).
- **An OpenAI or OpenRouter Responses stream ends without `response.completed`.** The adapter emits `RUN_ERROR` with code `incomplete-stream`. This applies to chat and to structured output. The text that arrived stays available. The run does not call `onFinish`.
- **A Chat Completions stream ends without a finish.** See below.

Chat Completions adapters built on `@tanstack/openai-base` also make sure that the stream finished. A started stream needs one of these:

- a non-null `finish_reason`
- a final chunk with only usage (`choices: []` with `usage`)

If neither arrives, the adapter closes the open lifecycles and emits `RUN_ERROR` with code `incomplete-stream`. The partial text stays available. The run calls `onError`, skips pending server tools, and does not call `onFinish`.

The usage-only rule keeps providers compatible. Usage on an earlier chunk, or usage next to a choice, does not count. The OpenAI SDK hides `[DONE]`, so this check cannot see that marker. A stream with only `[DONE]` after the content still needs a finish reason or a usage-only last chunk.
