---
title: Cloudflare Persistence
id: cloudflare
---

# Cloudflare Persistence

`@tanstack/ai-persistence-cloudflare` maps state stores to Cloudflare-native
primitives:

| Binding | Stores |
| --- | --- |
| D1 | `messages`, `runs`, `interrupts`, `metadata` |
| R2 | `artifacts`, `blobs` |
| Durable Objects | `locks` |

Pass only the bindings you need. The return type contains exactly the stores
those bindings can provide.

This package persists state. It does not provide a stream-delivery adapter;
resumable streams remain a separate transport-level feature.

## Configure bindings

```jsonc
// wrangler.jsonc
{
  "d1_databases": [
    {
      "binding": "AI_STATE",
      "database_name": "tanstack-ai-state",
      "database_id": "<database-id>",
      "migrations_dir": "migrations"
    }
  ],
  "r2_buckets": [
    {
      "binding": "AI_MEDIA",
      "bucket_name": "tanstack-ai-media"
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "AI_LOCKS",
        "class_name": "CloudflareLockDurableObject"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["CloudflareLockDurableObject"]
    }
  ]
}
```

Re-export the lock Durable Object from your Worker entry:

```ts
export { CloudflareLockDurableObject } from '@tanstack/ai-persistence-cloudflare'
```

## Create persistence

```ts
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'

interface Env {
  AI_STATE: D1Database
  AI_MEDIA: R2Bucket
  AI_LOCKS: DurableObjectNamespace
}

export function createPersistence(env: Env) {
  return cloudflarePersistence({
    d1: env.AI_STATE,
    r2: env.AI_MEDIA,
    durableObjects: env.AI_LOCKS,
    artifactPrefix: 'artifacts/',
    blobPrefix: 'blobs/',
    lockOptions: {
      leaseDurationMs: 30_000,
      retryDelayMs: 50,
    },
  })
}
```

D1 stores structured records in SQLite tables. R2 keeps artifact metadata
indexes and blob bodies. Each lock key is routed to a Durable Object, which
serializes owners and uses leases/alarms for recovery.

## Use it with chat

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'

export default {
  async fetch(request: Request, env: Env) {
    try {
      const params = await chatParamsFromRequest(request)
      const persistence = createPersistence(env)
      const stream = chat({
        adapter: openaiText('gpt-5.5'),
        messages: params.messages,
        threadId: params.threadId,
        runId: params.runId,
        ...(params.resume ? { resume: params.resume } : {}),
        middleware: [withChatPersistence(persistence)],
      })

      return toServerSentEventsResponse(stream)
    } catch (error) {
      if (error instanceof Response) return error
      throw error
    }
  },
}
```

## Apply D1 migrations

The package exports an ordered `d1Migrations` manifest and a CLI. Copy the SQL
into the directory managed by Wrangler:

```bash
pnpm exec tanstack-ai-cloudflare-migrations --out migrations
wrangler d1 migrations apply tanstack-ai-state --local
wrangler d1 migrations apply tanstack-ai-state --remote
```

Use `--stdout` to print the ordered SQL. Existing divergent files are not
overwritten unless `--force` is passed. Commit the copied migrations and apply
them before deploying code that uses the stores.

Programmatic tooling can read the same manifest:

```ts
import { d1Migrations } from '@tanstack/ai-persistence-cloudflare'

for (const migration of d1Migrations) {
  console.log(migration.filename)
}
```

## Override selected stores

Use Cloudflare as the base and replace only application-owned stores:

```ts
import { composePersistence } from '@tanstack/ai-persistence'
import type { InterruptStore, RunStore } from '@tanstack/ai-persistence'

declare const customInterrupts: InterruptStore
declare const customRuns: RunStore

const persistence = composePersistence(createPersistence(env), {
  overrides: {
    interrupts: customInterrupts,
    runs: customRuns,
  },
})
```

D1 continues to own messages and metadata, R2 owns artifacts and blobs, and
Durable Objects own locks. Cross-backend transactions are not added by
composition; design retries and consistency explicitly.
