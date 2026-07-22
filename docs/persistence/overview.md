---
title: Persistence Overview
id: overview
---

# Persistence Overview

Persistence stores authoritative state — messages, runs, pending interrupts,
metadata, and locks. It is configured with persistence middleware.

Reconnecting to an in-flight streaming response is a separate transport-layer
feature ([Resumable Streams](../resumable-streams/overview)), not part of this
middleware. Persisting state does not automatically make a live response
replayable, and a replayable response does not replace authoritative
application state.

## Store contract

An `AIPersistence` object can expose these stores:

| Store | Purpose |
| --- | --- |
| `messages` | Authoritative model-message history per thread. |
| `runs` | Run status, timing, errors, and usage. |
| `interrupts` | Pending, resolved, or cancelled human/tool waits. |
| `metadata` | App and integration key/value state. |
| `locks` | Cross-worker coordination. |

Middleware activates behavior from the stores that are present; there is no
separate enablement list. When chat persistence sees an `interrupts` store it
also requires a `runs` store.

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
the second argument. Any `AIPersistence` can be the base — here a
`memoryPersistence()` base keeps the example self-contained, and two
application-owned stores are routed elsewhere:

```ts
import {
  composePersistence,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import { appInterrupts, appRuns } from './stores'

const base = memoryPersistence()

const persistence = composePersistence(base, {
  overrides: {
    interrupts: appInterrupts,
    runs: appRuns,
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

- [Cloudflare](./cloudflare): D1 structured state and Durable Object locks.
- [Drizzle](./drizzle): SQLite-family Drizzle databases and a Node SQLite
  convenience factory.
- [Prisma](./prisma): provider-neutral Prisma models with your migrated client.
- [Custom Stores](./custom-stores): implement only the store contracts you
  need.

For the shared mechanics behind every backend — the middleware lifecycle and
composition semantics — see [Persistence Internals](./internals).
