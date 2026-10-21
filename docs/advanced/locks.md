---
title: Locks
id: locks
order: 3
description: "Let only one run at a time enter a critical section for a key, across workers. Use LockStore and withLocks, for example around sandbox create."
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

Two runs for the same thread start at the same time on two workers. Both see that no sandbox exists, and both create one. Now you pay for two sandboxes, and the thread uses the wrong one.

A lock fixes this. Only one caller at a time runs the critical section for a key. The next caller waits until the first one is done.

## Quick setup

### 1. Provide a lock store

Add `withLocks` to the `middleware` array. Put it before the middleware that uses the lock:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { openaiText } from '@tanstack/ai-openai'
import { onePrepPerThread } from './one-prep-per-thread'

// Create the store once, so all requests share it.
// For more than one process, pass a distributed LockStore.
const locks = new InMemoryLockStore()

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
    middleware: [withLocks(locks), onePrepPerThread],
  })

  return toServerSentEventsResponse(stream)
}
```

### 2. Use the lock in your middleware

Read the store with `getLocks(ctx)`. Then wrap the critical section in `withLock`:

```ts
// one-prep-per-thread.ts
import { defineChatMiddleware } from '@tanstack/ai'
import { LocksCapability, getLocks } from '@tanstack/ai/locks'

export const onePrepPerThread = defineChatMiddleware({
  name: 'one-prep-per-thread',
  requires: [LocksCapability],
  async onStart(ctx) {
    const locks = getLocks(ctx)
    await locks.withLock(`thread:${ctx.threadId}`, async (signal) => {
      // Only one run for this thread is in here at a time.
      // Pass `signal` to cancellable work when you use a lease-backed store.
      console.log(`start ${ctx.threadId}`)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      console.log(`end ${ctx.threadId}, lost lock: ${signal.aborted}`)
    })
  },
})
```

When two runs for the same thread start at the same time, the server console shows `start`, `end`, `start`, `end`. The two critical sections never overlap.

## How it works

- `withLocks(store)` is a middleware. It provides the `LocksCapability` in its `setup` hook. See [Capabilities](./middleware-advanced#capabilities).
- `withLocks` does not lock a whole `chat()` turn. It only gives the store to later middleware. A consumer calls `withLock` when it needs the lock.
- The capability is the same object everywhere. So each later middleware that reads `LocksCapability` sees the same store, including `@tanstack/ai-sandbox`.

When you use a sandbox, put `withLocks` before `withSandbox`:

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withSandbox } from '@tanstack/ai-sandbox'
import type { SandboxDefinition } from '@tanstack/ai-sandbox'

declare const sandbox: SandboxDefinition

const middleware = [
  withLocks(new InMemoryLockStore()),
  withSandbox(sandbox), // after the providers
]
```

## When you need a lock

Use a lock when **more than one process or isolate** can enter the same critical section for the same key:

- **Sandbox resume-or-create** (`withSandbox` / `ensure`). Two runs for the same thread must not both create a provider sandbox. See [Sandbox Instance Durability](../sandbox/durability).
- **Your own middleware.** Any work with more than one writer that you want to run one at a time across workers. For example, "one active job per thread".

You do not need a lock for:

- Local development with one process. `InMemoryLockStore` is enough there.
- Saving chat state. Stores and `withPersistence` do that. See [Persistence Controls](../persistence/controls).

## Advanced

### The contract

```ts
import type { LockStore } from '@tanstack/ai/locks'

declare const locks: LockStore

// Mutual exclusion for a key. Lease-backed stores abort `signal` on loss.
await locks.withLock('thread:abc', async (signal) => {
  // Critical section. Pass `signal` to cancellable work when you use leases.
  void signal
})
```

| Piece | Role |
| --- | --- |
| `LockStore` | Interface: `withLock(key, fn)` |
| `withLocks(store)` | Chat middleware that provides `LocksCapability` |
| `InMemoryLockStore` | Implementation for one process (a promise chain per key) |
| `defineLock(lock)` | Types your own `LockStore` inline |
| `getLocks` / `provideLocks` | Low-level capability accessors for custom middleware |

`InMemoryLockStore` is correct **in one process only**:

- It runs callers for the same key one at a time.
- When a critical section throws, the next caller still runs.
- It never aborts its signal, because a process cannot lose its own lock.

### Implement a lock

Wrap your own mutual-exclusion primitive with `defineLock`. It checks the object against the contract inline, so you get autocomplete and need no `: LockStore` annotation.

1. Acquire the key.
2. Run `fn`.
3. Release the key when `fn` settles, also when it throws.

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

Wire it as middleware with `withLocks(locks)`. A production store must meet the rules in the next section.

### Distributed locks and leases

A deployment with more than one instance needs a **distributed** store, for example a Durable Object or Redis. A good store:

1. Lets one owner at a time hold each `key`.
2. Uses **leases** (or something like them), so an owner that crashes cannot block the key forever.
3. Passes an `AbortSignal` into `fn`. When the lease is lost, it **aborts** the signal. The callback then stops starting work that others can see, and passes the signal to cancellable dependencies.

A callback that ignores `signal` still type-checks, because `() => Promise<T>` is assignable. But a lease-backed store cannot protect you if the critical section keeps changing data after the abort.

To test your store:

- The chat store testkit has no lock conformance suite. Write your own tests for concurrency, release on throw, and lease expiry.
- The Cloudflare Durable Object recipe is in the `ai-persistence/build-cloudflare-adapter` agent skill. It is a file that your app owns, not a published package.

On Redis, `upstashLocks()` from `@upstash/agentkit-tanstack-ai` is a published third-party `LockStore` on Upstash Redis. It renews its lease while `fn` runs, and it aborts `signal` if a renewal fails. See [Upstash](../community-adapters/upstash#locks).

### Provide a store without `withLocks`

If you already own a custom middleware, call `provideLocks(ctx, store)` in its `setup` hook, and list `LocksCapability` in its `provides`. Later middleware then reads the store with `getLocks(ctx)`.
