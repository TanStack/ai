---
title: Custom Durability Adapter
id: custom-adapter
description: "Implement StreamDurability (five methods) over Redis, Postgres, or any ordered log."
keywords:
  - custom durability adapter
  - StreamDurability
  - resumable streams
  - redis durable stream
  - postgres durable stream
  - delivery durability
---

# Custom Durability Adapter

If you need resumable streams on your own store → implement `StreamDurability` and pass it as `durability.adapter`.

Core only round-trips opaque offsets. Five methods:

| Method | Job |
| --- | --- |
| `resumeFrom()` | Offset from this request, or `null` for a fresh run |
| `append(chunks)` | Persist batch before delivery; one offset per chunk, in order |
| `read(offset, signal)` | Replay chunks **strictly after** offset |
| `close()` | Mark complete; wake parked readers |
| `snapshot()` | Everything stored now, no wait |

## Rules that break resume

1. **Offsets** — unique, non-empty, no `NUL`/CR/LF, no leading/trailing whitespace (wire: SSE `id:` or NDJSON `{ id, chunk }`).
2. **`read` ends only on `close()`** — never on first terminal chunk. Agent loops emit `RUN_FINISHED` per iteration (`tool_calls` then `stop`); stopping early truncates tool runs. Core awaits `close()` on every producer exit.
3. **Park while producing** — empty clean end while the run is live → client `DurableStreamIncompleteError`. Honor abort `signal`.
4. **`snapshot` never waits** — return current append order, or `[]` for empty/unknown; do not share `read('-1')` failure path. Hang here breaks resume after crashed producers (log stays open forever).

Core buffers, calls `append`, then delivers once offsets return.

## Implement

```ts ignore
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

interface RunLog {
  append: (chunks: Array<StreamChunk>) => Promise<Array<string>>
  readAfter: (
    cursor: string | null,
  ) => Promise<Array<{ cursor: string; chunk: StreamChunk }>>
  isComplete: () => Promise<boolean>
  waitForChange: (signal?: AbortSignal) => Promise<void>
  markComplete: () => Promise<void>
  readAll: () => Promise<Array<{ cursor: string; chunk: StreamChunk }>>
}

export function customDurability(
  request: Request,
  openLog: (runId: string) => RunLog,
): StreamDurability {
  const url = new URL(request.url)
  const resume =
    request.headers.get('Last-Event-ID') ?? url.searchParams.get('offset')
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
      let cursor: string | null = offset === '-1' ? null : offset
      for (;;) {
        if (signal?.aborted) return
        const entries = await log.readAfter(cursor)
        for (const entry of entries) {
          cursor = entry.cursor
          yield { offset: entry.cursor, chunk: entry.chunk }
        }
        if (await log.isComplete()) return
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

Wire:

```ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
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

NDJSON: same adapter, `toHttpResponse`.

## Optional `upsert`

Not required for resume. Prefer [snapshot + append remainder](./advanced#resuming-without-duplicating). Expose `upsert` only if your store can write at a caller-chosen key (`INSERT … ON CONFLICT`, explicit Redis IDs). Type as `UpsertableStreamDurability`.

Validate the whole batch before mutating:

- reject offsets you did not mint
- reject duplicates inside one batch
- new offsets must sit after current tail (contiguous suffix only)

```ts
import type { StreamChunk, UpsertableStreamDurability } from '@tanstack/ai'

interface UpsertableRunLog {
  tailSeq: () => Promise<number>
  hasOffset: (offset: string) => Promise<boolean>
  write: (
    entries: Array<{ chunk: StreamChunk; offset: string }>,
  ) => Promise<Array<string>>
}

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
    return log.write(entries)
  }
}
```

## Brand offsets (optional)

```ts
import type { StreamDurability } from '@tanstack/ai'

type MyOffset = string & { readonly __brand: 'MyOffset' }
type MyAdapter = StreamDurability<MyOffset>
```

## Terminalization

Your `close()` must make `isComplete()` true and wake waiters — only end-of-`read` signal. Process crash without `close()` needs a lease/reaper — [Process death](./advanced#process-death).
