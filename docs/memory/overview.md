---
title: Overview
id: memory-overview
order: 1
description: "Cross-session chat memory: memoryMiddleware recalls into the prompt, then deferred-saves each turn."
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

# Memory overview

If you need recall across turns/sessions → `memoryMiddleware` + an adapter in `@tanstack/ai-memory`.

If you only need the last few messages of **this** request → pass them in `messages` (skip memory).

Copy-paste setup: [Quickstart](./quickstart). Custom backend: [Custom Adapter](./custom-adapter).

## When to use it

| Need | Use |
|------|-----|
| Remember last week | Memory + persistent adapter |
| Per-user context | Memory + scoped adapter |
| Hosted memory (mem0, Honcho, Hindsight) | Matching vendor adapter |
| Same-request history only | `messages` only |

## Contract: `recall` + `save`

Adapter owns extraction, ranking, rendering, storage. Middleware never inspects records.

| Member | Purpose |
|--------|---------|
| `id` | Stable id for logs/devtools |
| `recall(scope, query)` | Relevant memory: `systemPrompt`, optional `fragments` / `tools` / `toolGuidance` |
| `save(scope, turn)` | Persist `{ user, assistant }`; return `SaveReceipt[]` |
| `inspect?` / `listFacts?` | Optional devtools |

```ts
import type { MemoryAdapter } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'
import { redis } from '@tanstack/ai-memory/redis'
import { hindsight } from '@tanstack/ai-memory/hindsight'
import { mem0 } from '@tanstack/ai-memory/mem0'
import { honcho } from '@tanstack/ai-memory/honcho'
```

All options: [Adapters](./adapters).

## Turn flow

1. **Recall** during `init` — inject `systemPrompt`, tools, guidance
2. **Save** after stream ends via `ctx.defer` — never blocks streaming

Telemetry / save-only / failures: [Operating memory](./operating).

## Scope and security

`MemoryScope` aliases shared `Scope` from `@tanstack/ai`:

```ts
type MemoryScope = {
  threadId: string // required
  userId?: string
  tenantId?: string
  namespace?: string // reserved
}
```

Resolve scope **server-side** from trusted session. Never take `userId`/`tenantId` from the request body alone.

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import type { MemoryAdapter } from '@tanstack/ai-memory'

declare const adapter: MemoryAdapter
declare function getSession(ctx: unknown): { threadId: string; userId: string }

memoryMiddleware({
  adapter,
  scope: (ctx) => {
    const session = getSession(ctx)
    return { threadId: session.threadId, userId: session.userId }
  },
})
```

## Next

1. [Quickstart](./quickstart) — wire into `chat()`
2. [Adapters](./adapters) — options per adapter
3. [Custom Adapter](./custom-adapter) — your backend
4. [Operating](./operating) — telemetry and failures
