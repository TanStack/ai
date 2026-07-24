/**
 * TanStack AI persistence schema — emitted by
 * `tanstack-ai-drizzle-schema --dialect pg`.
 *
 * This file is yours. Add it to your drizzle-kit `schema` paths so your own
 * migration journal owns the DDL, then pass it back to the runtime:
 *
 * ```ts
 * import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
 * import { schema } from './tanstack-ai-schema'
 *
 * const persistence = drizzlePersistence(db, { provider: 'pg', schema })
 * ```
 *
 * You may rename tables and columns (or drop the explicit column names below
 * and rely on your drizzle `casing` configuration) and add extra app-owned
 * columns — keep added columns nullable or defaulted so the runtime's inserts
 * succeed, and keep the columns below with these data shapes.
 *
 * This package does not ship SQL migrations. Generate and apply them with
 * drizzle-kit in this project.
 */
import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core'
import type { InterruptRecord, RunStatus } from '@tanstack/ai-persistence'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'

/** Thread message history (`MessageStore`). */
export const messages = pgTable('messages', {
  threadId: text('thread_id').primaryKey(),
  messagesJson: jsonb('messages_json').$type<Array<ModelMessage>>().notNull(),
})

/** Run lifecycle records (`RunStore`). */
export const runs = pgTable('runs', {
  runId: text('run_id').primaryKey(),
  threadId: text('thread_id').notNull(),
  status: text('status').$type<RunStatus>().notNull(),
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
  finishedAt: bigint('finished_at', { mode: 'number' }),
  error: text('error'),
  usageJson: jsonb('usage_json').$type<TokenUsage>(),
})

/** Interrupt / approval records (`InterruptStore`). */
export const interrupts = pgTable(
  'interrupts',
  {
    interruptId: text('interrupt_id').primaryKey(),
    runId: text('run_id').notNull(),
    threadId: text('thread_id').notNull(),
    status: text('status').$type<InterruptRecord['status']>().notNull(),
    requestedAt: bigint('requested_at', { mode: 'number' }).notNull(),
    resolvedAt: bigint('resolved_at', { mode: 'number' }),
    payloadJson: jsonb('payload_json')
      .$type<Record<string, unknown>>()
      .notNull(),
    responseJson: jsonb('response_json').$type<unknown>(),
  },
  // The runtime lists interrupts by thread and by run; keep (or extend) these
  // lookup indexes to taste — this file is yours.
  (table) => [
    index('interrupts_thread_id_idx').on(table.threadId),
    index('interrupts_run_id_idx').on(table.runId),
  ],
)

/** Scoped key/value metadata (`MetadataStore`). */
export const metadata = pgTable(
  'metadata',
  {
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    valueJson: jsonb('value_json').$type<unknown>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.key] })],
)

/** The full state schema, for `drizzlePersistence(db, { provider: 'pg', schema })` and drizzle-kit. */
export const schema = {
  messages,
  runs,
  interrupts,
  metadata,
}
