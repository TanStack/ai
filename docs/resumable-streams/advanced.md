---
title: Resumable Streams (Advanced)
id: advanced
description: "Run resumable streams in production: durableStream options, write batching, joinRun, disconnect and error handling, reconnect limits, offset rules, Cloudflare, and process-death recovery."
keywords:
  - stream durability
  - durableStream options
  - joinRun
  - StreamReconnectLimitError
  - DurableStreamIncompleteError
  - process death
  - cloudflare durable streams
---

`durableStream` keeps the stream log in an external Durable Streams backend. A reconnect can then reach any worker.

## Go to production

1. Install the adapter.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-durable-stream
vue: @tanstack/ai-durable-stream
solid: @tanstack/ai-durable-stream
svelte: @tanstack/ai-durable-stream
preact: @tanstack/ai-durable-stream
angular: @tanstack/ai-durable-stream
octane: @tanstack/ai-durable-stream
vanilla: @tanstack/ai-durable-stream

<!-- ::end:tabs -->

2. Replace `memoryStream(request)` with `durableStream(request, options)` in the `POST` and in the `GET`:

```ts
import {
  chat,
  chatParamsFromRequest,
  resumeServerSentEventsResponse,
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
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream, {
    durability: {
      adapter: durableStream(request, durableOptions),
      batch: 32,
      batchWaitMs: 50,
    },
  })
}

export async function GET(request: Request) {
  return resumeServerSentEventsResponse({
    adapter: durableStream(request, durableOptions),
  })
}
```

3. Reload the page while a reply streams. The client reconnects, possibly to a different process, and the reply finishes in place.

The client code does not change.

## How it works

- Core appends each batch of chunks to the log before it sends them. The adapter returns one opaque offset per chunk.
- The client remembers the last offset. On a reconnect, it sends that offset, and the server replays the log from that point. The model does not run again.
- The producer is not tied to the client socket. A disconnect cancels the response, but the run keeps writing to the log until it ends.
- The log stores one run. It does not store the conversation. For the conversation, use [persistence](../persistence/overview).

## Advanced

### durableStream options

| Option | What it does | Default |
| --- | --- | --- |
| `server` | Base URL of the Durable Streams server. Optional when you pass `fetch` (for example, a Cloudflare service binding). | None |
| `streamPrefix` | Prefix for the stream names. | `runs` |
| `headers` | Headers for every create, append, read, and close request. A static object, or an async resolver that runs for every request so tokens can rotate. | None |
| `fetch` | The fetch implementation. | Global `fetch` |
| `reconnect` | Bounds for the read retry loop: `{ maxReadFailures, delayMs }`. See [Reconnection bounding](#reconnection-bounding). | `{ maxReadFailures: 10, delayMs: 250 }` |
| `operationTimeoutMs` | Timeout for one create, append, or close request. `snapshot` is bounded by it too. A long-poll `read` is not. | `30000` |
| `producerEpoch` | Sent as `Producer-Epoch` on every append. A backend that fences producers rejects appends from a lower epoch, so a host that lost its claim cannot keep writing. Pass `RunRecord.driverEpoch` here. | `0` |

Behavior to know:

- The backend must return a non-empty `Stream-Next-Offset` header on create, append, and close. If the header is missing, the call fails. The adapter never guesses an offset.
- `durableStream` returns a plain `StreamDurability`. Its offsets contain a cursor that the backend assigns, so a caller cannot choose one. It has no `upsert`. Code that requires `UpsertableStreamDurability` fails to compile where you wire it.
- You do not need `upsert` to resume a run after a producer restart. See [Resuming a run without duplicating what you already streamed](#resuming-a-run-without-duplicating-what-you-already-streamed). For adapters that can offer `upsert`, see [Re-persisting a stored range](./custom-adapter#re-persisting-a-stored-range).

### Batch the log writes

Each append to a remote backend is one request. A chunk goes to the client only after its append. Two options on `durability` balance the number of writes against how fast the text shows:

- `batch`: the maximum number of chunks in one append. The default is 32.
- `batchWaitMs`: the maximum time in milliseconds that a chunk waits for more chunks. Then its batch is appended and sent. The default is 50.

If your backend charges per write, increase `batchWaitMs` and `batch`. The text then arrives in bigger steps. If the reply arrives in large blocks, decrease `batchWaitMs`. Set it to `0` to append each chunk alone.

### Attaching to a run by id

Reconnect after a drop is automatic. To attach to a run from the start on purpose (a second tab, or a full reload where you know the run id), call `joinRun`. It sends a read-only `GET` with `offset=-1`, so the server needs the `GET` handler from the Overview. That handler is `resumeServerSentEventsResponse({ adapter })` (or `resumeHttpResponse` for NDJSON). It replays from the log, and it returns a 400 if the request has no resume offset.

```ts
import { fetchServerSentEvents } from '@tanstack/ai-client'

async function attach(runId: string) {
  const connection = fetchServerSentEvents('/api/chat')
  for await (const chunk of connection.joinRun(runId)) {
    console.log(chunk)
  }
}
```

All four HTTP adapters (`fetchServerSentEvents`, `fetchHttpStream`, `xhrServerSentEvents`, `xhrHttpStream`) have `joinRun`.

### Disconnect, stop, and errors

The producer of a durable run is not tied to the delivery socket. When the client disconnects (a page reload, a dropped connection), the response is cancelled, but the run keeps writing into the log until its own terminal. A reconnect or a `joinRun` at mount then reads it to the end. That is why a run resumes after a full reload, not only after a reconnect in the same session.

If the replay ends on a client tool, the client sends the tool result after the replay finishes. That is the same path as a live stream.

A run ends early only on a real cancel or a failure:

- **Cancel**: you pass an `AbortController` to the response as `abortController`, then abort it. For example, from a Stop button, or by forwarding `request.signal` to a controller of your own. This stops the producer and appends a terminal `RUN_ERROR`. A plain client disconnect does not do this. Pass a controller if you want a disconnect to stop the run too.
- **Provider failure**: the model stream throws, and the error is appended as a terminal `RUN_ERROR`.

In both cases, the producer writes a terminal and then awaits `close()` on exit. A reconnecting or joining client then sees a terminal and does not hang.

If the append of that terminal or the close fails, the server logs the cause by default. A joining client only sees a generic incomplete error, so the server log has the real cause. The server logs a failed replay the same way, for example a reconnect to an expired run. On SSE and NDJSON, that reader also gets a `RUN_ERROR`. Pass `debug` to send these logs to your own logger:

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

A durable source must end with its own terminal event (`RUN_FINISHED` or `RUN_ERROR`). On normal completion, core terminalizes the log only if the source emitted a terminal. Without one, a durable consumer reconnects once, gets nothing new, and fails with `DurableStreamIncompleteError`. `chat()` always emits `RUN_FINISHED`, so this affects only streams that you build yourself.

### memoryStream in production

In one live process, `memoryStream` survives a client disconnect. The producer outlives the socket and keeps writing into the log, so a later reconnect or `joinRun` resumes a run that still goes on. Two limits keep it to development and single-process deployments:

1. The log lives in the memory of one process. A reconnect that reaches a different worker finds nothing.
2. If the process dies, the log dies with it. The run can neither resume nor terminalize. A production backend adds a lease and a reaper (see [Process death](#process-death)). An in-memory process cannot.

More `memoryStream` behavior:

- Completed runs are evicted after a grace window of 5 minutes. The store also keeps at most 1024 runs and drops the oldest completed ones first. A run in progress is never evicted.
- A resume of an expired or unknown run fails with an error. It does not hang.
- A from-start join to a run that never produces fails after `firstChunkDeadlineMs` (100 ms by default). Raise it with `memoryStream(request, { firstChunkDeadlineMs })` when a producer can start long after a joiner attaches.
- `memoryStream({ runId })` builds the adapter without a `Request`, for example in a server function that got the run id as data.

`durableStream` removes limit 1: the log spans processes.

### Reconnection bounding

A dropped connection resumes from the last offset. A transport error retries as long as the client holds an offset, even if that attempt delivered only the replayed overlap.

How a stream that ends cleanly is treated:

- A durable run that ends cleanly with no terminal and no new events fails with `DurableStreamIncompleteError`.
- Only a non-durable (untagged) stream that ends cleanly counts as a completed run.

This rule exists because a clean close means the server ended the response. So a durable transport must never end an empty long-poll window while the producer is alive.

The client waits between attempts and limits reconnects with `maxAttempts`. Past the limit, it fails with `StreamReconnectLimitError`. The limit counts only consecutive reconnects that deliver no new events, and any new event resets it to zero. A healthy long run never reaches it, even behind a proxy that closes the socket after each event. It fires only when a run is stuck.

```ts
import { fetchServerSentEvents } from '@tanstack/ai-client'

function makeConnection() {
  return fetchServerSentEvents('/api/chat', {
    reconnect: { maxAttempts: 5, delayMs: 250 }, // defaults shown
  })
}
```

`durableStream` limits its own read loop the same way. After a body read fails in the middle of a window, it retries from the last valid position, and it limits consecutive failures (`reconnect: { maxReadFailures: 10, delayMs: 250 }`). Normal long-poll progress is never throttled.

### WebSocket transport

A WebSocket stays open for the whole conversation, so some things are different from SSE and NDJSON. [WebSockets](./websockets) has the full protocol and code. What changes:

- **Resume uses the URL, not a header.** A browser `WebSocket` cannot set custom headers on the handshake, so the offset goes in the URL: `?runId=<id>&offset=<lastId>`. `webSocket()` reopens at that URL by itself when a durable run drops, with the same de-duplication as `fetchServerSentEvents`.
- **The socket belongs to the conversation, not to a run.** One socket carries many turns. So the `durability` option of `toWebSocketStream` is a factory, keyed by the `runId` of each turn. The socket closes on a client close, an idle timeout, or a process shutdown. It does not close on `RUN_FINISHED`.
- **Heartbeat and idle timeout.** `toWebSocketStream` sends a ping every `heartbeatMs` (default 30 s). It closes the socket after `idleTimeoutMs` (default 5 minutes) with no inbound frame, but never while a turn still streams.
- **An abort frame stops one turn.** `{ type: 'abort', runId }` aborts only that turn's `onRun`. Closing the socket aborts every turn in flight on it.
- **Hosting depends on the runtime.** On Cloudflare Workers or Durable Objects, `toWebSocketResponse` uses the global `WebSocketPair`. On Node, you upgrade the connection yourself (for example with `ws`'s `WebSocketServer({ noServer: true })`) and pass the socket to `toWebSocketStream` or `resumeWebSocketStream`.

A dropped WebSocket aborts the `chat()` call behind it, with `memoryStream` and with `durableStream`. A reconnect then replays the log up to the drop. It does not resume the model call. To keep a reply going across a drop, use SSE or NDJSON with `durableStream`.

### Offset ownership

`StreamDurability<TOffset>` owns its offset format. Core only passes the returned values back to that adapter and writes them to the wire: an SSE `id:` field, or the `id` of an NDJSON `{ id, chunk }` envelope. For each appended batch:

1. Core calls `append(chunks)` before it forwards the chunks.
2. The adapter returns exactly one offset per chunk, in order.
3. Core rejects a missing, extra, or empty offset, and an offset that contains whitespace, CR, or LF.
4. A resume reads strictly after the given offset.

Core never makes an offset from an array index, and never writes one onto the `StreamChunk`.

### Resuming a run without duplicating what you already streamed

A producer that restarts in the middle of a run and replays part of its source must not append the overlap again. The client cannot protect you. A chunk appended again gets a new offset, so the client's offset de-duplication does not catch it. The stream processor then joins the text deltas and tool-call arguments, and the user sees duplicated text and `{"a":1}{"a":1}` arguments.

Use `snapshot()` plus a normal `append`. Read what the log already holds, compare it with your replay, skip the matching prefix, and append only the rest:

```ts
import { memoryStream } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

async function appendAfterStored(
  request: Request,
  replayed: Array<StreamChunk>,
) {
  const durability = memoryStream(request)
  const stored = await durability.snapshot()
  // `snapshot` returns at once, even while the log is open, so this works on a
  // log whose previous producer died without calling `close()`.
  const remainder = replayed.slice(stored.length)
  if (remainder.length > 0) await durability.append(remainder)
}
```

`@tanstack/ai-sandbox` does this for a replayed agent run. It compares by a fingerprint that ignores timestamps, not by count, and it throws if the replay and the log differ inside the prefix. See [The Run Journal](../sandbox/journal).

The log stays append-only with offsets from the adapter, so this also works on `durableStream`, the recommended production adapter, which has no `upsert`. Two limits of `durableStream.snapshot()`:

- It stops after an internal maximum number of windows, if the backend never reports that the reader caught up.
- It reads from `-1`, so it cannot return `[]` for a stream that the backend never created. That case is a failed call, not an empty run.

`upsert` stays an optional capability for adapters whose store can write at a key that the caller chooses. The resume path above does not use it, and most apps never need it. `memoryStream` has it. `durableStream` does not. To build your own, see [Re-persisting a stored range](./custom-adapter#re-persisting-a-stored-range).

### Cloudflare Durable Streams

[Durable Streams](https://durablestreams.com) has a backend for Cloudflare Workers plus Durable Objects that speaks this protocol. `durableStream` talks to it directly, with no new adapter.

When your TanStack AI endpoint also runs on Workers, connect to the backend through a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/), not a public URL. The adapter's `fetch` option sends each request through the binding. Traffic stays on the Cloudflare network, and the binding (not a bearer token) authorizes the call:

```ts
import { durableStream } from '@tanstack/ai-durable-stream'

interface Env {
  // A service binding to the deployed Durable Streams Worker.
  DURABLE_STREAMS: { fetch: typeof fetch }
}

function cloudflareAdapter(request: Request, env: Env) {
  // No `server` here: the binding routes by path, so the adapter uses an
  // internal placeholder base and only the `/streams/...` path matters.
  return durableStream(request, {
    streamPrefix: 'chat-runs',
    fetch: env.DURABLE_STREAMS.fetch.bind(env.DURABLE_STREAMS),
  })
}
```

If the backend runs somewhere else, set `server` to the public URL of the Worker:

```ts
import { durableStream } from '@tanstack/ai-durable-stream'

function urlAdapter(request: Request) {
  return durableStream(request, {
    server: 'https://durable-streams.example.workers.dev',
    streamPrefix: 'chat-runs',
  })
}
```

A Durable Object also gives you the lease and reaper from [Process death](#process-death). A DO alarm can terminalize a run whose producer died, so a reconnecting client sees a terminal state and does not wait forever.

### Process death

A process that has stopped cannot run cleanup code. So `finally` or `close()` alone cannot handle real process death. A production backend adds a lease and a reaper:

1. The producer gets or renews a lease while it writes.
2. A timer, an alarm, or a background worker finds expired leases.
3. The reaper records an aborted terminal state and closes the log.
4. Readers see that terminal state and do not wait forever.

This belongs to the durability service or the deployment, not to the response helper in the process.

A **sandboxed** run has its own mechanism. Its work continues inside the sandbox, not in the dead process, so a later request can adopt it. `sandboxRunDriver` claims the run, fences out the host that died, and continues to append to the same log. That is a takeover of a live producer, not the terminalization of a dead one, and it applies only to sandboxed runs. See [Takeover & Detached Runs](../sandbox/takeover). `memoryStream` cannot take part, because its log lives in the process of the producer, and nothing survives that process.

### Delivery is not state

The durability log replays chunks. It is not a source of truth that you can query for thread messages or history. It answers "what did this run stream?", not "what did this user say?". Keep the authoritative state in your own storage. See [Persistence](../persistence/overview) and [Client persistence](../persistence/client-persistence).
