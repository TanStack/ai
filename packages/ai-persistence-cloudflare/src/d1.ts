import { drizzle } from 'drizzle-orm/d1'
import { drizzlePersistence, schema } from '@tanstack/ai-persistence-drizzle'

/** Create the structured stores owned by a migrated Cloudflare D1 binding. */
export function createD1Stores(d1: D1Database) {
  const persistence = drizzlePersistence(drizzle(d1, { schema }))
  return {
    messages: persistence.stores.messages,
    runs: persistence.stores.runs,
    interrupts: persistence.stores.interrupts,
    metadata: persistence.stores.metadata,
  }
}
