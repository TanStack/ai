---
title: Adapters
id: memory-adapters
order: 3
description: "Built-in and vendor memory adapters: inMemory, redis, hindsight, mem0, honcho — options and examples."
keywords:
  - tanstack ai
  - memory
  - adapters
  - inMemory
  - redis
  - hindsight
  - mem0
  - honcho
  - options
---

# Memory adapters

If you need a ready adapter → pick one below. All implement the same `recall`/`save` contract for `memoryMiddleware`.

- [Common options](#common-options) (`inMemory`, `redis`)
- [`inMemory()`](#inmemory) · [`redis()`](#redis) · [`hindsight()`](#hindsight) · [`mem0()`](#mem0) · [`honcho()`](#honcho)

## Common options

Shared by `inMemory()` and `redis()`:

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `topK` | `number` | `6` | Max recall hits |
| `minScore` | `number` | `0.15` | Drop weak hits |
| `kinds` | `Array<MemoryKind>` | all | Filter kinds |
| `embedder` | `{ embed(text) }` | none | Semantic scoring |
| `extract` | `(turn, scope) => ExtractedFact[]` | none | Derived facts on save |
| `render` | `(hits) => string` | built-in | Prompt renderer |

```ts
import { inMemory } from '@tanstack/ai-memory/in-memory'

declare function embedText(text: string): Promise<Array<number>>

const memory = inMemory({
  topK: 8,
  minScore: 0.2,
  kinds: ['message', 'fact', 'preference'],
  embedder: { embed: embedText },
  extract: (turn) => [
    { text: `User said: ${turn.user}`, kind: 'fact', importance: 0.8 },
  ],
  render: (hits) =>
    `What I remember:\n${hits.map((h) => `- ${h.record.text}`).join('\n')}`,
})
```

`extract` returns `ExtractedFact[]` or `undefined` (no-op). Without `embedder`, scoring is lexical + recency only.

## `inMemory()`

Zero-dep `Map` store. Dev/tests/demos only.

```ts
import { inMemory } from '@tanstack/ai-memory/in-memory'

const memory = inMemory()
```

## `redis()`

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `redis` | `RedisLike` | required | Client |
| `prefix` | `string` | `'tanstack-ai:memory'` | Key namespace |

Plus [common options](#common-options).

```ts
import Redis from 'ioredis'
import { redis } from '@tanstack/ai-memory/redis'

const memory = redis({
  redis: new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'),
  prefix: 'myapp:memory',
  topK: 8,
  minScore: 0.2,
})
```

**node-redis** (camelCase API) → wrap with `fromNodeRedis`:

```ts
import { createClient } from 'redis'
import { redis, fromNodeRedis } from '@tanstack/ai-memory/redis'

const client = createClient({ url: process.env.REDIS_URL })
await client.connect()

const memory = redis({ redis: fromNodeRedis(client) })
```

Index keys: `{prefix}:index:{tenantId|_}:{userId|_}:{threadId}`. Missing dims become `_` — always pass the same dims you wrote with.

## Scope fields per adapter

| Adapter | `threadId` | `userId` | `tenantId` | `namespace` |
|---------|------------|----------|------------|-------------|
| `inMemory()` | yes | yes | yes | ignored |
| `redis()` | yes | yes | yes | ignored |
| `hindsight()` | bank id | bank / `user` | bank prefix | ignored |
| `mem0()` | `run_id` | `user_id` / `user` | **no** | ignored |
| `honcho()` | session | peer / `user` | session/peer prefix | ignored |

Optional dims are exact-match. mem0 has no tenants — encode isolation in `user` if needed.

## `hindsight()`

Server-side extraction/ranking. Peer: `@vectorize-io/hindsight-client` (lazy).

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `user` | `string` | `scope.userId` | Bank key user |
| `baseUrl` | `string` | `HINDSIGHT_URL` / localhost:8888 | Server |
| `budget` | `'low' \| 'mid' \| 'high'` | `'mid'` | Recall depth |
| `onToolRetain` / `onToolRecall` | callbacks | none | Tool hooks |

```ts
import { hindsight } from '@tanstack/ai-memory/hindsight'

const memory = hindsight({
  user: 'alice',
  baseUrl: 'https://hindsight.internal',
  budget: 'high',
  onToolRetain: (receipt) => console.log('model retained', receipt.ok),
  onToolRecall: (query, result) =>
    console.log('model recalled', query, result.fragments?.length),
})
```

Bank id: `{tenantId|_}__{user}__{threadId}`.

## `mem0()`

HTTP only (no SDK peer). Needs a running mem0 server.

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `user` | `string` | `scope.userId` / `'demo-user'` | `user_id` |
| `baseUrl` | `string` | `MEM0_URL` / localhost:8000 | Server |
| `apiKey` | `string` | `MEM0_ADMIN_API_KEY` | Bearer |
| `rerank` | `boolean` | `true` | Rerank results |
| `threshold` | `number` | `0.1` | Min score |

```ts
import { mem0 } from '@tanstack/ai-memory/mem0'

const memory = mem0({
  user: 'alice',
  baseUrl: 'https://mem0.internal',
  apiKey: process.env.MEM0_ADMIN_API_KEY,
  rerank: true,
  threshold: 0.2,
})
```

Sends `user_id` + `run_id` (`threadId`). No `tenantId`.

## `honcho()`

Dialectic answer over user representation (no discrete fragments). Peer: `@honcho-ai/sdk` (lazy).

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `user` | `string` | `scope.userId` / `'demo-user'` | Peer id |
| `baseURL` | `string` | `HONCHO_URL` / localhost:8001 | Server |
| `workspaceId` | `string` | `HONCHO_APP_NAME` / `'ai-memory'` | Workspace |
| `apiKey` | `string` | `HONCHO_API_KEY` / `'dev-no-auth'` | Key |
| `assistantId` | `string` | `'assistant'` | Assistant peer |

```ts
import { honcho } from '@tanstack/ai-memory/honcho'

const memory = honcho({
  user: 'alice',
  baseURL: 'https://honcho.internal',
  workspaceId: 'my-app',
  apiKey: process.env.HONCHO_API_KEY,
  assistantId: 'support-bot',
})
```

Session: `{tenantId|_}__{threadId}`; peers: `{tenantId}__{user}` when tenant set.

## Next

- [Overview](./overview) · [Quickstart](./quickstart) · [Operating](./operating) · [Custom Adapter](./custom-adapter)
