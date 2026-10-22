---
title: Upstash
id: upstash-adapter
order: 3
description: "Keep TanStack AI persistence, resumable streams, locks, and memory in Upstash Redis, so they work across serverless instances, reloads, and devices."
keywords:
  - tanstack ai
  - upstash
  - redis
  - persistence
  - resumable streams
  - locks
  - memory
  - serverless
  - community adapter
---

`@upstash/agentkit-tanstack-ai` stores chat state in Upstash Redis. Every serverless instance then reads the same messages, streams, and locks. Upstash maintains it.

| TanStack AI part | Upstash adapter |
| --- | --- |
| `withPersistence()` / `withGenerationPersistence()` stores | `upstashPersistence()` |
| `StreamDurability` for resumable streams | `upstashStream()` |
| `LockStore` for `withLocks()` | `upstashLocks()` |
| `MemoryAdapter` for `memoryMiddleware()` | `upstashMemory()` |

The client is `@upstash/redis`. It talks HTTP, so it works on edge and serverless runtimes with no connection pool.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @upstash/agentkit-tanstack-ai @tanstack/ai
vue: @upstash/agentkit-tanstack-ai @tanstack/ai
solid: @upstash/agentkit-tanstack-ai @tanstack/ai
svelte: @upstash/agentkit-tanstack-ai @tanstack/ai
preact: @upstash/agentkit-tanstack-ai @tanstack/ai
angular: @upstash/agentkit-tanstack-ai @tanstack/ai
vanilla: @upstash/agentkit-tanstack-ai @tanstack/ai
octane: @upstash/agentkit-tanstack-ai @tanstack/ai

<!-- ::end:tabs -->

Persistence and memory have their own entry points. Also install the TanStack package for each one that you use:

- `@tanstack/ai-persistence` for `/persistence`.
- `@tanstack/ai-memory` for `/memory`.

## 2. Set the Redis credentials

Put the credentials of your Upstash Redis database in the environment of your server:

```bash
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

Every factory reads these two variables. You can also pass your own `redis` client.

## 3. Keep chat history in Redis

`upstashPersistence()` gives you the stores. Pass it to `withPersistence`, the same as any persistence adapter:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { upstashPersistence } from '@upstash/agentkit-tanstack-ai/persistence'

const persistence = upstashPersistence()

export const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'hi' }],
  threadId: 'support-chat',
  middleware: [withPersistence(persistence)],
})
```

The chat history of `support-chat` is now in Redis, so every instance can load it. `reconstructChat(persistence, request, ...)` works with no change, so the `GET` handler from the [Persistence Overview](../persistence/overview) needs no other edits.

`upstashPersistence()` gives these stores:

- `messages`, `runs`, `interrupts`, and `metadata`.
- `generationRuns` and `artifacts`.
- `blobs`, when you pass a bucket. See [Keep generated files](#keep-generated-files).

## Keep generated files

To keep generated files, pass an [Upstash Blob](https://upstash.com/docs/blob) bucket. It adds a `blobs` store:

```ts
import { Bucket } from '@upstash/blob'
import { upstashPersistence } from '@upstash/agentkit-tanstack-ai/persistence'

const persistence = upstashPersistence({ bucket: Bucket.fromEnv() })
```

- The bytes go to the bucket. The records go to Redis.
- Ranged reads use HTTP `Range` requests.

## Resumable streams

`upstashStream(request)` is a `StreamDurability` adapter. A client that reconnects gets the chunks it missed, then follows the live run, on any instance:

```ts
import {
  chat,
  chatParamsFromRequest,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { upstashStream } from '@upstash/agentkit-tanstack-ai'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: upstashStream(request) },
  })
}

export function GET(request: Request) {
  return resumeServerSentEventsResponse({ adapter: upstashStream(request) })
}
```

- The adapter adds each chunk to a Redis Stream before it delivers the chunk.
- A client reconnects with `Last-Event-ID` or `?offset=`.
- Outside a request handler, use `upstashStream({ runId, offset })`.

See [Resumable Streams](../resumable-streams/overview).

## Locks

`upstashLocks()` is a distributed `LockStore`. Give it to `withLocks` in place of `InMemoryLockStore`. Then `withSandbox` (or your own middleware, through `getLocks`) takes the lock across instances:

```ts
import { chat } from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { openaiText } from '@tanstack/ai-openai'
import { upstashLocks } from '@upstash/agentkit-tanstack-ai'

export const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'hi' }],
  threadId: 'thread-1',
  middleware: [withLocks(upstashLocks())],
})
```

- Each lock is a lease. The default `leaseMs` is 30 seconds. The adapter renews the lease while `fn` runs.
- If a renewal fails, the `signal` passed to `fn` aborts, as the [lock contract](../advanced/locks#distributed-locks-and-leases) requires.
- Release and renewal check the owner in Lua. So an expired owner cannot release a lock that another owner holds now.

## Memory

`upstashMemory()` is a `MemoryAdapter` on Upstash Redis Search. Recall is a BM25 full-text query in Redis, so it does not scan every record on each turn:

```ts
import { chat } from '@tanstack/ai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { openaiText } from '@tanstack/ai-openai'
import { upstashMemory } from '@upstash/agentkit-tanstack-ai/memory'

declare const session: { userId: string }

export const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'hi' }],
  threadId: 'support-chat',
  middleware: [
    memoryMiddleware({
      adapter: upstashMemory(),
      // Derive the user from your session, never from the request body.
      scope: (ctx) => ({ threadId: ctx.threadId, userId: session.userId }),
    }),
  ],
})
```

- By default, memory is per user, across threads.
- When the scope has no `userId`, memory is per thread. To always keep it per conversation, set `scopeBy: 'thread'`.
- `tenantId` and `namespace` always partition the memory.

See [Memory](../memory/overview).

## Also in the package

- `toolCache()`: chat middleware that answers repeated tool calls from Redis.
- `rateLimit()`: chat middleware that limits the runs per user before the model call.
- `createSearchTools()`: `search`, `aggregate`, and `count` tools over your own documents.

## Options

### `upstashPersistence()`

| Option | Default | What it does |
| --- | --- | --- |
| `redis` | `Redis.fromEnv()` | Your `@upstash/redis` client. |
| `prefix` | `'agentkit:tanstack'` | The key namespace. |
| `messagesTtlSeconds` | none | Expire idle transcripts. Runs, interrupts, and metadata never expire. |
| `bucket` | none | An Upstash Blob bucket for the `blobs` store. |

### `upstashStream()`

| Option | Default | What it does |
| --- | --- | --- |
| `ttlSeconds` | `86400` | How long a run stays resumable after its last chunk. |
| `pollIntervalMs` | `150` | The poll interval for the live tail. The REST API has no blocking reads. |
| `firstChunkDeadlineMs` | `2000` | How long a reader from the start waits for a run that has no output yet. |

### `upstashMemory()`

| Option | Default | What it does |
| --- | --- | --- |
| `scopeBy` | `'user'` | Share memories across the threads of a user, or keep them per `'thread'`. |
| `saveTool` | `true` | Give the model a `save_memory` tool for durable facts. |
| `captureUserMessages` | `true` | Store the user message of each turn. |
| `waitForIndexing` | `true` | Wait for the index on save, so the next turn can recall a memory. |

For every option and feature, see the [AgentKit for TanStack AI docs](https://upstash.com/docs/redis/sdks/agentkit/tanstack-ai). The source and the issues are on [GitHub](https://github.com/upstash/agentkit/tree/main/packages/tanstack-ai).

## Advanced

### How the stores write to Redis

- Records are RedisJSON documents.
- Runs and interrupts are listed through sorted-set indexes: per thread, per run, per parent run, and by detach time for `listReclaimable`.
- Each write updates the document and its indexes in one Lua script. So two instances cannot interleave a write.
- `createOrResume` inserts only if the run does not exist.
- Interrupt `commitBatch` writes all or nothing.

### Contract tests

- `upstashPersistence()` passes `runPersistenceConformance` with all seven stores.
- `upstashMemory()` passes `runMemoryAdapterContract`.
