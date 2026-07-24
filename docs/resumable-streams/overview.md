---
title: Resumable Streams
id: overview
description: "Reconnect to an in-flight AI response without re-running the model. Plug in a durability adapter, add a GET handler, and streams survive refreshes and dropped connections."
keywords:
  - resumable streams
  - resume stream
  - reconnect sse
  - reconnect ndjson
  - delivery durability
  - durable streams
  - last-event-id
---

# Resumable Streams

A resumable stream lets a client reconnect to an in-flight response after a page
refresh, a dropped connection, or a suspended tab, without calling the provider
again.

You turn it on by plugging a **durability adapter** into your streaming
response. The adapter records every chunk to an ordered log before delivery and
tags each event with an opaque offset. On reconnect the client resends the last
offset and the server replays from the log instead of re-running the model.

This is the delivery layer: it resumes a live stream. Saving the conversation so
it survives a reload or reaches another device is a separate layer. For how the
two fit together and when to pick each, see
[Durability and Persistence](../persistence/overview).

Three steps: pick an adapter, wrap your response with it, add a `GET` handler.

## 1. Pick an adapter

- `memoryStream(request)` from `@tanstack/ai` keeps the log in process memory.
  Zero setup, ideal for development. Single process only.
- `durableStream(request, options)` from `@tanstack/ai-durable-stream` writes to
  an external [Durable Streams](https://durablestreams.com) backend. Use this in
  production, where requests span many processes.

Using a different store (Redis, Postgres, a queue)? Implement the four-method
`StreamDurability` interface: see [Custom Durability Adapter](./custom-adapter).

## 2. Wrap your server response

Pass the adapter as `durability` to `toServerSentEventsResponse` (SSE) or
`toHttpResponse` (NDJSON). Add a `GET` handler so a reload or a second tab can
re-attach to a run:

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: memoryStream(request) },
  })
}

export async function GET(request: Request) {
  // Replays the run from the durability log. No model call happens here.
  return resumeServerSentEventsResponse({ adapter: memoryStream(request) })
}
```

For production, swap `memoryStream(request)` for
`durableStream(request, options)`. Everything else stays the same.

> **One gotcha:** on a dropped connection the client reconnects by re-sending
> the same `POST`. The model is not re-run (the log is replayed), but any side
> effects your handler runs around the stream (saving the user's message,
> creating a run row, counting usage) would fire a second time. Guard them
> behind a resume check so they only run on a fresh request.

The adapter already knows whether this is a resume: `resumeFrom()` returns the
offset on a reconnect and `null` on a fresh request. Build the adapter once,
check it, then reuse it for the response:

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
// Your own one-time side effects.
import { countUsage, saveUserMessage } from './db'

export async function POST(request: Request) {
  const durability = memoryStream(request)
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  // null on a fresh request, non-null on a reconnect. Do one-time work once.
  if (durability.resumeFrom() === null) {
    await saveUserMessage(threadId, messages)
    await countUsage(runId)
  }

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: durability },
  })
}
```

## 3. Client: nothing to wire

Reconnect is automatic. Use `useChat` with any HTTP connection adapter and a
dropped connection resumes itself:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return <button onClick={() => void chat.sendMessage('Hello')}>Send</button>
}
```

For NDJSON, swap `fetchServerSentEvents` for `fetchHttpStream` (with the server
on `toHttpResponse`). The XHR adapters (`xhrServerSentEvents`, `xhrHttpStream`)
work the same way, for runtimes without streaming `fetch`.

That covers the common case. For the durability contract, terminal and error
handling, reconnect tuning, attaching to a run by id, Cloudflare deployment, and
production process-death concerns, see [Advanced](./advanced).
