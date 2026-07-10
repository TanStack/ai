---
title: Persistence Internals
id: internals
---

# Persistence Internals

This page describes the contracts between middleware, state stores, browser
storage, and SSE delivery durability.

## Three separate boundaries

```text
Application state        Browser hydration       Stream delivery
-----------------        -----------------       ---------------
AIPersistence stores     ChatStorageAdapter      StreamDurability
middleware lifecycle     UIMessage/snapshot      SSE id/replay
server authoritative     client convenience      transport concern
```

These boundaries intentionally do not share delivery offsets. State middleware never
mutates chunks to add offsets. The SSE adapter returns opaque offset strings to
the response layer, which writes them as `id:` lines. Browser chat persistence
stores rendered messages or interrupt resume snapshots, not server event logs.

## Chat middleware lifecycle

`withChatPersistence(persistence)` derives a plan from store presence:

1. `setup` provides persistence, interrupt, and lock capabilities when their
   stores exist.
2. `onConfig` creates or resumes the run, loads pending interrupts, validates
   resume entries, resolves or cancels them, then merges stored messages into
   the request.
3. `onChunk` reacts only to a `RUN_FINISHED` interrupt outcome by storing
   interrupts, marking the run interrupted, and saving messages.
4. `onFinish`, `onError`, and `onAbort` terminalize the run record.

The canonical AG-UI chunk stream remains unchanged; persistence does not create
a second event stream.

## Generation middleware lifecycle

`withGenerationPersistence(persistence, options?)` records the run and, when
both `artifacts` and `blobs` exist, extracts durable media:

1. Blob bytes are written under a stable blob key.
2. `ArtifactRecord` metadata is written separately.
3. A lightweight `PersistedArtifactRef` is attached to the generation result.

`ArtifactRecord` does not contain bytes. This keeps searchable metadata
separate from potentially large binary bodies.

## Composition semantics

```ts
import {
  composePersistence,
  memoryPersistence,
} from '@tanstack/ai-persistence'

const base = memoryPersistence()
const replacement = base.stores.messages

const result = composePersistence(base, {
  overrides: {
    messages: replacement,
    metadata: undefined,
    locks: false,
  },
})
```

- `messages` is replaced.
- `metadata` is inherited because the override is `undefined`.
- `locks` is removed.
- every omitted store is inherited.

Composition copies the store map and does not mutate or dispose either input.
The return type calculates which keys are required, optional, replaced, or
removed. Unknown store keys are rejected statically and by runtime validation.

Middleware adds capability validation:

- chat rejects `interrupts` without `runs`;
- generation rejects an unpaired `artifacts` or `blobs` store.

The runtime checks are required because JavaScript, configuration loading, and
explicitly widened types can bypass static guarantees.

## Delivery durability contract

```ts
import type { StreamChunk } from '@tanstack/ai'

interface StreamDurability<TOffset extends string = string> {
  resumeFrom(): TOffset | null
  append(chunks: Array<StreamChunk>): Promise<Array<TOffset>>
  read(
    offset: TOffset,
    signal?: AbortSignal,
  ): AsyncIterable<{ offset: TOffset; chunk: StreamChunk }>
  close(): Promise<void>
}
```

The adapter owns `TOffset`. Core treats it as an opaque string and validates
only that it is non-empty and contains no CR/LF before writing an SSE id.

For a fresh producer, core appends each batch before forwarding it. `append`
must return exactly one offset per chunk in the same order. Missing or extra
offsets fail the stream; core never invents a fallback offset.

For a resume request, core reads strictly after `resumeFrom()` and never starts
the provider iterator. Delivery durability is supported by the SSE response
path, not the NDJSON response path.

## Terminalization

On normal completion, caught provider/server errors, and user cancellation,
the producer awaits `close()`. A caught error or cancellation also attempts to
append a terminal `RUN_ERROR`; cancellation uses an abort-shaped error payload.
Failures while flushing, appending the terminal event, or closing are surfaced
rather than silently discarded.

A process that has already died cannot run `finally`. Backends that must
recover from literal process death need an external lease, timeout, alarm, or
reaper that marks abandoned streams terminal. This mechanism is outside the
core response helper.

## Backend ownership

Packaged backends own resources differently:

- Drizzle accepts a migrated SQLite-family database; its root import is
  edge-safe. The `/sqlite` entry creates a Node SQLite connection.
- Prisma accepts the application's generated and migrated client.
- Cloudflare maps D1 to structured stores, R2 to artifacts/blobs, and Durable
  Objects to locks.

`composePersistence` does not add distributed transactions. When related
stores use different systems, adapter authors must define retry,
idempotency, and consistency behavior.

## Browser storage

`ChatStorageAdapter<T>` allows synchronous or asynchronous `getItem`,
`setItem`, and `removeItem`. The chat persistence controller orders writes and
owns hydration/cleanup independently of the main `ChatClient` stream logic.

Web Storage adapters serialize strings and require a codec for non-JSON values.
IndexedDB uses structured clone. All three built-ins throw
`StorageUnavailableError` when their browser API is unavailable, including
SSR.
