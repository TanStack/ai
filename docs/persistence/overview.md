---
title: Persistence Overview
id: overview
---

# Persistence Overview

TanStack AI separates two independent durability concerns:

- **State persistence** stores messages, runs, pending interrupts, metadata,
  locks, and generated artifacts. It is configured with persistence middleware.
- **Delivery durability** stores an ordered SSE event stream so a client can
  reconnect without re-running the provider. It is configured on the response
  transport.

Persisting state does not automatically make a live response replayable, and a
replayable response does not replace authoritative application state.

## Store contract

An `AIPersistence` object can expose these stores:

| Store | Purpose |
| --- | --- |
| `messages` | Authoritative model-message history per thread. |
| `runs` | Run status, timing, errors, and usage. |
| `interrupts` | Pending, resolved, or cancelled human/tool waits. |
| `metadata` | App and integration key/value state. |
| `locks` | Cross-worker coordination. |
| `artifacts` | Generated file/media metadata. |
| `blobs` | Generated file/media bytes. |

Middleware activates behavior from the stores that are present; there is no
separate enablement list.

## Minimal server state persistence

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/state.sqlite',
  migrate: true,
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withChatPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

The Node convenience factory is SQLite-only. For an existing SQLite-family
Drizzle database, including Cloudflare D1, use the edge-safe root
`drizzlePersistence(db)`. For another database engine, implement the
`AIPersistence` store interfaces or use Prisma.

## Compose backends by store

Use one backend as the first argument and replace only selected stores through
the second argument:

```ts
import { composePersistence } from '@tanstack/ai-persistence'
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type { CloudflarePersistenceOptions } from '@tanstack/ai-persistence-cloudflare'
import type { AIPersistenceStores } from '@tanstack/ai-persistence'

declare const env: {
  AI_STATE: NonNullable<CloudflarePersistenceOptions['d1']>
  AI_MEDIA: NonNullable<CloudflarePersistenceOptions['r2']>
  AI_LOCKS: NonNullable<CloudflarePersistenceOptions['durableObjects']>
}
declare const myInterruptStore: NonNullable<
  AIPersistenceStores['interrupts']
>
declare const myRunStore: NonNullable<AIPersistenceStores['runs']>

const base = cloudflarePersistence({
  d1: env.AI_STATE,
  r2: env.AI_MEDIA,
  durableObjects: env.AI_LOCKS,
})

const appStores = defineAIPersistence({
  stores: {
    interrupts: myInterruptStore,
    runs: myRunStore,
  },
})

const persistence = composePersistence(base, {
  overrides: {
    interrupts: appStores.stores.interrupts,
    runs: appStores.stores.runs,
  },
})
```

An omitted or explicitly `undefined` override inherits the base store. A store
object replaces that one store. `false` removes it. The return type tracks the
resulting keys, and runtime validation rejects unknown keys from untyped
JavaScript.

Cross-store consistency remains your responsibility. If `runs` and
`interrupts` live in separate systems, design for partial failure and retries.

## Choose a backend

- [Cloudflare](./cloudflare): D1 structured state, R2 artifacts/blobs, Durable
  Object locks.
- [Drizzle](./drizzle): SQLite-family Drizzle databases and a Node SQLite
  convenience factory.
- [Prisma](./prisma): provider-neutral Prisma models with your migrated client.
- [Custom Stores](./custom-stores): implement only the store contracts you
  need.

Then choose a journey: [Chat](./chat-persistence),
[Generation](./generation-persistence), [Sandbox](./sandbox-persistence), or
[MCP](./mcp-persistence).
