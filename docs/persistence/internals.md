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
a stored thread without resending history, pass an empty `messages` array, and the
stored transcript is loaded and used.

## Reading the stores from your own middleware

Your own middleware often needs the same stores `withPersistence` is already
holding: an audit step that writes to `metadata`, a guard that checks pending
interrupts. Passing the persistence object in twice works but drifts, because
the middleware and your code can end up with different instances.

`withPersistence` publishes what it holds as capabilities instead. Declare what
you need in `requires`, then read it off the context:

```ts
import { chat, defineChatMiddleware, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  InterruptsCapability,
  PersistenceCapability,
  getInterrupts,
  getPersistence,
  memoryPersistence,
  withPersistence,
} from '@tanstack/ai-persistence'
import type { ChatMiddlewareContext } from '@tanstack/ai'

const persistence = memoryPersistence()

const auditPending = defineChatMiddleware({
  name: 'audit-pending',
  // Fails fast at setup when the capability was never provided.
  requires: [PersistenceCapability, InterruptsCapability],
  async setup(ctx: ChatMiddlewareContext) {
    const stores = getPersistence(ctx).stores
    const interrupts = getInterrupts(ctx)
    const pending = await interrupts.listPending(ctx.threadId)
    await stores.metadata?.set(ctx.threadId, 'pending-count', {
      count: pending.length,
    })
  },
})

export async function POST(request: Request) {
  const { messages, threadId } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
    threadId,
    // Order matters: the provider runs before the consumer.
    middleware: [withPersistence(persistence), auditPending],
  })
  return toServerSentEventsResponse(stream)
}
```

Two capabilities are published:

- `PersistenceCapability`, read with `getPersistence(ctx)`: the whole
  `AIPersistence` object, so any store it exposes is reachable.
- `InterruptsCapability`, read with `getInterrupts(ctx)`: the `interrupts` store
  alone, published only when persistence actually has one.

`providePersistence` and `provideInterrupts` are the write halves, for a
middleware of your own that supplies the stores instead of `withPersistence`.
Locks are not part of this: they are a separate capability from
[`@tanstack/ai/locks`](../advanced/locks).

## Generation middleware lifecycle

`withGenerationPersistence(persistence)` records the job across
three points:

- `onStart` creates or resumes the run record.
- `onFinish` / `onError` / `onAbort` terminalize it.
- A result transform captures the terminal result metadata (ids, urls, never
  media bytes) onto the record.

When `artifacts` and `blobs` are both provided it also persists the generated
media and merges the durable refs onto both the result and the run record.

Generation uses its own `generationRuns` store (`GenerationRunStore`), never chat's
`runs` / `messages`. A generation has no conversation, so the run is keyed on
its own `runId` (`ctx.runId ?? ctx.requestId`), and `threadId` never becomes the
job's primary identity.

`threadId` is nonetheless **required**: it is the slot the run is filed under,
and `GenerationRunRecord.threadId` is a required field. The middleware resolves
it as `opts.threadId ?? ctx.threadId` (normally the `threadId` the caller
passed the activity, with the option as an override) and **throws** when
neither supplies one. It is never faked from the request id: a run filed under
an invented scope can never be hydrated by one, so restoring would silently
return nothing forever.

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
stores it exposes. [Build a chat adapter](./build-your-own-chat-adapter) shows
this end to end for SQLite.

`composePersistence` does not add distributed transactions. When related
stores use different systems, adapter authors must define retry,
idempotency, and consistency behavior.
