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

# Custom Durability Adapter

You have a store you want streams to survive on: Redis, Postgres, a queue,
Electric, an object store. By the end of this page you have a `StreamDurability`
adapter that plugs into `toServerSentEventsResponse` / `toHttpResponse`, so a
client can reconnect to an in-flight run without re-running the model.

Core never understands your store. It only round-trips opaque offset strings you
hand it. You implement five methods:

| Method | Job |
| --- | --- |
| `resumeFrom()` | Return the resume offset from this request, or `null` for a fresh run. |
| `append(chunks)` | Persist a batch before delivery; return one offset per chunk, in order. |
| `read(offset, signal)` | Replay chunks strictly after `offset`. |
| `close()` | Mark the run complete and wake any parked readers. |
| `snapshot()` | Return everything stored for this run right now, without waiting. |

## The rules that matter

Get these wrong and resume breaks in subtle ways:

- **Offsets are opaque, unique, and round-trip-safe.** Return a distinct offset
  per chunk. It travels on an SSE `id:` line or inside an NDJSON `{ id, chunk }`
  envelope, so it must survive that: core rejects an empty offset, one
  containing `NUL`/CR/LF, one with leading or trailing whitespace, or a
  duplicate.
- **`read` replays strictly *after* the offset**, oldest first, and ends when the
  log is **closed** — never when it sees a terminal chunk. This is the rule most
  likely to be "simplified" back, so here is the reason, quoted from the
  invariant `memoryStream`'s own `read` loop carries in
  `packages/ai/src/stream-durability.ts` (a test pins it):

  > A terminal chunk (`RUN_FINISHED` / `RUN_ERROR`) does NOT end the read: an
  > agent-loop run emits one per iteration (`finishReason` `"tool_calls"` then
  > `"stop"`), so stopping on the first would truncate a tool-calling run at its
  > first tool call. The producer signals true completion by calling `close()`
  > (it does so on every exit — see `StreamDurability.close`), which sets
  > `log.complete`. Read tails until then, or until the caller aborts.

  So an adapter that returns at the first terminal chunk truncates **every**
  resumed tool-calling run — the resumed client sees the first tool call and
  then a clean end, which it reads as "the run is over". `close()` is your only
  end-of-log signal, and core awaits it on every producer exit (completion,
  cancellation, and failure), so tailing until then always terminates.
- **`read` must never end the response empty while the run is still producing.**
  Park (wait for the next append) instead. A clean end with no new data tells
  the client the run is over; if it isn't, the client fails with
  `DurableStreamIncompleteError`. Honor the abort `signal` so a gone client
  stops the wait.
- You do not handle ordering or append-before-deliver. Core buffers, calls
  `append`, and only forwards a chunk once you return its offset.
- **`snapshot` never waits.** It resolves with whatever is stored right now, in
  append order, even while the run is still producing, and resolves to `[]`
  for a run with nothing stored. Unlike `read`, it does not park: a caller
  wants to see a previous host's prefix before resuming, not tail the log. Get
  this one wrong and resume hangs on exactly the logs that need it, because a
  producer that crashed never called `close()`, so its log stays open forever
  and a `read` over it never finishes. In particular, do not reuse the
  unknown-run failure path a from-start `read` join takes: `read('-1')` on an
  empty log may fail, `snapshot()` must resolve to `[]`. Rejecting on a
  transport, protocol, or authorization failure is still correct.

## Implement it

Write the adapter against your store's operations. Here it is over an
append-only per-run log you provide; swap `RunLog` for your backend:

```ts ignore
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
  // Everything stored so far, in append order. Must not wait for more.
  readAll: () => Promise<Array<{ cursor: string; chunk: StreamChunk }>>
}

export function customDurability(
  request: Request,
  openLog: (runId: string) => RunLog,
): StreamDurability {
  const url = new URL(request.url)
  // The resume offset: native SSE reconnect header first, then a join's ?offset.
  const resume =
    request.headers.get('Last-Event-ID') ?? url.searchParams.get('offset')
  // Your adapter owns run identity. Resolve it the way core's own
  // `resolveResumeRunId` does, and the way `durableStream` does too: the
  // X-Run-Id header first (a POST producer sends this), then the ?runId
  // query (a GET join sends this). Never mint a fresh id when neither is
  // present — a generated id addresses a log no attach request could ever
  // name, so the run would appear to work while writing where nobody reads.
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
      // '-1' / 'now' are the from-start / from-tail join sentinels.
      let cursor: string | null = offset === '-1' ? null : offset
      for (;;) {
        if (signal?.aborted) return
        const entries = await log.readAfter(cursor)
        for (const entry of entries) {
          cursor = entry.cursor
          // Yield terminal chunks like any other. An agent-loop run emits a
          // RUN_FINISHED per iteration, so returning on one would truncate a
          // resumed tool-calling run at its first tool call.
          yield { offset: entry.cursor, chunk: entry.chunk }
        }
        // The ONLY end-of-log condition: the producer called `close()`.
        if (await log.isComplete()) return
        // Park. Do NOT end the response here while the producer is alive.
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

## Re-persisting a stored range

Some stores can write at a key the caller chose. If yours can, you may expose
that as an extra capability so a caller replaying a range it already streamed can
land each chunk back on the entry it already occupies.

You do not need it to resume a run. The recommended way to restart mid-run is to
read the stored prefix with `snapshot()`, suppress it, and `append` only the
remainder, which keeps the log append-only and works on every adapter. See
[Resuming a run without duplicating what you already streamed](./advanced#resuming-a-run-without-duplicating-what-you-already-streamed).

The capability is a separate method, `upsert`. Implement it and your adapter is
an `UpsertableStreamDurability`; leave it out and it is a plain
`StreamDurability`. Absence is the honest signal: a consumer that needs the
capability asks for `UpsertableStreamDurability`, so a mismatch is a compile
error at the wiring site rather than a failure buried in a run log. Offer it
only if your store can write at a key the caller chose, such as a Postgres
`INSERT ... ON CONFLICT (cursor) DO UPDATE` or a Redis `XADD` with an explicit,
deduplicated ID. A store that stamps its own cursor on every write cannot, so it
just does not expose `upsert`, which is the choice `durableStream` makes.
`memoryStream` does expose it.

Each entry pairs a chunk with the offset it belongs at, so nothing has to be
lined up by position. Validate the entire batch before touching stored state, so
a rejected call never leaves part of it applied:

- reject an offset you did not mint yourself, because every offset you minted is
  resumable by definition;
- reject an offset that repeats inside one batch;
- require a not-yet-stored offset to sit after the current tail. A caller
  replaying an overlap therefore has to replay a contiguous suffix, and cannot
  write into a position it skipped earlier.

```ts
import type { StreamChunk, UpsertableStreamDurability } from '@tanstack/ai'

// Your backend, plus the one operation `upsert` needs beyond `append`: a write
// at a cursor you supply that replaces whatever is already stored there.
interface UpsertableRunLog {
  tailSeq: () => Promise<number>
  hasOffset: (offset: string) => Promise<boolean>
  write: (
    entries: Array<{ chunk: StreamChunk; offset: string }>,
  ) => Promise<Array<string>>
}

// Offsets here are `${runId}:${seq}`. Yours can be any format you can decode
// back into a run id and a position.
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
// rejected promise rather than a synchronous throw.
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
    // Every entry passed, so the write below cannot reject partway and leave a
    // prefix of the batch applied.
    return log.write(entries)
  }
}
```

Hand that to the adapter as `upsert: makeUpsert(log, runId)` alongside the five
methods above, and annotate the result `UpsertableStreamDurability` so the extra
capability shows up in the type.

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
parked readers, so a caught-up reader stops rather than hanging — it is the only
thing that ends a `read`, since the terminal chunk it appended does not (see
[the rules](#the-rules-that-matter)). If your backend
producer can die without running `close()` (process crash), add a lease/reaper
that terminalizes abandoned logs. See [Process death](./advanced#process-death).
