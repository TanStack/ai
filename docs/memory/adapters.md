---
title: Adapters
id: memory-adapters
order: 3
description: "Every built-in and vendor memory adapter in @tanstack/ai-memory, with all of their options and an example of each — inMemory, redis, hindsight, mem0, honcho."
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

Every adapter implements the same `recall`/`save` contract, so they're interchangeable
in `memoryMiddleware`. This page is the exhaustive option reference — each adapter's
options with an example of each.

- [Common options](#common-options) — shared by `inMemory()` and `redis()`
- [`inMemory()`](#inmemory) · [`redis()`](#redis) · [`hindsight()`](#hindsight) · [`mem0()`](#mem0) · [`honcho()`](#honcho)

## Common options

`inMemory()` and `redis()` are both client-side rankers built on the same pipeline, so
they share these options.

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `topK` | `number` | `6` | Max hits returned by `recall`. |
| `minScore` | `number` | `0.15` | Drop hits scoring below this. |
| `kinds` | `Array<MemoryKind>` | all | Restrict recall to these record kinds (`'message'`, `'summary'`, `'fact'`, `'preference'`). |
| `embedder` | `{ embed(text): Promise<number[]> }` | — | Enable semantic scoring (embeds on both `recall` and `save`). |
| `extract` | `(turn, scope) => ExtractedFact[]` | — | Persist derived facts on `save`, alongside the raw turn. |
| `render` | `(hits) => string` | built-in | Replace the prompt renderer. |

Every option, in one adapter:

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
    // store a derived fact in addition to the raw turn
    { text: `User said: ${turn.user}`, kind: 'fact', importance: 0.8 },
  ],
  render: (hits) =>
    // custom prompt block instead of the default renderer
    `What I remember:\n${hits.map((h) => `- ${h.record.text}`).join('\n')}`,
})
```

**`extract`** returns `ExtractedFact[]` — `{ text, kind?, importance?, metadata? }`. Return
`undefined` for a no-op. It's where an LLM-based fact extractor plugs in without the
adapter taking a hard dependency on any model.

**`embedder`** is invoked on the recall path (to embed the query) and again on save (to
embed stored text). Without it, scoring is lexical + recency only.

## `inMemory()`

Zero-dependency, `Map`-backed. Takes only the [common options](#common-options) above.
Records vanish on restart — use it for dev, tests, and single-process demos.

```ts
import { inMemory } from '@tanstack/ai-memory/in-memory'

const memory = inMemory() // all options are optional
```

## `redis()`

Plain-Redis adapter. Adds two options to the [common options](#common-options), and
requires a client.

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `redis` | `RedisLike` | — (required) | Your Redis client (`ioredis`, or node-redis via `nodeRedisAsRedisLike`). |
| `prefix` | `string` | `'tanstack-ai:memory'` | Key namespace. |

```ts ignore
// ignore: needs a live ioredis client. ioredis's `Redis` type is structurally broader
// than the minimal `RedisLike` the adapter needs, so it doesn't nominally match — but it
// works at runtime, which is why the adapter accepts a BYO ioredis client directly.
import Redis from 'ioredis'
import { redis } from '@tanstack/ai-memory/redis'

const memory = redis({
  redis: new Redis(process.env.REDIS_URL), // required
  prefix: 'myapp:memory', // key namespace
  topK: 8, // common options apply here too
  minScore: 0.2,
})
```

Using **node-redis** (`redis` package) instead of `ioredis`? Its camelCase API doesn't
match `RedisLike` — wrap it with `nodeRedisAsRedisLike`:

```ts ignore
// ignore: needs a live node-redis client.
import { createClient } from 'redis'
import { redis, nodeRedisAsRedisLike } from '@tanstack/ai-memory/redis'

const client = createClient({ url: process.env.REDIS_URL })
await client.connect()

const memory = redis({ redis: nodeRedisAsRedisLike(client) })
```

`ioredis` and `redis` are both optional peer dependencies — install whichever you use.

## `hindsight()`

Hosted adapter backed by Hindsight. Owns extraction/ranking server-side and exposes
`retain`/`recall`/`reflect` LLM tools through `recall`. `@vectorize-io/hindsight-client`
is an optional peer, loaded lazily.

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `user` | `string` | `scope.userId` | Durable user id used in the bank key (`{user}__{sessionId}`). |
| `baseUrl` | `string` | `HINDSIGHT_URL` / `http://localhost:8888` | Server URL. |
| `budget` | `'low' \| 'mid' \| 'high'` | `'mid'` | Recall budget. |
| `onToolRetain` | `(receipt) => void` | — | Fired when the model calls `hindsight_retain`. |
| `onToolRecall` | `(query, result) => void` | — | Fired when the model calls `hindsight_recall`. |

```ts ignore
// ignore: requires a running Hindsight server + the @vectorize-io/hindsight-client peer.
import { hindsight } from '@tanstack/ai-memory/hindsight'

const memory = hindsight({
  user: 'alice', // bank = alice__{sessionId}
  baseUrl: 'https://hindsight.internal', // default: HINDSIGHT_URL
  budget: 'high', // deeper recall
  onToolRetain: (receipt) => console.log('model retained', receipt.ok),
  onToolRecall: (query, result) =>
    console.log('model recalled', query, result.fragments?.length),
})
```

## `mem0()`

Hosted adapter backed by a mem0 server, over plain HTTP (no SDK peer). Requires a running
mem0 server.

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `user` | `string` | `scope.userId` / `'demo-user'` | mem0 `user_id`. |
| `baseUrl` | `string` | `MEM0_URL` / `http://localhost:8000` | Server URL. |
| `apiKey` | `string` | `MEM0_ADMIN_API_KEY` | Bearer token. |
| `rerank` | `boolean` | `true` | Ask mem0 to rerank search results. |
| `threshold` | `number` | `0.1` | Minimum search score. |

```ts ignore
// ignore: requires a running mem0 server.
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

Hosted adapter backed by Honcho. `recall` returns a synthesized dialectic answer over the
user's representation (no discrete fragments). `@honcho-ai/sdk` is an optional peer,
loaded lazily.

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `user` | `string` | `scope.userId` / `'demo-user'` | User peer id. |
| `baseURL` | `string` | `HONCHO_URL` / `http://localhost:8001` | Server URL. |
| `workspaceId` | `string` | `HONCHO_APP_NAME` / `'ai-memory'` | Workspace id. |
| `apiKey` | `string` | `HONCHO_API_KEY` / `'dev-no-auth'` | API key. |
| `assistantId` | `string` | `'assistant'` | Assistant peer id. |

```ts ignore
// ignore: requires a running Honcho server + the @honcho-ai/sdk peer.
import { honcho } from '@tanstack/ai-memory/honcho'

const memory = honcho({
  user: 'alice', // user peer
  baseURL: 'https://honcho.internal', // default: HONCHO_URL
  workspaceId: 'my-app', // default: HONCHO_APP_NAME
  apiKey: process.env.HONCHO_API_KEY, // default: 'dev-no-auth'
  assistantId: 'support-bot', // default: 'assistant'
})
```

## Where to go next

- [Overview](./overview) — the contract, `memoryMiddleware` options, devtools events
- [Quickstart](./quickstart) — wire an adapter into a real `chat()` call
- [Custom Adapter](./custom-adapter) — implement `recall`/`save` for a backend not shipped
