import { drizzle } from 'drizzle-orm/d1'
import {
  createDrizzleSandboxStore,
  drizzlePersistence,
  schema,
} from '@tanstack/ai-persistence-drizzle'
import type { SandboxStore } from '@tanstack/ai'

/** Create the structured stores owned by a migrated Cloudflare D1 binding. */
export function createD1Stores(d1: D1Database) {
  const persistence = drizzlePersistence(drizzle(d1, { schema }))
  return {
    messages: persistence.stores.messages,
    runs: persistence.stores.runs,
    interrupts: persistence.stores.interrupts,
    metadata: persistence.stores.metadata,
    sandbox: persistence.stores.sandbox,
  }
}

/**
 * Durable {@link SandboxStore} over a migrated Cloudflare D1 binding (delegates
 * to the Drizzle sandbox store). Pair with `createDurableObjectLockStore` for a
 * multi-instance-correct sandbox resume on the edge.
 */
export function createD1SandboxStore(d1: D1Database): SandboxStore {
  return createDrizzleSandboxStore(drizzle(d1, { schema }))
}
