---
title: Persistence Controls
id: controls
---

Pass only the stores you use. Messages can live in your database while approvals live somewhere else.

Persistence has no feature flags. The stores that the backend provides decide what is persisted. Use `composePersistence` to mix backends per store, and give only the stores your app needs.

## Swap one store

`composePersistence` takes the base backend first and an overrides object second. This example starts from the in-memory backend and replaces the `interrupts` and `runs` stores:

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
// Your own implementations of the InterruptStore and RunStore contracts.
import { interruptStore, runStore } from './stores'

const persistence = composePersistence(memoryPersistence(), {
  overrides: {
    interrupts: interruptStore,
    runs: runStore,
  },
})
```

## Remove one store

Set the store to `false`:

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'

// Drop metadata. The resulting type has no `metadata` key.
const withoutMetadata = composePersistence(memoryPersistence(), {
  overrides: { metadata: false },
})
```

Each override is independent:

| Override value | Result |
| --- | --- |
| Key omitted | Keep the base store. |
| `undefined` | Keep the base store. |
| A store object | Replace that store only. |
| `false` | Remove that store. |

Unknown store names fail the type check. They also fail at runtime when the values come from untyped JavaScript.

To define a partial backend directly, without a base, use `defineAIPersistence({ stores: { ... } })` and pass only the stores you have. The [store reference](./store-reference) has the store contracts.

## What each store gives you

| You want | Store |
| --- | --- |
| A server transcript that is the true copy | `messages` (**required** by `withPersistence` and `reconstructChat`) |
| Run status and usage | `runs` (required on `ChatPersistence`, and required when `interrupts` is set) |
| Durable approvals or human input | `interrupts` (needs `runs`) |
| App or integration checkpoints | `metadata` (always optional) |

`withPersistence(persistence)` looks at the stores that are present. A present store turns its feature on.

## Valid store combinations

- `withPersistence` needs `messages`.
- `interrupts` needs `runs`, because an interrupt record belongs to a run.
- `withGenerationPersistence` needs `generationRuns`.
- Portable sandbox snapshots need `messages`, `artifacts`, and `blobs` on the same persistence object. See [Keep Files After Reload](../sandbox/portable-snapshots-configure).

## Advanced

### Named shapes

Use these types for a persistence object. They are better than a sparse map:

| Type | Required stores | Use |
| --- | --- | --- |
| `ChatTranscriptStores` / `ChatTranscriptPersistence` | `messages` (`runs`, `interrupts`, and `metadata` optional) | The minimum for `withPersistence` and `reconstructChat` |
| `ChatPersistenceStores` / `ChatPersistence` | `messages`, `runs`, `interrupts`, and `metadata` | Packaged backends (`memoryPersistence`, Drizzle, Prisma, D1) |
| `ChatWithInterruptsStores` / `ChatWithInterruptsPersistence` | `messages`, `runs`, and `interrupts` | Human-in-the-loop without `metadata` |

There is no public sparse `AIPersistenceStores` export. For a custom map, use a named shape or `AIPersistence<{ messages: MessageStore, ... }>`. `defineAIPersistence` and `composePersistence` still accept sparse maps by inference.

### Entrypoint requirements

| Entrypoint | Shape | Notes |
| --- | --- | --- |
| `withPersistence` | At least `ChatTranscriptStores` | `interrupts` needs `runs` |
| `reconstructChat` | `ChatTranscriptStores` | `runs` and `interrupts` add data to the response when present |
| Packaged `*Persistence()` | `ChatPersistence` | `messages` and `runs`, plus `interrupts` and `metadata` |
| `defineAIPersistence` / `composePersistence` | Sparse, by inference | Use a named shape for the result |

### Locks

Locks coordinate work across server instances, like a distributed mutex. They live in `@tanstack/ai/locks`, and you add them as their own middleware with `withLocks`, next to `withPersistence`. Full guide: [Locks](../advanced/locks).

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withPersistence, memoryPersistence } from '@tanstack/ai-persistence'

const middleware = [
  withPersistence(memoryPersistence()),
  withLocks(new InMemoryLockStore()), // For many instances, use a distributed LockStore.
]
```
