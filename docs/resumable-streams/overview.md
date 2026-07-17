---
title: Resumable Streams
id: overview
description: "Reconnect to an in-flight AI response without re-running the model — durable, offset-addressed SSE delivery with replay, multi-tab join, and producer-death recovery."
keywords:
  - resumable streams
  - resume stream
  - reconnect sse
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

Resumable delivery is supported by `toServerSentEventsResponse`. NDJSON
helpers do not accept durability and do not resume.

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

Use a static `headers` object for fixed credentials or an async resolver for
rotating tokens. The resolver runs for every create, append, read, and close
request. This option belongs to the external URL adapter; a future direct
Cloudflare binding would use binding authorization instead.

The external service must return a non-empty `Stream-Next-Offset` header for
create, append, and close operations. Missing headers fail loudly. The adapter
never guesses an offset.

For development and tests, swap `durableStream(request, durableOptions)` for
`memoryStream(request)` from `@tanstack/ai` — no external service required,
at the cost of the log living only in that process's memory.

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
  return durableStream(request, {
    streamPrefix: 'chat-runs',
    // Any absolute URL parses; a service binding dispatches to the bound
    // Worker regardless of host, and only the `/streams/...` path is used.
    server: 'https://durable-streams',
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
values back to that adapter and writes them to SSE `id:` fields.

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
append or close fails, the failure is surfaced. This prevents a known error
from leaving readers parked on an apparently live log.

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
