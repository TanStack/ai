---
name: tanstack-ai-memory-in-memory
description: Use when wiring inMemory() from @tanstack/ai-memory/in-memory — explains setup, options (embedder, extract, topK/minScore), when to pick it (dev/tests/single-process demos), and what NOT to use it for (multi-process or persistent).
---

# In-Memory Memory Adapter

Zero-dependency `recall`/`save` adapter backed by a `Map`. Records vanish on process
restart.

## When to use it

- Local development.
- Vitest / Playwright tests.
- Single-process demos where users don't need persistence.

## When NOT to use it

- Production multi-process deployments — every worker has its own `Map`; users get
  inconsistent memory.
- Anything that needs survival across restarts.

For production, use `redis()` (see the `tanstack-ai-memory-redis` skill).

## Setup

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const memory = inMemory()

memoryMiddleware({ adapter: memory, scope })
```

## Options

`inMemory(options?)` accepts:

- `topK` (default 6), `minScore` (default 0.15), `kinds` — recall tuning.
- `embedder: { embed(text): Promise<number[]> }` — enable semantic scoring (both
  `recall` and `save` embed through it).
- `extract(turn, scope)` — return derived facts to persist alongside the raw turn
  (e.g. call an LLM to pull out preferences). Without it, `save` stores the raw
  user/assistant messages and `recall` scores them lexically + by recency.
- `render(hits)` — replace the built-in prompt renderer.

## Capacity

The adapter scans every record in a scope per `recall`. Fine up to ~100k records; beyond
that, switch to Redis.
