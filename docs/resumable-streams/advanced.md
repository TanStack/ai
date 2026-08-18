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
- `durableStream` returns a plain `StreamDurability`. Its offsets embed a
  backend-assigned cursor, so a caller cannot choose one, and the adapter has no
  `upsert` to re-persist a range at offsets it did not mint. Code that requires
  `UpsertableStreamDurability` fails to compile at the wiring site rather than at
  run time. See
  [Re-persisting a stored range](./custom-adapter#re-persisting-a-stored-range)
  for adapters that can offer it. Resuming a run after a producer restart does
  not need it: see
  [Resuming a run without duplicating what you already streamed](#resuming-a-run-without-duplicating-what-you-already-streamed).

## Attaching to a run by id

Reconnect after a drop is automatic. To attach to a run from the start on
purpose (a second tab, or a full reload where you already know the run id), call
`joinRun`. It performs a read-only `GET` with `offset=-1`, which is why the
server needs the `GET` handler from the Overview. That handler is just
`resumeServerSentEventsResponse({ adapter })` (or `resumeHttpResponse` for
NDJSON): it replays from the log and returns a 400 if the request has no resume
offset.

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

## Disconnect, stop, and errors

A durable run's producer is decoupled from the delivery socket. When the client
disconnects (a page reload, a dropped connection), the response is cancelled but
the run keeps draining into the log to its own terminal, so a reconnect or a
mount-time `joinRun` tails it to completion. This is what makes a run resumable
across a full reload, not just an in-session reconnect.

A run ends early only on a genuine cancel or a failure:

- **Cancel** — an `AbortController` you pass to the response as
  `abortController` and then abort (from a user Stop button, or by forwarding
  `request.signal`, which is an `AbortSignal`, onto a controller of your own).
  This stops the producer and appends a terminal `RUN_ERROR`. A bare client
  disconnect does not do this; pass a controller when you want a disconnect to
  also stop the run.
- **Provider failure** — the model stream throws; the error is appended as a
  terminal `RUN_ERROR`.

Either way the producer awaits `close()` on exit, and a terminal is written
before closing so a reconnecting or joining client sees a terminal instead of
hanging. If appending that terminal or closing fails, the cause is logged
server-side by default (a joiner only ever sees a generic incomplete error, so
the server log is where the real cause lives). Pass `debug` to route it to your
own logger:

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

Within a single live process `memoryStream` already survives a client
disconnect: the producer outlives the socket and keeps draining into the log, so
a later reconnect or `joinRun` resumes a still-running run. Two things still keep
it to development and single-process deployments:

1. The log lives in one process's memory, so a reconnect that lands on a
   different worker finds nothing.
2. If the process itself dies, the log dies with it, so an interrupted run can
   neither resume nor terminalize on its own. A production backend adds a
   lease/reaper (see [Process death](#process-death)) that an in-memory process
   cannot.

Completed runs are evicted after a grace window, so resuming an expired or
unknown run fails loudly instead of hanging, and a from-start join to a run that
never produces fails after `firstChunkDeadlineMs`. Spanning processes (point 1)
is what `durableStream` adds.

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

## WebSocket transport

Everything above describes SSE and NDJSON: one connection per turn. A
WebSocket instead stays open for the whole conversation, so a few things work
differently. See [WebSockets](./websockets) for the full protocol and code;
this section covers only what changes relative to the rest of this page.

**Reconnect rides in the URL, not a header.** SSE and NDJSON resume with
`Last-Event-ID` because `fetch`/XHR can set arbitrary headers before opening a
request. A browser's `WebSocket` constructor can't set custom headers on the
handshake, so the offset instead rides in the URL: `?runId=<id>&offset=<lastId>`.
`webSocket()` reopens at that URL automatically on a durable run's drop, the
same de-dupe guarantee as `fetchServerSentEvents`, just carried differently on
the wire.

**The socket is conversation-scoped, not run-scoped.** One socket carries many
turns. `toWebSocketStream`'s `durability` option is therefore a factory keyed
by each turn's `runId` (via a synthetic per-turn request), not a single value
built once. The socket itself closes on client close, an idle timeout, or
process shutdown, not when one turn's `RUN_FINISHED` arrives.

**Heartbeat and idle timeout replace the transport-level keepalive SSE gets
for free.** `toWebSocketStream` pings every `heartbeatMs` (default 30s) and
closes the socket after `idleTimeoutMs` (default 5 minutes) with no inbound
frame.

**An abort frame targets one turn, not the socket.** `{ type: 'abort', runId }`
aborts only that turn's `onRun` iteration; the socket stays open for the next
turn. Closing the socket aborts every turn still in flight on it.

**Hosting differs by runtime.** On Cloudflare Workers or Durable Objects,
`toWebSocketResponse` uses the global `WebSocketPair` and needs no manual
upgrade. On Node (or anywhere without `WebSocketPair`), you upgrade the
connection yourself, typically with `ws`'s `WebSocketServer({ noServer: true })`
hooked into the HTTP server's `upgrade` event, and hand the resulting socket to
`toWebSocketStream` / `resumeWebSocketStream` directly.

**The producer-vs-socket caveat from [memoryStream in
production](#memorystream-in-production) applies unchanged.** With
`memoryStream`, a dropped WebSocket aborts the `chat()` call backing it just
like a dropped SSE connection does; reconnecting replays the log rather than
resuming a still-running model call. `durableStream` decouples the two exactly
as it does for SSE and NDJSON.

## Offset ownership

`StreamDurability<TOffset>` owns its offset format. Core only passes returned
values back to that adapter and writes them to the wire (an SSE `id:` field, or
the `id` of an NDJSON `{ id, chunk }` envelope). For every appended batch:

1. core calls `append(chunks)` before forwarding the chunks;
2. the adapter returns exactly one offset per chunk, in order;
3. core rejects missing, extra, empty, or whitespace/CR/LF-containing offsets;
4. a resume reads strictly after the supplied offset.

Core never derives an offset from an array index and never stamps one onto the
`StreamChunk`.

### Resuming a run without duplicating what you already streamed

A producer that restarts mid-run and replays part of its source must not append
the overlap twice. The client has no safety net below its offset de-dup: a
re-appended chunk carries a new offset, so `seen` never suppresses it, and the
stream processor concatenates text deltas and tool-call arguments
unconditionally. That is duplicated prose and `{"a":1}{"a":1}` arguments, not a
degraded experience.

The mechanism for it is `snapshot()` plus plain `append`, not caller-chosen
offsets. Read what the log already holds, compare it against your replay,
suppress the matching prefix, and append only the remainder:

```ts
import { memoryStream } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

async function appendAfterStored(
  request: Request,
  replayed: Array<StreamChunk>,
) {
  const durability = memoryStream(request)
  const stored = await durability.snapshot()
  // `snapshot` returns without waiting, even while the log is open, so this
  // works on a log whose previous producer died without calling `close()`.
  const remainder = replayed.slice(stored.length)
  if (remainder.length > 0) await durability.append(remainder)
}
```

This is what `@tanstack/ai-sandbox` does for a replayed agent run, comparing by
a timestamp-insensitive fingerprint rather than by count, and throwing if the
replay and the log disagree inside the prefix. See
[The Run Journal](../sandbox/journal) for that path in full.

Because the log stays append-only with adapter-minted offsets, this works on
`durableStream` too, which is the point: it is the recommended production
adapter and it has no `upsert`. Two caveats on `durableStream.snapshot()`
specifically. It is bounded by an internal ceiling on how many windows it will
pull before giving up on a backend that never reports the reader caught up, and
it reads from `-1`, so it cannot answer `[]` for a stream the backend never
created; that is a failed call, not an empty run.

`upsert` remains available as an optional capability for adapters whose store
can write at a caller-chosen key. Nothing in the resume path above uses it, and
most integrations never ask for it. `memoryStream` offers it, `durableStream`
does not (see above). See
[Re-persisting a stored range](./custom-adapter#re-persisting-a-stored-range) to
build your own.

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

One case has a mechanism rather than only advice. A **sandboxed** run's work
lives on inside the sandbox rather than in the dead process, so a later request
can adopt it: `sandboxRunDriver` claims the run, fences out the host that died,
and resumes appending to the same log. That is a takeover of a live producer, not
terminalization of a dead one, and it only applies to sandboxed runs — see
[Takeover & Detached Runs](../sandbox/takeover). The advice above still stands for
everything else. Note also that `memoryStream` cannot participate: its log lives
in the producer's own process, so nothing survives that process to be adopted.

## Delivery is not state

The durability log replays chunks. It is not a queryable source of truth for
thread messages or conversation history. It answers "what did this run stream?",
not "what has this user said?". Keep authoritative state in your own storage.
See [Client persistence](../persistence/client-persistence) for the client-side options.
