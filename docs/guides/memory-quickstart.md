---
title: Memory Quickstart
id: memory-quickstart
order: 1
description: "Add cross-session memory to a TanStack AI chat() call in five steps — install the package, pick an adapter, wire memoryMiddleware, optionally add an embedder, and derive scope server-side."
keywords:
  - tanstack ai
  - memory
  - quickstart
  - in-memory adapter
  - redis adapter
  - chat middleware
---

You have a working `chat()` call and you want it to remember context across turns or sessions. By the end of this guide, you'll have `memoryMiddleware` retrieving relevant records into the prompt and persisting new turns through a real adapter, with scope derived safely from your server-validated session.

> **Want the full contract first?** See the [Memory Middleware](../middlewares/memory) concept page for the adapter interface, hooks, and devtools events.

## Step 1 — Install the package

`@tanstack/ai` is already installed. Add the adapter package:

```bash
pnpm add @tanstack/ai-memory
```

`@tanstack/ai-memory` exports the built-in `inMemoryMemoryAdapter` and `redisMemoryAdapter`. The middleware itself (`memoryMiddleware`) and the type contract (`MemoryAdapter`, `MemoryScope`, `MemoryRecord`, ...) live on the `@tanstack/ai/memory` subpath of the core package — no extra install required for those.

## Step 2 — Pick an adapter

> **In-memory** — `inMemoryMemoryAdapter()` is zero-dependency and stores records in a `Map`. Use it for local development, Vitest / Playwright tests, and single-process demos. Records vanish on process restart.

> **Redis** — `redisMemoryAdapter({ redis })` persists across restarts and shares state across processes. Use it for production. Bring your own Redis client (`ioredis`, `redis`, Upstash, ...) — the adapter is BYO-client.

Custom adapters implement the `MemoryAdapter` interface from `@tanstack/ai/memory`.

## Step 3 — Wire `memoryMiddleware` into `chat()`

Start with the in-memory adapter — it's the fastest path to a working setup:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai/memory'
import { inMemoryMemoryAdapter } from '@tanstack/ai-memory'

const memory = inMemoryMemoryAdapter()

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  middleware: [
    memoryMiddleware({
      adapter: memory,
      scope: { tenantId: 'demo', userId: 'alice' },
    }),
  ],
})
```

That's a working setup. Each turn, the middleware retrieves relevant records into the system prompt (lexical search by default), then deferred-persists the user message and the assistant response after the stream finishes.

When you're ready to ship, swap the adapter and keep everything else the same:

```ts
import Redis from 'ioredis'
import { redisMemoryAdapter } from '@tanstack/ai-memory'

const redis = new Redis(process.env.REDIS_URL!)
const memory = redisMemoryAdapter({ redis })

memoryMiddleware({ adapter: memory, scope })
```

## Step 4 — Add an embedder (optional)

The middleware accepts an `embedder` for semantic search. **Add one when you need it; skip it when you don't:**

- **Skip** if your scopes are small (a few hundred records per user) — lexical scoring handles this fine and there is no embedding cost or latency.
- **Add** when scopes grow large or queries don't share keywords with stored records, and your adapter supports vector search (Redis with vector ops, hosted vector DBs, custom adapters).

```ts
import { memoryMiddleware } from '@tanstack/ai/memory'

memoryMiddleware({
  adapter: memory,
  scope,
  embedder: {
    async embed(text) {
      // Use any embedding model — OpenAI, Cohere, a local model, etc.
      const result = await embeddings.create({ input: text })
      return result.data[0].embedding
    },
  },
})
```

The embedder is invoked on the retrieval path (to embed the query) and may be invoked again on the persist path (to embed assistant text or extracted facts). Implementations should be idempotent.

## Step 5 — Derive scope server-side

`scope` is the isolation boundary. Static scopes are fine for fixtures, but in any real multi-tenant app you must derive scope per request from server-validated session data — never from the request body.

```ts
import { chat } from '@tanstack/ai'
import { memoryMiddleware } from '@tanstack/ai/memory'

type AppCtx = { session: { tenantId: string; userId: string; activeThreadId: string } }

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  context: { session }, // attached by your auth middleware, not from req.body
  middleware: [
    memoryMiddleware({
      adapter: memory,
      scope: (ctx) => {
        const { session } = ctx.context as AppCtx
        return {
          tenantId: session.tenantId,
          userId: session.userId,
          threadId: session.activeThreadId,
        }
      },
    }),
  ],
})
```

If you accept `userId` or `tenantId` from the client, one user can read or overwrite another user's memory. The function form on `scope` is the safer default — it executes per request and only sees what your server attached to the chat context.

## Where to go next

- [Memory Middleware](../middlewares/memory) — adapter contract, hooks reference, devtools events, failure modes
- [In-memory adapter skill](https://github.com/TanStack/ai) — `tanstack-ai-memory-in-memory` (when to use, capacity limits)
- [Redis adapter skill](https://github.com/TanStack/ai) — `tanstack-ai-memory-redis` (vector search, key layout, ops)
