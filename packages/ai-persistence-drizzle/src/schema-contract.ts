/**
 * Structural contract for a user-supplied TanStack AI Drizzle schema.
 *
 * The contract itself is dialect-neutral: {@link TanstackAiTableShapes} lists
 * the logical columns and their decoded data shapes, nothing else. Table and
 * column **database names are free**, and any Drizzle dialect can project the
 * shapes into concrete tables — {@link TanstackAiSqliteSchema} is the SQLite
 * projection this package's stores consume today.
 *
 * `drizzlePersistence` accepts any schema whose tables and columns carry the
 * required data shapes. Emit a starter with `tanstack-ai-drizzle-schema`,
 * generate DDL through your own drizzle-kit journal — including projects using
 * drizzle's `casing` name transforms — and extend tables with extra columns
 * (for example an ownership `user_id`) without falling out of contract.
 *
 * Only the columns listed here are read or written by the stores. Extra
 * columns must therefore be nullable or defaulted so inserts succeed.
 */
import { Column, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { InterruptRecord, RunStatus } from '@tanstack/ai-persistence'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'

/** Database dialects the Drizzle backend supports. */
export type DrizzleProvider = 'sqlite' | 'pg'

/**
 * Decoded (`data`) column shapes per store table — the dialect-neutral single
 * source of truth for the schema contract. Nullability, database names, and
 * driver specifics are intentionally unconstrained; only the base data shape
 * of each column is fixed.
 */
export interface TanstackAiTableShapes {
  /** Thread message history (`MessageStore`). */
  messages: {
    threadId: string
    messagesJson: Array<ModelMessage>
  }
  /** Run lifecycle records (`RunStore`). */
  runs: {
    runId: string
    threadId: string
    status: RunStatus
    startedAt: number
    finishedAt: number
    error: string
    usageJson: TokenUsage
  }
  /** Interrupt / approval records (`InterruptStore`). */
  interrupts: {
    interruptId: string
    runId: string
    threadId: string
    status: InterruptRecord['status']
    requestedAt: number
    resolvedAt: number
    payloadJson: Record<string, unknown>
    responseJson: unknown
  }
  /** Scoped key/value metadata (`MetadataStore`). */
  metadata: {
    scope: string
    key: string
    valueJson: unknown
  }
}

/**
 * The SQLite projection of {@link TanstackAiTableShapes}: what
 * `drizzlePersistence` can operate over. Satisfied by
 * {@link createDefaultSqliteSchema} and by the file emitted by
 * `tanstack-ai-drizzle-schema`. Other dialects can project the same shapes
 * over their own table/column types when their stores land.
 */
export type TanstackAiSqliteSchema = {
  [TableKey in keyof TanstackAiTableShapes]: SQLiteTable & {
    [ColumnKey in keyof TanstackAiTableShapes[TableKey]]: AnySQLiteColumn<{
      data: TanstackAiTableShapes[TableKey][ColumnKey]
    }>
  }
}

/**
 * The Postgres projection of {@link TanstackAiTableShapes}: what
 * `pgPersistence` (the `/pg` entry) can operate over. Satisfied by
 * {@link createDefaultPgSchema} and by the file emitted by
 * `tanstack-ai-drizzle-schema --dialect pg`.
 */
export type TanstackAiPgSchema = {
  [TableKey in keyof TanstackAiTableShapes]: PgTable & {
    [ColumnKey in keyof TanstackAiTableShapes[TableKey]]: AnyPgColumn<{
      data: TanstackAiTableShapes[TableKey][ColumnKey]
    }>
  }
}

/** Any dialect projection accepted by the runtime schema assertion. */
export type TanstackAiAnySchema = TanstackAiSqliteSchema | TanstackAiPgSchema

/** @deprecated Use {@link TanstackAiSqliteSchema}. */
export type TanstackAiSchema = TanstackAiSqliteSchema

const requiredColumns: {
  [TableKey in keyof TanstackAiTableShapes]: ReadonlyArray<
    keyof TanstackAiTableShapes[TableKey] & string
  >
} = {
  messages: ['threadId', 'messagesJson'],
  runs: [
    'runId',
    'threadId',
    'status',
    'startedAt',
    'finishedAt',
    'error',
    'usageJson',
  ],
  interrupts: [
    'interruptId',
    'runId',
    'threadId',
    'status',
    'requestedAt',
    'resolvedAt',
    'payloadJson',
    'responseJson',
  ],
  metadata: ['scope', 'key', 'valueJson'],
}

const tableKeys = Object.keys(requiredColumns) as Array<
  keyof TanstackAiTableShapes
>

/** A user-supplied schema failed the {@link TanstackAiSqliteSchema} contract. */
export class DrizzleSchemaError extends Error {
  constructor(problems: ReadonlyArray<string>) {
    super(
      `Invalid TanStack AI Drizzle schema:\n${problems
        .map((problem) => `  - ${problem}`)
        .join('\n')}`,
    )
    this.name = 'DrizzleSchemaError'
  }
}

const providerTables = {
  sqlite: { table: SQLiteTable, label: 'SQLite' },
  pg: { table: PgTable, label: 'Postgres' },
} as const

/**
 * Assert `input` structurally satisfies the store contract at runtime: every
 * table is a Drizzle table of the declared `provider`'s dialect and carries
 * every column property the stores reference. Column data shapes are enforced
 * by the dialect projection types ({@link TanstackAiSqliteSchema},
 * {@link TanstackAiPgSchema}) at compile time and are not re-checked here.
 */
export function assertTanstackAiSchema(
  input: TanstackAiAnySchema,
  provider: DrizzleProvider,
): void {
  const dialect = providerTables[provider]
  const problems: Array<string> = []
  for (const tableKey of tableKeys) {
    const table: unknown = input[tableKey]
    if (!is(table, dialect.table)) {
      problems.push(
        `\`${tableKey}\` is not a Drizzle ${dialect.label} table (provider '${provider}').`,
      )
      continue
    }
    for (const columnKey of requiredColumns[tableKey]) {
      const column: unknown = Reflect.get(table, columnKey)
      if (!is(column, Column)) {
        problems.push(
          `\`${tableKey}.${columnKey}\` is missing or not a Drizzle column.`,
        )
      }
    }
  }
  if (problems.length > 0) throw new DrizzleSchemaError(problems)
}
