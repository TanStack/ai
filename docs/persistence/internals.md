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
4. `onFinish`, `onError`, and `onAbort` terminalize the run record.

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

`withGenerationPersistence(persistence, { threadId })` records the job across
three points:

- `onStart` creates or resumes the run record.
- `onFinish` / `onError` / `onAbort` terminalize it.
- A result transform captures the terminal result metadata (ids, urls, never
  media bytes) onto the record.

When `artifacts` and `blobs` are both provided it also persists the generated
media and merges the durable refs onto both the result and the run record.

Generation uses its own `generationRuns` store (`GenerationRunStore`), never chat's
`runs` / `messages`. A generation has no conversation, so the run is keyed on
its own `runId` (`ctx.runId ?? ctx.requestId`) and `threadId` is **optional** —
carried through only when the caller supplies one, as a link to a chat or as
the stable hydration key a server-driven client reloads by. It is never faked
from the request id, and `threadId` never becomes the job's primary identity.

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
- generation requires `generationRuns`.
- `reconstructChat` requires `messages`.
- `reconstructGeneration` requires `generationRuns`.

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
