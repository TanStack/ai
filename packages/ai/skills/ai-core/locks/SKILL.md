---
name: ai-core/locks
description: >
  LockStore, InMemoryLockStore, LocksCapability and withLocks for
  multi-instance coordination in TanStack AI. Ships in @tanstack/ai — NOT in
  @tanstack/ai-persistence. Separate from AIPersistence state stores — not a
  stores key, not composable. InMemoryLockStore vs a distributed (e.g.
  Cloudflare Durable Object) lock, lease recovery, AbortSignal in critical
  sections. Use when sandbox or other middleware needs cross-worker mutual
  exclusion — NOT for storing messages/runs (use withPersistence).
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/advanced/locks.md'
  - 'TanStack/ai:packages/ai/src/activities/chat/middleware/locks.ts'
---

# Locks (coordination — not persistence)

> **Dependency note:** This skill builds on ai-core and ai-core/middleware.
> `withLocks` is a ChatMiddleware that provides a capability. Locks are **not**
> part of `AIPersistence.stores` and are **not** composed with
> `composePersistence` — they ship in `@tanstack/ai`, independent of
> `@tanstack/ai-persistence`.

## Why separate?

State stores answer "what is durable chat data?"  
Locks answer "who may run this critical section right now?"

`withPersistence` does **not** automatically lock a whole turn. Take a
per-thread (or other) lock yourself when multi-writer races matter.

## Wire locks

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'

middleware: [
  withLocks(new InMemoryLockStore()), // single process
]
```

Alongside persistence — optional, locks do not require it:

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withPersistence } from '@tanstack/ai-persistence'

middleware: [withPersistence(persistence), withLocks(new InMemoryLockStore())]
```

`withLocks` provides `LocksCapability` for downstream middleware (e.g.
sandbox). Order: usually state first, locks alongside or after depending on
who consumes the capability.

## The contract

```ts
interface LockStore {
  withLock<T>(key: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T>
}
```

`InMemoryLockStore` ships in **`@tanstack/ai/locks`**: a per-key promise chain,
correct **within a single process only**. Multi-instance deployments need a
distributed implementation — you write it. The Cloudflare Durable Object recipe
is in **ai-persistence/build-cloudflare-adapter** (`@tanstack/ai-persistence`).

Type your own store with `defineLock` (autocomplete, no `: LockStore`
annotation), then hand it to `withLocks`. Acquire the key, run `fn`, release when
`fn` settles:

```ts
import { defineLock, withLocks } from '@tanstack/ai/locks'
import { acquire } from './my-lock-backend'

const locks = defineLock({
  async withLock(key, fn) {
    const { release, signal } = await acquire(key)
    try {
      return await fn(signal)
    } finally {
      release()
    }
  },
})

middleware: [withLocks(locks)]
```

## Lease semantics

A good `LockStore`:

- Serializes owners per key,
- Uses **leases** (or equivalent) so a crashed owner cannot block forever,
- Passes an `AbortSignal` into the critical section via `withLock`; when the
  lease is lost, abort so work stops starting external mutations.

Callbacks must honor the signal and pass it to cancellable dependencies.
`InMemoryLockStore` never aborts its signal — within one process, ownership
cannot be lost.

## Capability identity

The `'locks'` capability token lives in `@tanstack/ai/locks`. Capability identity
is by **object reference**, so one shared token means a `withLocks` in the chain
reaches `withSandbox` automatically.

## Common mistakes

### HIGH: Importing locks from `@tanstack/ai-persistence`

They are not exported there. Use `@tanstack/ai`.

### HIGH: Putting `locks` on `AIPersistence.stores`

Not supported. `stores` accepts only `messages`, `runs`, `interrupts`,
`metadata` — never `locks`. Use `withLocks`.

### HIGH: Passing `locks` to `composePersistence` overrides

Same rejection, at the override layer. Locks are not state.

### HIGH: Passing `'locks'` to the conformance testkit's `skip`

`skip` accepts only chat state store keys. The suite does not cover locks
at all — test lease expiry and abort separately.

### HIGH: `InMemoryLockStore` across multiple processes

No mutual exclusion between machines — use a distributed lock store.

### MEDIUM: Ignoring lease abort

Continuing work after losing the lease races other owners.

## Cross-references

- See also: **ai-core/middleware/SKILL.md** -- the middleware chain and capability plumbing
- See also: **`@tanstack/ai-persistence` skills** (`skills/ai-persistence/SKILL.md` in that package) -- `ai-persistence/server` (state middleware) and `ai-persistence/build-cloudflare-adapter` (Durable Object lock recipe)
