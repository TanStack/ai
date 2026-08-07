---
title: Locks
id: locks
order: 3
description: "Cross-instance mutual exclusion with LockStore and withLocks for multi-worker critical sections."
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

If multiple processes might enter the same critical section for one key → use locks. Locks are **not** persistence.

| Concern | Question | Seam |
| --- | --- | --- |
| **State** | What is durable? | Stores + `withPersistence` |
| **Locks** | Who may run this critical section now? | `LockStore` + `withLocks` |

Lives in `@tanstack/ai` (middleware capability), not `@tanstack/ai-persistence`.

## When you need them

**Must use locks when** more than one process/isolate can hit the same key:

1. Sandbox resume-or-create (`withSandbox` / `ensure`) — concurrent runs must not both create a sandbox. See [Sandbox Instance Durability](../sandbox/durability).
2. Custom multi-writer middleware (e.g. one active job per thread).

**Skip locks for:**

- Single-process local dev (`InMemoryLockStore` is fine if you want one anyway)
- Chat state durability (use stores)
- Auto-locking a whole `chat()` turn — `withLocks` only **provides** the capability; consumers call `withLock`

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
    withLocks(new InMemoryLockStore()), // multi-instance: pass a distributed LockStore
  ],
})
```

Capability identity is by **object reference**. `withLocks` provides `LocksCapability`; later middleware (including `@tanstack/ai-sandbox`) read the same store.

With sandbox, provide locks first:

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withSandbox } from '@tanstack/ai-sandbox'
import type { SandboxDefinition } from '@tanstack/ai-sandbox'

declare const sandbox: SandboxDefinition

const middleware = [
  withLocks(new InMemoryLockStore()),
  withSandbox(sandbox),
]
```

## Contract

```ts
import type { LockStore } from '@tanstack/ai/locks'

declare const locks: LockStore

await locks.withLock('thread:abc', async (signal) => {
  // critical section — pass signal to cancellable work under leases
  void signal
})
```

| Piece | Role |
| --- | --- |
| `LockStore` | `withLock(key, fn)` |
| `withLocks(store)` | Middleware that provides `LocksCapability` |
| `InMemoryLockStore` | Process-local (promise chain per key) |
| `getLocks` / `provideLocks` | Capability accessors for custom middleware |

`InMemoryLockStore` only serializes **within one process**. Throws don't poison the chain; signal never aborts (ownership can't be lost in-process).

## Implement a store

```ts
import { defineLock } from '@tanstack/ai/locks'
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

Then: `withLocks(locks)`.

## Distributed locks and leases

Multi-instance needs a distributed backend (Durable Object, Redis, …). A production store must:

1. Serialize owners per `key`
2. Use **leases** so a crashed owner can't block forever
3. Abort `signal` when the lease is lost so `fn` stops starting external work

Ignoring `signal` still type-checks; lease backends can't protect you if work continues after abort.

No shared conformance suite — test concurrency, release-on-throw, and lease expiry yourself. Cloudflare Durable Object recipe: `ai-persistence/build-cloudflare-adapter` agent skill (app-owned, not a package).

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
      void signal
    })
  },
})
```

Or call `provideLocks` in your own `setup` instead of `withLocks`.

## Related

- [Middleware](./middleware) — capability bus and lifecycle
- [Sandboxes](../sandbox/overview) — sandbox middleware
- [Sandbox Instance Durability](../sandbox/durability) — `withSandbox` / `ensure`
- [Persistence Controls](../persistence/controls) — compose state stores
- [Build Your Own Adapter](../persistence/build-your-own-adapter) — chat store contracts
