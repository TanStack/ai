/**
 * Structural contract for a user-supplied TanStack AI Drizzle schema.
 *
 * `drizzlePersistence` accepts any schema whose tables and columns carry the
 * required data shapes; table and column **database names are free**. This lets
 * a project own the schema file (emitted by `tanstack-ai-drizzle-schema`),
 * generate DDL through its own drizzle-kit journal — including projects using
 * drizzle's `casing` name transforms — and extend tables with extra columns
 * (for example an ownership `user_id`) without falling out of contract.
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
 * The schema shape `drizzlePersistence` can operate over. `schema` exported
 * from this package satisfies it, as does the file emitted by the
 * `tanstack-ai-drizzle-schema` CLI.
 */
export interface TanstackAiSchema {
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
  artifacts: AiTable<{
    artifactId: AiColumn<string>
    runId: AiColumn<string>
    threadId: AiColumn<string>
    name: AiColumn<string>
    mimeType: AiColumn<string>
    size: AiColumn<number>
    externalUrl: AiColumn<string>
    createdAt: AiColumn<number>
  }>
  blobs: AiTable<{
    key: AiColumn<string>
    contentType: AiColumn<string>
    size: AiColumn<number>
    etag: AiColumn<string>
    customMetadataJson: AiColumn<Record<string, string>>
    createdAt: AiColumn<number>
    updatedAt: AiColumn<number>
    body: AiColumn<Uint8Array<ArrayBuffer>>
  }>
}

const requiredColumns: {
  [K in keyof TanstackAiSchema]: ReadonlyArray<string>
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
  artifacts: [
    'artifactId',
    'runId',
    'threadId',
    'name',
    'mimeType',
    'size',
    'externalUrl',
    'createdAt',
  ],
  blobs: [
    'key',
    'contentType',
    'size',
    'etag',
    'customMetadataJson',
    'createdAt',
    'updatedAt',
    'body',
  ],
}

const tableKeys = Object.keys(requiredColumns) as Array<keyof TanstackAiSchema>

/** A user-supplied schema failed the {@link TanstackAiSchema} contract. */
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
 * {@link TanstackAiSchema} type at compile time and are not re-checked here.
 */
export function assertTanstackAiSchema(input: TanstackAiSchema): void {
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
