/**
 * Default Postgres table definitions for TanStack AI state stores.
 *
 * Prefer owning this shape in your project via
 * `tanstack-ai-drizzle-schema --dialect pg` and generating DDL with **your**
 * drizzle-kit journal. This factory is the runtime convenience default for
 * apps that want the stock tables without copying a file first.
 *
 * This package does **not** ship SQL migrations. Schema ownership and
 * migration generation live in the application.
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
import type { TanstackAiPgSchema } from './schema-contract'

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
  // The stores list interrupts by thread and by run (`list*`,
  // `listPending*`); index both foreign lookups.
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

/**
 * Build a fresh copy of the default Postgres schema tables.
 *
 * Pass the result to {@link pgPersistence}, or prefer the file emitted by
 * `tanstack-ai-drizzle-schema --dialect pg` when you want drizzle-kit to own
 * DDL in your repo.
 */
export function createDefaultPgSchema(): TanstackAiPgSchema {
  return {
    messages,
    runs,
    interrupts,
    metadata,
  }
}
