---
title: Quickstart
id: memory-quickstart
order: 2
description: "Add cross-session memory to a TanStack AI chat() call — install the package, pick a recall/save adapter, wire memoryMiddleware, and derive scope server-side."
keywords:
  - tanstack ai
  - memory
  - quickstart
  - in-memory adapter
  - redis adapter
  - chat middleware
---

You have a working `chat()` call and you want it to remember context across turns or
sessions. By the end of this guide, `memoryMiddleware` will recall relevant memory into
the prompt and save each finished turn through a real adapter, scoped safely from your
server-validated session.

> **Want the full contract first?** See the [Overview](./overview).

## Step 1 — Install the package

```bash
pnpm add @tanstack/ai-memory
```

`@tanstack/ai-memory` ships `memoryMiddleware`, the `MemoryAdapter` contract, and the
built-in and vendor adapters (each on its own subpath).

## Step 2 — Pick an adapter

> **In-memory** — `inMemory()` is zero-dependency and stores records in a `Map`. Use
> it for local development, tests, and single-process demos. Records vanish on restart.
>
> **Redis** — `redis({ redis })` persists across restarts and shares state across
> processes. Bring your own client (`ioredis`, or `redis` via `nodeRedisAsRedisLike`).
>
> **Vendors** — `hindsight()`, `mem0()`, `honcho()` delegate to a hosted memory service.

Custom adapters implement the `recall`/`save` contract — see [Custom Adapter](./custom-adapter).

## Step 3 — Wire `memoryMiddleware` into `chat()`

Start with the in-memory adapter — the fastest path to a working setup:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const memory = inMemory()

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Hello' }],
  middleware: [
    memoryMiddleware({
      adapter: memory,
      scope: { sessionId: 'demo-thread', userId: 'alice' },
    }),
  ],
})
```

Each turn, the middleware recalls relevant memory into the system prompt (lexical
scoring by default), then deferred-saves the user + assistant turn after the stream
finishes.

When you're ready to ship, swap the adapter and keep everything else the same:

```ts ignore
// ignore: ioredis's `Redis` type is structurally broader than the adapter's minimal
// `RedisLike` contract, so it does not nominally match here — but it works at runtime,
// which is why the adapter accepts a BYO ioredis client directly. `scope` is from Step 5.
import Redis from 'ioredis'
import { redis } from '@tanstack/ai-memory/redis'

const client = new Redis(process.env.REDIS_URL)
const memory = redis({ redis: client })

memoryMiddleware({ adapter: memory, scope })
```

> **Using a hosted service?** Swap `inMemory()` for `hindsight({ user })`,
> `mem0({ user })`, or `honcho({ user })`. The middleware wiring is identical — the
> adapter maps `recall`/`save` onto the vendor API.

## Step 4 — Semantic scoring (optional)

The built-in adapters score lexically by default. Pass an `embedder` for semantic
recall when scopes grow large or queries don't share keywords with stored text:

```ts
import OpenAI from 'openai'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const openai = new OpenAI()

const memory = inMemory({
  embedder: {
    async embed(text) {
      const result = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      })
      const embedding = result.data[0]?.embedding
      if (!embedding) throw new Error('embedding request returned no vector')
      return embedding
    },
  },
})
```

## Step 5 — Derive scope server-side

`scope` is the isolation boundary. Static scopes are fine for fixtures, but in any real
app derive scope per request from server-validated session data — never from the
request body.

```ts ignore
// ignore: `getSession` and `memory` come from earlier steps / your auth layer — this
// shows the pattern rather than type-checking against a concrete context type.
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai-memory'

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  context: { session }, // attached by your auth middleware, not from req.body
  middleware: [
    memoryMiddleware({
      adapter: memory,
      scope: (ctx) => {
        const session = getSession(ctx)
        return { sessionId: session.threadId, userId: session.userId }
      },
    }),
  ],
})
```

On the client, nothing changes — `useChat` (or your connection adapter) consumes the
stream exactly as before. Memory is entirely server-side.

## Where to go next

- [Overview](./overview) — the `recall`/`save` contract, scope, `memoryMiddleware` options
- [Adapters](./adapters) — every adapter's options, with an example of each
- [Custom Adapter](./custom-adapter) — implement `recall`/`save` for a backend not shipped
