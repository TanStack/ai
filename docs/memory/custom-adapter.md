---
title: Custom Adapter
id: memory-custom-adapter
order: 3
description: "Write a MemoryAdapter for a backend that isn't shipped — pgvector, MongoDB, DynamoDB, Pinecone, Supabase. Walks through the eight contract members, the three isolation invariants, the shared contract test suite, and publishing as a package."
keywords:
  - tanstack ai
  - memory
  - custom adapter
  - MemoryAdapter
  - pgvector
  - mongodb
  - dynamodb
  - pinecone
  - supabase
  - contract suite
---

You have a backend in mind — pgvector, MongoDB, DynamoDB, Pinecone, Supabase, a hand-rolled SQL table — and the built-in `inMemoryMemoryAdapter` and `redisMemoryAdapter` don't fit. By the end of this guide, you'll have a working adapter that passes the shared contract suite, plugs into `memoryMiddleware`, and is ready to publish if you want.

> **Already comfortable with the contract?** Jump to [Step 4 — Run the contract suite](#step-4--run-the-contract-suite). **First time looking at memory?** Start with the [Overview](./overview) for what `MemoryAdapter` is and what it does.

## When to write a custom adapter

| Situation | Use this |
|-----------|----------|
| You already use Postgres + pgvector / Supabase / Neon for app data | Custom adapter (one fewer system to operate) |
| You need ANN search through a hosted vector DB (Pinecone, Weaviate, Qdrant) | Custom adapter |
| You need DynamoDB / Cosmos / Spanner for compliance or existing infra | Custom adapter |
| You want to layer caching, encryption, or tenant routing in front of an existing adapter | Custom adapter that wraps `inMemoryMemoryAdapter` or `redisMemoryAdapter` |
| Local dev or single-process demo | `inMemoryMemoryAdapter` from `@tanstack/ai-memory` |
| Production with Redis already in your stack | `redisMemoryAdapter` from `@tanstack/ai-memory` |

If a built-in fits, use it. The contract is documented precisely so a custom adapter is always an option — not a requirement.

## The contract at a glance

A `MemoryAdapter` has one identifier and seven methods. The [Overview](./overview#adapter-contract) page covers each method's semantics in detail; this guide focuses on the implementation journey.

```ts
import type {
  MemoryAdapter,
  MemoryRecord,
  MemoryRecordPatch,
  MemoryScope,
  MemoryQuery,
  MemorySearchResult,
  MemoryListOptions,
  MemoryListResult,
} from '@tanstack/ai/memory'

interface MemoryAdapter {
  name: string
  add(records: MemoryRecord | MemoryRecord[]): Promise<void>
  get(id: string, scope: MemoryScope): Promise<MemoryRecord | undefined>
  update(id: string, scope: MemoryScope, patch: MemoryRecordPatch): Promise<MemoryRecord | undefined>
  search(query: MemoryQuery): Promise<MemorySearchResult>
  list(scope: MemoryScope, options?: MemoryListOptions): Promise<MemoryListResult>
  delete(ids: string[], scope: MemoryScope): Promise<void>
  clear(scope: MemoryScope): Promise<void>
}
```

Three invariants every adapter MUST uphold — these are non-negotiable:

1. **Scope isolation.** Reads and writes never cross scopes. A query for `{tenantId: 't1'}` MUST NOT return records belonging to `{tenantId: 't2'}`.
2. **Expiry filtering.** Records whose `expiresAt` is in the past MUST be excluded from `get`, `search`, and `list`. Adapters SHOULD opportunistically sweep them on `add`.
3. **Id uniqueness across all scopes.** Two records with the same `id` MUST NOT coexist, even if their scopes differ.

The shared contract suite in `@tanstack/ai-memory/tests/contract.ts` verifies all three across every method. If your adapter passes it, the middleware works.

## Step 1 — Scaffold the adapter shape

Pick a backend and stub the eight members. Here's a pgvector skeleton you can copy as a starting point:

```ts
import type {
  MemoryAdapter,
  MemoryListOptions,
  MemoryListResult,
  MemoryQuery,
  MemoryRecord,
  MemoryRecordPatch,
  MemoryScope,
  MemorySearchResult,
} from '@tanstack/ai/memory'
import type { Pool } from 'pg'

export interface PgvectorMemoryAdapterOptions {
  pool: Pool
  /** Table name. Defaults to "tanstack_ai_memory". */
  table?: string
}

export function pgvectorMemoryAdapter(
  options: PgvectorMemoryAdapterOptions,
): MemoryAdapter {
  const table = options.table ?? 'tanstack_ai_memory'
  const pool = options.pool

  return {
    name: 'pgvector',
    async add(records) { /* … */ },
    async get(id, scope) { /* … */ },
    async update(id, scope, patch) { /* … */ },
    async search(query) { /* … */ },
    async list(scope, options) { /* … */ },
    async delete(ids, scope) { /* … */ },
    async clear(scope) { /* … */ },
  }
}
```

Pick a `name` your operators will see in logs and devtools — usually the backend's name.

## Step 2 — Reuse the shared helpers

`@tanstack/ai/memory` exports helpers that handle the parts of the contract that don't depend on your storage choice. Use them instead of reimplementing:

```ts
import {
  scopeMatches,
  isExpired,
  defaultScoreHit,
  cosine,
  lexicalOverlap,
  recencyScore,
} from '@tanstack/ai/memory'
```

- `scopeMatches(recordScope, queryScope)` — the canonical "does this record match this query scope?" check. Treats empty-string values and empty objects as no-match. Use everywhere you'd filter by scope.
- `isExpired(record, now?)` — returns `true` for records past their `expiresAt`. Inject `now` for deterministic tests.
- `defaultScoreHit({ record, query, now? })` — weighted score: semantic 0.55, lexical 0.20, recency 0.15, importance 0.10. Use as your default ranker, or roll your own and reuse `cosine` / `lexicalOverlap` / `recencyScore` à la carte.

If your backend has native vector or full-text search (pgvector's `<->`, Postgres `ts_rank`, Pinecone's score), prefer it — the helpers are for adapters with no native ranking.

## Step 3 — Implement each method

Implementation specifics are backend-dependent, but the shape is the same everywhere. A pgvector example for `add` and `search` makes the pattern concrete:

```ts
async add(input) {
  const batch = Array.isArray(input) ? input : [input]
  const now = Date.now()

  for (const r of batch) {
    await pool.query(
      `INSERT INTO ${table} (id, tenant_id, user_id, session_id, thread_id, namespace,
                            text, kind, role, created_at, updated_at, expires_at,
                            importance, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         user_id = EXCLUDED.user_id,
         session_id = EXCLUDED.session_id,
         thread_id = EXCLUDED.thread_id,
         namespace = EXCLUDED.namespace,
         text = EXCLUDED.text,
         kind = EXCLUDED.kind,
         role = EXCLUDED.role,
         updated_at = EXCLUDED.updated_at,
         expires_at = EXCLUDED.expires_at,
         importance = EXCLUDED.importance,
         embedding = EXCLUDED.embedding,
         metadata = EXCLUDED.metadata`,
      [
        r.id, r.scope.tenantId ?? null, r.scope.userId ?? null,
        r.scope.sessionId ?? null, r.scope.threadId ?? null, r.scope.namespace ?? null,
        r.text, r.kind, r.role ?? null, r.createdAt ?? now, now,
        r.expiresAt ?? null, r.importance ?? null,
        r.embedding ? JSON.stringify(r.embedding) : null,
        r.metadata ? JSON.stringify(r.metadata) : null,
      ],
    )
  }
},

async search(query: MemoryQuery): Promise<MemorySearchResult> {
  const topK = query.topK ?? 6
  const minScore = query.minScore ?? 0
  const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0

  const { rows } = await pool.query(
    `SELECT *,
            CASE WHEN $1::vector IS NOT NULL AND embedding IS NOT NULL
                 THEN 1 - (embedding <=> $1::vector)
                 ELSE 0
            END AS score
       FROM ${table}
      WHERE (tenant_id IS NOT DISTINCT FROM $2)
        AND (user_id IS NOT DISTINCT FROM $3)
        AND (session_id IS NOT DISTINCT FROM $4)
        AND (thread_id IS NOT DISTINCT FROM $5)
        AND (namespace IS NOT DISTINCT FROM $6)
        AND (expires_at IS NULL OR expires_at > $7)
        AND ($8::text[] IS NULL OR kind = ANY($8))
      ORDER BY score DESC
      OFFSET $9 LIMIT $10`,
    [
      query.embedding ? JSON.stringify(query.embedding) : null,
      query.scope.tenantId ?? null, query.scope.userId ?? null,
      query.scope.sessionId ?? null, query.scope.threadId ?? null,
      query.scope.namespace ?? null,
      Date.now(),
      query.kinds ?? null,
      offset, topK + 1,
    ],
  )

  const hits = rows.slice(0, topK).map((row) => ({
    record: rowToRecord(row),
    score: Number(row.score),
  })).filter((h) => h.score >= minScore)

  return {
    hits,
    nextCursor: rows.length > topK ? String(offset + topK) : undefined,
  }
}
```

The shape generalizes: every method takes a `scope`, does its backend-specific work, and respects the three invariants. For backends without native search, fall back to "load scope-matched records, score via `defaultScoreHit`, sort, slice" — that's exactly what `inMemoryMemoryAdapter` does.

## Step 4 — Run the contract suite

The shared test suite in `@tanstack/ai-memory/tests/contract.ts` is the canonical verification for any adapter. Import `runMemoryAdapterContract` and point it at a factory that returns a fresh adapter:

```ts
// tests/pgvector.test.ts
import { Pool } from 'pg'
import { runMemoryAdapterContract } from '@tanstack/ai-memory/tests/contract'
import { pgvectorMemoryAdapter } from '../src/pgvector'

runMemoryAdapterContract('pgvectorMemoryAdapter', async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  // Truncate the table between tests so each test gets a clean adapter.
  await pool.query('TRUNCATE tanstack_ai_memory')
  return pgvectorMemoryAdapter({ pool })
})
```

The suite covers `add` (single, batch, upsert), `get`, `update`, `search` (topK, minScore, kinds filter, cursor pagination, lexical-vs-semantic ranking), `list`, `delete`, `clear`, scope isolation across every method, expiry filtering, partial-scope cascades, glob metacharacter safety, colon and underscore safety, and the resolved-scope override for records returned by `extractMemories`. If your adapter passes, every contract guarantee is met.

The contract module isn't re-exported from `@tanstack/ai-memory`'s public entry yet — import directly from `@tanstack/ai-memory/tests/contract` until that lands.

## Step 5 — Wire it into `memoryMiddleware`

Once the contract suite is green, the adapter is interchangeable with the built-ins:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai/memory'
import { Pool } from 'pg'
import { pgvectorMemoryAdapter } from './pgvector-adapter'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const memory = pgvectorMemoryAdapter({ pool })

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  middleware: [memoryMiddleware({ adapter: memory, scope })],
})
```

Everything the middleware does — retrieval, deferred persistence, `extractMemories`, `onToolResult`, `afterPersist`, devtools events — works exactly the same. The middleware never inspects the adapter's internals; the contract is the entire interface.

## Step 6 — Publish (optional)

If you want others to use your adapter, ship it as its own package. The conventions:

- Name it `@your-org/ai-memory-<backend>` (e.g. `@acme/ai-memory-pgvector`).
- List `@tanstack/ai` as a peer dependency with a workspace-friendly range — `">=0.16.0 <1"` is typical.
- List your backend client (`pg`, `mongodb`, `@pinecone-database/pinecone`, …) as a peer dependency, marked optional via `peerDependenciesMeta` if your adapter accepts any compatible shape (BYO-client pattern, like `redisMemoryAdapter`).
- Include the contract suite as a `devDependency` so consumers can run the same tests against forks.
- Re-export the relevant types from `@tanstack/ai/memory` for ergonomics.

A minimal `package.json` for a published adapter:

```json
{
  "name": "@acme/ai-memory-pgvector",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "peerDependencies": {
    "@tanstack/ai": ">=0.16.0 <1",
    "pg": ">=8"
  },
  "peerDependenciesMeta": { "pg": { "optional": false } },
  "devDependencies": {
    "@tanstack/ai": "^0.16.0",
    "@tanstack/ai-memory": "^0.1.0",
    "pg": "^8",
    "vitest": "^1"
  }
}
```

## Pitfalls

A few things that catch first-time adapter authors:

- **Don't trust the caller's `record.scope`.** The middleware overrides it before calling `add`, so adapter implementations should not silently rewrite scope based on caller intent. If your storage encodes scope into keys, take it from the record you were handed — and treat empty values defensively.
- **Escape your delimiters.** If your storage serializes scope into a composite key, escape any character your delimiter uses (`:`, `_`, `/`, …) when it appears inside a user-supplied scope value. Otherwise a tenant whose id legitimately contains the delimiter will collide with sub-scope buckets. The Redis adapter handles this with an `escapeScopeValue` helper.
- **Make `clear` cascade correctly.** `clear({tenantId: 't1'})` MUST wipe every record whose scope is `t1`-prefixed (e.g. `{tenantId: 't1', userId: 'u1'}`), not only records whose scope is exactly `{tenantId: 't1'}`. This is the partial-scope contract — the in-memory adapter gets it for free via `scopeMatches`; the Redis adapter implements it via SCAN over a glob pattern.
- **Multi-step writes are not atomic by default.** If your backend supports transactions (Postgres, MongoDB sessions, DynamoDB transact-write), use them for `add` on scope changes and for `clear`. Document the consistency guarantee you provide.
- **Refuse `clear({})`.** Empty scope is documented as misuse. `scopeMatches` returns `false` for it, so adapters using the helper get the guard for free. Adapters that bypass `scopeMatches` (Redis with its SCAN path) need an explicit `hasAnyScopeKey` check.

## Where to go next

- [Overview](./overview) — adapter contract, hooks reference, devtools events, failure modes
- [Quickstart](./quickstart) — wire `memoryMiddleware` into a real `chat()` call
- [Middleware](../advanced/middleware) — the underlying `chat()` middleware lifecycle, useful when your adapter needs to coordinate with other middlewares
