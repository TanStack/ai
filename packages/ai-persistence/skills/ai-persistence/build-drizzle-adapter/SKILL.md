---
name: ai-persistence/build-drizzle-adapter
description: Use when an app already runs Drizzle ORM and needs TanStack AI chat persistence — writes a chat-persistence.ts into the app against its existing db handle, schema file, and drizzle-kit journal. Covers the four tables (SQLite/Postgres/MySQL), the onConflict idempotency rules, JSON columns, and per-request bindings like D1.
---

# Drizzle Chat Persistence

The deliverable is **one file in the app** — `src/lib/chat-persistence.ts` —
exporting a `ChatPersistence` built from the app's existing Drizzle `db`. Plus
four tables added to the app's existing schema file and a migration generated
through the app's existing `drizzle-kit` setup.

Do not create a package, a second `db` instance, a migration runner, or a
`drizzle.config.ts`. The app has those.

Read the **Store Reference**
(`docs/persistence/store-reference.md`) for the store contracts and
invariants, and **ai-persistence/stores** for the shape rules. Every
store below mirrors the reference in-memory backend in
`@tanstack/ai-persistence` (`memory.ts`); the shared conformance testkit is the
proof.

## 1. Read the app before writing anything

| Find               | Where to look                                                       | What it decides                                             |
| ------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Dialect            | `drizzle.config.ts` `dialect:`, or the `drizzle-orm/*-core` import  | `sqlite-core` vs `pg-core` vs `mysql-core` column builders  |
| Schema file(s)     | `drizzle.config.ts` `schema:` glob                                  | Where the four tables go — append, never start a new file   |
| The `db` handle    | `src/db/index.ts`, `src/db.ts`, `src/server/db.ts`                  | Module singleton (`export const db`) vs factory (`getDb()`) |
| Migration flow     | `drizzle.config.ts` `out:`, the `migrations/` or `drizzle/` journal | Which generate/apply commands to tell the user to run       |
| Naming conventions | Existing tables in the schema file                                  | Table prefix, var casing, `snake_case` column names         |
| Import alias       | `tsconfig.json` `paths`                                             | `@/db`, `~/db`, `#/db/index`, or a relative path            |

Match what is already there. If their tables are `chat_*`-prefixed and their
vars are camelCase, so are yours. If they already have a `messages` table for
something else, prefix — the store code reads database names off the table
objects, so any name works.

**Never invent a migration path.** Add the tables to their schema file, then
have them run their own commands (`npx drizzle-kit generate` then
`migrate`/`push`, or `wrangler d1 migrations apply` for D1). A parallel
migration table behind their back is how schemas drift.

## 2. Add the tables to their schema file

SQLite. JSON payloads use `text({ mode: 'json' })` so Drizzle round-trips
objects for you; timestamps are `integer` epoch ms.

```ts ignore
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'
import type { InterruptRecord, RunStatus } from '@tanstack/ai-persistence'

export const chatThreads = sqliteTable('chat_threads', {
  threadId: text('thread_id').primaryKey(),
  messagesJson: text('messages_json', { mode: 'json' })
    .$type<Array<ModelMessage>>()
    .notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const chatRuns = sqliteTable(
  'chat_runs',
  {
    runId: text('run_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    status: text('status').$type<RunStatus>().notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    error: text('error'),
    errorCode: text('error_code'),
    usageJson: text('usage_json', { mode: 'json' }).$type<TokenUsage>(),
    sandboxKey: text('sandbox_key'),
    detachedSince: integer('detached_since'),
    cancelRequested: integer('cancel_requested', { mode: 'boolean' }),
    driverEpoch: integer('driver_epoch'),
  },
  (table) => [
    // Powers listReclaimable: status = 'running' AND detachedSince <= cutoff.
    index('chat_runs_status_detached').on(table.status, table.detachedSince),
    // Powers listByThread and findActiveRun.
    index('chat_runs_thread_started').on(table.threadId, table.startedAt),
  ],
)

export const chatInterrupts = sqliteTable('chat_interrupts', {
  interruptId: text('interrupt_id').primaryKey(),
  runId: text('run_id').notNull(),
  threadId: text('thread_id').notNull(),
  status: text('status').$type<InterruptRecord['status']>().notNull(),
  requestedAt: integer('requested_at').notNull(),
  resolvedAt: integer('resolved_at'),
  payloadJson: text('payload_json', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .notNull(),
  responseJson: text('response_json', { mode: 'json' }).$type<unknown>(),
})

export const chatMetadata = sqliteTable(
  'chat_metadata',
  {
    namespace: text('namespace').notNull(),
    key: text('key').notNull(),
    valueJson: text('value_json', { mode: 'json' }).$type<unknown>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.namespace, table.key] })],
)
```

`updatedAt` on threads is an app-owned extra, not part of any contract — the
stores never read columns they do not know about, so add `userId`, tenant ids,
or audit columns the same way (nullable or defaulted so inserts still succeed).
The `namespace` column is the `MetadataStore` first argument; the stock SQL in
the guide calls the same column `scope`.

`RunRecord.error` is a structured `RunError` (`{ message: string, code?: string }`),
so it gets two columns rather than one JSON blob: `error` for the provider's
prose and `errorCode` for the stable classification an operator filters and
groups by. `error` and `errorCode` always move together in `update`, so a
later code-less failure can never leave a stale `code` from an earlier one
behind.

**Postgres** (`drizzle-orm/pg-core`): `jsonb()` for the JSON payloads,
`bigint({ mode: 'number' })` for epoch-ms timestamps (including
`detachedSince`), `integer()` for `driverEpoch`, `boolean()` for
`cancelRequested`, `text()` elsewhere, composite `primaryKey` on
`(namespace, key)` unchanged. **MySQL**
(`drizzle-orm/mysql-core`): `json()`, `bigint({ mode: 'number' })`,
`boolean()` for `cancelRequested`, and `varchar(..., { length: 255 })` for the
primary-key columns. The store bodies below are identical across all three,
only `onConflictDoUpdate` becomes `onDuplicateKeyUpdate` on MySQL, and the
`(status, detachedSince)` / `(threadId, startedAt)` indexes carry over as is.

## 3. Write `src/lib/chat-persistence.ts`

The whole file. Idempotency is the entire game — the comments below mark the
rules the conformance suite checks.

```ts ignore
import { and, asc, desc, eq, isNotNull, lte } from 'drizzle-orm'
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type { SQL } from 'drizzle-orm'
import type {
  ChatPersistence,
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStore,
} from '@tanstack/ai-persistence'

import { db } from '@/db'
import {
  chatInterrupts,
  chatMetadata,
  chatRuns,
  chatThreads,
} from '@/db/schema'

type Db = typeof db

// Records omit absent optionals so they compare cleanly against the reference
// in-memory backend.
function mapRun(row: typeof chatRuns.$inferSelect): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    startedAt: row.startedAt,
    ...(row.finishedAt != null ? { finishedAt: row.finishedAt } : {}),
    ...(row.error != null
      ? {
          error: {
            message: row.error,
            ...(row.errorCode != null ? { code: row.errorCode } : {}),
          },
        }
      : {}),
    ...(row.usageJson != null ? { usage: row.usageJson } : {}),
    ...(row.sandboxKey != null ? { sandboxKey: row.sandboxKey } : {}),
    ...(row.detachedSince != null ? { detachedSince: row.detachedSince } : {}),
    ...(row.cancelRequested != null
      ? { cancelRequested: row.cancelRequested }
      : {}),
    ...(row.driverEpoch != null ? { driverEpoch: row.driverEpoch } : {}),
  }
}

function mapInterrupt(
  row: typeof chatInterrupts.$inferSelect,
): InterruptRecord {
  return {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    requestedAt: row.requestedAt,
    payload: row.payloadJson,
    ...(row.resolvedAt != null ? { resolvedAt: row.resolvedAt } : {}),
    ...(row.responseJson != null ? { response: row.responseJson } : {}),
  }
}

function createMessageStore(db: Db): MessageStore {
  return {
    async loadThread(threadId) {
      const rows = await db
        .select({ messagesJson: chatThreads.messagesJson })
        .from(chatThreads)
        .where(eq(chatThreads.threadId, threadId))
        .limit(1)
      // Unknown thread is [], never null.
      return rows[0]?.messagesJson ?? []
    },
    // Full overwrite — `messages` is the complete authoritative transcript.
    async saveThread(threadId, messages) {
      const updatedAt = Date.now()
      await db
        .insert(chatThreads)
        .values({ threadId, messagesJson: messages, updatedAt })
        .onConflictDoUpdate({
          target: chatThreads.threadId,
          set: { messagesJson: messages, updatedAt },
        })
    },
  }
}

function createRunStore(db: Db): RunStore {
  async function get(runId: string) {
    const rows = await db
      .select()
      .from(chatRuns)
      .where(eq(chatRuns.runId, runId))
      .limit(1)
    return rows[0] ? mapRun(rows[0]) : null
  }

  return {
    get,
    // Idempotent: an existing runId is returned untouched so resume and
    // double-submit are safe.
    async createOrResume({ runId, threadId, startedAt, status }) {
      const existing = await get(runId)
      if (existing) return existing

      await db
        .insert(chatRuns)
        .values({ runId, threadId, status: status ?? 'running', startedAt })
        .onConflictDoNothing({ target: chatRuns.runId })

      // Re-read rather than trusting the insert: a concurrent createOrResume
      // may have won the race, and that row is the authoritative one.
      const stored = await get(runId)
      return (
        stored ?? { runId, threadId, status: status ?? 'running', startedAt }
      )
    },
    // Patching an unknown runId is a no-op: never throws, never inserts.
    async update(runId, patch) {
      const set: Partial<typeof chatRuns.$inferInsert> = {}
      if (patch.status !== undefined) set.status = patch.status
      if (patch.finishedAt !== undefined) set.finishedAt = patch.finishedAt
      // Both columns move together, so a later code-less failure cannot
      // leave a stale errorCode from an earlier one behind.
      if (patch.error !== undefined) {
        set.error = patch.error.message
        set.errorCode = patch.error.code ?? null
      }
      if (patch.usage !== undefined) set.usageJson = patch.usage
      // The four durable-run fields use `'field' in patch`, NOT
      // `!== undefined`: a reattach clears `detachedSince` by passing it
      // explicitly as `undefined`, and that must still write NULL. Checking
      // `!== undefined` cannot distinguish "clear this" from "didn't mention
      // this", so it would silently drop the clear and leave the run looking
      // permanently detached to the reaper. Same reasoning applies to
      // `cancelRequested` (`false` is a meaningful value, not "unset").
      if ('sandboxKey' in patch) set.sandboxKey = patch.sandboxKey ?? null
      if ('detachedSince' in patch)
        set.detachedSince = patch.detachedSince ?? null
      if ('cancelRequested' in patch)
        set.cancelRequested = patch.cancelRequested ?? null
      if ('driverEpoch' in patch) set.driverEpoch = patch.driverEpoch ?? null
      if (Object.keys(set).length === 0) return

      await db.update(chatRuns).set(set).where(eq(chatRuns.runId, runId))
    },
    // Optional in the contract; enables reconnect without a client-held run id.
    async findActiveRun(threadId) {
      const rows = await db
        .select()
        .from(chatRuns)
        .where(
          and(eq(chatRuns.threadId, threadId), eq(chatRuns.status, 'running')),
        )
        .orderBy(desc(chatRuns.startedAt))
        .limit(1)
      return rows[0] ? mapRun(rows[0]) : null
    },
    // Optional; every run for the thread, ascending by startedAt. Uses the
    // (threadId, startedAt) index.
    async listByThread(threadId) {
      const rows = await db
        .select()
        .from(chatRuns)
        .where(eq(chatRuns.threadId, threadId))
        .orderBy(asc(chatRuns.startedAt))
      return rows.map(mapRun)
    },
    // Optional; still-running runs detached at or before the cutoff. Uses the
    // (status, detachedSince) index. The cutoff is inclusive.
    async listReclaimable({ now, ttlMs }) {
      const cutoff = now - ttlMs
      const rows = await db
        .select()
        .from(chatRuns)
        .where(
          and(
            eq(chatRuns.status, 'running'),
            isNotNull(chatRuns.detachedSince),
            lte(chatRuns.detachedSince, cutoff),
          ),
        )
      return rows.map(mapRun)
    },
  }
}

function createInterruptStore(db: Db): InterruptStore {
  // Every listing is ordered by requestedAt ascending.
  const listWhere = async (where: SQL | undefined) => {
    const rows = await db
      .select()
      .from(chatInterrupts)
      .where(where)
      .orderBy(asc(chatInterrupts.requestedAt))
    return rows.map(mapInterrupt)
  }

  return {
    // Insert-if-absent: a duplicate create must never clobber a resolved
    // interrupt back to pending.
    async create(record) {
      await db
        .insert(chatInterrupts)
        .values({
          interruptId: record.interruptId,
          runId: record.runId,
          threadId: record.threadId,
          status: 'pending',
          requestedAt: record.requestedAt,
          payloadJson: record.payload,
          ...(record.response !== undefined
            ? { responseJson: record.response }
            : {}),
        })
        .onConflictDoNothing({ target: chatInterrupts.interruptId })
    },
    async resolve(interruptId, response) {
      await db
        .update(chatInterrupts)
        .set({
          status: 'resolved',
          resolvedAt: Date.now(),
          ...(response !== undefined ? { responseJson: response } : {}),
        })
        .where(eq(chatInterrupts.interruptId, interruptId))
    },
    async cancel(interruptId) {
      await db
        .update(chatInterrupts)
        .set({ status: 'cancelled', resolvedAt: Date.now() })
        .where(eq(chatInterrupts.interruptId, interruptId))
    },
    async get(interruptId) {
      const rows = await db
        .select()
        .from(chatInterrupts)
        .where(eq(chatInterrupts.interruptId, interruptId))
        .limit(1)
      return rows[0] ? mapInterrupt(rows[0]) : null
    },
    list: (threadId) => listWhere(eq(chatInterrupts.threadId, threadId)),
    listPending: (threadId) =>
      listWhere(
        and(
          eq(chatInterrupts.threadId, threadId),
          eq(chatInterrupts.status, 'pending'),
        ),
      ),
    listByRun: (runId) => listWhere(eq(chatInterrupts.runId, runId)),
    listPendingByRun: (runId) =>
      listWhere(
        and(
          eq(chatInterrupts.runId, runId),
          eq(chatInterrupts.status, 'pending'),
        ),
      ),
  }
}

function createMetadataStore(db: Db): MetadataStore {
  return {
    async get(namespace, key) {
      const rows = await db
        .select({ valueJson: chatMetadata.valueJson })
        .from(chatMetadata)
        .where(
          and(eq(chatMetadata.namespace, namespace), eq(chatMetadata.key, key)),
        )
        .limit(1)
      return rows[0]?.valueJson ?? null
    },
    async set(namespace, key, value) {
      // A JSON-mode column binds JS null as SQL NULL, which the NOT NULL
      // column rejects with an opaque driver error. Fail clearly instead.
      if (value == null) {
        throw new TypeError(
          `Cannot store ${value} for (${namespace}, ${key}) — use delete() to clear metadata.`,
        )
      }
      await db
        .insert(chatMetadata)
        .values({ namespace, key, valueJson: value })
        .onConflictDoUpdate({
          target: [chatMetadata.namespace, chatMetadata.key],
          set: { valueJson: value },
        })
    },
    async delete(namespace, key) {
      await db
        .delete(chatMetadata)
        .where(
          and(eq(chatMetadata.namespace, namespace), eq(chatMetadata.key, key)),
        )
    },
  }
}

/** The four chat state stores backed by the app's Drizzle database. */
export const chatPersistence: ChatPersistence = defineAIPersistence({
  stores: {
    messages: createMessageStore(db),
    runs: createRunStore(db),
    interrupts: createInterruptStore(db),
    metadata: createMetadataStore(db),
  },
})
```

Annotate `ChatPersistence` — bare `AIPersistence` is the all-optional bag and
`withPersistence` rejects it. There is no `locks` store: `stores` accepts only
those four keys, and coordination is wired separately with `withLocks` (see
**ai-core/locks**).

### If `db` is per-request

Workers/D1 and any request-scoped client cannot read a binding at module scope.
Export a factory instead, and call it inside the handler:

```ts ignore
type Db = ReturnType<typeof getDb>

export function chatPersistence(): ChatPersistence {
  const db = getDb()
  return defineAIPersistence({
    stores: {
      messages: createMessageStore(db),
      runs: createRunStore(db),
      interrupts: createInterruptStore(db),
      metadata: createMetadataStore(db),
    },
  })
}
```

The store factories are unchanged — only the export flips from a const to a
function. For D1 specifically, see
**ai-persistence/build-cloudflare-adapter**.

## 4. Wire it into the chat route

```ts ignore
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { chatPersistence } from '@/lib/chat-persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(chatPersistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

`threadId` is a bare string to the stores. **Authorize thread access at the
route** — derive the user from the session, never trust a client-supplied id.

## 5. Verify

```ts ignore
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { chatPersistence } from '../src/lib/chat-persistence'

runPersistenceConformance('app-drizzle', () => chatPersistence, {
  skip: ['generationRuns', 'artifacts', 'blobs'],
})
```

Point it at a throwaway database (`:memory:` SQLite, a scratch schema, PGlite)
that has the migration applied, and reset between runs. The suite covers all
seven stores, so a chat adapter declares the generation half it omits; drop the
`skip` once you add those tables. `skip` never accepts `'locks'`, which is not a
store.

If your recipe leaves an optional `runs` method
(`listByThread`/`listReclaimable`) unimplemented, declare it
with `skipMethods`, e.g. `{ skipMethods: ['runs.listByThread'] }`. An
omitted method that is not declared fails the suite instead of silently
passing.

## Only if you are publishing this as a package

Everything above assumes the file lives in the app. If instead you are shipping
a reusable `drizzle` adapter to npm, the same store bodies apply, plus:

- **Peer deps** `@tanstack/ai`, `@tanstack/ai-persistence`, `drizzle-orm >=0.44.0`;
  dev dep `drizzle-kit`. Keep the module root free of Node built-ins so it is
  edge-safe, and put any `node:sqlite` convenience factory behind a `/sqlite`
  subpath.
- **Type `db` structurally** so a consumer's client is assignable:
  `Pick<BaseSQLiteDatabase<'sync' | 'async', unknown>, 'select' | 'insert' | 'update' | 'delete'>`.
- **Multi-dialect**: take a `provider: 'sqlite' | 'pg'` option, declare
  overloads so `db` and `schema` must agree, and add a runtime dialect check so
  a mismatched pair fails at construction rather than on first query.
- **BYO schema**: accept `drizzlePersistence(db, { schema })`, validate the
  tables/columns exist at construction, and pin the required column shapes with
  a compile-time contract type.
- **Never bundle SQL migrations or a runner.** Either re-export the stock tables
  from a `/sqlite-schema` subpath so the consumer's `drizzle-kit` picks them up,
  or emit an owned starter schema file with a small CLI. An opt-in
  `ensureTables(db)` issuing `CREATE TABLE IF NOT EXISTS` is fine for local dev,
  kept clearly separate from their journal. Pick one DDL owner per database.
- Run `runPersistenceConformance` once per dialect.
