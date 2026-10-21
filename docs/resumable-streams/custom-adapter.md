---
title: Custom Durability Adapter
id: custom-adapter
description: "Back resumable streams with your own store (Redis, Postgres, a queue) by implementing the five-method StreamDurability contract."
keywords:
  - custom durability adapter
  - StreamDurability
  - resumable streams
  - redis durable stream
  - postgres durable stream
  - delivery durability
---

You want streams to survive on a store that you already run: Redis, Postgres, a queue, Electric, an object store. Write a `StreamDurability` adapter for it. The adapter plugs into `toServerSentEventsResponse` or `toHttpResponse`, and a client can then reconnect to an in-flight run without running the model again.

> [!NOTE]
> On Upstash Redis, a third-party adapter is available: `upstashStream()` from `@upstash/agentkit-tanstack-ai`. See [Upstash](../community-adapters/upstash#resumable-streams).

## Build the adapter

1. Implement the five methods over your store. Core never reads your store. It only passes back the offset strings that you give it.

| Method | Job |
| --- | --- |
| `resumeFrom()` | Return the resume offset of this request, or `null` for a fresh run. |
| `append(chunks)` | Store a batch before delivery. Return one offset per chunk, in order. |
| `read(offset, signal)` | Replay chunks strictly after `offset`. |
| `close()` | Mark the run complete and wake any waiting readers. |
| `snapshot()` | Return everything stored for this run now, without waiting. |

Here the adapter wraps an append-only log per run. Replace `RunLog` with your backend:

```ts ignore
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

// Your backend, one append-only log per run. Use Redis Streams, a Postgres
// table, or a queue: anything that returns a stable cursor per entry.
interface RunLog {
  append: (chunks: Array<StreamChunk>) => Promise<Array<string>>
  readAfter: (
    cursor: string | null,
  ) => Promise<Array<{ cursor: string; chunk: StreamChunk }>>
  isComplete: () => Promise<boolean>
  waitForChange: (signal?: AbortSignal) => Promise<void>
  markComplete: () => Promise<void>
  // Everything stored so far, in append order. Must not wait for more.
  readAll: () => Promise<Array<{ cursor: string; chunk: StreamChunk }>>
}

export function customDurability(
  request: Request,
  openLog: (runId: string) => RunLog,
): StreamDurability {
  const url = new URL(request.url)
  // The resume offset: the SSE reconnect header first, then a join's ?offset.
  const resume =
    request.headers.get('Last-Event-ID') ?? url.searchParams.get('offset')
  // Your adapter owns run identity. Use the same order as core's
  // `resolveResumeRunId` and `durableStream`: the X-Run-Id header first (a
  // POST producer sends it), then the ?runId query (a GET join sends it).
  // Never make up a new id when both are missing. No attach request can
  // name that log, so the run writes where nobody reads.
  const runId =
    request.headers.get('X-Run-Id') ?? url.searchParams.get('runId')
  if (runId === null) {
    throw new Error(
      'a runId is required: send it as an X-Run-Id header or a ?runId query param',
    )
  }
  const log = openLog(runId)

  return {
    resumeFrom: () => resume,
    append: (chunks) => log.append(chunks),
    close: () => log.markComplete(),
    read: async function* (offset, signal) {
      // '-1' and 'now' are the from-start and from-tail join values.
      let cursor: string | null = offset === '-1' ? null : offset
      for (;;) {
        if (signal?.aborted) return
        const entries = await log.readAfter(cursor)
        for (const entry of entries) {
          cursor = entry.cursor
          // Yield terminal chunks like any other. An agent-loop run emits a
          // RUN_FINISHED per iteration, so a return here cuts a resumed
          // tool-calling run at its first tool call.
          yield { offset: entry.cursor, chunk: entry.chunk }
        }
        // The ONLY end-of-log condition: the producer called `close()`.
        if (await log.isComplete()) return
        // Wait. Do NOT end the response here while the producer is alive.
        await log.waitForChange(signal)
      }
    },
    snapshot: async () => {
      const entries = await log.readAll()
      return entries.map((entry) => ({
        offset: entry.cursor,
        chunk: entry.chunk,
      }))
    },
  }
}
```

2. Pass the adapter to the response, the same way as a built-in adapter:

```ts
import {
  chat,
  chatParamsFromRequest,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
// Your modules: the adapter above, and the per-run log factory of your backend.
import { customDurability } from './durability'
import { openRunLog } from './run-log'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const stream = chat({ adapter: openaiText('gpt-6.1-sol'), messages, threadId, runId })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: customDurability(request, openRunLog) },
  })
}

export async function GET(request: Request) {
  // Replays the run from your log. No model call happens here.
  return resumeServerSentEventsResponse({
    adapter: customDurability(request, openRunLog),
  })
}
```

3. Start a reply, then reload the page. The client reconnects and the reply finishes from your store.

For NDJSON, use `toHttpResponse` and `resumeHttpResponse`. The adapter is the same. Only the wire encoding changes.

## How it works

Core buffers the chunks, calls `append`, and sends a chunk only after you return its offset. You do not handle ordering or the append-before-send rule. On a reconnect, core calls `resumeFrom()` and then `read` from that offset. On every producer exit, core awaits `close()`.

## The rules that matter

Break one of these and resume fails in ways that are hard to see:

- **Offsets are opaque, unique, and safe to send back.** Return a different offset for each chunk. An offset travels on an SSE `id:` line or inside an NDJSON `{ id, chunk }` envelope. Core rejects an empty offset, an offset with `NUL`, CR, or LF, an offset with leading or trailing whitespace, and a duplicate.
- **`read` replays strictly after the offset**, oldest first.
- **`read` ends only when the log is closed**, never when it sees a terminal chunk. See the next section for the reason.
- **`read` must never end the response empty while the run still produces.** Wait for the next append. A clean end with no new data tells the client that the run is over. If the run is not over, the client fails with `DurableStreamIncompleteError`. Obey the abort `signal`, so a client that left stops the wait.
- **`snapshot` never waits.** It returns what is stored now, in append order, even while the run still produces. It returns `[]` for a run with nothing stored.

### Why `read` ignores terminal chunks

The `read` loop of `memoryStream` in `packages/ai/src/stream-durability.ts` follows this rule, and a test pins it:

- A terminal chunk (`RUN_FINISHED` or `RUN_ERROR`) does not end the read.
- An agent-loop run emits one terminal per iteration (`finishReason` `"tool_calls"`, then `"stop"`). A read that stops on the first one cuts a tool-calling run at its first tool call.
- The producer signals the real end by calling `close()` on every exit. That sets `log.complete`.
- The read follows the log until then, or until the caller aborts.

An adapter that returns at the first terminal chunk cuts **every** resumed tool-calling run. The resumed client sees the first tool call and then a clean end, which it reads as "the run is over". `close()` is your only end-of-log signal. Core awaits it on every producer exit (completion, cancellation, and failure), so a read that waits for it always ends.

### Why `snapshot` must not wait

A caller uses `snapshot` to see the prefix that a previous host stored before it resumes. It does not want to follow the log. A producer that crashed never called `close()`, so its log stays open forever, and a `read` over it never ends. If `snapshot` waits, resume hangs on exactly the logs that need it.

Do not reuse the unknown-run failure of a from-start `read`. `read('-1')` on an empty log can fail. `snapshot()` must return `[]`. A rejection for a transport, protocol, or authorization failure is still correct.

## Advanced

### Re-persisting a stored range

Some stores can write at a key that the caller chooses. If yours can, you can expose that as an extra capability. A caller that replays a range it already streamed can then put each chunk back on the entry it already has.

You do not need this to resume a run. To restart in the middle of a run, read the stored prefix with `snapshot()`, skip it, and `append` only the rest. That keeps the log append-only and works on every adapter. See [Resuming a run without duplicating what you already streamed](./advanced#resuming-a-run-without-duplicating-what-you-already-streamed).

The capability is a separate method, `upsert`:

- Implement it, and your adapter is an `UpsertableStreamDurability`.
- Leave it out, and your adapter is a plain `StreamDurability`.

A consumer that needs the capability asks for `UpsertableStreamDurability`. A mismatch is then a compile error where you wire it, not a failure in a run log.

Offer `upsert` only if your store can write at a key that the caller chose. Examples are a Postgres `INSERT ... ON CONFLICT (cursor) DO UPDATE`, or a Redis `XADD` with an explicit, de-duplicated ID. A store that sets its own cursor on each write cannot. It does not expose `upsert`. `durableStream` is such a store. `memoryStream` does expose `upsert`.

Each entry pairs a chunk with its offset, so nothing is matched by position. Validate the whole batch before you change stored state, so a rejected call never applies part of the batch. Reject:

- an offset that you did not make yourself (every offset you made is resumable by definition),
- an offset that repeats inside one batch,
- an offset that is not stored yet and is not after the current tail. A caller that replays an overlap must replay a continuous suffix. It cannot write into a position it skipped.

```ts
import type { StreamChunk, UpsertableStreamDurability } from '@tanstack/ai'

// Your backend, plus the one operation `upsert` needs beyond `append`: a write
// at a cursor you supply that replaces what is already stored there.
interface UpsertableRunLog {
  tailSeq: () => Promise<number>
  hasOffset: (offset: string) => Promise<boolean>
  write: (
    entries: Array<{ chunk: StreamChunk; offset: string }>,
  ) => Promise<Array<string>>
}

// Offsets here are `${runId}:${seq}`. Yours can use any format that you can
// decode back into a run id and a position.
function decodeSeq(runId: string, offset: string, index: number): number {
  const prefix = `${runId}:`
  const seq = offset.startsWith(prefix)
    ? Number(offset.slice(prefix.length))
    : Number.NaN
  if (!Number.isSafeInteger(seq) || seq < 1) {
    throw new Error(
      `entries[${index}].offset ${JSON.stringify(offset)} was not minted by this run`,
    )
  }
  return seq
}

// The returned function is `async`, so every rejection reaches the caller as a
// rejected promise, not a synchronous throw.
export function makeUpsert(
  log: UpsertableRunLog,
  runId: string,
): UpsertableStreamDurability['upsert'] {
  return async (entries) => {
    let tail = await log.tailSeq()
    const seen = new Set<string>()
    for (const [index, entry] of entries.entries()) {
      const seq = decodeSeq(runId, entry.offset, index)
      if (seen.has(entry.offset)) {
        throw new Error(
          `entries[${index}].offset ${JSON.stringify(entry.offset)} is repeated in this batch`,
        )
      }
      seen.add(entry.offset)
      if (await log.hasOffset(entry.offset)) continue
      if (seq <= tail) {
        throw new Error(
          `entries[${index}].offset ${JSON.stringify(entry.offset)} is not stored yet but claims position ${seq}, at or before the tail ${tail}`,
        )
      }
      tail = seq
    }
    // Every entry passed, so the write below cannot fail partway and leave a
    // prefix of the batch applied.
    return log.write(entries)
  }
}
```

Give that to the adapter as `upsert: makeUpsert(log, runId)` next to the five methods. Then type the result as `UpsertableStreamDurability`, so the extra capability shows in the type.

### Type your offsets

`StreamDurability<TOffset>` is generic over the offset string. Brand it, so a plain string cannot go where one of your offsets is expected:

```ts
import type { StreamDurability } from '@tanstack/ai'

type MyOffset = string & { readonly __brand: 'MyOffset' }

// append, read, and resumeFrom all use MyOffset. A plain string does not
// type-check where a MyOffset is expected.
type MyAdapter = StreamDurability<MyOffset>
```

Core still treats the value as opaque. The brand only makes your own code stricter.

### Terminalization is on you

Core awaits `close()` on every producer exit: normal completion, cancellation, and failure. On cancellation and failure, it appends a terminal `RUN_ERROR` before the close.

Your `close()` must make `isComplete()` return `true` and wake waiting readers, so a reader that caught up stops and does not hang. It is the only thing that ends a `read`, because the terminal chunk does not (see [the rules](#the-rules-that-matter)).

If your producer can die without calling `close()` (a process crash), add a lease and a reaper that terminalize abandoned logs. See [Process death](./advanced#process-death).
