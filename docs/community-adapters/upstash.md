---
title: Upstash
id: upstash-adapter
order: 3
description: "Back TanStack AI persistence, resumable streams, locks, and memory with Upstash Redis, so they hold across serverless instances, reloads, and devices."
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

[`@upstash/agentkit-tanstack-ai`](https://github.com/upstash/agentkit/tree/main/packages/tanstack-ai)
implements TanStack AI's state contracts on [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted).
The built-in implementations (`memoryPersistence()`, `memoryStream()`, `InMemoryLockStore`,
`inMemory()`) live in one process. These keep the same state in Redis, so every serverless
instance sees it. The client is `@upstash/redis`, which talks HTTP, so it works on edge and
serverless runtimes without a connection pool.

| TanStack AI seam | Upstash adapter |
| --- | --- |
| `withPersistence()` / `withGenerationPersistence()` stores | `upstashPersistence()` |
| `StreamDurability` for resumable streams | `upstashStream()` |
| `LockStore` for `withLocks()` | `upstashLocks()` |
| `MemoryAdapter` for `memoryMiddleware()` | `upstashMemory()` |

`upstashPersistence()` passes `runPersistenceConformance` with all seven stores, and
`upstashMemory()` passes `runMemoryAdapterContract`.

## Installation

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

Persistence and memory have their own entry points, so install the TanStack package for the
ones you use: `@tanstack/ai-persistence` for `/persistence` and `@tanstack/ai-memory` for
`/memory`.

Every factory reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or takes a
`redis` client:

```bash
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

## Persistence

`upstashPersistence()` returns the `messages`, `runs`, `interrupts`, and `metadata` stores, plus
`generationRuns` and `artifacts`. Pass it to `withPersistence` as you would any adapter:

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

Records are RedisJSON documents. Runs and interrupts are listed through sorted-set indexes
(per thread, per run, per parent run, and by detach time for `listReclaimable`), and each
write updates the document and its indexes in one Lua script, so two instances cannot
interleave a write. `createOrResume` is insert-if-absent and interrupt `commitBatch` is
all-or-nothing.

`reconstructChat(persistence, request, …)` works unchanged, so the `GET` handler from the
[Persistence Overview](../persistence/overview) needs no other edits.

To keep generated files, pass an [Upstash Blob](https://upstash.com/docs/blob) bucket. It
adds a `blobs` store: bytes go to the bucket, records to Redis, and ranged reads use HTTP
`Range` requests.

```ts
import { Bucket } from '@upstash/blob'
import { upstashPersistence } from '@upstash/agentkit-tanstack-ai/persistence'

const persistence = upstashPersistence({ bucket: Bucket.fromEnv() })
```

| Option | Default | Purpose |
| --- | --- | --- |
| `redis` | `Redis.fromEnv()` | Your `@upstash/redis` client. |
| `prefix` | `'agentkit:tanstack'` | Key namespace. |
| `messagesTtlSeconds` | none | Expire idle transcripts. Runs, interrupts, and metadata never expire. |
| `bucket` | none | Upstash Blob bucket for the `blobs` store. |

## Resumable streams

`upstashStream(request)` is a `StreamDurability` adapter. Every chunk is appended to a Redis
Stream before it is delivered, and a client that reconnects with `Last-Event-ID` or
`?offset=` replays what it missed and keeps tailing the live run, on any instance.

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

Outside a request handler, use `upstashStream({ runId, offset })`.

| Option | Default | Purpose |
| --- | --- | --- |
| `ttlSeconds` | `86400` | How long a run stays resumable after its last chunk. |
| `pollIntervalMs` | `150` | Tail poll interval. The REST API has no blocking reads. |
| `firstChunkDeadlineMs` | `2000` | How long a from-start reader waits for a run that has not produced yet. |

## Locks

`upstashLocks()` is a distributed `LockStore`. Hand it to `withLocks` in place of
`InMemoryLockStore`, and `withSandbox` (or your own middleware, through `getLocks`) takes
the lock across instances:

```ts
import { chat } from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { openaiText } from '@tanstack/ai-openai'
import { upstashLocks } from '@upstash/agentkit-tanstack-ai'

export const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'hi' }],
  middleware: [withLocks(upstashLocks())],
})
```

Each lock is a lease (`leaseMs`, default 30 seconds) that is renewed while `fn` runs. If
renewal fails, the `signal` passed to `fn` aborts, as the
[lock contract](../advanced/locks#distributed-locks-and-leases) requires. Release and
renewal check ownership in Lua, so an expired owner cannot release a lock someone else now
holds.

## Memory

`upstashMemory()` is a `MemoryAdapter` backed by Upstash Redis Search. Recall is a BM25
full-text query in Redis, so it does not scan every record on each turn.

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

Memory is per user across threads by default, or per thread when the scope has no `userId`.
Set `scopeBy: 'thread'` to keep it per conversation. `tenantId` and `namespace` always
partition.

| Option | Default | Purpose |
| --- | --- | --- |
| `scopeBy` | `'user'` | Share memories across a user's threads, or keep them per `'thread'`. |
| `saveTool` | `true` | Give the model a `save_memory` tool for durable facts. |
| `captureUserMessages` | `true` | Store each turn's user message. |
| `waitForIndexing` | `true` | Wait for the index on save, so a memory is recallable on the next turn. |

## Also in the package

- `toolCache()` and `rateLimit()`: chat middleware that serves repeated tool calls from Redis
  and limits runs per user before the model is called.
- `createSearchTools()`: `search`, `aggregate`, and `count` tools over your own documents.

## Next steps

- [AgentKit for TanStack AI docs](https://upstash.com/docs/redis/sdks/agentkit/tanstack-ai): every option and feature
- [GitHub repository](https://github.com/upstash/agentkit/tree/main/packages/tanstack-ai): source and issues
- [Persistence Overview](../persistence/overview): the server and client halves
- [Resumable Streams](../resumable-streams/overview): the delivery layer
- [Locks](../advanced/locks): the `LockStore` contract
- [Memory](../memory/overview): the `recall`/`save` contract
