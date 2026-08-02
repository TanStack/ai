---
title: Persistence Controls
id: controls
---

# Persistence Controls

Persistence has no feature flags. What you persist is decided by which **state**
stores the backend provides, and you compose backends per store. Supply only the
stores your workflow needs.

Need a mutex across instances? See [Locks](#locks-coordination) below.

## Named shapes (prefer these)

| Type | Required stores | Use |
| --- | --- | --- |
| `ChatTranscriptStores` / `ChatTranscriptPersistence` | `messages` (optional runs/interrupts/metadata) | Floor for `withPersistence` / `reconstructChat` |
| `ChatPersistenceStores` / `ChatPersistence` | `messages` + `runs` + `interrupts` + `metadata` | Packaged backends (`memoryPersistence`, Drizzle, Prisma, D1) |
| `ChatWithInterruptsStores` / `ChatWithInterruptsPersistence` | `messages` + `runs` + `interrupts` | HITL without requiring metadata |

There is no public sparse `AIPersistenceStores` export, so use a named shape or
`AIPersistence<{ messages: MessageStore, … }>` for custom maps.
`defineAIPersistence` / `composePersistence` still accept sparse maps by
inference.

## What each state store gives you

| Requirement | Store |
| --- | --- |
| Authoritative server transcript | `messages` (**required** by `withPersistence` / `reconstructChat`) |
| Run status and usage | `runs` (required on `ChatPersistence`; required when `interrupts` is set) |
| Durable approvals or human input | `interrupts` (requires `runs`) |
| App or integration checkpoints | `metadata` (always optional) |

`withPersistence(persistence)` inspects the stores that are present. Store
presence is the capability selection mechanism for optional chat features.

## Entrypoint requirements

| Entrypoint | Shape | Notes |
| --- | --- | --- |
| `withPersistence` | `ChatTranscriptStores` floor | `interrupts` ⇒ `runs` |
| `reconstructChat` | `ChatTranscriptStores` | `runs` / `interrupts` enrich the response when present |
| Packaged `*Persistence()` | `ChatPersistence` | messages + runs (+ interrupts + metadata) |
| `defineAIPersistence` / `composePersistence` | sparse by inference | Prefer a named shape for the result |

## Compose and override stores

`composePersistence` takes the base backend first and an overrides object
second. Here it starts from the in-memory reference backend and swaps in custom
`interrupts` / `runs` stores:

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
// Your own store implementations of the InterruptStore / RunStore contracts.
import { interruptStore, runStore } from './stores'

const persistence = composePersistence(memoryPersistence(), {
  overrides: {
    interrupts: interruptStore,
    runs: runStore,
  },
})
```

Each override is independent:

| Override value | Result |
| --- | --- |
| key omitted | Inherit the base store. |
| `undefined` | Inherit the base store. |
| a store object | Replace that store only. |
| `false` | Remove that store. |

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'

// Drop metadata; the resulting type has no `metadata` key.
const withoutMetadata = composePersistence(memoryPersistence(), {
  overrides: { metadata: false },
})
```

Unknown store names fail type checking, and are also rejected at runtime when
values arrive from untyped JavaScript.

## Valid store combinations

- `withPersistence` requires `messages`.
- `interrupts` requires `runs`: an interrupt record is scoped to a run.
- `withGenerationPersistence` requires `generationRuns`.

To define a partial backend directly rather than by composing, use
`defineAIPersistence({ stores: { ... } })` and pass only the stores you have.
See the
[store reference](./store-reference)
for the store contracts.

## Locks (coordination)

Locks coordinate work across instances (a distributed mutex). They live in
`@tanstack/ai/locks` and apply as their own middleware with `withLocks`,
alongside `withPersistence`. Full guide: [Locks](../advanced/locks).

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withPersistence, memoryPersistence } from '@tanstack/ai-persistence'

const middleware = [
  withPersistence(memoryPersistence()),
  withLocks(new InMemoryLockStore()), // multi-instance: distributed LockStore
]
```
