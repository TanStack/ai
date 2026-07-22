---
title: Overview
id: memory-overview
order: 1
description: "Persist and recall context across turns and sessions in TanStack AI — memoryMiddleware recalls relevant memory into the prompt through a pluggable recall/save adapter, then deferred-saves each finished turn."
keywords:
  - tanstack ai
  - memory
  - long-term memory
  - retrieval
  - persistence
  - middleware
  - rag
  - personalization
---

`memoryMiddleware` plugs server-side memory into a `chat()` run. Before the model
runs it **recalls** relevant memory from a pluggable adapter into the system prompt;
after the run finishes it **saves** the turn — asynchronously, so streaming is never
blocked. It's the right tool when you need recall **across turns or across sessions**,
not for keeping recent messages in the same request.

Everything lives in `@tanstack/ai-memory`: the middleware, the adapter contract, and
the built-in and vendor adapters.

> **Want a copy-paste setup?** See the [Quickstart](./quickstart). **Building an
> adapter for a backend that isn't shipped?** See the [Custom Adapter](./custom-adapter) guide.

## When to reach for it

| Need | Use this |
|------|----------|
| "Remember what the user told me last week" | Memory middleware + a persistent adapter |
| "Each user has their own context" | Memory middleware with a scoped adapter |
| "Use a hosted memory service (mem0, Honcho, Hindsight)" | The matching vendor adapter |
| Keep the last N turns in the same request | Just pass them in `messages` — memory is overkill |

## The contract: `recall` + `save`

A memory adapter has one identifier and two verbs. Everything else — extraction,
ranking, rendering, storage — is the adapter's job. The middleware never inspects
records.

| Member | Purpose |
|--------|---------|
| `id` | Stable identifier used in logs and devtools. |
| `recall(scope, query)` | Return what's relevant to `query` within `scope`: a rendered `systemPrompt`, optional `fragments`, and optional LLM `tools` + `toolGuidance`. |
| `save(scope, turn)` | Persist a completed `{ user, assistant }` turn. Extraction happens here. Returns one `SaveReceipt` per underlying write. |
| `inspect(scope)?` | Optional — a full snapshot for a devtools panel. |
| `listFacts(scope)?` | Optional — a flat fact list for a devtools panel. |

```ts
// The MemoryAdapter contract, from `@tanstack/ai-memory`:
import type { MemoryAdapter } from '@tanstack/ai-memory'
```

Built-in adapters (each a tree-shakeable subpath):

```ts
import { inMemory } from '@tanstack/ai-memory/in-memory'
import { redis } from '@tanstack/ai-memory/redis'
```

Vendor adapters:

```ts
import { hindsight } from '@tanstack/ai-memory/hindsight'
import { mem0 } from '@tanstack/ai-memory/mem0'
import { honcho } from '@tanstack/ai-memory/honcho'
```

## Scope and security

`MemoryScope` is the isolation boundary — session-centric, with an optional durable
user id:

```ts
// The MemoryScope type, from `@tanstack/ai-memory`:
type MemoryScope = {
  sessionId: string
  userId?: string
}
```

**Always derive scope server-side from trusted state.** Accepting `userId` from the
request body is how one user reads another user's memory. The function form on `scope`
runs per request and only sees what your server attached to the chat context:

```ts ignore
// ignore: `adapter` and `getSession` are application-defined — this shows the
// server-side scope-derivation pattern.
memoryMiddleware({
  adapter,
  scope: (ctx) => {
    const session = getSession(ctx) // your server-validated session
    return { sessionId: session.threadId, userId: session.userId }
  },
})
```

## Recall flow (read side)

Runs once per `chat()` invocation, during the `init` phase:

1. `adapter.recall({ sessionId, userId }, userText)` — the adapter decides how to
   rank (lexical, semantic, hybrid, or vendor-native).
2. The middleware injects `result.toolGuidance` and `result.systemPrompt` into the
   system prompts, and merges `result.tools` into the run's tools.

Set `role: 'save-only'` to skip recall entirely (persist without reading).

## Save flow (write side)

Deferred via `ctx.defer` — runs after the stream finishes and never blocks the response:

1. The middleware captures the `{ user, assistant }` turn.
2. `adapter.save(scope, turn)` persists it. Extraction (turn → stored facts) is the
   adapter's responsibility — the built-in adapters store the raw turn by default and
   accept an `extract` option; vendors extract server-side.

## `memoryMiddleware` options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `adapter` | `MemoryAdapter` | — (required) | The backend to `recall` from / `save` to. |
| `scope` | `MemoryScope \| (ctx) => MemoryScope` | — (required) | Isolation scope, static or derived per request. |
| `role` | `'recall+save' \| 'save-only'` | `'recall+save'` | `'save-only'` persists turns without recalling/injecting. |
| `onRecall` | `({ scope, query, result }) => void` | — | App telemetry after each `recall`. |
| `onSave` | `({ scope, turn, receipts }) => void` | — | App telemetry after each deferred `save`. |

Every option in one place:

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const mw = memoryMiddleware({
  adapter: inMemory(),
  // Function form derives scope per request. `ctx.threadId` is the stable
  // per-conversation id; add `userId` from your server-validated session.
  scope: (ctx) => ({ sessionId: ctx.threadId }),
  // Static form is fine for fixtures: scope: { sessionId: 'demo', userId: 'alice' }
  role: 'recall+save', // or 'save-only' to persist without injecting
  onRecall: ({ query, result }) => {
    console.log('recalled', result.fragments?.length ?? 0, 'hits for', query)
  },
  onSave: ({ receipts }) => {
    console.log('saved', receipts.filter((r) => r.ok).length, 'records')
  },
})
```

See the [Adapters](./adapters) page for every adapter's own options.

## Stacking adapters

`composeMemoryMiddleware` runs several memory middlewares as one — e.g. save to two
backends, or recall from one while saving to another:

```ts ignore
// ignore: `scope` and `client` come from your app.
import {
  memoryMiddleware,
  composeMemoryMiddleware,
} from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'
import { redis } from '@tanstack/ai-memory/redis'

const memory = composeMemoryMiddleware([
  memoryMiddleware({ adapter: redis({ redis: client }), scope }),
  // second adapter only writes (no recall injection)
  memoryMiddleware({ adapter: inMemory(), scope, role: 'save-only' }),
])
```

## Devtools events

The middleware emits five events on `aiEventClient` (from `@tanstack/ai-event-client`):

| Event | When |
|-------|------|
| `memory:retrieve:started` | Recall begins |
| `memory:retrieve:completed` | Recall returns (fragment count, whether tools were injected) |
| `memory:persist:started` | A deferred save begins |
| `memory:persist:completed` | A save completes (receipt count) |
| `memory:error` | A `recall` or `save` threw (`phase: 'recall' \| 'save'`) |

For app telemetry that shouldn't depend on devtools, use the `onRecall` / `onSave`
callbacks on `memoryMiddleware`.

## Failure modes

Memory failures are **non-fatal**: a throwing `recall` or `save` emits `memory:error`
and the chat run continues with degraded memory. Streaming is never blocked, and a
failed save never fails the turn.

## Next steps

- [Quickstart](./quickstart) — wire `memoryMiddleware` into a real `chat()` call
- [Adapters](./adapters) — every adapter's options, with an example of each
- [Custom Adapter](./custom-adapter) — implement `recall`/`save` for an unsupported backend
- [Middleware](../advanced/middleware) — the underlying `chat()` middleware lifecycle
