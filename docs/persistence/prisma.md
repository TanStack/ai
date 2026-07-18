---
title: Persistence with Prisma
id: prisma
---

# Persistence with Prisma

`@tanstack/ai-persistence-prisma` accepts your generated and migrated
`PrismaClient`. The package provides a provider-neutral models fragment, not a
datasource, generator, connection URL, or prebuilt SQL migration.

## Copy the models fragment

```bash
pnpm exec tanstack-ai-prisma-models --out prisma/schema
```

This writes `tanstack-ai.prisma`, containing only the TanStack AI models. Point
Prisma at that multi-file schema directory alongside your application's
datasource, generator, and models.

Use `--stdout` to inspect the fragment. The CLI refuses to overwrite a
divergent file unless `--force` is passed.

The same asset is available programmatically:

```ts
import {
  prismaModels,
  prismaModelsFilename,
} from '@tanstack/ai-persistence-prisma'

console.log(prismaModelsFilename)
console.log(prismaModels)
```

## Generate a native migration

Use Prisma's normal workflow for your selected provider:

```bash
pnpm prisma migrate dev --name add-tanstack-ai-persistence
pnpm prisma generate
```

Deploy the resulting application-owned migrations normally:

```bash
pnpm prisma migrate deploy
```

This lets Prisma generate provider-specific SQL and integrate the models with
the rest of your schema history.

## Create persistence

```ts
import { PrismaClient } from '@prisma/client'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'

const prisma = new PrismaClient()
export const persistence = prismaPersistence(prisma)
```

The adapter provides messages, runs, interrupts, metadata, artifacts, blobs,
and an in-process lock store. The application owns client connection and
shutdown lifecycle.

## Use it with chat

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withChatPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

`prismaPersistence` provides no `locks` store: this backend has no distributed
lock, so consumers that need one (such as `withSandbox`) fall back to an
in-process lock. Use `composePersistence` to add a distributed `locks`
implementation — for example the Cloudflare Durable Object lock from
`@tanstack/ai-persistence-cloudflare` — or to route selected stores to another
system. Composition does not add a transaction across multiple backends.

## Model layout

The fragment maps six persisted store contracts to `Message`, `Run`, `Interrupt`,
`Metadata`, `Artifact`, and `Blob` models. Artifact rows contain metadata;
binary bodies live on `Blob.body`. IDs and timestamps use portable Prisma
types so the application can generate migrations for its chosen provider.

## Rename the models

The fragment is yours once copied, and its model names are generic — an
application often already has a `Message` or `Run` model. Rename the TanStack
AI models freely and map each store to the renamed client delegate:

```prisma
/// Renamed from `Message` to avoid a collision.
model ChatMessage {
  threadId     String @id @map("thread_id")
  messagesJson String @map("messages_json")

  @@map("messages")
}
```

```ts
import { PrismaClient } from '@prisma/client'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'

const prisma = new PrismaClient()

export const persistence = prismaPersistence(prisma, {
  models: { messages: 'chatMessage' },
})
```

Map values are the camelCase client accessor names (`prisma.chatMessage`), not
the PascalCase model names. Unmapped stores keep their default names
(`message`, `run`, `interrupt`, `metadata`, `artifact`, `blob`), and
`prismaPersistence` throws a `PrismaModelError` naming every store whose
delegate cannot be found.

What stays fixed is the client-level field surface: keep the fragment's field
names and types, and the default composite unique alias `scope_key` on the
metadata model. Everything else is yours:

- **Database names** — table and column names are already governed by
  `@@map` / `@map` in your copy; change them without touching the runtime.
- **Extra app-owned fields** — for example a `userId` on the messages model to
  scope threads to users. Keep added fields optional or defaulted so the
  store creates succeed; the TanStack AI stores never read or write them.
