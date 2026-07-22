---
title: Custom Durability Adapter
id: custom-adapter
description: "Back resumable streams with your own store (Redis, Postgres, a queue) by implementing the four-method StreamDurability contract."
keywords:
  - custom durability adapter
  - StreamDurability
  - resumable streams
  - redis durable stream
  - postgres durable stream
  - delivery durability
---

# Custom Durability Adapter

You have a store you want streams to survive on: Redis, Postgres, a queue,
Electric, an object store. By the end of this page you have a `StreamDurability`
adapter that plugs into `toServerSentEventsResponse` / `toHttpResponse`, so a
client can reconnect to an in-flight run without re-running the model.

Core never understands your store. It only round-trips opaque offset strings you
hand it. You implement four methods:

| Method | Job |
| --- | --- |
| `resumeFrom()` | Return the resume offset from this request, or `null` for a fresh run. |
| `append(chunks)` | Persist a batch before delivery; return one offset per chunk, in order. |
| `read(offset, signal)` | Replay chunks strictly after `offset`. |
| `close()` | Mark the run complete and wake any parked readers. |

## The rules that matter

Get these wrong and resume breaks in subtle ways:

- **Offsets are opaque, unique, and round-trip-safe.** Return a distinct offset
  per chunk. It travels on an SSE `id:` line or inside an NDJSON `{ id, chunk }`
  envelope, so it must survive that: core rejects an empty offset, one
  containing `NUL`/CR/LF, one with leading or trailing whitespace, or a
  duplicate.
- **`read` replays strictly *after* the offset**, oldest first, and stops at the
  first `RUN_FINISHED` / `RUN_ERROR`.
- **`read` must never end the response empty while the run is still producing.**
  Park (wait for the next append) instead. A clean end with no new data tells
  the client the run is over; if it isn't, the client fails with
  `DurableStreamIncompleteError`. Honor the abort `signal` so a gone client
  stops the wait.
- You do not handle ordering or append-before-deliver. Core buffers, calls
  `append`, and only forwards a chunk once you return its offset.

## Implement it

Write the adapter against your store's operations. Here it is over an
append-only per-run log you provide; swap `RunLog` for your backend:

```ts ignore
import { EventType } from '@tanstack/ai'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

// Your backend, one append-only log per run. Back it with Redis Streams, a
// Postgres table, a queue. Anything that returns a stable cursor per entry.
interface RunLog {
  append: (chunks: Array<StreamChunk>) => Promise<Array<string>>
  readAfter: (
    cursor: string | null,
  ) => Promise<Array<{ cursor: string; chunk: StreamChunk }>>
  isComplete: () => Promise<boolean>
  waitForChange: (signal?: AbortSignal) => Promise<void>
  markComplete: () => Promise<void>
}

function isTerminal(chunk: StreamChunk): boolean {
  return chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR
}

export function customDurability(
  request: Request,
  openLog: (runId: string) => RunLog,
): StreamDurability {
  const url = new URL(request.url)
  // The resume offset: native SSE reconnect header first, then a join's ?offset.
  const resume =
    request.headers.get('Last-Event-ID') ?? url.searchParams.get('offset')
  // Your adapter owns run identity. A real backend decodes the runId from the
  // resume offset; this example takes the client's chosen id from the
  // X-Run-Id header (a POST producer) or the ?runId query (a GET join), and
  // otherwise mints a fresh one.
  const runId =
    request.headers.get('X-Run-Id') ??
    url.searchParams.get('runId') ??
    crypto.randomUUID()
  const log = openLog(runId)

  return {
    resumeFrom: () => resume,
    append: (chunks) => log.append(chunks),
    close: () => log.markComplete(),
    read: async function* (offset, signal) {
      // '-1' / 'now' are the from-start / from-tail join sentinels.
      let cursor: string | null = offset === '-1' ? null : offset
      for (;;) {
        if (signal?.aborted) return
        const entries = await log.readAfter(cursor)
        for (const entry of entries) {
          cursor = entry.cursor
          yield { offset: entry.cursor, chunk: entry.chunk }
          if (isTerminal(entry.chunk)) return
        }
        if (await log.isComplete()) return
        // Park. Do NOT end the response here while the producer is alive.
        await log.waitForChange(signal)
      }
    },
  }
}
```

Wire it up exactly like the built-in adapters:

```ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
// Your modules: the adapter above, and your backend's per-run log factory.
import { customDurability } from './durability'
import { openRunLog } from './run-log'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const stream = chat({ adapter: openaiText('gpt-5.5'), messages, threadId, runId })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: customDurability(request, openRunLog) },
  })
}
```

For NDJSON, swap `toServerSentEventsResponse` for `toHttpResponse`. The adapter
is identical; only the wire encoding changes.

## Type your offsets (optional)

`StreamDurability<TOffset>` is generic over the offset string. Brand it so a
raw string can't be passed where one of your offsets is expected:

```ts
import type { StreamDurability } from '@tanstack/ai'

type MyOffset = string & { readonly __brand: 'MyOffset' }

// Your adapter is then StreamDurability<MyOffset>; append/read/resumeFrom all
// speak MyOffset, and a plain string won't type-check where one is expected.
type MyAdapter = StreamDurability<MyOffset>
```

Core still treats the value as opaque; the brand only tightens your own code.

## Terminalization is on you

Core awaits `close()` on every producer exit (normal completion, cancellation,
and failure) and appends a terminal `RUN_ERROR` on cancel/failure before
closing. Your `close()` must make `read`'s `isComplete()` return `true` and wake
parked readers, so a caught-up reader stops rather than hanging. If your backend
producer can die without running `close()` (process crash), add a lease/reaper
that terminalizes abandoned logs. See [Process death](./advanced#process-death).
