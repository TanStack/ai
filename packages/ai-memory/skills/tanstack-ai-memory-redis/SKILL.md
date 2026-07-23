---
name: tanstack-ai-memory-redis
description: Use when wiring redis() from @tanstack/ai-memory/redis in production — covers client setup (ioredis or node-redis via fromNodeRedis), the storage model, client-side ranking limits, and troubleshooting.
---

# Redis Memory Adapter

Production-grade `recall`/`save` adapter backed by plain Redis (no vector index
required). Ranks client-side (lexical + optional cosine + recency + importance).

## Setup

Bring your own Redis client. `ioredis` wires in directly; `redis` (node-redis v4+) needs
a small wrapper.

### Option A: `ioredis`

```ts
import Redis from 'ioredis'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { redis } from '@tanstack/ai-memory/redis'

const client = new Redis(process.env.REDIS_URL)
const memory = redis({ redis: client, prefix: 'myapp:memory' })

memoryMiddleware({ adapter: memory, scope })
```

### Option B: `redis` (node-redis v4+)

```ts
import { createClient } from 'redis'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { redis, fromNodeRedis } from '@tanstack/ai-memory/redis'

const client = createClient({ url: process.env.REDIS_URL })
await client.connect()

const memory = redis({
  redis: fromNodeRedis(client),
  prefix: 'myapp:memory',
})

memoryMiddleware({ adapter: memory, scope })
```

node-redis exposes a camelCase API (`sAdd`, `mGet`); `fromNodeRedis` translates it
to the lowercase `RedisLike` shape. Passing a raw node-redis client without the wrapper
throws `client.sadd is not a function`.

`redis()` accepts the same `topK` / `minScore` / `kinds` / `embedder` / `extract` options
as `inMemory()`.

## Storage model

```text
{prefix}:record:{id}                       -> JSON record
{prefix}:index:{userId or _}:{sessionId}   -> Set<id>
```

`save` writes the record and adds it to the scope's index set; `recall` loads the set,
scores, and renders. Scope values are escaped so a `:` in a `userId`/`sessionId` can't
collide two scopes.

## Ranking limits

Ranking is client-side: `recall` loads every record for the scope into Node and scores
it. Fine up to ~10k records per scope. Beyond that, write a vector-index-aware adapter
against the same `recall`/`save` contract.

## Troubleshooting

- **Records not visible across processes:** ensure every process uses the same
  `REDIS_URL` and `prefix`.
- **Malformed JSON rows:** a row whose JSON won't parse is skipped on read and **left in
  place** (never deleted) — the signal is a one-time `console.warn` per bad id. Fix or
  delete the offending `{prefix}:record:{id}` key to remediate.
