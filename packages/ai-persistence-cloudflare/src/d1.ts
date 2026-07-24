import { drizzle } from 'drizzle-orm/d1'
import {
  createDefaultSqliteSchema,
  drizzlePersistence,
} from '@tanstack/ai-persistence-drizzle'

/**
 * Create the structured stores owned by a migrated Cloudflare D1 binding.
 *
 * Apply this package's D1 migrations (or equivalent DDL matching the default
 * schema) before use — the drizzle adapter does not ship or apply migrations.
 */
export function createD1Stores(d1: D1Database) {
  const schema = createDefaultSqliteSchema()
  const persistence = drizzlePersistence(drizzle(d1, { schema }), {
    provider: 'sqlite',
    schema,
  })
  return {
    messages: persistence.stores.messages,
    runs: persistence.stores.runs,
    interrupts: persistence.stores.interrupts,
    metadata: persistence.stores.metadata,
  }
}
