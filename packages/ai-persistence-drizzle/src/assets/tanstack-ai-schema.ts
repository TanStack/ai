/**
 * TanStack AI persistence schema — emitted by `tanstack-ai-drizzle-schema`.
 *
 * This file is yours. Add it to your drizzle-kit `schema` paths so your own
 * migration journal owns the DDL, then pass it back to the runtime:
 *
 * ```ts
 * import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
 * import type { DrizzleTransactionExecutor } from '@tanstack/ai-persistence-drizzle'
 * import { schema } from './tanstack-ai-schema'
 *
 * declare const transactionExecutor: DrizzleTransactionExecutor
 * const persistence = drizzlePersistence(db, {
 *   schema,
 *   interrupts: transactionExecutor,
 * })
 * ```
 *
 * You may rename tables and columns (or drop the explicit column names below
 * and rely on your drizzle `casing` configuration) and add extra app-owned
 * columns — keep added columns nullable or defaulted so the runtime's inserts
 * succeed, and keep the columns below with these data shapes.
 */
import {
  customType,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type {
  InterruptBatchRecord,
  InterruptRecord,
  RunStatus,
} from '@tanstack/ai-persistence'
import type { InterruptBinding, ModelMessage, TokenUsage } from '@tanstack/ai'

const bytes = customType<{
  data: Uint8Array<ArrayBuffer>
  driverData: ArrayBuffer | Uint8Array
}>({
  dataType() {
    return 'blob'
  },
  fromDriver(value) {
    const source = value instanceof Uint8Array ? value : new Uint8Array(value)
    const owned = new Uint8Array(new ArrayBuffer(source.byteLength))
    owned.set(source)
    return owned
  },
  toDriver(value) {
    return value
  },
})

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
export const interrupts = sqliteTable(
  'interrupts',
  {
    interruptId: text('interrupt_id').primaryKey(),
    runId: text('run_id').notNull(),
    threadId: text('thread_id').notNull(),
    generation: integer('generation').notNull(),
    status: text('status').$type<InterruptRecord['status']>().notNull(),
    requestedAt: integer('requested_at').notNull(),
    resolvedAt: integer('resolved_at'),
    payloadJson: text('payload_json', { mode: 'json' })
      .$type<InterruptRecord['payload']>()
      .notNull(),
    bindingJson: text('binding_json', { mode: 'json' })
      .$type<InterruptBinding>()
      .notNull(),
    responseSchemaHash: text('response_schema_hash').notNull(),
    responseJson: text('response_json', { mode: 'json' }).$type<unknown>(),
  },
  (table) => [
    index('interrupts_thread_status_requested_at_idx').on(
      table.threadId,
      table.status,
      table.requestedAt,
    ),
    index('interrupts_run_status_requested_at_idx').on(
      table.runId,
      table.status,
      table.requestedAt,
    ),
  ],
)

/** Durable winner records for atomic interrupt resolution batches. */
export const interruptBatches = sqliteTable(
  'interrupt_batches',
  {
    interruptedRunId: text('interrupted_run_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    generation: integer('generation').notNull(),
    expectedInterruptIdsJson: text('expected_interrupt_ids_json', {
      mode: 'json',
    })
      .$type<InterruptBatchRecord['expectedInterruptIds']>()
      .notNull(),
    fingerprint: text('fingerprint').notNull(),
    canonicalResolutions: text('canonical_resolutions').notNull(),
    resolutionsJson: text('resolutions_json', { mode: 'json' })
      .$type<InterruptBatchRecord['resolutions']>()
      .notNull(),
    continuationRunId: text('continuation_run_id').notNull(),
    committedAt: integer('committed_at').notNull(),
  },
  (table) => [
    uniqueIndex('interrupt_batches_continuation_run_id_unique').on(
      table.continuationRunId,
    ),
  ],
)

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

/** Generation artifact references (`ArtifactStore`). Bytes live in the blob store. */
export const artifacts = sqliteTable('artifacts', {
  artifactId: text('artifact_id').primaryKey(),
  runId: text('run_id').notNull(),
  threadId: text('thread_id').notNull(),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  externalUrl: text('external_url'),
  createdAt: integer('created_at').notNull(),
})

/** Generic blob objects (`BlobStore`). */
export const blobs = sqliteTable('blobs', {
  key: text('key').primaryKey(),
  contentType: text('content_type'),
  size: integer('size'),
  etag: text('etag'),
  customMetadataJson: text('custom_metadata_json', { mode: 'json' }).$type<
    Record<string, string>
  >(),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
  body: bytes('body'),
})

/** The full state schema for `drizzlePersistence` and drizzle-kit. */
export const schema = {
  messages,
  runs,
  interrupts,
  interruptBatches,
  metadata,
  artifacts,
  blobs,
}
