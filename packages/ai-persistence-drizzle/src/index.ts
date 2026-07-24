/**
 * Drizzle-backed SQLite-family persistence for TanStack AI.
 *
 * Schema-first: this package does **not** ship SQL migrations. Emit a schema
 * into your project with `tanstack-ai-drizzle-schema`, let **your** drizzle-kit
 * journal own the DDL, then pass the schema into {@link drizzlePersistence}.
 *
 * This root entry is safe to import in edge runtimes. Node's convenience
 * factory (default schema + optional runtime table bootstrap) lives at
 * `@tanstack/ai-persistence-drizzle/sqlite`.
 */
import { assertTanstackAiSchema } from './schema-contract'
import {
  createInterruptStore,
  createMessageStore,
  createMetadataStore,
  createRunStore,
} from './stores'
import type { TanstackAiSqliteSchema } from './schema-contract'
import type { DrizzleSqliteDb, TanstackAiTables } from './stores'

export { createDefaultSqliteSchema } from './default-sqlite-schema'
export { ensureSqliteTables } from './ensure-sqlite-tables'
export { drizzleSchemaFilename, drizzleSchemaSource } from './schema-source'
export { DrizzleSchemaError, assertTanstackAiSchema } from './schema-contract'
export type { TanstackAiSqliteSchema } from './schema-contract'
export type { DrizzleSqliteDb } from './stores'
/** @deprecated Use {@link TanstackAiSqliteSchema}. */
export type { TanstackAiSchema } from './schema-contract'
/** @deprecated Use {@link DrizzleSqliteDb}. */
export type { DrizzleDb } from './stores'

export interface DrizzlePersistenceOptions {
  /**
   * Your TanStack AI schema tables. Emit a starter with
   * `tanstack-ai-drizzle-schema`, add it to drizzle-kit, generate migrations in
   * your project, and pass the module here. Table/column database names are
   * yours (including drizzle `casing`); extra app-owned columns are fine when
   * nullable or defaulted.
   *
   * For the stock tables without a project file, use
   * {@link createDefaultSqliteSchema}.
   */
  schema: TanstackAiSqliteSchema
}

/**
 * Wire TanStack AI persistence stores over a migrated Drizzle SQLite database.
 *
 * `schema` is required — this package never applies bundled DDL. Own migrations
 * via drizzle-kit (after emitting the schema) or call {@link ensureSqliteTables}
 * for local bootstrap of a known schema.
 *
 * No `locks` store is returned: this backend has no distributed lock primitive.
 * Consumers that need cross-instance locking should compose one in (for example
 * the Cloudflare Durable Object lock).
 */
export function drizzlePersistence(
  db: DrizzleSqliteDb,
  options: DrizzlePersistenceOptions,
) {
  assertTanstackAiSchema(options.schema)
  // Safe widening: stores depend on column data shapes (pinned by the contract)
  // and runtime table/column objects (which carry database names into SQL).
  const tables = options.schema as TanstackAiTables
  return {
    stores: {
      messages: createMessageStore(db, tables),
      runs: createRunStore(db, tables),
      interrupts: createInterruptStore(db, tables),
      metadata: createMetadataStore(db, tables),
    },
  }
}
