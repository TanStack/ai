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
import type { DrizzleDb } from './stores'

export { schema } from './schema'
export { sqliteMigrations } from './migrations'
export type { SqliteMigration } from './migrations'
export type { DrizzleDb } from './stores'

/** Wire TanStack AI persistence stores over a migrated Drizzle SQLite database. */
export function drizzlePersistence(db: DrizzleDb) {
  const locks: LockStore = new InMemoryLockStore()
  return {
    stores: {
      messages: createMessageStore(db),
      runs: createRunStore(db),
      interrupts: createInterruptStore(db),
      metadata: createMetadataStore(db),
      artifacts: createArtifactStore(db),
      blobs: createBlobStore(db),
      locks,
    },
  }
}
