---
title: Cloudflare Persistence
id: cloudflare
---

Use the Cloudflare backend when `chat()` runs in Workers and persistence should
stay on Cloudflare primitives. D1 stores the core SQL state, R2 can hold blobs
and artifact bytes, and Durable Objects can provide cross-isolate locks.

## Bind D1, R2, and Durable Objects

```ts
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'

interface Env {
  AI_D1: D1Database
  AI_BLOBS: R2Bucket
  AI_LOCKS: DurableObjectNamespace
}

export function persistence(env: Env) {
  return cloudflarePersistence({
    d1: env.AI_D1,
    r2: env.AI_BLOBS,
    durableObjects: env.AI_LOCKS,
    r2ArtifactPrefix: 'tanstack-ai/artifacts/',
    r2BlobPrefix: 'tanstack-ai/blobs/',
  })
}
```

`d1` is required. `r2` and `durableObjects` are optional; include them only when
your app needs blob/artifact storage or distributed locks.

## Core state lives in D1

D1 backs the shared SQL stores:

- runs,
- public replay events,
- internal events,
- messages,
- interrupts,
- metadata,
- migration bookkeeping.

That means reconnect and resume behavior does not depend on R2. R2 only stores
byte payloads for the optional blob and artifact stores.

## Store blobs and artifacts in R2

When you pass `r2`, the backend adds:

- `stores.blobs` backed by R2 objects,
- `stores.artifacts` with D1 metadata/index rows and R2-backed bytes.

Artifact `list(runId)` reads the D1 index without downloading byte bodies.
Artifact `get(artifactId)` hydrates bytes from R2 when the artifact record
points at a blob. Optional artifact cleanup deletes both the D1 row and the R2
object.

## Use Durable Objects for locks

Pass a Durable Object namespace when sandbox resume, workflow coordination, or
another feature needs cross-isolate mutual exclusion.

```ts
import {
  LockDurableObject,
  cloudflarePersistence,
} from '@tanstack/ai-persistence-cloudflare'

export { LockDurableObject }

export function persistence(env: Env) {
  return cloudflarePersistence({
    d1: env.AI_D1,
    durableObjects: env.AI_LOCKS,
    durableObjectLocks: {
      leaseMs: 30_000,
      pollMs: 50,
    },
  })
}
```

Bind the exported `LockDurableObject` class in your Worker config and pass that
namespace as `durableObjects`.

## Self-managed schema

Cloudflare migrations are lazy by default. If you deploy schema separately, set
`migrate: false` and apply both the shared SQL DDL and the Cloudflare artifact
index DDL.

```ts
import { cloudflareArtifactDdl } from '@tanstack/ai-persistence-cloudflare'
import { ddl } from '@tanstack/ai-persistence-sql'

export const statements = [...ddl('sqlite'), ...cloudflareArtifactDdl()]
```

D1 is SQLite-compatible, so use the SQLite dialect for the shared core DDL. The
artifact DDL creates the Cloudflare-specific artifact index table used when R2
is attached.
