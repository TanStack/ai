---
title: JSON
id: transports-json
order: 9
description: "Send each chat run as one JSON response with fetchJson and toJsonResponse when your host buffers streams. Poll long runs with resumeJsonResponse."
keywords:
  - tanstack ai
  - json transport
  - non-streaming chat
  - fetchJson
  - toJsonResponse
  - resumeJsonResponse
  - polling
  - serverless timeout
---

Your host, proxy, or React Native setup buffers or breaks streamed responses. Or you want one plain response per run. Send the whole run as one JSON body with `fetchJson`. `useChat` works the same: messages, tool calls, approvals, and errors.

## Quick setup

### 1. Return JSON from the server

Run the chat to its end with `stream: false`. Then send the result with `toJsonResponse()`:

```typescript
// api/chat.ts
import { chat, chatParamsFromRequest, toJsonResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const result = await chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    stream: false,
  });
  return toJsonResponse(result);
}
```

### 2. Connect from the client

Pass `fetchJson()` to `useChat`:

```tsx
import { useChat, fetchJson } from "@tanstack/ai-react";

export function Chat() {
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchJson("/api/chat"),
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
      <button disabled={isLoading} onClick={() => void sendMessage("Hello")}>
        Send
      </button>
    </div>
  );
}
```

Click Send. When the run ends, the full reply appears in `messages`, with no stream between your server and the browser.

`fetchJson` sends the same POST body as `fetchHttpStream`. It takes the same options: `headers`, `body`, `credentials`, `fetchClient`, and dynamic functions. See [Request Options](./request-options).

## How it works

- `result.text` is the full reply on the server. `result.chunks` holds every chunk of the run.
- `toJsonResponse()` sends the body `{ chunks, offset?, done }`. Without durability, `done` is always `true`, and the body holds the whole run.
- `fetchJson` reads the chunks from the body and gives them to the chat client, one after the other.

## Advanced

### Send the stream from chat()

You can also pass the stream from `chat()` to `toJsonResponse()`. Then pass `request.signal`, so that the run stops when the client leaves:

```typescript
// api/chat.ts
import { chat, chatParamsFromRequest, toJsonResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
  });
  return toJsonResponse(stream, { signal: request.signal });
}
```

### Send a structured output

`await chat({ outputSchema })` gives you the typed object on the server. You can save it or change it before the client sees it. To show it in `useChat`, pass the object to `toJsonResponse()`:

```typescript
// api/extract-person.ts
import { chat, chatParamsFromRequest, toJsonResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
});

export async function POST(request: Request) {
  const { messages } = await chatParamsFromRequest(request);
  const person = await chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    outputSchema: PersonSchema,
  });
  // `person` is typed here. Save it before you send it.
  return toJsonResponse(person);
}
```

On the client, give `useChat` the same schema and read `final`:

```tsx
import { useChat, fetchJson } from "@tanstack/ai-react";
import { z } from "zod";

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
});

export function PersonExtractor() {
  const { sendMessage, isLoading, final } = useChat({
    connection: fetchJson("/api/extract-person"),
    outputSchema: PersonSchema,
  });

  return (
    <div>
      <button
        disabled={isLoading}
        onClick={() => void sendMessage("Extract: John Doe is 30")}
      >
        Extract
      </button>
      {final && (
        <p>
          {final.name} is {final.age}
        </p>
      )}
    </div>
  );
}
```

What happens:

- **One complete part**: the assistant message gets one `structured-output` part. `final` and `partial` get the object in the same reply.
- **Next turn**: the client sends the object back to the model as the assistant reply.

To fill in the object field by field, pass the stream from `chat({ outputSchema, stream: true })` to `toJsonResponse()` instead.

### Long runs and reloads

A long agent run can take more time than your host lets one request live. Add durability, and the server replies before the timeout. The client then asks for the rest.

1. Pass a durability adapter, `request.signal`, and `maxWaitMs` to `toJsonResponse`.
2. Add a `GET` handler with `resumeJsonResponse`.

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  resumeJsonResponse,
  toJsonResponse,
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
  return toJsonResponse(stream, {
    durability: { adapter: memoryStream(request) },
    signal: request.signal,
    maxWaitMs: 10_000,
  });
}

// fetchJson polls GET ?runId=...&offset=... until the reply has done: true.
export async function GET(request: Request) {
  return resumeJsonResponse({ adapter: memoryStream(request) });
}
```

What happens:

- **`maxWaitMs`**: after 10 seconds, the server replies with the chunks it has and `done: false`. The run keeps going and fills the log.
- **Polling**: `fetchJson` waits `pollIntervalMs`, then sends `GET ?runId=<id>&offset=<offset>`. Each reply holds only new chunks. It stops at `done: true`.
- **`signal`**: when the client leaves, the run does not stop. It keeps going in the log.
- **Reloads**: after a reload, `joinRun` sends `GET ?runId=<id>&offset=-1` to the same handler and reads the run from the start.

`resumeJsonResponse` waits at most 1000 ms for new chunks before it replies. It never calls the model.

The client from step 2 needs no change. To set the wait between polls (default 250 ms), pass `pollIntervalMs`:

```typescript
import { fetchJson } from "@tanstack/ai-react";

export const connection = fetchJson("/api/chat", { pollIntervalMs: 500 });
```

Pass this `connection` to `useChat`.

`memoryStream(request)` keeps the log in one process. If your requests run on many processes, use a production adapter. See [Resumable Streams](../resumable-streams/overview).

### Limits

- **No live text.** The answer appears when a reply arrives. With `maxWaitMs`, it appears in parts, one part per reply.
- **The run must outlive the reply.** After an early reply, the run continues in the same process. Your host must keep that work alive after the response goes out.
- **The first POST is not retried.** A retry can start the run two times. A failed poll is retried with the `reconnect` option. See [Reconnection bounding](../resumable-streams/advanced#reconnection-bounding).
- **Use `fetchJson`, not `fetcher`.** The chat client parses a `Response` from a `useChat` fetcher as SSE.
