---
name: tanstack-ai-memory-redis
description: Use when wiring redisMemoryAdapter from @tanstack/ai-memory in production — covers client setup (node-redis or ioredis), env wiring, storage model, plain-Redis vs RediSearch tradeoffs, and troubleshooting connection / serialization issues.
---

# Redis Memory Adapter

Production-grade `MemoryAdapter` backed by plain Redis (no vector index required).

## Setup

```bash
pnpm add redis  # or: pnpm add ioredis
```

Pass the connected client into the adapter:

```ts
import { createClient } from 'redis'
import { memoryMiddleware } from '@tanstack/ai/memory'
import { redisMemoryAdapter } from '@tanstack/ai-memory'

const redis = createClient({ url: process.env.REDIS_URL })
await redis.connect()

const memory = redisMemoryAdapter({ redis, prefix: 'myapp:memory' })

memoryMiddleware({ adapter: memory, scope })
```

The adapter accepts any client implementing the `RedisLike` shape (a small subset: `get`, `set`, `del`, `sadd`, `srem`, `smembers`, `mget`). Both `redis` (node-redis v4+) and `ioredis` work.

## Storage model

```
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
- **Malformed JSON rows:** if the JSON in `{prefix}:record:{id}` is malformed (older schema, third-party writer), the adapter silently skips the row. There is no exception you can catch — the only observable signal is a one-time `console.warn` per process. To detect drift, periodically run `list(scope)` and compare counts to your application's source of truth, then clean up the offending rows via `clear(scope)` or by deleting the underlying record keys directly.
