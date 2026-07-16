---
title: Persistence & Recovery
id: interrupts-persistence
order: 6
description: "Choose ephemeral resume or durable persistence for interrupts, and wire explicit recovery and continuation endpoints."
keywords:
  - tanstack ai
  - interrupt persistence
  - withChatPersistence
  - interrupt recovery
  - continuation loader
---

# Persistence & Recovery

Interrupts resume without any database by default. Add persistence when
approvals guard operations that need durable audit and concurrency guarantees.

## Ephemeral vs durable

**Ephemeral (default):** interrupts are request-scoped. The client resends the
full message history; the server validates it against the current tool
definitions and response schemas. It **cannot** prove the client didn't drop or
rewrite earlier history, and gives you no authoritative reload recovery,
exactly-once execution, replay protection, restart recovery, or cross-tab/
cross-instance coordination. Use it when those guarantees aren't required.

**Durable (`withChatPersistence`):** server state and browser drafts have
different authority:

- The store atomically opens the descriptor/binding batch and commits the exact
  resolution set with compare-and-swap semantics.
- The browser's `ChatResumeSnapshotV2` holds raw JSON-safe drafts only — never
  bound methods, validators, tool implementations, or hydrated errors.
- On reload, authoritative recovery runs **before** descriptors are rebound and
  a draft is restored.
- Submission fingerprints make an exact retry idempotent — the same accepted
  batch replays or joins the winning continuation instead of re-executing tools.
- A second tab with a stale generation loses the compare-and-swap and adopts
  recovery state; it never starts a second execution.

Add `withChatPersistence(persistence)` to the route's `middleware` array after
configuring a store. `migrate: true` is for local SQLite dev — generate, review,
and deploy your backend's native migration for production. See
[Persistence migrations](../persistence/migrations).

## Wire recovery endpoints

Recovery is opt-in and explicit — TanStack AI never infers a recovery or
continuation URL from the chat URL. Configure application-owned endpoints:

```ts
import {
  createInterruptContinuationLoader,
  createInterruptStateFetcher,
  fetchServerSentEvents,
} from '@tanstack/ai-client'

const connection = fetchServerSentEvents('/api/chat', {
  interruptStateFetcher: createInterruptStateFetcher('/api/interrupts/recovery'),
  continuationLoader: createInterruptContinuationLoader(
    '/api/interrupts/continuation',
  ),
})
```

The recovery endpoint must authenticate the caller, authorize the requested
thread, and return the store's authoritative recovery DTO. The continuation
endpoint is a read-only GET of the winning run. See
[Chat persistence](../persistence/chat-persistence),
[Custom stores](../persistence/custom-stores), and
[Delivery durability](../persistence/delivery-durability).

`resumeInterruptsUnsafe` remains a low-level escape hatch for already-validated
raw AG-UI resume entries and recovery tooling — not a replacement for normal
approval UI. Prefer [bound item methods](./multiple).

> Deeper internals — validate-all, CAS, continuation, and replay processing —
> are in [Approval flow architecture](../architecture/approval-flow-processing).
