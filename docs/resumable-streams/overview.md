---
title: Resumable Streams
id: overview
description: "Reconnect to an in-flight AI response without re-running the model. Durable, offset-addressed SSE and NDJSON delivery with replay, multi-tab join, and backend-driven producer-death recovery."
keywords:
  - resumable streams
  - resume stream
  - reconnect sse
  - reconnect ndjson
  - delivery durability
  - durable streams
  - last-event-id
  - replay
  - joinRun
---

# Resumable Streams

A resumable stream lets a client reconnect to an in-flight response — after a
page refresh, a dropped connection, or a suspended tab — without invoking the
provider again. TanStack AI implements this with a **delivery durability**
adapter: an ordered log that records every stream chunk before it is delivered,
so any client can replay from any point.

Because the log outlives the request, this goes further than in-flight
reconnection: a finished run can be replayed, a second tab can join a live run,
and a run whose producer died can still be terminalized by the backend.

Two adapters ship:

- `memoryStream(request)` stores a process-local log for development and tests.
- `durableStream(request, options)` writes to an external
  [Durable Streams](https://durablestreams.com) protocol URL.

Any backend that speaks the Durable Streams protocol works with `durableStream`
directly — for example the Cloudflare Workers + Durable Objects server (see
[below](#cloudflare-durable-streams)). To back durability with a different
system — a Postgres-backed log via [Electric](https://electric-sql.com), Redis
streams, a message queue — implement the four-method `StreamDurability`
interface against it; core only round-trips the opaque offsets it returns.

Resumable delivery works over both wire encodings:

- `toServerSentEventsResponse` tags each SSE event with an `id:` offset line.
- `toHttpResponse` (NDJSON) has no native event id, so each durable line is
  emitted as an `{ id, chunk }` envelope carrying the same opaque offset.

The durability layer (logging, offsets, resume, terminalization) is identical
for both. Only the encoding differs, and an untagged stream stays exactly what
it was before. On the client, `fetchServerSentEvents`, `fetchHttpStream`, and
the XHR adapters (`xhrServerSentEvents`, `xhrHttpStream`) all reconnect with
`Last-Event-ID`, de-dupe the replayed prefix, and expose `joinRun(runId)`.

## Server setup

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { durableStream } from '@tanstack/ai-durable-stream'
import { openaiText } from '@tanstack/ai-openai'

declare function getDurableStreamsToken(): Promise<string>

const durableOptions = {
  server: 'https://streams.example.com',
  streamPrefix: 'chat-runs',
  headers: async () => ({
    Authorization: `Bearer ${await getDurableStreamsToken()}`,
  }),
}

type ChatInput = Pick<
  Awaited<ReturnType<typeof chatParamsFromRequest>>,
  'messages' | 'threadId' | 'runId'
>

async function respond(request: Request, input: ChatInput) {
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: input.messages,
    threadId: input.threadId,
    runId: input.runId,
  })

  return toServerSentEventsResponse(stream, {
    durability: {
      adapter: durableStream(request, durableOptions),
      batch: 32,
    },
  })
}

export async function POST(request: Request) {
  return respond(request, await chatParamsFromRequest(request))
}

export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get('runId')
  if (!runId) return new Response('runId is required', { status: 400 })

  // A resume request replays the durability log and never iterates this lazy
  // provider stream. The placeholder input is therefore not sent upstream.
  return respond(request, {
    messages: [],
    threadId: `replay:${runId}`,
    runId,
  })
}
```

> **Make the POST handler reconnect-safe.** On a dropped connection the client
> auto-reconnects by re-issuing the **same POST** with a `Last-Event-ID` header.
> The durability layer guarantees the provider stream is not re-run, but any
> non-idempotent work your handler does _around_ `respond` — persisting the
> user's message, creating a run row, incrementing usage — runs again on every
> reconnect. Guard those side effects behind a resume check (a `Last-Event-ID`
> header or a non-null `durability.resumeFrom()`) so they run only on a fresh
> request, not a replay.

Use a static `headers` object for fixed credentials or an async resolver for
rotating tokens. The resolver runs for every create, append, read, and close
request. This option belongs to the external URL adapter; a future direct
Cloudflare binding would use binding authorization instead.

The external service must return a non-empty `Stream-Next-Offset` header for
create, append, and close operations. Missing headers fail loudly. The adapter
never guesses an offset.

For development and tests, swap `durableStream(request, durableOptions)` for
`memoryStream(request)` from `@tanstack/ai` — no external service required,
at the cost of the log living only in that process's memory. Because that store
is process-global, `memoryStream` is for development and single-process
deployments only: completed runs are evicted after a grace window (so resuming
an expired or unknown run fails loudly instead of hanging), and a from-start
join to a run that never produces fails after `firstChunkDeadlineMs`.

### Cloudflare Durable Streams

[Durable Streams](https://durablestreams.com) ships a Cloudflare Workers +
Durable Objects backend that speaks this same protocol, so `durableStream`
talks to it directly — no new adapter.

When your TanStack AI endpoint also runs on Workers, reach the backend over a
[service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
rather than a public URL. The adapter's injectable `fetch` routes every create,
append, read, and close through the binding, so traffic never leaves
Cloudflare's network and the binding — not a bearer token — authorizes the call:

```ts
import { durableStream } from '@tanstack/ai-durable-stream'

interface Env {
  // A service binding to the deployed Durable Streams Worker.
  DURABLE_STREAMS: { fetch: typeof fetch }
}

function cloudflareAdapter(request: Request, env: Env) {
  // No `server` needed — the binding routes by path, so the adapter uses an
  // internal placeholder base and only the `/streams/...` path matters.
  return durableStream(request, {
    streamPrefix: 'chat-runs',
    fetch: env.DURABLE_STREAMS.fetch.bind(env.DURABLE_STREAMS),
  })
}
```

If the backend runs elsewhere, or the caller is off-platform, point `server` at
the deployed Worker's public URL instead:

```ts
import { durableStream } from '@tanstack/ai-durable-stream'

const cloudflareOptions = {
  server: 'https://durable-streams.example.workers.dev',
  streamPrefix: 'chat-runs',
}

function urlAdapter(request: Request) {
  return durableStream(request, cloudflareOptions)
}
```

Running on a Durable Object also satisfies the lease/reaper described under
[Process death](#process-death): a DO alarm can terminalize a run whose producer
died, so a reconnecting client observes a terminal state instead of waiting
forever.

## Client setup

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return <button onClick={() => void chat.sendMessage('Hello')}>Send</button>
}
```

When the server emits SSE `id:` lines, `fetchServerSentEvents` remembers the
last id, reconnects with `Last-Event-ID`, and de-duplicates the replayed prefix.
The id is opaque to the client.

The NDJSON adapter behaves the same way. Swap the transport and keep the server
on `toHttpResponse`:

```tsx
import { fetchHttpStream, useChat } from '@tanstack/ai-react'

export function Chat() {
  const chat = useChat({
    connection: fetchHttpStream('/api/chat'),
  })

  return <button onClick={() => void chat.sendMessage('Hello')}>Send</button>
}
```

`fetchHttpStream` reads the offset from each `{ id, chunk }` envelope instead of
an SSE `id:` line. Reconnect, de-dupe, and `joinRun` are otherwise the same. The
XHR adapters (`xhrServerSentEvents`, `xhrHttpStream`) resume the same way, for
runtimes without streaming `fetch`.

To attach to a known run from the beginning, use the adapter's `joinRun`:

```ts
import { fetchServerSentEvents } from '@tanstack/ai-client'

declare const runId: string
const connection = fetchServerSentEvents('/api/chat')

for await (const chunk of connection.joinRun(runId)) {
  console.log(chunk)
}
```

`joinRun` performs a GET with `offset=-1` and `runId`. The endpoint must accept
that GET, as shown above.

## Offset ownership

`StreamDurability<TOffset>` owns its offset format. Core only passes returned
values back to that adapter and writes them to the wire — an SSE `id:` field, or
the `id` of an NDJSON `{ id, chunk }` envelope.

For every appended batch:

1. core calls `append(chunks)` before forwarding the chunks;
2. the adapter returns exactly one offset per chunk in the same order;
3. core rejects missing, extra, empty, or CR/LF-containing offsets;
4. a resume reads strictly after the supplied offset.

Core never derives an offset from an array index and never stamps an offset onto
the `StreamChunk` object.

## Completion, stop, and errors

The producer awaits `close()` on all in-process exits:

- normal completion;
- `stop()` / response cancellation;
- provider iteration errors;
- caught server-side durability failures.

Cancellation and provider failure also attempt to append a terminal
`RUN_ERROR` with an aborted or failed error payload before closing. If terminal
append or close fails, the failure is surfaced to the live consumer. Because a
_joiner_ replaying the log only sees a generic incomplete error, pass
`debug` to `toServerSentEventsResponse` to record the real cause server-side:

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

A durable source **must** end with its own terminal event
(`RUN_FINISHED`/`RUN_ERROR`). On clean completion the producer terminalizes the
log only when the source emitted a terminal; if it ends without one, the log is
left unterminated and a durable consumer (fresh, reconnecting, or joining)
reconnects once, makes no progress, and fails with
`DurableStreamIncompleteError`. `chat()` always emits `RUN_FINISHED`, so this
only bites hand-rolled streams.

With `memoryStream` the producer and the delivery socket are the same process,
so a mid-stream client disconnect aborts the producer and appends a terminal
`RUN_ERROR` to the log. A later reconnect/join then replays the partial content
followed by that error rather than resuming a still-running response. So
`memoryStream` is for replaying completed (or fully-buffered) runs in a single
process; live resume of a run that is still producing after a disconnect
requires a backend where the producer outlives the delivery socket (see
[Process death](#process-death)).

## Reconnection bounding

A dropped connection resumes from the last offset. A transport **error** retries
as long as an offset is held — even if that attempt delivered only the replayed
overlap and no new events. A durable run that ends **cleanly** without a terminal
event and makes no forward progress fails with `DurableStreamIncompleteError`
(the run cannot complete); only a non-durable (untagged) stream that ends cleanly
is treated as a completed run. This asymmetry is deliberate: a clean close means
the server ended the response, so a durable transport must never surface an empty
long-poll window as a clean end while the producer is still alive. To keep a
flapping producer (or a proxy that rolls the socket after every event) from
reconnecting without end, the client throttles between attempts and caps the
total, failing with `StreamReconnectLimitError`:

```ts
import { fetchServerSentEvents } from '@tanstack/ai-client'

function makeConnection() {
  return fetchServerSentEvents('/api/chat', {
    reconnect: { maxAttempts: 1000, delayMs: 250 }, // defaults shown
  })
}
```

`durableStream` bounds its own read loop the same way — after a mid-window body
read failure it retries from the last valid position, capping consecutive
failures (`reconnect: { maxReadFailures: 10, delayMs: 250 }`). Normal
long-poll window advancement is never throttled.

## Process death

A process that has already terminated cannot execute cleanup code. Therefore
literal process death cannot be guaranteed by `finally` or `close()` alone.

Production backends should add a lease/reaper mechanism:

1. the producer acquires or renews a lease while writing;
2. a timer, alarm, or background worker detects expired leases;
3. the reaper appends or records an aborted terminal state and closes the log;
4. readers observe the terminal state instead of waiting forever.

This mechanism belongs to the durability service or deployment. It is not
implemented by the in-process response helper.

## Delivery is not state

The durability log replays chunks. It is not a queryable source of truth for
thread messages or conversation history — it answers "what did this run
stream?", not "what has this user said?". Keep authoritative state in your own
storage; see [Persistence](../chat/persistence) for the client-side options.
