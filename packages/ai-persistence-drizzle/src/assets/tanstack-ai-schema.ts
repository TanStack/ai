/**
 * TanStack AI persistence schema — emitted by `tanstack-ai-drizzle-schema`.
 *
 * This file is yours. Add it to your drizzle-kit `schema` paths so your own
 * migration journal owns the DDL, then pass it back to the runtime:
 *
 * ```ts
 * import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
 * import { schema } from './tanstack-ai-schema'
 *
 * const persistence = drizzlePersistence(db, { schema })
 * ```
 *
 * You may rename tables and columns (or drop the explicit column names below
 * and rely on your drizzle `casing` configuration) and add extra app-owned
 * columns — keep added columns nullable or defaulted so the runtime's inserts
 * succeed, and keep the columns below with these data shapes.
 */
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { InterruptRecord, RunStatus } from '@tanstack/ai-persistence'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'

/** Thread message history (`MessageStore`). */
export const messages = sqliteTable('messages', {
  threadId: text('thread_id').primaryKey(),
  messagesJson: text('messages_json', { mode: 'json' })
    .$type<Array<ModelMessage>>()
    .notNull(),
})

/** Run lifecycle records (`RunStore`). */
export const runs = sqliteTable('runs', {
  runId: text('run_id').primaryKey(),
  threadId: text('thread_id').notNull(),
  status: text('status').$type<RunStatus>().notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  error: text('error'),
  usageJson: text('usage_json', { mode: 'json' }).$type<TokenUsage>(),
})

/** Interrupt / approval records (`InterruptStore`). */
export const interrupts = sqliteTable('interrupts', {
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

/** Scoped key/value metadata (`MetadataStore`). */
export const metadata = sqliteTable(
  'metadata',
  {
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    valueJson: text('value_json', { mode: 'json' }).$type<unknown>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.key] })],
)

/** The full state schema, for `drizzlePersistence(db, { schema })` and drizzle-kit. */
export const schema = {
  messages,
  runs,
  interrupts,
  metadata,
}
