---
title: Persistence Internals
id: internals
---

# Persistence Internals

This page describes the server-side contracts between the persistence
middleware and the state stores.

## Separate boundaries

Server state persistence is one of three boundaries that intentionally share no
code:

- **Server state** (this page): `AIPersistence` stores driven by the middleware
  lifecycle, the authoritative record.
- **Client hydration**: the browser restores a rendered conversation, a separate
  concern covered in [Client persistence](./client-persistence).
- **Stream delivery**: replaying an in-flight SSE response,
  [Resumable Streams](../resumable-streams/overview).

State middleware never mutates chunks to add delivery offsets, and it stores
server event state, not the client's rendered messages.

## Chat middleware lifecycle

`withPersistence(persistence)` derives a plan from store presence:

1. `setup` provides persistence, interrupt, and lock capabilities when their
   stores exist.
2. `onConfig` creates or resumes the run, loads pending interrupts, and
   validates the request's resume batch against them, then merges stored
   messages into the request when the request carries no history.
3. `onChunk` reacts only to a `RUN_FINISHED` interrupt outcome by committing
   the accepted resumes, storing the new interrupts, marking the run
   interrupted, and saving messages.
4. `onFinish` and `onError` terminalize the run record. So does `onAbort`, with
   one exception: on a run another middleware has declared detachable, a plain
   disconnect (no cancel recorded in either band) writes nothing and leaves the
   record `'running'` for a later takeover. See
   [Takeover & Detached Runs](../sandbox/takeover#detach-vs-cancel).

Accepted resumes are committed (interrupts marked resolved/cancelled) only once
the run reaches a successful boundary, so a provider failure or abort between
accepting a resume and reaching that boundary leaves the interrupt pending and a
retry with the same resume succeeds. The canonical AG-UI chunk stream remains
unchanged; persistence does not create a second event stream.

When a request carries a non-empty `messages` array it is treated as the full
authoritative history and, on finish, overwrites the stored thread. To continue
a stored thread without resending history, pass an empty `messages` array — the
stored transcript is loaded and used.

## Generation middleware lifecycle

`withGenerationPersistence(persistence)` records the run: `onStart` creates or
resumes the run record, and `onFinish`, `onError`, and `onAbort` terminalize
it. Durable media storage (artifact metadata plus blob bytes) is a follow-up
feature.

**Do not treat this as the long-term generation model.** Today it reuses chat
`RunStore` and dual-keys `(runId, threadId)` both to `requestId`. That is a
stopgap: **generation jobs must not fake `threadId = requestId`.** `threadId`
is the shared conversation key (`Scope.threadId`); a generation job's primary
id is `requestId` / `jobId`. The follow-up should introduce a dedicated
generation job store (and later artifact store), not chat `RunStore` /
`MessageStore`.

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
    interrupts: false,
  },
})
```

- `messages` is replaced.
- `metadata` is inherited because the override is `undefined`.
- `interrupts` is removed.
- every omitted store is inherited.

Composition copies the store map and does not mutate or dispose either input.
The return type calculates which keys are required, optional, replaced, or
removed. Unknown store keys are rejected statically and by runtime validation.

Middleware adds entrypoint validation:

- chat requires `messages`; rejects `interrupts` without `runs`.
- generation requires `runs`.
- `reconstructChat` requires `messages`.

The runtime checks are required because JavaScript, configuration loading, and
explicitly widened types can bypass static guarantees.

## Backend ownership

An adapter owns its own resources: connection lifecycle, when migrations run, and
how each store record maps to rows. The middleware only calls the store methods;
it never opens a connection or inspects a table. A backend may provide any subset
of the stores (for example, no `metadata`), and the return type reflects exactly the
stores it exposes. [Build your own adapter](./build-your-own-adapter) shows this
end to end for SQLite.

`composePersistence` does not add distributed transactions. When related
stores use different systems, adapter authors must define retry,
idempotency, and consistency behavior.

Two `RunStore` details bind an adapter author beyond the obvious mapping, and
both exist for durable runs. `update` must round-trip `driverEpoch` — the fencing
token a takeover bumps, and the only way a superseded host can discover it lost
the run — and it must distinguish an **omitted** patch key (leave the column
alone) from a key carrying `undefined` (clear the column). The takeover path
clears `detachedSince` exactly that way. See
[Build your own adapter](./build-your-own-adapter) and
[Takeover & Detached Runs](../sandbox/takeover#requirements).
