---
title: Persistence Overview
id: overview
---

Persistence makes server-side runs durable. TanStack AI splits durability into
two independent concerns:

- **State durability (this section)** — thread messages, run records,
  interrupts/approvals, metadata, locks, and generation artifacts. This is a
  store concern and lives on the **middleware** layer: add
  `withChatPersistence(...)` to a `chat()` call, or `withGenerationPersistence(...)`
  to `generateImage` / `generateAudio` / TTS / video / transcription.
- **Delivery durability (transport)** — a client disconnects, reloads, or opens
  a second tab and still receives the full ordered stream. This is a *transport*
  concern, handled by a pluggable delivery sink on the transport helpers
  (`toServerSentEvents*`), **not** by the persistence middleware. That half is
  documented separately once the transport delivery layer lands.

The persistence middleware persists **state only**. It never rewrites the chunk
stream and stamps no cursor — a persisted run produces byte-identical chunks to
a non-persisted one.

By the end of this section, you can choose the smallest state store your app
needs, wire it to your server route, and move from local development migrations
to a production-owned schema.

## How state persistence works

Both middlewares are opt-in. A run without them stays in-memory. A run with
either middleware calls the stores exposed by your `AIPersistence` object at
boundaries (load thread on config, save thread + run status on finish, record
interrupts on pause) — low volume, not per-token.

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'

const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:./chat.db',
  migrate: true,
})

export async function POST(request: Request) {
  const { messages, threadId, runId, resume } = await request.json()

  const stream = chat({
    threadId,
    runId,
    resume,
    adapter: anthropicText('claude-sonnet-4-6'),
    messages,
    middleware: [withChatPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

The `resume` array carries AG-UI interrupt responses (approvals, client-tool
results) for a thread that has pending interrupts — that is state, resolved by
`withChatPersistence`. Making the *stream itself* replayable across a disconnect
is a separate transport-layer delivery concern.

### Run IDs must be unique across activities

`withChatPersistence` and `withGenerationPersistence` may share one
`AIPersistence` backend. The `runs` store is keyed only by `runId` (there is no
activity discriminator), so **every chat run and every generation run needs a
distinct `runId`**. Reusing the same id across activities overwrites run status.

How ids are created:

| Path | Default `runId` |
| --- | --- |
| Client chat (`useChat` / `ChatClient`) | New `run-${Date.now()}-…` per send; interrupt resume reuses the stored id |
| Client generation hooks | New `run-${Date.now()}-…` per generate via the generation client |
| Server `chat({ runId })` | Caller-supplied, or falls back to a per-request `chat-…` id from the engine |
| Server generation (`generateImage`, …) | Caller-supplied `runId`, else `requestId` for run tracking |

Default client/SDK ids are unique enough for normal use. Only force a shared
`runId` if you deliberately control identity — and never reuse one id for both
a chat turn and a media generation. Sharing a **`threadId`** across chat and
generation for the same conversation is fine.

## What `AIPersistence` contains

`AIPersistence` is an object with optional state stores. Implement only the
stores your scenario needs, or use a packaged backend that implements them for
you.

```ts
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type {
  ArtifactStore,
  BlobStore,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunStore,
} from '@tanstack/ai-persistence'
import type { LockStore } from '@tanstack/ai'

declare const messages: MessageStore
declare const runs: RunStore
declare const interrupts: InterruptStore
declare const metadata: MetadataStore
declare const locks: LockStore
declare const artifacts: ArtifactStore
declare const blobs: BlobStore

export const persistence = defineAIPersistence({
  stores: {
    messages,
    runs,
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
`messages.loadThread`, `runs.createOrResume`, or `metadata.set`.

## Choose your path

Start with [Persistence Controls](./controls) when you need to decide which
stores and client options to enable.

Read [Migrations](./migrations) before deploying a packaged backend. Each ORM
owns its own migrations (drizzle-kit / prisma migrate).

Use the topic pages when you know the feature you are building:

- [Chat Persistence](./chat-persistence) for server-authoritative chat threads
  and pending human decisions.
- [Generation Persistence](./generation-persistence) for image, audio, speech,
  transcription, and video hooks with durable artifact refs.
- [Sandbox Persistence](./sandbox-persistence) for coding-agent sandboxes,
  workspace checkpoints, records, and locks.
- [MCP Persistence](./mcp-persistence) for durable MCP session metadata and
  tool-call correlation.

Use the adapter pages when you know the infrastructure you are deploying on:

- [Prisma](./prisma) when Prisma owns your database access.
- [Drizzle](./drizzle) when Drizzle owns your database access.
- [Custom Stores](./custom-stores) when your app owns the persistence boundary
  or you are writing an integration.
- [Persistence Internals](./internals) when you need the exact store contracts.
