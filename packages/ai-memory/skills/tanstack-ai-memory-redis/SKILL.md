---
name: tanstack-ai-memory-redis
description: Use when wiring redisMemoryAdapter from @tanstack/ai-memory in production — covers client setup (node-redis or ioredis), env wiring, storage model, plain-Redis vs RediSearch tradeoffs, and troubleshooting connection / serialization issues.
---

# Redis Memory Adapter

Production-grade `MemoryAdapter` backed by plain Redis (no vector index required).

## Setup

Pick a Redis client and wire it in. Both `ioredis` and `redis` (node-redis v4+) are supported, but they expose different method-name styles, so the wiring differs.

### Option A: `ioredis` (direct wiring)

```bash
pnpm add ioredis
```

```ts
import Redis from 'ioredis'
import { memoryMiddleware } from '@tanstack/ai/memory'
import { redisMemoryAdapter } from '@tanstack/ai-memory'

const redis = new Redis(process.env.REDIS_URL!)
const memory = redisMemoryAdapter({ redis, prefix: 'myapp:memory' })

memoryMiddleware({ adapter: memory, scope })
```

`ioredis` exposes lowercase method names (`sadd`, `mget`, `scan(cursor, 'MATCH', ...)`) directly, which matches the adapter's `RedisLike` contract — no wrapper needed.

### Option B: `redis` (node-redis v4+) — wrap with `nodeRedisAsRedisLike`

```bash
pnpm add redis
```

```ts
import { createClient } from 'redis'
import { memoryMiddleware } from '@tanstack/ai/memory'
import { redisMemoryAdapter, nodeRedisAsRedisLike } from '@tanstack/ai-memory'

const client = createClient({ url: process.env.REDIS_URL })
await client.connect()

const memory = redisMemoryAdapter({
  redis: nodeRedisAsRedisLike(client),
  prefix: 'myapp:memory',
})

memoryMiddleware({ adapter: memory, scope })
```

node-redis v4+ uses a camelCase API by default (`sAdd`, `mGet`, `scan(cursor, { MATCH, COUNT })`); `nodeRedisAsRedisLike` translates between the two shapes. Passing a raw node-redis v4+ client without the wrapper will throw `client.sadd is not a function` at runtime.

(You can also use `createClient({ legacyMode: true })` and skip the wrapper, but the wrapper is the cleaner choice for new code — `legacyMode` is deprecated upstream.)

### `RedisLike` shape

The adapter accepts any client implementing the `RedisLike` shape: `get`, `set`, `del`, `sadd`, `srem`, `smembers`, `mget`, `scan` (ioredis-style variadic). Bring-your-own clients (e.g. Upstash, hand-rolled mocks) only need to implement that subset.

## Storage model

```text
{prefix}:record:{memoryId}  → JSON-stringified MemoryRecord
{prefix}:index:{tenantId}:{userId}:{sessionId}:{threadId}:{namespace} → Set<memoryId>
```

Missing scope keys are encoded as `_`. Updates rewrite the JSON; deletes remove from both the record key and the scope set.

## Plain Redis vs RediSearch / RedisVL

This adapter performs ranking **client-side**: it loads every record for a scope into Node and computes lexical + cosine + recency + importance scores. That's fine up to ~10k records per scope. Beyond that, latency degrades.

For larger scopes use a vector-index-aware adapter. None ships in v1; write one against the same `MemoryAdapter` contract or wait for a future `redisVectorMemoryAdapter`.

## Troubleshooting

- **Records not visible across processes:** check that all processes use the same `REDIS_URL` and `prefix`. The adapter does not auto-namespace by host.
- **Records expiring unexpectedly:** check whether your records carry `expiresAt`; the adapter sweeps these on read. If you do not want expiry, leave `expiresAt` undefined.
- **Malformed JSON rows:** if the JSON in `{prefix}:record:{id}` is malformed (older schema, third-party writer, truncated/partial write), the adapter skips the row for that read and **leaves it in place** — it is never deleted, because a parse failure is not proof the data is unrecoverable. There is no exception you can catch; the observable signal is a `console.warn` emitted once per distinct malformed id (bounded, so a large corrupted store cannot spam the console). To detect drift, periodically run `list(scope)` and compare counts to your application's source of truth; to remediate, fix or delete the offending record keys directly (or `clear(scope)` the whole scope).
