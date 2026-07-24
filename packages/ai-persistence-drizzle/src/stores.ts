/**
 * AIPersistence store implementations over a Drizzle SQLite database.
 *
 * Stores operate on injected table objects from the caller's schema. JSON
 * columns are expected to use Drizzle's `text({ mode: 'json' })` (or equivalent
 * that decodes to the contract data shapes).
 */
import { and, asc, eq } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'
import type {
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStatus,
  RunStore,
} from '@tanstack/ai-persistence'
import type { TanstackAiSqliteSchema } from './schema-contract'

/**
 * Any Drizzle sqlite database (better-sqlite3, libsql, node:sqlite proxy, D1, …).
 *
 * Typed as the schema-agnostic slice of the query builder we actually use, so a
 * BYO `db` constructed with any `{ schema }` is assignable regardless of its
 * `TFullSchema` (which is invariant on the full `BaseSQLiteDatabase`).
 */
export type DrizzleSqliteDb = Pick<
  BaseSQLiteDatabase<'sync' | 'async', unknown>,
  'select' | 'insert' | 'update' | 'delete'
>

/** @deprecated Use {@link DrizzleSqliteDb}. */
export type DrizzleDb = DrizzleSqliteDb

/**
 * Table set the stores read/write. Only column *data* shapes matter; table and
 * column database names are carried by the runtime objects.
 */
export type TanstackAiTables = TanstackAiSqliteSchema

type RunRow = {
  runId: string
  threadId: string
  status: RunStatus
  startedAt: number
  finishedAt: number | null
  error: string | null
  usageJson: TokenUsage | null
}

type InterruptRow = {
  interruptId: string
  runId: string
  threadId: string
  status: InterruptRecord['status']
  requestedAt: number
  resolvedAt: number | null
  payloadJson: Record<string, unknown>
  responseJson: unknown | null
}

export function createMessageStore(
  db: DrizzleSqliteDb,
  { messages }: TanstackAiTables,
): MessageStore {
  return {
    async loadThread(threadId) {
      const rows = await db
        .select({ messagesJson: messages.messagesJson })
        .from(messages)
        .where(eq(messages.threadId, threadId))
      return rows[0]?.messagesJson ?? []
    },
    async saveThread(threadId, msgs: Array<ModelMessage>) {
      await db
        .insert(messages)
        .values({ threadId, messagesJson: msgs })
        .onConflictDoUpdate({
          target: messages.threadId,
          set: { messagesJson: msgs },
        })
    },
  }
}

function mapRun(row: RunRow): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    startedAt: row.startedAt,
    ...(row.finishedAt != null ? { finishedAt: row.finishedAt } : {}),
    ...(row.error != null ? { error: row.error } : {}),
    ...(row.usageJson != null ? { usage: row.usageJson } : {}),
  }
}

export function createRunStore(
  db: DrizzleSqliteDb,
  { runs }: TanstackAiTables,
): RunStore {
  const store: RunStore = {
    async createOrResume(input) {
      const existing = await store.get(input.runId)
      if (existing) return existing
      const record: RunRecord = {
        runId: input.runId,
        threadId: input.threadId,
        status: input.status ?? 'running',
        startedAt: input.startedAt,
      }
      await db
        .insert(runs)
        .values({
          runId: record.runId,
          threadId: record.threadId,
          status: record.status,
          startedAt: record.startedAt,
        })
        .onConflictDoNothing({ target: runs.runId })
      return (await store.get(input.runId)) ?? record
    },
    async update(runId, patch) {
      const set: {
        status?: RunStatus
        finishedAt?: number | null
        error?: string | null
        usageJson?: TokenUsage | null
      } = {}
      if (patch.status !== undefined) set.status = patch.status
      if (patch.finishedAt !== undefined) set.finishedAt = patch.finishedAt
      if (patch.error !== undefined) set.error = patch.error
      if (patch.usage !== undefined) set.usageJson = patch.usage
      if (Object.keys(set).length === 0) return
      await db.update(runs).set(set).where(eq(runs.runId, runId))
    },
    async get(runId) {
      const rows = await db.select().from(runs).where(eq(runs.runId, runId))
      const row = rows[0] as RunRow | undefined
      return row ? mapRun(row) : null
    },
  }
  return store
}

function mapInterrupt(row: InterruptRow): InterruptRecord {
  return {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    requestedAt: row.requestedAt,
    ...(row.resolvedAt != null ? { resolvedAt: row.resolvedAt } : {}),
    payload: row.payloadJson,
    ...(row.responseJson != null ? { response: row.responseJson } : {}),
  }
}

export function createInterruptStore(
  db: DrizzleSqliteDb,
  { interrupts }: TanstackAiTables,
): InterruptStore {
  return {
    async create(record) {
      await db
        .insert(interrupts)
        .values({
          interruptId: record.interruptId,
          runId: record.runId,
          threadId: record.threadId,
          status: 'pending',
          requestedAt: record.requestedAt,
          payloadJson: record.payload,
          responseJson: record.response ?? null,
        })
        .onConflictDoNothing({ target: interrupts.interruptId })
    },
    async resolve(interruptId, response) {
      await db
        .update(interrupts)
        .set({
          status: 'resolved',
          resolvedAt: Date.now(),
          responseJson: response ?? null,
        })
        .where(eq(interrupts.interruptId, interruptId))
    },
    async cancel(interruptId) {
      await db
        .update(interrupts)
        .set({ status: 'cancelled', resolvedAt: Date.now() })
        .where(eq(interrupts.interruptId, interruptId))
    },
    async get(interruptId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(eq(interrupts.interruptId, interruptId))
      const row = rows[0] as InterruptRow | undefined
      return row ? mapInterrupt(row) : null
    },
    async list(threadId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(eq(interrupts.threadId, threadId))
        .orderBy(asc(interrupts.requestedAt))
      return (rows as Array<InterruptRow>).map(mapInterrupt)
    },
    async listPending(threadId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(
          and(
            eq(interrupts.threadId, threadId),
            eq(interrupts.status, 'pending'),
          ),
        )
        .orderBy(asc(interrupts.requestedAt))
      return (rows as Array<InterruptRow>).map(mapInterrupt)
    },
    async listByRun(runId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(eq(interrupts.runId, runId))
        .orderBy(asc(interrupts.requestedAt))
      return (rows as Array<InterruptRow>).map(mapInterrupt)
    },
    async listPendingByRun(runId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(
          and(eq(interrupts.runId, runId), eq(interrupts.status, 'pending')),
        )
        .orderBy(asc(interrupts.requestedAt))
      return (rows as Array<InterruptRow>).map(mapInterrupt)
    },
  }
}

function assertStorableMetadata(value: unknown): void {
  if (value == null) {
    throw new TypeError(
      `TanStack AI metadata values must be defined, non-null JSON; received ${
        value === undefined ? '`undefined`' : '`null`'
      }. Use \`delete(scope, key)\` to clear a value.`,
    )
  }
}

export function createMetadataStore(
  db: DrizzleSqliteDb,
  { metadata }: TanstackAiTables,
): MetadataStore {
  return {
    async get(scope, key) {
      const rows = await db
        .select({ valueJson: metadata.valueJson })
        .from(metadata)
        .where(and(eq(metadata.scope, scope), eq(metadata.key, key)))
      const row = rows[0]
      return row ? row.valueJson : null
    },
    async set(scope, key, value) {
      // SQL backends store JSON text in a NOT NULL column and cannot persist a
      // nullish value: `text({ mode: 'json' })` binds a JS `null` as SQL NULL
      // (it never serializes it to the text `"null"`), and `undefined` has no
      // JSON at all — both violate NOT NULL. Reject nullish with a clear error
      // (consistent with the sibling Prisma backend) instead of a cryptic
      // driver failure. Unlike the in-memory reference, which round-trips
      // nullish; use `delete` to clear.
      assertStorableMetadata(value)
      await db
        .insert(metadata)
        .values({ scope, key, valueJson: value })
        .onConflictDoUpdate({
          target: [metadata.scope, metadata.key],
          set: { valueJson: value },
        })
    },
    async delete(scope, key) {
      await db
        .delete(metadata)
        .where(and(eq(metadata.scope, scope), eq(metadata.key, key)))
    },
  }
}
