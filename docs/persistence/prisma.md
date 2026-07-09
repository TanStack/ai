---
title: Persistence with Prisma
id: prisma
---

`@tanstack/ai-persistence-prisma` is the Prisma backend for TanStack AI
**state** persistence. It is **bring-your-own-client**: you add the shipped
model fragment to your own `schema.prisma`, run `prisma migrate` through your
normal workflow, then hand the generated `PrismaClient` to
`prismaPersistence(...)`. It returns the same `AIPersistence` contract consumed
by `withChatPersistence(...)` and `withGenerationPersistence(...)`.

Prefer [Drizzle](./drizzle) if you want a batteries-included `sqlPersistence`
with bundled migrations. Reach for Prisma when Prisma already owns your database
connection and migration workflow.

```sh
pnpm add @tanstack/ai-persistence @tanstack/ai-persistence-prisma @prisma/client
pnpm add -D prisma
```

## Add the models to your schema

Copy the models from this package's `prisma/schema.prisma` into your own Prisma
schema (or import them if you split your schema across files). The fragment
defines six models — `Message`, `Run`, `Interrupt`, `Metadata`, `Artifact`, and
`Blob` — that back the `AIPersistence` state stores:

```prisma
model Message {
  threadId     String @id @map("thread_id")
  messagesJson String @map("messages_json")

  @@map("messages")
}

model Run {
  runId      String  @id @map("run_id")
  threadId   String  @map("thread_id")
  status     String
  startedAt  BigInt  @map("started_at")
  finishedAt BigInt? @map("finished_at")
  error      String?
  usageJson  String? @map("usage_json")

  @@map("runs")
}

model Interrupt {
  interruptId  String  @id @map("interrupt_id")
  runId        String  @map("run_id")
  threadId     String  @map("thread_id")
  status       String
  requestedAt  BigInt  @map("requested_at")
  resolvedAt   BigInt? @map("resolved_at")
  payloadJson  String  @map("payload_json")
  responseJson String? @map("response_json")

  @@map("interrupts")
}

model Metadata {
  scope     String
  key       String
  valueJson String @map("value_json")

  @@id([scope, key])
  @@map("metadata")
}

model Artifact {
  artifactId  String  @id @map("artifact_id")
  runId       String  @map("run_id")
  threadId    String  @map("thread_id")
  name        String
  mimeType    String  @map("mime_type")
  size        BigInt
  externalUrl String? @map("external_url")
  createdAt   BigInt  @map("created_at")

  @@map("artifacts")
}

model Blob {
  key                String  @id
  contentType        String? @map("content_type")
  size               BigInt?
  etag               String?
  customMetadataJson String? @map("custom_metadata_json")
  createdAt          BigInt? @map("created_at")
  updatedAt          BigInt? @map("updated_at")
  body               Bytes?

  @@map("blobs")
}
```

JSON-valued fields are stored in `*_json` `String` (TEXT) columns because
Prisma's `Json` type is unavailable on SQLite; the adapter serializes and parses
them for you. Integer columns use `BigInt` so epoch-millisecond timestamps fit
the full 64-bit range — the adapter converts `bigint` back to `number` at the
boundary, so the records you read are plain numbers.

## Run the migration

Generate and apply a migration with your normal Prisma workflow:

```sh
pnpm exec prisma migrate dev --name tanstack_ai_persistence
```

For production, generate the migration ahead of time and apply it with
`prisma migrate deploy` from your deployment pipeline.

## Create the persistence object

Pass your generated `PrismaClient` to `prismaPersistence(...)`:

```ts
import { PrismaClient } from '@prisma/client'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'
import { withChatPersistence } from '@tanstack/ai-persistence'

const prisma = new PrismaClient()

export const persistence = prismaPersistence(prisma)
export const middleware = withChatPersistence(persistence)
```

The middleware then flows into your chat handler like any other. On the server:

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { middleware } from './persistence'

export async function POST(request: Request) {
  const body: unknown = await request.json()
  const messages = Array.isArray(body) ? body : []

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
    middleware: [middleware],
  })

  return toServerSentEventsResponse(stream)
}
```

## What is persisted

The models mirror the `AIPersistence` state records:

- `Message` — thread message history
- `Run` — run lifecycle (status, usage, timing)
- `Interrupt` — interrupts / approvals
- `Metadata` — scoped key/value metadata
- `Artifact` — generation artifact references
- `Blob` — generic blob objects

Delivery durability (resuming an interrupted stream) is a **transport** concern
and is not stored here. Locks are not part of the SQL schema; an in-memory lock
is provided as a dev default. Swap in a distributed lock for multi-process
deployments via [Custom Stores](./custom-stores).

## Keep the Drizzle and Prisma schemas in sync

> **Coupling: `persistence-schema-dual-source`.** The Prisma models above and the
> Drizzle schema in `@tanstack/ai-persistence-drizzle` describe the **same**
> state tables and have **no** auto-converter between them. Changing one without
> the other silently diverges the two backends.

Any change to either schema requires all three of:

1. the sibling schema updated to match, column-for-column;
2. regenerated migrations for **both** ORMs (`drizzle-kit generate` and
   `prisma migrate dev`);
3. the shared conformance suite re-run against memory, Drizzle, and Prisma.

The two schemas stay column-for-column identical: Drizzle's `integer()` columns
and Prisma's `BigInt` columns are both 64-bit INTEGER-affinity columns in
SQLite, so the on-disk shape matches.

## Use it across the guides

The same Prisma-backed `AIPersistence` object works across the topic guides:

- [Chat Persistence](./chat-persistence) for server-owned transcripts.
- [Persistence Controls](./controls) when you need to choose a feature list.
- [Custom Stores](./custom-stores) when you want Prisma for SQL state but a
  separate object store for blobs.
