/**
 * Structural contract for a user-supplied TanStack AI Drizzle schema.
 *
 * `drizzlePersistence` accepts any schema whose tables and columns carry the
 * required data shapes; table and column **database names are free**. Emit a
 * starter with `tanstack-ai-drizzle-schema`, generate DDL through your own
 * drizzle-kit journal — including projects using drizzle's `casing` name
 * transforms — and extend tables with extra columns (for example an ownership
 * `user_id`) without falling out of contract.
 *
 * Only the columns listed here are read or written by the stores. Extra
 * columns must therefore be nullable or defaulted so inserts succeed.
 */
import { Column, is } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { InterruptRecord, RunStatus } from '@tanstack/ai-persistence'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'

/**
 * A column whose decoded (`data`) type is `TData`. Name, table name, and
 * driver specifics are intentionally unconstrained.
 */
type AiColumn<TData> = AnySQLiteColumn<{ data: TData }>

type AiTable<TColumns> = SQLiteTable & TColumns

/**
 * The schema shape `drizzlePersistence` can operate over. Satisfied by
 * {@link createDefaultSqliteSchema} and by the file emitted by
 * `tanstack-ai-drizzle-schema`.
 */
export interface TanstackAiSqliteSchema {
  messages: AiTable<{
    threadId: AiColumn<string>
    messagesJson: AiColumn<Array<ModelMessage>>
  }>
  runs: AiTable<{
    runId: AiColumn<string>
    threadId: AiColumn<string>
    status: AiColumn<RunStatus>
    startedAt: AiColumn<number>
    finishedAt: AiColumn<number>
    error: AiColumn<string>
    usageJson: AiColumn<TokenUsage>
  }>
  interrupts: AiTable<{
    interruptId: AiColumn<string>
    runId: AiColumn<string>
    threadId: AiColumn<string>
    status: AiColumn<InterruptRecord['status']>
    requestedAt: AiColumn<number>
    resolvedAt: AiColumn<number>
    payloadJson: AiColumn<Record<string, unknown>>
    responseJson: AiColumn<unknown>
  }>
  metadata: AiTable<{
    scope: AiColumn<string>
    key: AiColumn<string>
    valueJson: AiColumn<unknown>
  }>
}

/** @deprecated Use {@link TanstackAiSqliteSchema}. */
export type TanstackAiSchema = TanstackAiSqliteSchema

const requiredColumns: {
  [K in keyof TanstackAiSqliteSchema]: ReadonlyArray<string>
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
  keyof TanstackAiSqliteSchema
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

/**
 * Assert `input` structurally satisfies the store contract at runtime: every
 * table is a Drizzle SQLite table and carries every column property the
 * stores reference. Column data shapes are enforced by the
 * {@link TanstackAiSqliteSchema} type at compile time and are not re-checked here.
 */
export function assertTanstackAiSchema(input: TanstackAiSqliteSchema): void {
  const problems: Array<string> = []
  for (const tableKey of tableKeys) {
    const table: unknown = input[tableKey]
    if (!is(table, SQLiteTable)) {
      problems.push(`\`${tableKey}\` is not a Drizzle SQLite table.`)
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
