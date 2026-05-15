---
name: tanstack-ai-memory-in-memory
description: Use when wiring inMemoryMemoryAdapter from @tanstack/ai-memory — explains setup, when to pick it (dev/tests/single-process demos), and what NOT to use it for (anything multi-process or persistent).
---

# In-Memory Memory Adapter

Zero-dependency `MemoryAdapter` backed by a `Map`. Records vanish on process restart.

## When to use it

- Local development.
- Vitest / Playwright tests.
- Single-process demos where users don't need persistence.

## When NOT to use it

- Production multi-process deployments — every worker has its own Map; users get inconsistent memory.
- Anything that needs survivability across restarts.

For production, use `redisMemoryAdapter` (see `tanstack-ai-memory-redis` skill).

## Setup

```ts
import { memoryMiddleware } from '@tanstack/ai/memory'
import { inMemoryMemoryAdapter } from '@tanstack/ai-memory'

const memory = inMemoryMemoryAdapter()

memoryMiddleware({ adapter: memory, scope })
```

That's the entire setup — there are no options and no peer dependencies.

## Capacity

The adapter holds records in a single `Map`. Don't load > ~100k records or search latency degrades (it scans every record per query). For larger workloads, switch to Redis.

## Expiry

`MemoryRecord.expiresAt` is honored — expired records are filtered from `search`/`list`/`get` and opportunistically swept on `add`.
