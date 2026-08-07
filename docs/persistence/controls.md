---
title: Persistence Controls
id: controls
description: "Pick stores by composition. No feature flags — presence enables behavior."
---

# Persistence Controls

If you need only some capabilities → supply only those stores. Compose per store; no feature flags.

Mutex across instances → [Locks](#locks-coordination).

## Named shapes (prefer these)

| Type | Required stores | Use |
| --- | --- | --- |
| `ChatTranscriptStores` / `ChatTranscriptPersistence` | `messages` (+ optional runs/interrupts/metadata) | Floor for `withPersistence` / `reconstructChat` |
| `ChatPersistenceStores` / `ChatPersistence` | `messages` + `runs` + `interrupts` + `metadata` | Packaged backends (`memoryPersistence`, Drizzle, Prisma, D1) |
| `ChatWithInterruptsStores` / `ChatWithInterruptsPersistence` | `messages` + `runs` + `interrupts` | HITL without metadata |

No public sparse `AIPersistenceStores`. Custom maps: `AIPersistence<{ messages: MessageStore, … }>` or infer via `defineAIPersistence` / `composePersistence`.

## What each store gives

| Requirement | Store |
| --- | --- |
| Authoritative transcript | `messages` (**required** by `withPersistence` / `reconstructChat`) |
| Run status and usage | `runs` (required on `ChatPersistence`; required when `interrupts` set) |
| Durable approvals / human input | `interrupts` (requires `runs`) |
| App checkpoints | `metadata` (always optional) |

`withPersistence(persistence)` inspects present stores. Presence = capability.

## Entrypoint requirements

| Entrypoint | Shape | Notes |
| --- | --- | --- |
| `withPersistence` | `ChatTranscriptStores` floor | `interrupts` ⇒ `runs` |
| `reconstructChat` | `ChatTranscriptStores` | `runs` / `interrupts` enrich when present |
| Packaged `*Persistence()` | `ChatPersistence` | messages + runs (+ interrupts + metadata) |
| `defineAIPersistence` / `composePersistence` | sparse by inference | Prefer named shape for result |

## Compose and override

Base first, overrides second:

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { interruptStore, runStore } from './stores'

const persistence = composePersistence(memoryPersistence(), {
  overrides: {
    interrupts: interruptStore,
    runs: runStore,
  },
})
```

| Override value | Result |
| --- | --- |
| key omitted | Inherit base |
| `undefined` | Inherit base |
| store object | Replace that store |
| `false` | Remove that store |

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'

const withoutMetadata = composePersistence(memoryPersistence(), {
  overrides: { metadata: false },
})
```

Unknown store names fail at type-check and at runtime (untyped JS).

## Valid combinations

**Must:**

1. `withPersistence` → `messages`
2. `interrupts` → also `runs`
3. `withGenerationPersistence` → `generationRuns`

Partial backend without compose:

```ts
import { defineAIPersistence } from '@tanstack/ai-persistence'

defineAIPersistence({ stores: { /* only what you have */ } })
```

Contracts: [store reference](./store-reference).

## Locks (coordination)

Distributed mutex lives in `@tanstack/ai/locks` as separate middleware. Full guide: [Locks](../advanced/locks).

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withPersistence, memoryPersistence } from '@tanstack/ai-persistence'

const middleware = [
  withPersistence(memoryPersistence()),
  withLocks(new InMemoryLockStore()), // multi-instance: distributed LockStore
]
```
