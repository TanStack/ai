---
name: ai-persistence/build-prisma-adapter
description: Use when an app already runs Prisma and needs TanStack AI chat persistence — writes a chat-persistence.ts into the app against its existing PrismaClient and schema.prisma. Covers the four models, BigInt timestamps, JSON-as-string columns, upsert-with-empty-update idempotency, and model renaming.
---

# Prisma Chat Persistence

The deliverable is **one file in the app** — `src/lib/chat-persistence.ts` —
exporting a `ChatPersistence` built from the app's existing `PrismaClient`. Plus
four models added to the app's existing `schema.prisma` and a migration created
with the app's own `prisma migrate`.

Do not create a package, a second client, a datasource block, a generator, or a
hand-written SQL migration. The app has those.

Read the **Store Reference**
(`docs/persistence/store-reference.md`) for the store contracts and
invariants, and **ai-persistence/stores** for the shape rules. Every
store below mirrors the reference in-memory backend in
`@tanstack/ai-persistence` (`memory.ts`); the shared conformance testkit is the
proof.

## 1. Read the app before writing anything

| Find                 | Where to look                                                                  | What it decides                                                 |
| -------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Schema location      | `prisma/schema.prisma`, or a multi-file `prisma/schema/` dir                   | Append to the existing file, or add one new `.prisma` file      |
| Provider             | the `datasource` block                                                         | Whether `Json` is available; nothing else changes               |
| Client singleton     | `src/lib/prisma.ts`, `src/db.ts`, `globalThis` dev cache                       | What `chat-persistence.ts` imports — never `new PrismaClient()` |
| Generated client     | the `generator client` block (`output`, `prisma-client-js` vs `prisma-client`) | Where `ChatRun`/`ChatInterrupt` row types come from             |
| Existing model names | the schema                                                                     | Whether `Message`/`Run` are taken — prefix if so                |
| Migration flow       | `prisma/migrations/`, or `db push` in scripts                                  | `prisma migrate dev` vs `prisma db push`                        |

Prisma 6 and 7 both work: the delegate query API (`findUnique`, `upsert`,
`update`, `findMany`, `delete`) is unchanged, so it does not matter which
client the app generated.

**Never invent a migration path.** Add the models, then have the user run their
own `npx prisma migrate dev --name chat-persistence` (or `db push`) and
`prisma generate`.

## 2. Add the models to their schema

IDs are `String`, timestamps are `BigInt` (portable epoch ms — `Int` overflows
in 2038, `DateTime` forces a conversion at every boundary), JSON payloads are
`String`. Use `@map`/`@@map` to match the app's database naming.

```prisma
model ChatThread {
  threadId     String @id @map("thread_id")
  messagesJson String @map("messages_json")
  updatedAt    BigInt @map("updated_at")

  @@map("chat_threads")
}

model ChatRun {
  runId           String  @id @map("run_id")
  threadId        String  @map("thread_id")
  status          String
  startedAt       BigInt  @map("started_at")
  finishedAt      BigInt? @map("finished_at")
  error           String?
  errorCode       String? @map("error_code")
  usageJson       String? @map("usage_json")
  sandboxKey      String? @map("sandbox_key")
  detachedSince   BigInt? @map("detached_since")
  cancelRequested Boolean? @map("cancel_requested")
  driverEpoch     Int?     @map("driver_epoch")

  @@index([threadId, status])
  @@index([threadId, startedAt])
  // Powers listReclaimable: status = 'running' AND detachedSince <= cutoff.
  @@index([status, detachedSince])
  @@map("chat_runs")
}

model ChatInterrupt {
  interruptId  String  @id @map("interrupt_id")
  runId        String  @map("run_id")
  threadId     String  @map("thread_id")
  status       String
  requestedAt  BigInt  @map("requested_at")
  resolvedAt   BigInt? @map("resolved_at")
  payloadJson  String  @map("payload_json")
  responseJson String? @map("response_json")

  @@index([threadId, requestedAt])
  @@map("chat_interrupts")
}

model ChatMetadata {
  namespace String
  key       String
  valueJson String @map("value_json")

  @@id([namespace, key])
  @@map("chat_metadata")
}
```

Rename models freely to fit the app — the store code below is the only thing
that references them. Extra app-owned fields (a `userId`, audit columns) are
fine as long as they are optional or defaulted, so the stores' creates still
succeed. `namespace` is the `MetadataStore` first argument; the stock SQL in
the guide calls the same column `scope`.

`RunRecord.error` is a structured `RunError` (`{ message: string, code?: string }`),
so it gets two columns rather than one JSON blob: `error` for the provider's
prose and `errorCode` for the stable classification an operator filters and
groups by. `error` and `errorCode` always move together in `update`, so a
later code-less failure can never leave a stale `code` from an earlier one
behind.

On **Postgres or MySQL** you can switch the `*Json` fields to Prisma's `Json`
type and drop the `JSON.stringify`/`parse` in the mappers below. Keep `String`
if the app targets SQLite or if it is multi-provider.

## 3. Write `src/lib/chat-persistence.ts`

Two conversions the SQL backends do not need: `BigInt` timestamps in and out,
and JSON as strings. Everything else is the shared invariant set.

```ts ignore
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type {
  ChatInterrupt,
  ChatRun,
  Prisma,
  PrismaClient,
} from '@prisma/client'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'
import type {
  ChatPersistence,
  InterruptRecord,
  InterruptStatus,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStatus,
  RunStore,
} from '@tanstack/ai-persistence'

import { prisma } from '@/lib/prisma'

// Trusts the shape the stores themselves wrote — nothing else writes these
// columns.
function parseJson<T>(raw: string): T {
  return JSON.parse(raw)
}

const RUN_STATUSES: ReadonlyArray<RunStatus> = [
  'running',
  'interrupted',
  'completed',
  'failed',
  'aborted',
]
const INTERRUPT_STATUSES: ReadonlyArray<InterruptStatus> = [
  'pending',
  'resolved',
  'cancelled',
]

// The column is a plain String, so narrow instead of trusting it.
function toRunStatus(value: string): RunStatus {
  const status = RUN_STATUSES.find((candidate) => candidate === value)
  if (!status) throw new Error(`Unknown run status: ${value}`)
  return status
}

function toInterruptStatus(value: string): InterruptStatus {
  const status = INTERRUPT_STATUSES.find((candidate) => candidate === value)
  if (!status) throw new Error(`Unknown interrupt status: ${value}`)
  return status
}

// Records omit absent optionals so they compare cleanly against the reference
// in-memory backend.
function mapRun(row: ChatRun): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: toRunStatus(row.status),
    startedAt: Number(row.startedAt),
    ...(row.finishedAt != null ? { finishedAt: Number(row.finishedAt) } : {}),
    ...(row.error != null
      ? {
          error: {
            message: row.error,
            ...(row.errorCode != null ? { code: row.errorCode } : {}),
          },
        }
      : {}),
    ...(row.usageJson != null
      ? { usage: parseJson<TokenUsage>(row.usageJson) }
      : {}),
    ...(row.sandboxKey != null ? { sandboxKey: row.sandboxKey } : {}),
    ...(row.detachedSince != null
      ? { detachedSince: Number(row.detachedSince) }
      : {}),
    ...(row.cancelRequested != null
      ? { cancelRequested: row.cancelRequested }
      : {}),
    ...(row.driverEpoch != null ? { driverEpoch: row.driverEpoch } : {}),
  }
}

function mapInterrupt(row: ChatInterrupt): InterruptRecord {
  return {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    status: toInterruptStatus(row.status),
    requestedAt: Number(row.requestedAt),
    payload: parseJson<Record<string, unknown>>(row.payloadJson),
    ...(row.resolvedAt != null ? { resolvedAt: Number(row.resolvedAt) } : {}),
    ...(row.responseJson != null
      ? { response: parseJson<unknown>(row.responseJson) }
      : {}),
  }
}

function createMessageStore(db: PrismaClient): MessageStore {
  return {
    async loadThread(threadId) {
      const row = await db.chatThread.findUnique({ where: { threadId } })
      // Unknown thread is [], never null.
      return row ? parseJson<Array<ModelMessage>>(row.messagesJson) : []
    },
    // Full overwrite — `messages` is the complete authoritative transcript.
    async saveThread(threadId, messages) {
      const messagesJson = JSON.stringify(messages)
      const updatedAt = BigInt(Date.now())
      await db.chatThread.upsert({
        where: { threadId },
        create: { threadId, messagesJson, updatedAt },
        update: { messagesJson, updatedAt },
      })
    },
  }
}

function createRunStore(db: PrismaClient): RunStore {
  return {
    async get(runId) {
      const row = await db.chatRun.findUnique({ where: { runId } })
      return row ? mapRun(row) : null
    },
    // An empty `update` is Prisma's ON CONFLICT DO NOTHING: an existing runId
    // comes back untouched, so resume and double-submit are safe.
    async createOrResume({ runId, threadId, startedAt, status }) {
      const row = await db.chatRun.upsert({
        where: { runId },
        create: {
          runId,
          threadId,
          status: status ?? 'running',
          startedAt: BigInt(startedAt),
        },
        update: {},
      })
      return mapRun(row)
    },
    // Patching an unknown runId is a no-op: never throws, never inserts.
    async update(runId, patch) {
      const data: Prisma.ChatRunUpdateManyMutationInput = {}
      if (patch.status !== undefined) data.status = patch.status
      if (patch.finishedAt !== undefined) {
        data.finishedAt = BigInt(patch.finishedAt)
      }
      // Both columns move together, so a later code-less failure cannot
      // leave a stale errorCode from an earlier one behind.
      if (patch.error !== undefined) {
        data.error = patch.error.message
        data.errorCode = patch.error.code ?? null
      }
      if (patch.usage !== undefined)
        data.usageJson = JSON.stringify(patch.usage)
      // The four durable-run fields use `'field' in patch`, NOT
      // `!== undefined`: a reattach clears `detachedSince` by passing it
      // explicitly as `undefined`, and that must still write NULL, not be
      // silently dropped from the update. Checking `!== undefined` cannot
      // tell "clear this" from "didn't mention this", and would leave every
      // reattached run looking permanently detached to the reaper. Same
      // reasoning for `cancelRequested` (`false` is a meaningful value).
      if ('sandboxKey' in patch) data.sandboxKey = patch.sandboxKey ?? null
      if ('detachedSince' in patch) {
        data.detachedSince =
          patch.detachedSince === undefined ? null : BigInt(patch.detachedSince)
      }
      if ('cancelRequested' in patch)
        data.cancelRequested = patch.cancelRequested ?? null
      if ('driverEpoch' in patch) data.driverEpoch = patch.driverEpoch ?? null
      if (Object.keys(data).length === 0) return

      await db.chatRun.updateMany({ where: { runId }, data })
    },
    // Optional in the contract; enables reconnect without a client-held run id.
    async findActiveRun(threadId) {
      const row = await db.chatRun.findFirst({
        where: { threadId, status: 'running' },
        orderBy: { startedAt: 'desc' },
      })
      return row ? mapRun(row) : null
    },
    // Optional; every run for the thread, ascending by startedAt. Uses the
    // (threadId, startedAt) index.
    async listByThread(threadId) {
      const rows = await db.chatRun.findMany({
        where: { threadId },
        orderBy: { startedAt: 'asc' },
      })
      return rows.map(mapRun)
    },
    // Optional; still-running runs detached at or before the cutoff. Uses
    // the (status, detachedSince) index. The cutoff is inclusive.
    async listReclaimable({ now, ttlMs }) {
      const cutoff = BigInt(now - ttlMs)
      const rows = await db.chatRun.findMany({
        where: {
          status: 'running',
          detachedSince: { not: null, lte: cutoff },
        },
      })
      return rows.map(mapRun)
    },
  }
}

function createInterruptStore(db: PrismaClient): InterruptStore {
  // Every listing is ordered by requestedAt ascending.
  const listWhere = async (where: Prisma.ChatInterruptWhereInput) => {
    const rows = await db.chatInterrupt.findMany({
      where,
      orderBy: { requestedAt: 'asc' },
    })
    return rows.map(mapInterrupt)
  }

  return {
    // Insert-if-absent: a duplicate create must never clobber a resolved
    // interrupt back to pending.
    async create(record) {
      await db.chatInterrupt.upsert({
        where: { interruptId: record.interruptId },
        create: {
          interruptId: record.interruptId,
          runId: record.runId,
          threadId: record.threadId,
          status: 'pending',
          requestedAt: BigInt(record.requestedAt),
          payloadJson: JSON.stringify(record.payload),
          ...(record.response !== undefined
            ? { responseJson: JSON.stringify(record.response) }
            : {}),
        },
        update: {},
      })
    },
    async resolve(interruptId, response) {
      await db.chatInterrupt.updateMany({
        where: { interruptId },
        data: {
          status: 'resolved',
          resolvedAt: BigInt(Date.now()),
          ...(response !== undefined
            ? { responseJson: JSON.stringify(response) }
            : {}),
        },
      })
    },
    async cancel(interruptId) {
      await db.chatInterrupt.updateMany({
        where: { interruptId },
        data: { status: 'cancelled', resolvedAt: BigInt(Date.now()) },
      })
    },
    async get(interruptId) {
      const row = await db.chatInterrupt.findUnique({ where: { interruptId } })
      return row ? mapInterrupt(row) : null
    },
    list: (threadId) => listWhere({ threadId }),
    listPending: (threadId) => listWhere({ threadId, status: 'pending' }),
    listByRun: (runId) => listWhere({ runId }),
    listPendingByRun: (runId) => listWhere({ runId, status: 'pending' }),
  }
}

function createMetadataStore(db: PrismaClient): MetadataStore {
  return {
    async get(namespace, key) {
      const row = await db.chatMetadata.findUnique({
        where: { namespace_key: { namespace, key } },
      })
      return row ? parseJson<unknown>(row.valueJson) : null
    },
    async set(namespace, key, value) {
      // JSON.stringify(undefined) is undefined, which Prisma rejects against a
      // required column with an opaque error. Fail clearly instead.
      if (value == null) {
        throw new TypeError(
          `Cannot store ${value} for (${namespace}, ${key}) — use delete() to clear metadata.`,
        )
      }
      const valueJson = JSON.stringify(value)
      await db.chatMetadata.upsert({
        where: { namespace_key: { namespace, key } },
        create: { namespace, key, valueJson },
        update: { valueJson },
      })
    },
    async delete(namespace, key) {
      await db.chatMetadata.deleteMany({ where: { namespace, key } })
    },
  }
}

/** The four chat state stores backed by the app's Prisma client. */
export const chatPersistence: ChatPersistence = defineAIPersistence({
  stores: {
    messages: createMessageStore(prisma),
    runs: createRunStore(prisma),
    interrupts: createInterruptStore(prisma),
    metadata: createMetadataStore(prisma),
  },
})
```

Notes that bite:

- **`updateMany`, not `update`, for patches.** `update` throws
  `P2025` on a missing row; the contract says a patch to an unknown id is a
  silent no-op.
- **`namespace_key`** is Prisma's generated alias for the `@@id([namespace, key])`
  composite. If you rename the fields, the alias name changes with them.
- Annotate `ChatPersistence` — bare `AIPersistence` is the all-optional bag and
  `withPersistence` rejects it. There is no `locks` store: `stores` accepts only
  those four keys, and coordination is wired separately with `withLocks` (see
  **ai-core/locks**).
- If the app renamed the models, the delegate accessors are **camelCase**
  (`prisma.chatThread` for `model ChatThread`), and the row types imported from
  the client are PascalCase.

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

runPersistenceConformance('app-prisma', () => chatPersistence, {
  skip: ['generationRuns', 'artifacts', 'blobs'],
})
```

Point the client at a throwaway database with the migration applied (a scratch
SQLite file is enough) and reset it between runs. All four state stores are
provided; the suite also covers the three generation stores, so declare those as
skipped until you add them. `skip` never accepts `'locks'`, which is not a
store.

If your recipe leaves an optional `runs` method
(`listByThread`/`listReclaimable`) unimplemented, declare it
with `skipMethods`, e.g. `{ skipMethods: ['runs.listByThread'] }`. An
omitted method that is not declared fails the suite instead of silently
passing.

## Only if you are publishing this as a package

Everything above assumes the file lives in the app. For a reusable npm adapter,
the same store bodies apply, plus:

- **Peer dep** `@prisma/client >=6.7.0`. Ship no datasource, generator,
  connection URL, or prebuilt SQL migration — those stay in the consumer's
  schema.
- **Type the client structurally** (a `PrismaClientLike` shape) and read model
  delegates off it at runtime, so Prisma 6 and 7 clients both satisfy it
  regardless of where they were generated.
- **Ship the models as a raw string asset** plus a CLI
  (`tanstack-ai-prisma-models`) that copies a provider-neutral fragment into the
  consumer's multi-file schema directory. They then run `prisma migrate`.
- **Let consumers rename**: `prismaPersistence(prisma, { models: { messages: 'chatMessage' } })`,
  where map values are the camelCase client accessors. Throw a
  `PrismaModelError` naming every store whose delegate cannot be found. Keep the
  field surface and the composite-id alias fixed; database names and extra
  app-owned fields are theirs.
- Run `runPersistenceConformance` over a temporary SQLite database generated
  from the fragment.
