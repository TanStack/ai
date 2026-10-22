---
title: Adapters
id: memory-adapters
order: 3
description: "Every built-in and vendor memory adapter in @tanstack/ai-memory, with all options and an example of each: inMemory, redis, hindsight, mem0, honcho."
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

Each memory adapter implements `recall` and `save`. Swap one for another in `memoryMiddleware`.

| Adapter | Import | Use it for | Extra install |
| --- | --- | --- | --- |
| [`inMemory()`](#inmemory) | `@tanstack/ai-memory/in-memory` | Development, tests, demos | None |
| [`redis()`](#redis) | `@tanstack/ai-memory/redis` | Production on your own Redis | `ioredis` or `redis` |
| [`hindsight()`](#hindsight) | `@tanstack/ai-memory/hindsight` | Hindsight server, with memory tools for the model | `@vectorize-io/hindsight-client` |
| [`mem0()`](#mem0) | `@tanstack/ai-memory/mem0` | mem0 server, over HTTP | None |
| [`honcho()`](#honcho) | `@tanstack/ai-memory/honcho` | Honcho server | `@honcho-ai/sdk` |

All extra installs are optional peer dependencies. Install only the one that your adapter needs.

## Common options

`inMemory()` and `redis()` rank records in your server process with the same code, so they share these options:

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `topK` | `number` | `6` | Maximum number of hits that `recall` returns. |
| `minScore` | `number` | `0.15` | Hits with a lower score are dropped. |
| `kinds` | `Array<MemoryKind>` | all | Recall only these record kinds: `'message'`, `'summary'`, `'fact'`, `'preference'`. |
| `embedder` | `{ embed(text): Promise<number[]> }` | none | Adds semantic scoring. Runs on `recall` and on `save`. |
| `extract` | `(turn, scope) => ExtractedFact[]` | none | Saves derived facts on `save`, next to the raw turn. |
| `render` | `(hits) => string` | built-in | Replaces the prompt renderer. |

All options in one adapter:

```ts
import { inMemory } from '@tanstack/ai-memory/in-memory'

// `embedText` stands in for your embedding client (OpenAI, Cohere, a local model).
declare function embedText(text: string): Promise<Array<number>>

const memory = inMemory({
  topK: 8, // return up to 8 hits
  minScore: 0.2, // ignore weak matches
  kinds: ['message', 'fact', 'preference'], // skip summaries
  embedder: { embed: embedText }, // semantic + lexical scoring
  extract: (turn) => [
    // store a derived fact next to the raw turn
    { text: `User said: ${turn.user}`, kind: 'fact', importance: 0.8 },
  ],
  render: (hits) =>
    // custom prompt block instead of the default renderer
    `What I remember:\n${hits.map((h) => `- ${h.record.text}`).join('\n')}`,
})
```

- **`extract`** returns `ExtractedFact[]` (`{ text, kind?, importance?, metadata? }`), or `undefined` to save nothing extra. Put an LLM-based fact extractor here. The adapter does not depend on a model.
- **`embedder`** embeds the query on `recall` and the stored text on `save`. With no embedder, the score uses word overlap, recency, and importance only.

## `inMemory()`

Records live in a `Map` and are lost when the process restarts. Each server process has its own `Map`. It takes only the [common options](#common-options).

```ts
import { inMemory } from '@tanstack/ai-memory/in-memory'

const memory = inMemory() // all options are optional
```

## `redis()`

Plain Redis, no vector index. It adds two options to the [common options](#common-options):

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `redis` | `RedisLike` | (required) | Your Redis client: `ioredis`, or node-redis through `fromNodeRedis`. |
| `prefix` | `string` | `'tanstack-ai:memory'` | Key namespace. |

```ts
import Redis from 'ioredis'
import { redis } from '@tanstack/ai-memory/redis'

const memory = redis({
  redis: new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'), // required
  prefix: 'myapp:memory', // key namespace
  topK: 8, // common options apply here too
  minScore: 0.2,
})
```

If you use **node-redis** (the `redis` package), wrap the client with `fromNodeRedis`. Its camelCase methods do not match `RedisLike`:

```ts
import { createClient } from 'redis'
import { redis, fromNodeRedis } from '@tanstack/ai-memory/redis'

const client = createClient({ url: process.env.REDIS_URL })
await client.connect()

const memory = redis({ redis: fromNodeRedis(client) })
```

`redis()` loads all records of a scope and ranks them in your process. This suits up to about 10,000 records per scope. For the key layout, see [Redis keys](#redis-keys).

## `hindsight()`

Hindsight does extraction and ranking on its server. `recall` also gives the model three tools: `hindsight_retain`, `hindsight_recall`, and `hindsight_reflect`. The client package loads only when the adapter first runs.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `user` | `string` | `scope.userId`, then `'demo-user'` | User id in the bank id. |
| `baseUrl` | `string` | `HINDSIGHT_URL` or `http://localhost:8888` | Server URL. |
| `budget` | `'low' \| 'mid' \| 'high'` | `'mid'` | Recall budget. |
| `onToolRetain` | `(receipt) => void` | none | Runs when the model calls `hindsight_retain`. |
| `onToolRecall` | `(query, result) => void` | none | Runs when the model calls `hindsight_recall`. |

```ts
import { hindsight } from '@tanstack/ai-memory/hindsight'

const memory = hindsight({
  user: 'alice',
  baseUrl: 'https://hindsight.internal', // default: HINDSIGHT_URL
  budget: 'high', // deeper recall
  onToolRetain: (receipt) => console.log('model retained', receipt.ok),
  onToolRecall: (query, result) =>
    console.log('model recalled', query, result.fragments?.length),
})
```

## `mem0()`

mem0 does extraction and ranking on its server. The adapter uses plain HTTP, so it needs no SDK. You need a running mem0 server.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `user` | `string` | `scope.userId`, then `'demo-user'` | mem0 `user_id`. |
| `baseUrl` | `string` | `MEM0_URL` or `http://localhost:8000` | Server URL. |
| `apiKey` | `string` | `MEM0_ADMIN_API_KEY` | Bearer token. |
| `rerank` | `boolean` | `true` | Ask mem0 to rerank search results. |
| `threshold` | `number` | `0.1` | Minimum search score. |

```ts
import { mem0 } from '@tanstack/ai-memory/mem0'

const memory = mem0({
  user: 'alice', // mem0 user_id
  baseUrl: 'https://mem0.internal', // default: MEM0_URL
  apiKey: process.env.MEM0_ADMIN_API_KEY, // bearer token
  rerank: true, // rerank results
  threshold: 0.2, // stricter score floor
})
```

## `honcho()`

Honcho stores the turn as messages in a session. `recall` returns one written answer about the user, built by Honcho, with no separate fragments.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `user` | `string` | `scope.userId`, then `'demo-user'` | User peer id. |
| `baseURL` | `string` | `HONCHO_URL` or `http://localhost:8001` | Server URL. |
| `workspaceId` | `string` | `HONCHO_APP_NAME` or `'ai-memory'` | Workspace id. |
| `apiKey` | `string` | `HONCHO_API_KEY` or `'dev-no-auth'` | API key. |
| `assistantId` | `string` | `'assistant'` | Assistant peer id. |

```ts
import { honcho } from '@tanstack/ai-memory/honcho'

const memory = honcho({
  user: 'alice', // user peer
  baseURL: 'https://honcho.internal', // default: HONCHO_URL
  workspaceId: 'my-app', // default: HONCHO_APP_NAME
  apiKey: process.env.HONCHO_API_KEY, // default: 'dev-no-auth'
  assistantId: 'support-bot', // default: 'assistant'
})
```

## Which `Scope` fields each adapter honors

| Adapter | `threadId` | `userId` | `tenantId` | `namespace` |
| --- | --- | --- | --- | --- |
| `inMemory()` | yes (exact) | yes (exact) | yes (exact) | ignored |
| `redis()` | yes (key segment) | yes (key segment) | yes (key segment) | ignored |
| `hindsight()` | yes (bank id) | yes (bank id or `user` option) | yes (bank prefix, `_` when unset) | ignored |
| `mem0()` | yes (`run_id`) | yes (`user_id` or `user` option) | **no** | ignored |
| `honcho()` | yes (session key) | yes (peer id or `user` option) | yes (session and peer prefix) | ignored |

An optional field matches exactly. A read with no `tenantId` does not match a record written with one. mem0 does not model tenants, so for multi-tenant isolation, put the tenant into the `user` option.

## Third-party adapters

These adapters are published outside TanStack AI. They have the same `recall` and `save` methods, so they work in `memoryMiddleware` like the ones above.

| Adapter | Package | Backend | Recall |
| --- | --- | --- | --- |
| [`upstashMemory()`](../community-adapters/upstash#memory) | `@upstash/agentkit-tanstack-ai/memory` | Upstash Redis (HTTP client) | BM25 full-text query in Redis Search |

`upstashMemory()` passes `runMemoryAdapterContract` from `@tanstack/ai-memory/testkit`. It ranks inside Redis, so it does not load records into your process. It honors `namespace` as well as `tenantId`, `userId`, and `threadId`.

## Advanced

### Redis keys

`redis()` writes two kinds of keys:

```text
{prefix}:record:{id}                                      -> JSON record
{prefix}:index:{tenantId or _}:{userId or _}:{threadId}   -> Set of record ids
```

- Each scope value is escaped, so `:`, `\`, and `_` in a value cannot make two scopes share a key.
- A missing optional field becomes `_`. A write with `tenantId` and a read without it use different keys. Always read with the same fields that you wrote with.
- The adapter reads only this index layout. If you wrote memory under a different layout, reindex it or delete it.
- If a stored record is not valid JSON, recall skips it, logs a warning, and leaves it in Redis.

### Vendor ids

- **Hindsight** bank id: `{tenantId or _}__{user}__{threadId}`.
- **mem0** requests send `user_id` and `run_id` (the `threadId`). They do not send `tenantId`.
- **Honcho** session key: `{tenantId or _}__{threadId}`. The user peer id is `{tenantId}__{user}` when `tenantId` is set, and the bare user id when it is not.

### How `inMemory()` and `redis()` score

- Each record gets a weighted score: semantic match 0.55, word overlap 0.20, recency 0.15, importance 0.10.
- Recency halves every 30 days.
- A raw user or assistant message is saved with importance 0.4. An extracted fact uses the `importance` that `extract` returns, or 0.
- With no `embedder`, the semantic part is 0.
- The default renderer quotes each record with `JSON.stringify`, so stored text with new lines or instructions cannot break out of the memory list.
