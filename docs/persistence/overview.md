---
title: Persistence Overview
id: overview
---

Persistence makes server-side `chat()` runs durable. You add
`withPersistence(...)` to a server run, pass it an `AIPersistence` store
aggregate, and TanStack AI uses those stores to load thread history, record run
state, append replayable public events, and provide optional capabilities such
as interrupts, metadata, locks, artifacts, and blobs.

By the end of this section, you can choose the smallest persistence layer your
app needs, wire it to your server route, and move from local development
migrations to a production-owned schema.

## How persistence works

`withPersistence(...)` is middleware. A run without the middleware stays
in-memory. A run with the middleware calls the stores exposed by your
`AIPersistence` object.

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

const persistence = sqlitePersistence({
  path: '.tanstack-ai/state.sqlite',
  migrate: true,
})

export async function POST(request: Request) {
  const { messages, threadId, runId, cursor, resume } = await request.json()

  const stream = chat({
    threadId,
    runId,
    cursor,
    resume,
    adapter: anthropicText('claude-sonnet-4-6'),
    messages,
    middleware: [withPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

When the client later sends `{ threadId, runId, cursor }`, persistence replays
the stored public event tail after that cursor. Treat `cursor` as opaque: store
and forward it, but do not parse it.

## What `AIPersistence` contains

`AIPersistence` is an object with optional stores. Implement only the stores
your scenario needs, or use a packaged backend that implements them for you.

```ts
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type {
  ArtifactStore,
  BlobStore,
  InternalEventStore,
  InterruptStore,
  MessageStore,
  MetadataStore,
  PublicEventStore,
  RunStore,
} from '@tanstack/ai-persistence'
import type { LockStore } from '@tanstack/ai'

declare const messages: MessageStore
declare const runs: RunStore
declare const publicEvents: PublicEventStore
declare const internalEvents: InternalEventStore
declare const interrupts: InterruptStore
declare const metadata: MetadataStore
declare const locks: LockStore
declare const artifacts: ArtifactStore
declare const blobs: BlobStore

export const persistence = defineAIPersistence({
  stores: {
    messages,
    runs,
    publicEvents,
    internalEvents,
    interrupts,
    metadata,
    locks,
    artifacts,
    blobs,
  },
})
```

There is no separate high-level callback builder. Production apps usually keep
their own database, object storage, queues, and retention policies, then expose
those systems through `AIPersistence` store methods such as
`messages.loadThread`, `runs.createOrResume`, `publicEvents.append`, or
`metadata.set`.

## Choose your path

Start with [Persistence Controls](./controls) when you need to decide which
stores and client options to enable. It maps the six control levers from
in-memory runs through extension stores.

Read [Migrations](./migrations) before deploying a packaged backend. Migrations
are opt-in by default; pass `migrate: true` only when you intentionally want
local or development lazy migration.

Use the topic pages when you know the feature you are building:

- [Chat Persistence](./chat-persistence) for server-authoritative chat threads,
  reconnect replay, and pending human decisions.
- [Generation Persistence](./generation-persistence) for image, audio, speech,
  transcription, and video hooks with durable artifact refs.
- [Sandbox Persistence](./sandbox-persistence) for coding-agent sandboxes,
  workspace checkpoints, records, and locks.
- [MCP Persistence](./mcp-persistence) for durable MCP session metadata,
  tool-call correlation, and event/checkpoint storage.

Use the adapter pages when you know the infrastructure you are deploying on:

- [Cloudflare](./cloudflare) for Workers, D1, R2, and Durable Object locks.
- [SQL Backends](./sql-backends) for SQLite, Postgres, and MySQL-compatible
  custom SQL drivers.
- [Prisma](./prisma) when Prisma owns your SQLite or Postgres database access.
- [Drizzle](./drizzle) when Drizzle owns your SQLite or Postgres database access.
- [Custom Stores](./custom-stores) when your app owns the persistence boundary
  or you are writing an integration.
