---
title: Locks
id: locks
order: 3
description: "Cross-instance mutual exclusion with LockStore and withLocks — coordination middleware for multi-worker critical sections (e.g. sandbox ensure)."
keywords:
  - tanstack ai
  - locks
  - withLocks
  - LockStore
  - InMemoryLockStore
  - middleware
  - multi-instance
  - durable object
  - AbortSignal
  - coordination
---

Locks answer a different question from persistence:

| Concern | Question | Seam |
| --- | --- | --- |
| **State** | What is durable? | Stores + `withPersistence` |
| **Locks** | Who may run this critical section right now? | `LockStore` + `withLocks` |

They live in **`@tanstack/ai`** as a middleware capability — not in
`@tanstack/ai-persistence`, and never as a key on `AIPersistence.stores`.

## When you need them

Use locks when **more than one process or isolate** might enter the same critical
section for the same key:

- **Sandbox resume-or-create** (`withSandbox` / `ensure`) — two concurrent runs
  for the same thread must not both create a provider sandbox. See
  [Sandbox Instance Durability](../sandbox/durability).
- **Your own middleware** — any multi-writer work you want to serialize across
  workers (e.g. a custom “one active job per thread” gate).

You do **not** need locks for:

- Single-process local dev (optional: `InMemoryLockStore` is fine).
- Ordinary chat state durability — that is stores, not mutexes.
- Automatically locking an entire `chat()` turn — `withLocks` only **provides**
  the capability; consumers call `withLock` when they need exclusion.

## Wire it up

```ts
import { chat } from '@tanstack/ai'
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { grokBuildText } from '@tanstack/ai-grok-build'
import type { ModelMessage } from '@tanstack/ai'

const messages: Array<ModelMessage> = [{ role: 'user', content: 'hi' }]

chat({
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [
    // Single process. Multi-instance: pass a distributed LockStore instead.
    withLocks(new InMemoryLockStore()),
    // later middleware can getLocks(ctx) / withSandbox will use the same token
  ],
})
```

Capability identity is by **object reference**. `withLocks` provides the shared
`LocksCapability` from core; any later middleware that reads that token (including
`@tanstack/ai-sandbox`) sees the same store.

Typical order when composing with sandbox:

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withSandbox } from '@tanstack/ai-sandbox'
import type { SandboxDefinition } from '@tanstack/ai-sandbox'

declare const sandbox: SandboxDefinition

const middleware = [
  withLocks(new InMemoryLockStore()),
  withSandbox(sandbox), // after providers
]
```

## The contract

```ts
import type { LockStore } from '@tanstack/ai/locks'

declare const locks: LockStore

// Mutual exclusion for a key; lease-backed impls abort `signal` on loss.
await locks.withLock('thread:abc', async (signal) => {
  // critical section — pass `signal` to cancellable work when using leases
  void signal
})
```

| Piece | Role |
| --- | --- |
| `LockStore` | Interface: `withLock(key, fn)` |
| `withLocks(store)` | Chat middleware that provides `LocksCapability` |
| `InMemoryLockStore` | Process-local implementation (promise chain per key) |
| `getLocks` / `provideLocks` | Low-level capability accessors for custom middleware |

`InMemoryLockStore` is correct **within one process only**. It serializes
callers for the same key, does not poison the chain when a critical section
throws, and never aborts its signal (ownership cannot be lost in-process).

## Implement a lock

Wrap your own mutual-exclusion primitive with `defineLock`. It types the object
against the contract inline (autocomplete, no `: LockStore` annotation). Acquire
the key, run `fn`, and release when `fn` settles (whether it resolves or throws):

```ts
import { defineLock } from '@tanstack/ai/locks'
// Your distributed primitive. `acquire` waits until the key is free and returns
// a `release` (plus, for leases, a `signal` that fires when ownership is lost).
import { acquire } from './my-lock-backend'

export const locks = defineLock({
  async withLock(key, fn) {
    const { release, signal } = await acquire(key)
    try {
      return await fn(signal)
    } finally {
      release()
    }
  },
})
```

Wire it as middleware with `withLocks(locks)`. The requirements a production
store must meet are covered below.

## Distributed locks and leases

Multi-instance deployments need a **distributed** implementation (Durable Object,
Redis, etc.). A good store:

1. Serializes owners per `key`.
2. Uses **leases** (or equivalent) so a crashed owner cannot block forever.
3. Passes an `AbortSignal` into `fn`; when the lease is lost, **abort** so the
   callback stops starting externally visible work and passes the signal to
   cancellable dependencies.

Callbacks that ignore `signal` still type-check (`() => Promise<T>` is
assignable), but lease-backed backends cannot protect you if the critical
section keeps mutating after abort.

There is no shared lock conformance suite in the chat store testkit — write
targeted tests for concurrency, release-on-throw, and lease expiry for your
backend. The Cloudflare Durable Object recipe lives in the
`ai-persistence/build-cloudflare-adapter` agent skill (app-owned file,
not a shipped package).

## Consume in custom middleware

```ts
import { defineChatMiddleware } from '@tanstack/ai'
import { LocksCapability, getLocks } from '@tanstack/ai/locks'

const serializePerThread = defineChatMiddleware({
  name: 'serialize-per-thread',
  requires: [LocksCapability],
  async onStart(ctx) {
    const locks = getLocks(ctx)
    await locks.withLock(`thread:${ctx.threadId}`, async (signal) => {
      // critical section — honor `signal` under lease-backed locks
      void signal
    })
  },
})
```

Or provide without `withLocks` by calling `provideLocks` in your own
`setup` hook if you already own a custom middleware.

## See also

- [Middleware](./middleware) — capability bus and lifecycle
- [Sandboxes](../sandbox/overview) — sandbox middleware overview
- [Sandbox Instance Durability](../sandbox/durability) — primary product consumer (`withSandbox` / `ensure`)
- [Persistence Controls](../persistence/controls) — compose state stores from different systems
- [Build Your Own Adapter](../persistence/build-your-own-adapter) — chat store contracts
