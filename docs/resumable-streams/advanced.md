---
title: Resumable Streams (Advanced)
id: advanced
description: "durableStream options, joinRun, errors, reconnect limits, snapshot resume, Cloudflare, process death."
keywords:
  - stream durability
  - durableStream options
  - joinRun
  - StreamReconnectLimitError
  - DurableStreamIncompleteError
  - process death
  - cloudflare durable streams
---

# Resumable Streams: Advanced

Common case: [Overview](./overview). This page covers production knobs and edge cases.

## durableStream options

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { durableStream } from '@tanstack/ai-durable-stream'
import { openaiText } from '@tanstack/ai-openai'
import { getDurableStreamsToken } from './auth'

const durableOptions = {
  server: 'https://streams.example.com',
  streamPrefix: 'chat-runs',
  headers: async () => ({
    Authorization: `Bearer ${await getDurableStreamsToken()}`,
  }),
}

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: durableStream(request, durableOptions), batch: 32 },
  })
}
```

- `headers` — static object or async resolver (every create/append/read/close)
- `batch` — chunks per append (default 32)
- Backend must return non-empty `Stream-Next-Offset` on create/append/close
- Plain `StreamDurability` (no `upsert`) — resume via [snapshot](#resuming-without-duplicating)

## Attach by run id (`joinRun`)

```ts
import { fetchServerSentEvents } from '@tanstack/ai-client'

async function attach(runId: string) {
  const connection = fetchServerSentEvents('/api/chat')
  for await (const chunk of connection.joinRun(runId)) {
    console.log(chunk)
  }
}
```

GET handler from Overview required (`offset=-1` read-only). Works on all four HTTP adapters.

## Disconnect, stop, errors

Producer is decoupled from the socket: client disconnect cancels the response but the run keeps writing the log until its terminal. Reconnect / `joinRun` tails to completion.

Run ends early only on:

- **Cancel** — abort the `abortController` you pass to the response (Stop button or forward `request.signal`). Bare disconnect does **not** stop the producer unless you wire it.
- **Provider failure** — terminal `RUN_ERROR`

Producer awaits `close()` and writes a terminal before closing. Terminalize failures log server-side; pass `debug: true` or `{ logger }` to route them.

Hand-rolled streams must emit `RUN_FINISHED` / `RUN_ERROR` or reconnect fails with `DurableStreamIncompleteError`. `chat()` always emits `RUN_FINISHED`.

## memoryStream limits

Survives client disconnect inside one process. Not for multi-worker production:

1. Log is process-local — other workers find nothing
2. Process death loses the log (no lease/reaper)

Completed runs expire after a grace window. Use `durableStream` across processes.

## Reconnection bounds

```ts
import { fetchServerSentEvents } from '@tanstack/ai-client'

function makeConnection() {
  return fetchServerSentEvents('/api/chat', {
    reconnect: { maxAttempts: 5, delayMs: 250 },
  })
}
```

Ceiling counts consecutive reconnects with **no new events**; progress resets it. Stuck durable clean-close without terminal → `DurableStreamIncompleteError`. Limit hit → `StreamReconnectLimitError`.

`durableStream` read loop: `reconnect: { maxReadFailures: 10, delayMs: 250 }`.

## Offset ownership

Core: `append` before deliver → one offset per chunk → reject empty/whitespace/CR/LF/duplicates → resume reads **strictly after** offset. Core never invents offsets.

### Resuming without duplicating

Restarting a producer must not re-append overlap. Use `snapshot()` + `append` remainder:

```ts
import { memoryStream } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

async function appendAfterStored(
  request: Request,
  replayed: Array<StreamChunk>,
) {
  const durability = memoryStream(request)
  const stored = await durability.snapshot()
  const remainder = replayed.slice(stored.length)
  if (remainder.length > 0) await durability.append(remainder)
}
```

Works on open logs (snapshot never waits). Sandbox path fingerprints instead of length — [Run Journal](../sandbox/journal). `durableStream.snapshot()` has a window ceiling and fails (not `[]`) for never-created streams. Optional `upsert` for stores that can write at caller keys — [Custom adapter](./custom-adapter#re-persisting-a-stored-range).

## Cloudflare Durable Streams

Service binding (Workers → Durable Streams Worker):

```ts
import { durableStream } from '@tanstack/ai-durable-stream'

interface Env {
  DURABLE_STREAMS: { fetch: typeof fetch }
}

function cloudflareAdapter(request: Request, env: Env) {
  return durableStream(request, {
    streamPrefix: 'chat-runs',
    fetch: env.DURABLE_STREAMS.fetch.bind(env.DURABLE_STREAMS),
  })
}
```

Public URL: set `server: 'https://durable-streams.example.workers.dev'`. DO alarms can implement the process-death reaper below.

## Process death

`finally`/`close()` cannot run after a hard kill. Production backends need a lease/reaper:

1. Producer renews lease while writing
2. Timer/alarm detects expiry
3. Reaper writes aborted terminal + closes log
4. Readers see terminal instead of hanging

Sandbox runs can be **taken over** (`sandboxRunDriver`) — [Takeover](../sandbox/takeover). `memoryStream` cannot — log dies with the process.

## Delivery ≠ state

Durability log answers “what did this run stream?”, not “what did the user say?”. Keep conversation state in your store — [Client persistence](../persistence/client-persistence).
