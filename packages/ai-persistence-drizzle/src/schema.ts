/**
 * Drizzle schema for the TanStack AI **state** persistence contract.
 *
 * Each table mirrors the corresponding record in
 * `@tanstack/ai-persistence`'s `types.ts` column-for-column. JSON-valued fields
 * are stored in `*_json` text columns (portable across sqlite/pg/mysql); epoch
 * millisecond timestamps are stored as integers.
 *
 * This schema is the single source of truth for migrations: run
 * `pnpm db:generate` (drizzle-kit) after any change here. It is also exported
 * from the package so bring-your-own-drizzle users can drive their own
 * migration workflow against it.
 *
 * NOTE: keep this in sync with the sibling Prisma schema fragment
 * (`@tanstack/ai-persistence-prisma`). See coupling `persistence-schema-dual-source`.
 */
import { blob, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type {
  InterruptRecord,
  RunStatus,
} from '@tanstack/ai-persistence'
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
  body: blob('body', { mode: 'buffer' }),
})

/** The full state schema, for `drizzlePersistence(db)` and drizzle-kit. */
export const schema = {
  messages,
  runs,
  interrupts,
  metadata,
  artifacts,
  blobs,
}
