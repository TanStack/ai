/**
 * A deliberately renamed copy of the TanStack AI schema for exercising
 * `drizzlePersistence(db, { schema })`: prefixed table names, camelCase column
 * names (as a project using drizzle `casing`-style conventions would have),
 * and an extra app-owned `userId` ownership column on the messages table.
 * Structure (data shapes, nullability, primary keys) matches the contract.
 */
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { InterruptRecord, RunStatus } from '@tanstack/ai-persistence'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'

const messages = sqliteTable('app_ai_messages', {
  threadId: text('threadId').primaryKey(),
  messagesJson: text('messagesJson', { mode: 'json' })
    .$type<Array<ModelMessage>>()
    .notNull(),
  // App-owned extension the TanStack AI stores never read or write.
  userId: text('userId'),
})

const runs = sqliteTable('app_ai_runs', {
  runId: text('runId').primaryKey(),
  threadId: text('threadId').notNull(),
  status: text('status').$type<RunStatus>().notNull(),
  startedAt: integer('startedAt').notNull(),
  finishedAt: integer('finishedAt'),
  error: text('errorText'),
  usageJson: text('usageJson', { mode: 'json' }).$type<TokenUsage>(),
})

const interrupts = sqliteTable('app_ai_interrupts', {
  interruptId: text('interruptId').primaryKey(),
  runId: text('runId').notNull(),
  threadId: text('threadId').notNull(),
  status: text('status').$type<InterruptRecord['status']>().notNull(),
  requestedAt: integer('requestedAt').notNull(),
  resolvedAt: integer('resolvedAt'),
  payloadJson: text('payloadJson', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .notNull(),
  responseJson: text('responseJson', { mode: 'json' }).$type<unknown>(),
})

const metadata = sqliteTable(
  'app_ai_metadata',
  {
    scope: text('scopeName').notNull(),
    key: text('keyName').notNull(),
    valueJson: text('valueJson', { mode: 'json' }).$type<unknown>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.key] })],
)

export const variantSchema = {
  messages,
  runs,
  interrupts,
  metadata,
}

/** DDL matching {@link variantSchema}, applied directly in tests. */
export const variantDdl: ReadonlyArray<string> = [
  `CREATE TABLE app_ai_messages (
    threadId text PRIMARY KEY NOT NULL,
    messagesJson text NOT NULL,
    userId text
  );`,
  `CREATE TABLE app_ai_runs (
    runId text PRIMARY KEY NOT NULL,
    threadId text NOT NULL,
    status text NOT NULL,
    startedAt integer NOT NULL,
    finishedAt integer,
    errorText text,
    usageJson text
  );`,
  `CREATE TABLE app_ai_interrupts (
    interruptId text PRIMARY KEY NOT NULL,
    runId text NOT NULL,
    threadId text NOT NULL,
    status text NOT NULL,
    requestedAt integer NOT NULL,
    resolvedAt integer,
    payloadJson text NOT NULL,
    responseJson text
  );`,
  `CREATE TABLE app_ai_metadata (
    scopeName text NOT NULL,
    keyName text NOT NULL,
    valueJson text NOT NULL,
    PRIMARY KEY(scopeName, keyName)
  );`,
]
