---
title: Persistence Controls
id: controls
---

# Persistence Controls

Persistence has no feature flags. What you persist is decided by which stores
the backend provides, and you compose backends per store. Supply only the
stores your workflow needs.

## What each need maps to

| Requirement | Store or option |
| --- | --- |
| Restore messages / interrupts after a browser reload | `useChat({ persistence })` (client) |
| Authoritative server transcript | `messages` |
| Run status and usage | `runs` |
| Durable approvals or human input | `interrupts` (requires `runs`) |
| App or integration checkpoints | `metadata` |
| Cross-worker coordination | `locks` |
| Replay an in-flight response | [Resumable streams](../resumable-streams/overview) (transport feature, not a store) |

`withChatPersistence(persistence)` and `withGenerationPersistence(persistence)`
inspect the stores that are present. Store presence is the whole capability
selection mechanism.

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

// Drop the locks store entirely; the resulting type has no `locks` key.
const withoutLocks = composePersistence(memoryPersistence(), {
  overrides: { locks: false },
})
```

Unknown store names fail type checking, and are also rejected at runtime when
values arrive from untyped JavaScript.

## Valid store combinations

`interrupts` requires `runs`: an interrupt record is scoped to a run, so
`withChatPersistence` rejects a persistence object that has `interrupts` without
`runs`. Everything else is independent, add stores as the workflow needs them.

To define a partial backend directly rather than by composing, use
`defineAIPersistence({ stores: { ... } })` and pass only the stores you have.
See [Custom stores](./custom-stores) for the store contracts.
