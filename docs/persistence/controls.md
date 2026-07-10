---
title: Persistence Controls
id: controls
---

# Persistence Controls

Persistence is controlled by store presence. Supply only the state stores your
workflow needs, compose backends per store, and configure SSE delivery
durability independently.

## Decision table

| Requirement | Stores or option |
| --- | --- |
| Rendered messages after a browser reload | `useChat({ persistence: { client } })` |
| Pending client interrupt state after reload | `useChat({ persistence: { server } })` |
| Authoritative server transcript | `messages` |
| Run status and usage | `runs` |
| Durable approvals or human input | `interrupts` and `runs` |
| App or integration checkpoints | `metadata` |
| Cross-worker coordination | `locks` |
| Generated media or workspace files | `artifacts` and `blobs` |
| Replay an in-flight response | SSE `durability.adapter` |

`withChatPersistence(persistence)` and
`withGenerationPersistence(persistence)` inspect the stores. Store presence is
the complete capability selection mechanism.

## Compose and override stores

`composePersistence` takes the base backend first and a configuration object
second:

```ts
import {
  composePersistence,
  defineAIPersistence,
} from '@tanstack/ai-persistence'
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'
import type {
  InterruptStore,
  RunStore,
} from '@tanstack/ai-persistence'

declare const env: {
  AI_STATE: D1Database
  AI_MEDIA: R2Bucket
  AI_LOCKS: DurableObjectNamespace
}
declare const interrupts: InterruptStore
declare const runs: RunStore

const base = cloudflarePersistence({
  d1: env.AI_STATE,
  r2: env.AI_MEDIA,
  durableObjects: env.AI_LOCKS,
})

const custom = defineAIPersistence({ stores: { interrupts, runs } })

const persistence = composePersistence(base, {
  overrides: {
    interrupts: custom.stores.interrupts,
    runs: custom.stores.runs,
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
const withoutGeneratedMedia = composePersistence(base, {
  overrides: {
    artifacts: false,
    blobs: false,
  },
})
```

The type of `withoutGeneratedMedia.stores` no longer contains required
`artifacts` or `blobs` keys. Unknown store names fail type checking and are
also rejected at runtime when values arrive from untyped JavaScript.

## Valid store combinations

Some capabilities require related stores:

- `interrupts` requires `runs` for chat persistence.
- Generation artifact persistence requires both `artifacts` and `blobs`.
- Sandbox workspace persistence requires `metadata`, `artifacts`, and `blobs`;
  `locks` is optional.

Known-invalid static compositions fail to type-check at the middleware call.
Runtime validation covers dynamically typed inputs.

```ts
import { withGenerationPersistence } from '@tanstack/ai-persistence'

// Valid: both stores remain present.
const mediaPersistence = composePersistence(base, {
  overrides: {},
})

const middleware = withGenerationPersistence(mediaPersistence)
```

## Consistency across backends

Composition routes each method call to its selected store. It does not add a
distributed transaction across stores. When related state spans services:

- make writes idempotent;
- use stable run, interrupt, artifact, and blob keys;
- decide which store is authoritative;
- handle a successful write followed by a failed related write;
- use a lock when concurrent workers can mutate the same logical record.

Overriding `interrupts` and `runs` together is often safer when the custom
database needs transactional guarantees across those records.

## Client controls

Browser persistence is also per concern:

```tsx
import {
  indexedDBPersistence,
  sessionStoragePersistence,
} from '@tanstack/ai-client'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type {
  ChatResumeSnapshot,
  UIMessage,
} from '@tanstack/ai-client'

function serializeJson(value: unknown): string {
  const stringify: (input: unknown) => unknown = JSON.stringify
  const serialized = stringify(value)
  if (typeof serialized !== 'string') {
    throw new TypeError('The value is not JSON serializable.')
  }
  return serialized
}

export function Chat() {
  const chat = useChat({
    id: 'chat-1',
    threadId: 'thread-1',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: {
      client: indexedDBPersistence<Array<UIMessage>>(),
      server: sessionStoragePersistence<ChatResumeSnapshot>({
        serialize: serializeJson,
        deserialize: JSON.parse,
      }),
    },
  })

  return <button onClick={() => chat.clear()}>Clear</button>
}
```

Web Storage uses JSON and needs codecs for non-JSON values. IndexedDB uses
structured clone. All browser adapters fail visibly when used in an SSR
environment without the corresponding browser API.
