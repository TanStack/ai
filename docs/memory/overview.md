---
title: Overview
id: memory-overview
order: 1
description: "Give a TanStack AI chat() call memory across turns and sessions. memoryMiddleware recalls relevant memory into the prompt before the model runs, then saves each finished turn through a pluggable adapter."
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

Your assistant forgets everything the moment a session ends. A user tells it their name
this week; next week it asks again. `memoryMiddleware` fixes that. It gives a `chat()`
run memory that survives across turns and across sessions.

It works in two moves. Before the model runs, it **recalls** relevant memory from a
pluggable adapter and adds it to the system prompt. After the run finishes, it **saves**
the turn. The save is deferred, so it never blocks streaming.

Reach for it when you need recall across turns or sessions. To keep the last few messages
of the same request, just pass them in `messages`. Memory is overkill for that.

Everything lives in `@tanstack/ai-memory`: the middleware, the adapter contract, and the
built-in and vendor adapters.

> Want a copy-paste setup? See the [Quickstart](./quickstart). Building an adapter for a
> backend that isn't shipped? See the [Custom Adapter](./custom-adapter) guide.

## When to reach for it

| Need | Use this |
|------|----------|
| "Remember what the user told me last week" | Memory middleware with a persistent adapter |
| "Each user has their own context" | Memory middleware with a scoped adapter |
| "Use a hosted memory service (mem0, Honcho, Hindsight)" | The matching vendor adapter |
| Keep the last few turns in the same request | Pass them in `messages`, skip memory |

## The contract: recall and save

A memory adapter has one identifier and two verbs. Extraction, ranking, rendering, and
storage are all the adapter's job. The middleware never looks inside a record.

| Member | Purpose |
|--------|---------|
| `id` | Stable identifier used in logs and devtools. |
| `recall(scope, query)` | Return what's relevant to `query` within `scope`: a rendered `systemPrompt`, optional `fragments`, and optional LLM `tools` plus `toolGuidance`. |
| `save(scope, turn)` | Persist a finished `{ user, assistant }` turn. Extraction happens here. Returns one `SaveReceipt` per write. |
| `inspect(scope)?` | Optional. A full snapshot for a devtools panel. |
| `listFacts(scope)?` | Optional. A flat fact list for a devtools panel. |

```ts
// The MemoryAdapter contract, from `@tanstack/ai-memory`:
import type { MemoryAdapter } from '@tanstack/ai-memory'
```

Built-in adapters, each a tree-shakeable subpath:

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

See [Adapters](./adapters) for every adapter and its options.

## How a turn flows

1. **Recall** runs before the model, during the run's `init` phase.
   `adapter.recall(scope, userText)` returns memory, and the middleware adds the
   `systemPrompt`, `toolGuidance`, and any `tools` to the run.
2. **Save** runs after the stream finishes, deferred through `ctx.defer` so it never
   blocks the response. The middleware hands the `{ user, assistant }` turn to
   `adapter.save(scope, turn)`.

To add telemetry, watch memory in devtools, persist without recalling, or handle
failures, see [Operating memory](./operating).

## Scope and security

`MemoryScope` is the isolation boundary. It is session-centric, with an optional durable
user id:

```ts
// The MemoryScope type, from `@tanstack/ai-memory`:
type MemoryScope = {
  sessionId: string
  userId?: string
}
```

Always derive scope on the server from trusted state. Accepting `userId` from the request
body is how one user reads another user's memory. The function form of `scope` runs per
request and only sees what your server attached to the chat context:

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import type { MemoryAdapter } from '@tanstack/ai-memory'

declare const adapter: MemoryAdapter
declare function getSession(ctx: unknown): { threadId: string; userId: string }

memoryMiddleware({
  adapter,
  scope: (ctx) => {
    const session = getSession(ctx) // your server-validated session
    return { sessionId: session.threadId, userId: session.userId }
  },
})
```

## Next steps

- [Quickstart](./quickstart): wire `memoryMiddleware` into a real `chat()` call
- [Adapters](./adapters): every adapter's options, with an example of each
- [Custom Adapter](./custom-adapter): implement `recall`/`save` for a backend that isn't shipped
- [Operating memory](./operating): options, telemetry, devtools events, and failure behavior
