/**
 * Drizzle-backed SQLite-family persistence for TanStack AI.
 *
 * This root entry is safe to import in edge runtimes. Pass an already-created
 * and migrated SQLite-compatible Drizzle database, including Cloudflare D1, to
 * {@link drizzlePersistence}. Node's built-in SQLite convenience factory lives
 * at `@tanstack/ai-persistence-drizzle/sqlite`.
 */
import { InMemoryLockStore } from '@tanstack/ai'
import {
  createArtifactStore,
  createBlobStore,
  createInterruptStore,
  createMessageStore,
  createMetadataStore,
  createRunStore,
} from './stores'
import type { LockStore } from '@tanstack/ai'
import type { DrizzleDb, DrizzleTransactionExecutor } from './stores'

export { schema } from './schema'
export { sqliteMigrations } from './migrations'
export type { SqliteMigration } from './migrations'
export type { DrizzleDb, DrizzleTransactionExecutor } from './stores'

export interface DrizzlePersistenceInterruptOptions {
  /** Atomic transaction boundary required by the interrupt store. */
  interrupts: DrizzleTransactionExecutor
  /** Override wall-clock time, primarily for deterministic runtimes/tests. */
  clock?: () => number
}

export interface DrizzlePersistenceWithoutInterruptsOptions {
  /** Explicitly omit interrupts while retaining all other Drizzle stores. */
  interrupts: false
}

function createBaseStores(db: DrizzleDb) {
  const locks: LockStore = new InMemoryLockStore()
  return {
    messages: createMessageStore(db),
    runs: createRunStore(db),
    metadata: createMetadataStore(db),
    artifacts: createArtifactStore(db),
    blobs: createBlobStore(db),
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
  const stores = createBaseStores(db)
  if (options.interrupts === false) return { stores }
  return {
    stores: {
      ...stores,
      interrupts: createInterruptStore(db, options.interrupts, options.clock),
    },
  }
}
