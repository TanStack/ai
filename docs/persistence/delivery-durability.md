---
title: Delivery Durability
id: delivery-durability
---

# Delivery Durability

Delivery durability records an ordered SSE stream so a dropped connection can
replay chunks without invoking the provider again. It is separate from state
persistence for messages, runs, interrupts, metadata, and artifacts.

Interrupt submission has a second exact-replay rule. The persistence store
canonicalizes the complete resolution set into an idempotency fingerprint and
commits it with the continuation run ID. Repeating that exact set returns the
same winning continuation; it never executes approved tools twice. A different
set or stale generation is a conflict and returns authoritative recovery state.

Two adapters ship:

- `memoryStream(request)` stores a process-local log for development and tests.
- `durableStream(request, options)` writes to an external Durable Streams
  protocol URL.

Delivery durability is supported by `toServerSentEventsResponse`. NDJSON
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
  'messages' | 'threadId' | 'runId' | 'resume'
>

async function respond(request: Request, input: ChatInput) {
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: input.messages,
    threadId: input.threadId,
    runId: input.runId,
    ...(input.resume ? { resume: input.resume } : {}),
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
create and append operations. Missing headers fail loudly. The adapter never
guesses an offset.

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
  if ('type' in chunk) {
    console.log(chunk.type)
  }
}
```

`joinRun` performs a GET with `offset=-1` and `runId`. The endpoint must accept
that GET, as shown above.

For interrupt recovery, configure this winning-run loader explicitly with
`createInterruptContinuationLoader`. TanStack AI never guesses a continuation
or recovery route from the chat URL. See [Interrupts](../chat/interrupts) for
the client setup.

## Accepted tombstones and exact replay

After a native batch is accepted, the browser first persists a V2
`phase: 'accepted'` tombstone containing the winning continuation ID and no
drafts, then attempts to remove the resume record. If removal fails, reload does
not show stale pending UI. Authoritative committed recovery confirms the winner
and retries cleanup.

The layers cooperate without sharing identifiers:

1. Interrupt persistence compares the generation, exact ID set, and canonical
   resolution fingerprint.
2. A first valid submission atomically stores the resolutions and winning
   continuation receipt.
3. An exact retry returns `replayed` with that continuation ID.
4. The client joins the winning run through SSE durability or an explicit
   continuation loader.
5. SSE delivery resumes from the adapter-owned opaque offset and de-duplicates
   the replayed prefix.

The fingerprint is not an SSE offset. The accepted tombstone is not the
authoritative server commit. Keep both state persistence and delivery
durability when the workflow must survive request retries and connection loss.

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

## State is still separate

Delivery logs replay chunks. They are not the queryable source of truth for
thread messages, pending interrupts, generation artifacts, or retention
policies. Add [Chat Persistence](./chat-persistence) or
[Generation Persistence](./generation-persistence) for that state.

For atomic interrupt store requirements and conflict receipts, see
[Custom stores](./custom-stores). For the legacy-to-native transition, see
[Migrate to AG-UI interrupts](../migration/interrupts).
