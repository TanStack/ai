---
title: Custom Stores
id: custom-stores
---

# Custom Persistence Stores

Implement custom stores when your infrastructure is not covered by the
packaged backends or when selected data must remain in an application-owned
database.

## Define the stores you provide

```ts
import { defineAIPersistence } from '@tanstack/ai-persistence'
import { messages, runs } from './stores'

export const persistence = defineAIPersistence({
  stores: { messages, runs },
})
```

`defineAIPersistence` preserves the exact store keys in the type and rejects
unknown keys at runtime. Middleware behavior follows the keys that exist.

## Store interfaces

Each interface below is the public contract from `@tanstack/ai-persistence`.
Implement only the stores you need.

### Messages

```ts
import type { ModelMessage } from '@tanstack/ai'

interface MessageStore {
  loadThread(threadId: string): Promise<Array<ModelMessage>>
  saveThread(
    threadId: string,
    messages: Array<ModelMessage>,
  ): Promise<void>
}
```

`saveThread` receives the full authoritative model-message history, not a
delta. `loadThread` returns `[]` (never `null`) for a thread that was never
saved.

### Runs

```ts
import type { RunRecord } from '@tanstack/ai-persistence'

interface RunStore {
  createOrResume(input: {
    runId: string
    threadId: string
    status?: 'running' | 'completed' | 'failed' | 'interrupted'
    startedAt: number
  }): Promise<RunRecord>
  update(
    runId: string,
    patch: Partial<
      Pick<RunRecord, 'status' | 'finishedAt' | 'error' | 'usage'>
    >,
  ): Promise<void>
  get(runId: string): Promise<RunRecord | null>
}
```

Implement `createOrResume` idempotently: a second call for an existing `runId`
returns the stored record unchanged, which is what makes resuming a run safe.
`update` against an unknown `runId` is a no-op. Retries may repeat the same run
id.

### Interrupts

```ts
import type { InterruptRecord } from '@tanstack/ai-persistence'

interface InterruptStore {
  create(record: Omit<InterruptRecord, 'status' | 'resolvedAt'>): Promise<void>
  resolve(interruptId: string, response?: unknown): Promise<void>
  cancel(interruptId: string): Promise<void>
  get(interruptId: string): Promise<InterruptRecord | null>
  list(threadId: string): Promise<Array<InterruptRecord>>
  listPending(threadId: string): Promise<Array<InterruptRecord>>
  listByRun(runId: string): Promise<Array<InterruptRecord>>
  listPendingByRun(runId: string): Promise<Array<InterruptRecord>>
}
```

`create` accepts a record without `status`/`resolvedAt` so every interrupt is
born `'pending'`; it is insert-if-absent, so a duplicate `create` never clobbers
an already-resolved interrupt. The `list*` methods return records ordered by
`requestedAt` ascending. An `interrupts` store requires a `runs` store when used
with chat persistence.

### Metadata

```ts
interface MetadataStore {
  get(scope: string, key: string): Promise<unknown | null>
  set(scope: string, key: string, value: unknown): Promise<void>
  delete(scope: string, key: string): Promise<void>
}
```

Namespaces and value schemas are application-owned. `(scope, key)` is the
composite identity. Because a stored `null` is indistinguishable from absence at
the type level, wrap a value you must persist as `null` (e.g. `{ value: null }`).

### Locks

`LockStore` comes from `@tanstack/ai-persistence`. Use it to serialize work that
may run on multiple workers. A lock implementation should use leases or another
recovery mechanism so a crashed owner cannot block forever. `withLock` passes an
`AbortSignal` to the critical section. Lease-backed implementations abort that
signal when ownership can no longer be guaranteed; callbacks must stop starting
external mutations and pass the signal to cancellable dependencies. The package
ships an in-process `InMemoryLockStore` for single-process use.

## Example message store

```ts
import type { MessageStore } from '@tanstack/ai-persistence'
import type { ModelMessage } from '@tanstack/ai'

const threads = new Map<string, Array<ModelMessage>>()

export const messages: MessageStore = {
  async loadThread(threadId) {
    return [...(threads.get(threadId) ?? [])]
  },
  async saveThread(threadId, nextMessages) {
    threads.set(threadId, [...nextMessages])
  },
}
```

For durable infrastructure, preserve the same semantics with database
transactions, conditional writes, or stable idempotency keys.

## Override selected packaged stores

```ts ignore
import { composePersistence } from '@tanstack/ai-persistence'
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'
import { interrupts, runs } from './stores'

export function createPersistence(state: D1Database) {
  const base = cloudflarePersistence({ d1: state })
  return composePersistence(base, {
    overrides: { interrupts, runs },
  })
}
```

Only those two stores move to the custom database; D1 still owns messages and
metadata. Composition does not create a transaction across those systems;
design related writes accordingly.
