---
title: Build Your Own Adapter
id: build-your-own-adapter
---

# Build Your Own Persistence Adapter

You want server-side chat persistence, but your data lives in your own database:
Postgres behind Prisma, a SQLite file, Cloudflare D1, Mongo, whatever you already
run. TanStack AI does not ship a backend for your exact stack, and you would
rather not add one more service just for chat history.

You do not need a packaged backend. Server persistence is a small set of plain
store interfaces from `@tanstack/ai-persistence`. Implement the ones you want
against your database, hand the result to `withPersistence`, and you are done.
The core never inspects your tables, so the schema is yours to shape.

This guide builds a complete SQLite adapter on Node's built-in `node:sqlite`, end
to end, then shows how to map the same contracts onto a database schema you
already have. The runnable version of everything here lives in the
`examples/ts-react-chat` app (`src/lib/sqlite-persistence.ts`).

## What an adapter is

An adapter is an object with a `stores` map:

```ts ignore
import type {
  ChatTranscriptPersistence,
  MessageStore,
  RunStore,
} from '@tanstack/ai-persistence'

// messages and runs are your store implementations (built below).
declare const messages: MessageStore
declare const runs: RunStore

const persistence: ChatTranscriptPersistence = {
  stores: { messages, runs },
}
```

Each store is independent. Provide only the ones you need: `messages` for the
transcript, `runs` for run lifecycle, `interrupts` for durable approvals (needs
`runs`), `metadata` for namespaced key/value state. The middleware turns on
behavior for whatever stores it finds, so a `messages`-only adapter is a valid
adapter.

Those four are the *only* keys `stores` accepts — anything else throws
`Unknown AIPersistence store key` at construction. Cross-worker coordination is
a separate concern with its own seam (`LockStore` + `withLocks`); see
[Controls](./controls).

Annotate the value with a named shape — `ChatPersistence` for all four,
`ChatTranscriptPersistence` for the floor. Bare `AIPersistence` is the
all-optional bag, and `withPersistence` rejects it because `stores.messages` is
possibly `undefined`.

Every method signature and invariant is in the
[store interface reference](#store-interface-reference) at the end of this page.
The invariants (idempotent creates, insert-if-absent, ordered listings) are what
the shared conformance suite checks, and getting one wrong is the usual source of
subtle bugs.

## New database: a SQLite adapter start to finish

### 1. The schema

Four tables. JSON payloads are stored as text (SQLite has no JSON column type),
timestamps as integers (epoch milliseconds), everything keyed the way the store
methods look records up.

```sql
CREATE TABLE IF NOT EXISTS messages (
  thread_id text PRIMARY KEY NOT NULL,
  messages_json text NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  run_id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  status text NOT NULL,
  started_at integer NOT NULL,
  finished_at integer,
  error text,
  usage_json text
);
CREATE TABLE IF NOT EXISTS interrupts (
  interrupt_id text PRIMARY KEY NOT NULL,
  run_id text NOT NULL,
  thread_id text NOT NULL,
  status text NOT NULL,
  requested_at integer NOT NULL,
  resolved_at integer,
  payload_json text NOT NULL,
  response_json text
);
CREATE TABLE IF NOT EXISTS metadata (
  scope text NOT NULL,
  key text NOT NULL,
  value_json text NOT NULL,
  PRIMARY KEY (scope, key)
);
```

### 2. Messages: full-transcript overwrite

`saveThread` always receives the complete, authoritative history. It is a
replace, not an append. `loadThread` returns `[]` for a thread that was never
saved, never `null`.

```ts ignore
import { DatabaseSync } from 'node:sqlite'
import type { ModelMessage } from '@tanstack/ai'
import type { MessageStore } from '@tanstack/ai-persistence'

function createMessageStore(db: DatabaseSync): MessageStore {
  const select = db.prepare(
    'SELECT messages_json FROM messages WHERE thread_id = ?',
  )
  const upsert = db.prepare(
    `INSERT INTO messages (thread_id, messages_json) VALUES (?, ?)
     ON CONFLICT(thread_id) DO UPDATE SET messages_json = excluded.messages_json`,
  )
  return {
    loadThread(threadId) {
      const row = select.get(threadId)
      if (!row) return Promise.resolve([])
      const parsed: Array<ModelMessage> = JSON.parse(row.messages_json)
      return Promise.resolve(parsed)
    },
    saveThread(threadId, messages) {
      upsert.run(threadId, JSON.stringify(messages))
      return Promise.resolve()
    },
  }
}
```

The store methods are async in the interface, but SQLite here is synchronous, so
each method wraps its result in `Promise.resolve`. On an async driver you would
`await` the query instead.

### 3. Runs: idempotent create, patch, get

`createOrResume` must be idempotent. If the run id already exists, return the
stored record unchanged, so resuming a run never resets its `startedAt` or
status. `INSERT ... ON CONFLICT DO NOTHING` gives you that in one statement.
`update` on an unknown run id is a no-op.

```ts ignore
import type { RunStore, RunStatus } from '@tanstack/ai-persistence'

function createRunStore(db: DatabaseSync): RunStore {
  const select = db.prepare('SELECT * FROM runs WHERE run_id = ?')
  const insert = db.prepare(
    `INSERT INTO runs (run_id, thread_id, status, started_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(run_id) DO NOTHING`,
  )
  const store: RunStore = {
    createOrResume(input) {
      const existing = select.get(input.runId)
      if (existing) return Promise.resolve(rowToRun(existing))
      const status: RunStatus = input.status ?? 'running'
      insert.run(input.runId, input.threadId, status, input.startedAt)
      return Promise.resolve({
        runId: input.runId,
        threadId: input.threadId,
        status,
        startedAt: input.startedAt,
      })
    },
    update(runId, patch) {
      const sets: Array<string> = []
      const params: Array<string | number> = []
      if (patch.status !== undefined) {
        sets.push('status = ?')
        params.push(patch.status)
      }
      if (patch.finishedAt !== undefined) {
        sets.push('finished_at = ?')
        params.push(patch.finishedAt)
      }
      if (patch.error !== undefined) {
        sets.push('error = ?')
        params.push(patch.error)
      }
      if (patch.usage !== undefined) {
        sets.push('usage_json = ?')
        params.push(JSON.stringify(patch.usage))
      }
      if (sets.length === 0) return Promise.resolve()
      params.push(runId)
      db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE run_id = ?`).run(
        ...params,
      )
      return Promise.resolve()
    },
    get(runId) {
      const row = select.get(runId)
      return Promise.resolve(row ? rowToRun(row) : null)
    },
  }
  return store
}
```

`update` builds its `SET` list from only the fields present in the patch, so an
empty patch touches nothing and a partial patch leaves other columns alone. Map
each row back with a small helper that omits absent optional fields and parses
the JSON columns.

### 4. Interrupts: insert-if-absent, ordered listings

`create` is insert-if-absent: a duplicate interrupt id must never overwrite an
interrupt that was already resolved. Every `list*` method returns records ordered
by `requested_at` ascending, which the middleware relies on.

```ts ignore
import type { InterruptStore } from '@tanstack/ai-persistence'

function createInterruptStore(db: DatabaseSync): InterruptStore {
  const insert = db.prepare(
    `INSERT INTO interrupts
       (interrupt_id, run_id, thread_id, status, requested_at, payload_json, response_json)
     VALUES (?, ?, ?, 'pending', ?, ?, ?)
     ON CONFLICT(interrupt_id) DO NOTHING`,
  )
  const listByThread = db.prepare(
    'SELECT * FROM interrupts WHERE thread_id = ? ORDER BY requested_at ASC',
  )
  return {
    create(record) {
      insert.run(
        record.interruptId,
        record.runId,
        record.threadId,
        record.requestedAt,
        JSON.stringify(record.payload),
        record.response === undefined ? null : JSON.stringify(record.response),
      )
      return Promise.resolve()
    },
    list(threadId) {
      return Promise.resolve(listByThread.all(threadId).map(rowToInterrupt))
    },
    // resolve / cancel stamp resolved_at = Date.now(); get returns one row or
    // null; listPending, listByRun, and listPendingByRun add a WHERE clause but
    // keep the same ORDER BY requested_at ASC.
  }
}
```

### 5. Metadata: reject nullish

`(scope, key)` is the composite identity. A SQL backend cannot store a nullish
value in a `NOT NULL` text column, so reject `null` and `undefined` with a clear
error instead of a cryptic driver failure. Callers clear a value with `delete`.

```ts ignore
import type { MetadataStore } from '@tanstack/ai-persistence'

function createMetadataStore(db: DatabaseSync): MetadataStore {
  const select = db.prepare(
    'SELECT value_json FROM metadata WHERE scope = ? AND key = ?',
  )
  const upsert = db.prepare(
    `INSERT INTO metadata (scope, key, value_json) VALUES (?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET value_json = excluded.value_json`,
  )
  return {
    get(scope, key) {
      const row = select.get(scope, key)
      return Promise.resolve(row ? JSON.parse(row.value_json) : null)
    },
    set(scope, key, value) {
      if (value == null) {
        throw new TypeError(
          'Metadata values must be defined, non-null JSON. Use delete() to clear.',
        )
      }
      upsert.run(scope, key, JSON.stringify(value))
      return Promise.resolve()
    },
    delete(scope, key) {
      db.prepare('DELETE FROM metadata WHERE scope = ? AND key = ?').run(
        scope,
        key,
      )
      return Promise.resolve()
    },
  }
}
```

### 6. Assemble the adapter

Open the database, create the tables, and return the stores as an
`AIPersistence`. `defineAIPersistence` keeps the exact store keys in the type and
rejects unknown keys at runtime.

```ts ignore
import { DatabaseSync } from 'node:sqlite'
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type { ChatPersistence } from '@tanstack/ai-persistence'

export function sqlitePersistence(options: {
  url: string
  migrate?: boolean
}): ChatPersistence {
  const db = new DatabaseSync(options.url)
  if (options.migrate) db.exec(SCHEMA_SQL)
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

That is a complete backend. Work coordinated across multiple workers also needs
a `LockStore`, which is wired separately with `withLocks` rather than added to
`stores` (see [Controls](./controls)).

Wire it into `chat()` exactly like any other persistence:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

## Existing database: map the contracts onto your schema

You do not have to create the four tables above. If you already have a database,
map each store method onto the tables and columns you already run. Three things
change from the from-scratch version.

**Your column names, your types.** The core reads and writes only through your
store methods, so name columns whatever you like and use your database's native
types. Store `messages_json` as a real `jsonb` column on Postgres, use a
`timestamptz` for `started_at` and convert to epoch milliseconds in your row
mapper, split `usage` into real columns if you want to query it. The record shape
the methods return is fixed; how you store it is not.

**Extra columns are fine.** Add a `user_id` to the messages table to scope
threads per user, add `created_at`/`updated_at` audit columns, add a tenant id.
Keep added columns nullable or defaulted so the store's inserts still succeed. The
TanStack AI stores never read or write columns they do not know about.

**Adopt part of it.** You rarely need all four stores in the same database. Put
`messages` and `runs` in your primary database and nothing else, then fill the
rest from another source with `composePersistence`:

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { messages, runs } from './my-postgres-stores'

// Start from any base and replace the stores you own.
export const persistence = composePersistence(memoryPersistence(), {
  overrides: { messages, runs },
})
```

One caveat: `composePersistence` does not add a transaction across different
systems. If `messages` lives in Postgres and `interrupts` in Redis, a write that
must touch both is two writes; design retries and idempotency for that yourself.
The store invariants (idempotent `createOrResume`, insert-if-absent `create`) are
what make those retries safe, which is exactly why they are invariants.

## Verify with the conformance suite

Do not eyeball it. `@tanstack/ai-persistence` ships the same conformance test
suite every packaged backend runs. Point it at your factory and it exercises
every method of every store you provide, including the ordering and idempotency
rules that are easy to get subtly wrong.

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlitePersistence } from './sqlite-persistence'

runPersistenceConformance('my sqlite adapter', () =>
  sqlitePersistence({ url: ':memory:', migrate: true }),
)
```

The adapter above provides all four stores, so there is nothing to declare. A
partial adapter lists what it deliberately omits:

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { transcriptOnlyPersistence } from './transcript-only'

runPersistenceConformance(
  'transcript-only adapter',
  () => transcriptOnlyPersistence(),
  { skip: ['runs', 'interrupts', 'metadata'] },
)
```

`skip` accepts only the four state store keys. A store that is absent and not
listed fails the suite loudly, so you cannot ship a half-wired adapter by
accident. When this is green, your adapter is a drop-in for `withPersistence`.
The `examples/ts-react-chat` app runs exactly this test against its SQLite
backend.

## Let your coding agent write it

You do not have to type this page out. `@tanstack/ai-persistence` ships
[Agent Skills](../getting-started/agent-skills) that turn it into a recipe your
assistant follows against **your** stack: it reads your existing ORM config,
schema file, and database handle, appends the four tables to the schema you
already have, and writes a single `src/lib/chat-persistence.ts` exporting the
`ChatPersistence` — no new package, no second database client, and no migration
mechanism competing with the one you run.

Install the skills with [TanStack Intent](https://tanstack.com/intent/latest/docs/overview),
which scans `node_modules` for packages that ship skills and writes the mappings
into your agent's config (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, …):

```bash
pnpm add @tanstack/ai-persistence
npx @tanstack/intent@latest install
```

Then ask for what you want — "add chat persistence to this app" — and the
matching skill loads itself into context:

| Skill                                     | Covers                                                              |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `ai-persistence`                          | Entry point — routes to everything below                            |
| `ai-persistence/server`                   | `withPersistence`, run lifecycle, interrupts, `reconstructChat`     |
| `ai-persistence/stores`                   | The store contracts and their invariants                            |
| `ai-persistence/locks`                    | `LockStore` / `withLocks` coordination (lives in `@tanstack/ai`)    |
| `ai-persistence/build-drizzle-adapter`    | `chat-persistence.ts` for a Drizzle app (SQLite / Postgres / MySQL) |
| `ai-persistence/build-prisma-adapter`     | `chat-persistence.ts` for a Prisma app                              |
| `ai-persistence/build-cloudflare-adapter` | `chat-persistence.ts` for a Worker on D1, plus Durable Object locks |
| `ai-persistence/build-custom-adapter`     | `chat-persistence.ts` for anything else — raw `pg`, Kysely, SQLite, Mongo, Supabase |

Browser-side persistence is not in this package — its skill ships with
`@tanstack/ai` as `ai-core/client-persistence`, alongside the framework code it
teaches.

They are plain Markdown at
`node_modules/@tanstack/ai-persistence/skills/<skill-name>/SKILL.md` if you
prefer to read or follow them yourself.

## Store interface reference

These are the public contracts from `@tanstack/ai-persistence`. Implement only
the stores you need.

### MessageStore

```ts
import type { ModelMessage } from '@tanstack/ai'

interface MessageStore {
  loadThread(threadId: string): Promise<Array<ModelMessage>>
  saveThread(threadId: string, messages: Array<ModelMessage>): Promise<void>
}
```

`saveThread` receives the full authoritative model-message history, not a delta.
`loadThread` returns `[]` (never `null`) for a thread that was never saved.

### RunStore

```ts
import type { RunRecord } from '@tanstack/ai-persistence'

interface RunStore {
  createOrResume(input: {
    runId: string
    threadId: string
    status?: 'running' | 'completed' | 'failed' | 'interrupted'
    startedAt: number
  }): Promise<RunRecord>
  update(
    runId: string,
    patch: Partial<
      Pick<RunRecord, 'status' | 'finishedAt' | 'error' | 'usage'>
    >,
  ): Promise<void>
  get(runId: string): Promise<RunRecord | null>
}
```

Implement `createOrResume` idempotently: a second call for an existing `runId`
returns the stored record unchanged, which is what makes resuming a run safe.
`update` against an unknown `runId` is a no-op. Retries may repeat the same run
id.

### InterruptStore

```ts
import type { InterruptRecord } from '@tanstack/ai-persistence'

interface InterruptStore {
  create(record: Omit<InterruptRecord, 'status' | 'resolvedAt'>): Promise<void>
  resolve(interruptId: string, response?: unknown): Promise<void>
  cancel(interruptId: string): Promise<void>
  get(interruptId: string): Promise<InterruptRecord | null>
  list(threadId: string): Promise<Array<InterruptRecord>>
  listPending(threadId: string): Promise<Array<InterruptRecord>>
  listByRun(runId: string): Promise<Array<InterruptRecord>>
  listPendingByRun(runId: string): Promise<Array<InterruptRecord>>
}
```

`create` accepts a record without `status`/`resolvedAt` so every interrupt is
born `'pending'`; it is insert-if-absent, so a duplicate `create` never clobbers
an already-resolved interrupt. The `list*` methods return records ordered by
`requestedAt` ascending. An `interrupts` store requires a `runs` store when used
with chat persistence.

### MetadataStore

```ts
interface MetadataStore {
  get(scope: string, key: string): Promise<unknown | null>
  set(scope: string, key: string, value: unknown): Promise<void>
  delete(scope: string, key: string): Promise<void>
}
```

Namespaces and value schemas are application-owned, and `(scope, key)` is the
composite identity. A stored `null` is indistinguishable from absence at the type
level, so wrap a value you must persist as `null` (e.g. `{ value: null }`), or
reject nullish values outright the way the SQLite store above does.

## Not a store: `LockStore`

Mutual exclusion is **not** part of `AIPersistence.stores`. Wire it with
`withLocks` from `@tanstack/ai`. Full guide: [Locks](../advanced/locks).

## Where to go next

- [Controls](./controls): compose stores from different systems.
- [Locks](../advanced/locks): `LockStore` / `withLocks` coordination.
- [Migrations](./migrations): who owns the schema and when to apply changes.
- [Internals](./internals): the middleware lifecycle your stores plug into.
