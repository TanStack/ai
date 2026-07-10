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

Use `composePersistence` to replace `locks` with a distributed implementation
or to route selected stores to another system. Composition does not add a
transaction across multiple backends.

## Model layout

The fragment maps six persisted store contracts to `Message`, `Run`, `Interrupt`,
`Metadata`, `Artifact`, and `Blob` models. Artifact rows contain metadata;
binary bodies live on `Blob.body`. IDs and timestamps use portable Prisma
types so the application can generate migrations for its chosen provider.
