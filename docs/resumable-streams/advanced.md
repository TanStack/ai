---
title: Resumable Streams (Advanced)
id: advanced
description: "The durability contract, terminal and error handling, reconnect tuning, joinRun, Cloudflare deployment, and process-death recovery for resumable streams."
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

The [Overview](./overview) covers the common case: pick an adapter, wrap your
response, add a `GET` handler. This page covers the rest.

## durableStream options

`durableStream(request, options)` talks to an external
[Durable Streams](https://durablestreams.com) backend:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { durableStream } from '@tanstack/ai-durable-stream'
import { openaiText } from '@tanstack/ai-openai'
// Your token source.
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

- `headers` takes a static object for fixed credentials or an async resolver for
  rotating tokens. The resolver runs for every create, append, read, and close.
- `batch` controls how many chunks are buffered per log append (default 32).
- The backend must return a non-empty `Stream-Next-Offset` header on create,
  append, and close. A missing header fails loudly. The adapter never guesses an
  offset.

## Attaching to a run by id

Reconnect after a drop is automatic. To attach to a run from the start on
purpose (a second tab, or a full reload where you already know the run id), call
`joinRun`. It performs a read-only `GET` with `offset=-1`, which is why the
server needs the `GET` handler from the Overview:

```ts
import { fetchServerSentEvents } from '@tanstack/ai-client'

async function attach(runId: string) {
  const connection = fetchServerSentEvents('/api/chat')
  for await (const chunk of connection.joinRun(runId)) {
    console.log(chunk)
  }
}
```

All four HTTP adapters (`fetchServerSentEvents`, `fetchHttpStream`,
`xhrServerSentEvents`, `xhrHttpStream`) expose `joinRun`.

## Completion, stop, and errors

The producer awaits `close()` on every in-process exit: normal completion,
`stop()` or response cancellation, provider iteration errors, and caught
server-side durability failures.

Cancellation and provider failure also append a terminal `RUN_ERROR` before
closing, so a reconnecting or joining client sees a terminal instead of hanging.
If appending that terminal or closing fails, the cause is logged server-side by
default (a joiner only ever sees a generic incomplete error, so the server log
is where the real cause lives). Pass `debug` to route it to your own logger:

```ts
import { memoryStream, toServerSentEventsResponse } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

function respond(request: Request, stream: AsyncIterable<StreamChunk>) {
  return toServerSentEventsResponse(stream, {
    durability: { adapter: memoryStream(request) },
    debug: true, // or { logger } for a custom Logger
  })
}
```

A durable source must end with its own terminal event
(`RUN_FINISHED`/`RUN_ERROR`). On normal completion the log is terminalized only
if the source emitted a terminal; without one, a durable consumer reconnects
once, makes no progress, and fails with `DurableStreamIncompleteError`. `chat()`
always emits `RUN_FINISHED`, so this only affects hand-rolled streams.

## memoryStream in production

`memoryStream` is for development and single-process deployments. Two reasons it
does not fit production:

1. The log lives in one process's memory, so a reconnect that lands on a
   different worker finds nothing.
2. The producer and the delivery socket are the same process. A mid-stream
   client disconnect aborts the producer and writes a terminal `RUN_ERROR` to
   the log, so a later reconnect replays the partial content plus that error
   rather than resuming a still-running response.

Completed runs are evicted after a grace window, so resuming an expired or
unknown run fails loudly instead of hanging, and a from-start join to a run that
never produces fails after `firstChunkDeadlineMs`. Live resume of a run that is
still producing after a disconnect needs a backend whose producer outlives the
socket (see [Process death](#process-death)).

## Reconnection bounding

A dropped connection resumes from the last offset. A transport error retries as
long as an offset is held, even if that attempt delivered only the replayed
overlap. A durable run that ends cleanly without a terminal and makes no forward
progress fails with `DurableStreamIncompleteError`. Only a non-durable (untagged)
stream that ends cleanly counts as a completed run. The distinction is
deliberate: a clean close means the server ended the response, so a durable
transport must never end an empty long-poll window while the producer is alive.

The client throttles between attempts and bounds reconnection with `maxAttempts`,
failing with `StreamReconnectLimitError`. The ceiling counts only consecutive
reconnects that deliver no new events; forward progress resets it to zero. A
healthy long run, even one behind a proxy that rolls the socket after every
event, never approaches it. It fires only when a run is genuinely stuck.

```ts
import { fetchServerSentEvents } from '@tanstack/ai-client'

function makeConnection() {
  return fetchServerSentEvents('/api/chat', {
    reconnect: { maxAttempts: 5, delayMs: 250 }, // defaults shown
  })
}
```

`durableStream` bounds its own read loop the same way. After a mid-window body
read failure it retries from the last valid position, capping consecutive
failures (`reconnect: { maxReadFailures: 10, delayMs: 250 }`). Normal long-poll
advancement is never throttled.

## Offset ownership

`StreamDurability<TOffset>` owns its offset format. Core only passes returned
values back to that adapter and writes them to the wire (an SSE `id:` field, or
the `id` of an NDJSON `{ id, chunk }` envelope). For every appended batch:

1. core calls `append(chunks)` before forwarding the chunks;
2. the adapter returns exactly one offset per chunk, in order;
3. core rejects missing, extra, empty, or whitespace/CR/LF-containing offsets;
4. a resume reads strictly after the supplied offset.

Core never derives an offset from an array index and never stamps one onto the
`StreamChunk`. See [Custom Durability Adapter](./custom-adapter) to build your
own.

## Cloudflare Durable Streams

[Durable Streams](https://durablestreams.com) ships a Cloudflare Workers plus
Durable Objects backend that speaks this protocol, so `durableStream` talks to
it directly with no new adapter.

When your TanStack AI endpoint also runs on Workers, reach the backend over a
[service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
instead of a public URL. The adapter's injectable `fetch` routes every request
through the binding, so traffic stays on Cloudflare's network and the binding
(not a bearer token) authorizes the call:

```ts
import { durableStream } from '@tanstack/ai-durable-stream'

interface Env {
  // A service binding to the deployed Durable Streams Worker.
  DURABLE_STREAMS: { fetch: typeof fetch }
}

function cloudflareAdapter(request: Request, env: Env) {
  // No `server` needed: the binding routes by path, so the adapter uses an
  // internal placeholder base and only the `/streams/...` path matters.
  return durableStream(request, {
    streamPrefix: 'chat-runs',
    fetch: env.DURABLE_STREAMS.fetch.bind(env.DURABLE_STREAMS),
  })
}
```

If the backend runs elsewhere, point `server` at the Worker's public URL
instead:

```ts
import { durableStream } from '@tanstack/ai-durable-stream'

function urlAdapter(request: Request) {
  return durableStream(request, {
    server: 'https://durable-streams.example.workers.dev',
    streamPrefix: 'chat-runs',
  })
}
```

Running on a Durable Object also satisfies the lease/reaper described under
[Process death](#process-death): a DO alarm can terminalize a run whose producer
died, so a reconnecting client sees a terminal state instead of waiting forever.

## Process death

A process that has already terminated cannot run cleanup code, so literal
process death cannot be guaranteed by `finally` or `close()` alone. Production
backends should add a lease/reaper:

1. the producer acquires or renews a lease while writing;
2. a timer, alarm, or background worker detects expired leases;
3. the reaper records an aborted terminal state and closes the log;
4. readers observe that terminal state instead of waiting forever.

This belongs to the durability service or deployment, not the in-process
response helper.

## Delivery is not state

The durability log replays chunks. It is not a queryable source of truth for
thread messages or conversation history. It answers "what did this run stream?",
not "what has this user said?". Keep authoritative state in your own storage.
See [Persistence](../chat/persistence) for the client-side options.
