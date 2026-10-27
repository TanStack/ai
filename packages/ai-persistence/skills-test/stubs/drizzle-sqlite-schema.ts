import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import type { ModelMessage, TokenUsage } from '@tanstack/ai'
import type { InterruptRecord, RunStatus } from '@tanstack/ai-persistence'

export const chatThreads = sqliteTable('chat_threads', {
  threadId: text('thread_id').primaryKey(),
  messagesJson: text('messages_json', { mode: 'json' })
    .$type<Array<ModelMessage>>()
    .notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const chatRuns = sqliteTable(
  'chat_runs',
  {
    runId: text('run_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    status: text('status').$type<RunStatus>().notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    error: text('error'),
    errorCode: text('error_code'),
    usageJson: text('usage_json', { mode: 'json' }).$type<TokenUsage>(),
    sandboxKey: text('sandbox_key'),
    detachedSince: integer('detached_since'),
    cancelRequested: integer('cancel_requested', { mode: 'boolean' }),
    driverEpoch: integer('driver_epoch'),
    parentRunId: text('parent_run_id'),
    subagentRunId: text('subagent_run_id'),
    name: text('name'),
  },
  (table) => [
    // Powers listReclaimable: status = 'running' AND detachedSince <= cutoff.
    index('chat_runs_status_detached').on(table.status, table.detachedSince),
    // Powers listByThread and findActiveRun.
    index('chat_runs_thread_started').on(table.threadId, table.startedAt),
    // Powers listByParentRun: children of one parent, oldest startedAt first.
    index('chat_runs_parent_started').on(table.parentRunId, table.startedAt),
  ],
)

export const chatInterrupts = sqliteTable('chat_interrupts', {
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

export const chatMetadata = sqliteTable(
  'chat_metadata',
  {
    namespace: text('namespace').notNull(),
    key: text('key').notNull(),
    valueJson: text('value_json', { mode: 'json' }).$type<unknown>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.namespace, table.key] })],
)
