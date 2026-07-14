/**
 * Drizzle-backed SQLite-family persistence for TanStack AI.
 *
 * This root entry is safe to import in edge runtimes. Pass an already-created
 * and migrated SQLite-compatible Drizzle database, including Cloudflare D1, to
 * {@link drizzlePersistence}. Node's built-in SQLite convenience factory lives
 * at `@tanstack/ai-persistence-drizzle/sqlite`.
 */
import { InMemoryLockStore } from '@tanstack/ai'
import { schema } from './schema'
import { assertTanstackAiSchema } from './schema-contract'
import {
  createArtifactStore,
  createBlobStore,
  createInterruptStore,
  createMessageStore,
  createMetadataStore,
  createRunStore,
} from './stores'
import type { TanstackAiSchema } from './schema-contract'
import type { LockStore } from '@tanstack/ai'
import type {
  DrizzleDb,
  DrizzleTransactionExecutor,
  TanstackAiTables,
} from './stores'

export { schema } from './schema'
export { sqliteMigrations } from './migrations'
export { drizzleSchemaFilename, drizzleSchemaSource } from './schema-source'
export { DrizzleSchemaError } from './schema-contract'
export type { TanstackAiSchema } from './schema-contract'
export type { SqliteMigration } from './migrations'
export type { DrizzleDb, DrizzleTransactionExecutor } from './stores'

export interface DrizzlePersistenceOptions {
  /**
   * Operate over your project's own copy of the TanStack AI schema instead of
   * the bundled one — emit it with `tanstack-ai-drizzle-schema`, add it to
   * your drizzle-kit schema paths, and pass it here. Table and column database
   * names are yours to change (drizzle `casing` transforms included), and
   * tables may carry extra app-owned columns as long as they are nullable or
   * defaulted. Defaults to the bundled `schema` export.
   */
  schema?: TanstackAiSchema
}

export interface DrizzlePersistenceInterruptOptions extends DrizzlePersistenceOptions {
  /** Atomic transaction boundary required by the interrupt store. */
  interrupts: DrizzleTransactionExecutor
  /** Override wall-clock time, primarily for deterministic runtimes/tests. */
  clock?: () => number
}

export interface DrizzlePersistenceWithoutInterruptsOptions extends DrizzlePersistenceOptions {
  /** Explicitly omit interrupts while retaining all other Drizzle stores. */
  interrupts: false
}

function createBaseStores(db: DrizzleDb, tables: TanstackAiTables) {
  const locks: LockStore = new InMemoryLockStore()
  return {
    messages: createMessageStore(db, tables),
    runs: createRunStore(db, tables),
    metadata: createMetadataStore(db, tables),
    artifacts: createArtifactStore(db, tables),
    blobs: createBlobStore(db, tables),
    locks,
  }
}

type DrizzleBaseStores = ReturnType<typeof createBaseStores>
type DrizzleStoresWithInterrupts = DrizzleBaseStores & {
  interrupts: ReturnType<typeof createInterruptStore>
}

/** Wire TanStack AI persistence stores over a migrated Drizzle SQLite database. */
export function drizzlePersistence(
  db: DrizzleDb,
  options: DrizzlePersistenceInterruptOptions,
): { stores: DrizzleStoresWithInterrupts }
export function drizzlePersistence(
  db: DrizzleDb,
  options: DrizzlePersistenceWithoutInterruptsOptions,
): { stores: DrizzleBaseStores }
export function drizzlePersistence(db: DrizzleDb): never
export function drizzlePersistence(
  db: DrizzleDb,
  options?:
    | DrizzlePersistenceInterruptOptions
    | DrizzlePersistenceWithoutInterruptsOptions,
): { stores: DrizzleBaseStores | DrizzleStoresWithInterrupts } {
  if (!options) {
    throw new Error(
      'Drizzle interrupts require an explicit transaction executor. Pass { interrupts: executor } or explicitly disable them with { interrupts: false }.',
    )
  }
  const tables = resolveTables(options.schema)
  const stores = createBaseStores(db, tables)
  if (options.interrupts === false) return { stores }
  return {
    stores: {
      ...stores,
      interrupts: createInterruptStore(
        db,
        tables,
        options.interrupts,
        options.clock,
      ),
    },
  }
}

function resolveTables(input?: TanstackAiSchema): TanstackAiTables {
  if (!input) return schema
  assertTanstackAiSchema(input)
  // Safe widening: the stores only depend on the column *data* shapes, which
  // `TanstackAiSchema` pins at the call site, and on the runtime table/column
  // objects, which carry their own database names into the generated SQL. The
  // concrete `TanstackAiTables` name literals are phantom types the store code
  // never relies on.
  return input as TanstackAiTables
}
