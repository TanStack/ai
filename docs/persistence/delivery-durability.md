---
title: Delivery Durability
id: delivery-durability
---

**Delivery durability** is the transport-layer concern of letting a client
disconnect, reload, or open a second tab and still receive the full, ordered
run stream **exactly once**. It is distinct from **state durability** (thread
messages, run status, interrupts, artifacts — the middleware layer covered by
[Chat Persistence](./chat-persistence.md) and
[Generation Persistence](./generation-persistence.md)).

You get it by handing the transport helper a `durability` sink. The sink owns
**zero** application storage of its own — it appends the produced chunks to a
log and replays them on resume. Two backends ship:

- `memoryStream(request)` — a process-local log. Zero infrastructure; the right
  default for local dev and tests.
- `durableStream(request, { server })` — the
  [durable-streams](https://durablestreams.com) protocol, for production. The
  durable-streams server owns the bytes (its own WAL / group-commit); we store
  nothing.

## How resume works

`chat()` is lazy — calling it runs no provider request until the first
`for await`. The transport helper uses that:

- **Fresh request** — the helper iterates the stream, batches the chunks,
  `append`s each batch to the durability log, and forwards them as SSE, tagging
  every event with `id: <runId@seq>`.
- **Reconnect / second tab** — the helper reads the resume offset off the
  request (the browser's native `Last-Event-ID`, or a `?offset` query param),
  replays the log strictly after that offset, and **never iterates the input
  stream** — so `chat()` never calls the provider again. The untouched iterator
  is simply garbage-collected.

Because each SSE event carries an `id:`, native `EventSource` resends
`Last-Event-ID` on reconnect with zero application code. Joining an
already-running run passes `?offset=-1`.

## Server: wire a durability sink

Pass `durability` to any transport helper. In development, `memoryStream` needs
no setup:

```ts
import { chat, memoryStream, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: [{ role: 'user', content: 'Tell me about guitars.' }],
    stream: true,
  })

  return toServerSentEventsResponse(stream, {
    durability: { adapter: memoryStream(request) },
  })
}
```

For production, swap in `durableStream` — the only change is the sink:

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { durableStream } from '@tanstack/ai-durable-stream'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: [{ role: 'user', content: 'Tell me about guitars.' }],
    stream: true,
  })

  return toServerSentEventsResponse(stream, {
    durability: {
      adapter: durableStream(request, { server: process.env.DS_URL ?? '' }),
      // Optional: how many chunks to buffer per append (default 32).
      batch: 32,
    },
  })
}
```

The same `durability` option is available on `toHttpResponse` for
newline-delimited JSON transports (they resume via `?offset` rather than native
`Last-Event-ID`).

## Client: plain, resumable SSE

The client needs **no cursor machinery**. A plain `sse` connection is
resumable: when the server tags events with `id:` offsets, a dropped connection
reconnects with `Last-Event-ID` automatically and de-dupes any replayed prefix.

```ts
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

function Chat() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
  // ...render chat.messages
}
```

### Joining an in-flight or finished run

To attach a second tab (or re-attach after a full reload) to a run that is
already streaming, `joinRun(runId)` opens the stream from the start via
`?offset=-1`:

```ts ignore
import { fetchServerSentEvents } from '@tanstack/ai-client'

const connection = fetchServerSentEvents('/api/chat')

for await (const chunk of connection.joinRun(runId)) {
  // Same ordered event stream the original tab is receiving.
  if (chunk.type === 'TEXT_MESSAGE_CONTENT' && 'delta' in chunk) {
    appendDelta(chunk.delta)
  }
}
```

## Ceiling: producer lifetime (`waitUntil`)

Delivery durability replays what was **produced**. It cannot resume an LLM
completion that never finished producing: if the **producer process** dies
mid-run (e.g. a serverless function torn down the instant the client socket
closes), the log holds only the partial output and cannot continue it.

The fix is deployment, not code — run the producer in something that outlives
the client socket:

- a platform `waitUntil(...)` (Cloudflare Workers, Vercel) so the function keeps
  running after the response is returned,
- a durable object, or
- a background queue / worker.

With the producer kept alive, the log fills to completion and any reconnect or
second tab replays the whole run exactly once.

## Escape hatch: CDN fan-out

The shipped default keeps your app server in the connection path — it tails the
durability log and re-emits SSE. That is fine for hundreds to low-thousands of
concurrent readers.

For kernel-speed CDN fan-out, point the browser **directly** at the
durable-streams server (the app server only writes; the CDN collapses many
readers onto one origin read). That direct-to-DS wiring is an advanced,
documented pattern, not shipped API — reach for it only when the app-server
fan-out ceiling is the actual bottleneck.
