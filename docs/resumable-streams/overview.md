---
title: Resumable Streams
id: overview
description: "Reconnect to an in-flight AI stream without re-running the model — durability adapter + GET handler."
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

If a client drops mid-response and you must resume without re-calling the model → plug a durability adapter into the stream response and add a GET reattach handler.

Delivery only (per **run**). Conversation persistence is separate — [Durability and Persistence](../persistence/overview). Runs vs threads: [Threads and runs](../chat/streaming#threads-and-runs).

## 1. Pick an adapter

- `memoryStream(request)` (`@tanstack/ai`) — in-process; dev / single process
- `durableStream(request, options)` (`@tanstack/ai-durable-stream`) — external [Durable Streams](https://durablestreams.com); production
- Custom store → implement `StreamDurability`: [Custom adapter](./custom-adapter)

## 2. Wrap the response + GET

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
  // Replay only — no model call
  return resumeServerSentEventsResponse({ adapter: memoryStream(request) })
}
```

Production: swap `memoryStream` for `durableStream`. NDJSON: `toHttpResponse` / `resumeHttpResponse`.

Sandbox takeover of a detached run: pass `driver: sandboxRunDriver({ … })` on the GET — [Takeover](../sandbox/takeover).

### Guard one-time side effects

Reconnect may re-POST. Model is not re-run, but handler side effects would re-fire. Use `resumeFrom()`:

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { countUsage, saveUserMessage } from './db'

export async function POST(request: Request) {
  const durability = memoryStream(request)
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

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

## 3. Client

No extra wiring. Any HTTP connection adapter reconnects automatically:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return <button onClick={() => void chat.sendMessage('Hello')}>Send</button>
}
```

NDJSON: `fetchHttpStream` + server `toHttpResponse`. XHR: `xhrServerSentEvents` / `xhrHttpStream`.

Contract, errors, joinRun, Cloudflare, process death → [Advanced](./advanced).
