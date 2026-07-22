import initialMigrationSql from './assets/0000_tanstack_ai_initial.sql?raw'

export interface D1Migration {
  id: string
  filename: string
  sql: string
}

/**
 * PROVENANCE: `assets/0000_tanstack_ai_initial.sql` is a byte-for-byte copy of
 * the Drizzle asset
 * (`@tanstack/ai-persistence-drizzle`'s `src/assets/0000_tanstack_ai_initial.sql`).
 * `createD1Stores` runs the Drizzle stores against a D1 database migrated with
 * this SQL, so the copy MUST stay identical to Drizzle's. The test "cloudflare
 * D1 asset matches the drizzle asset" (`tests/migrations.test.ts`) fails on any
 * drift.
 */
/** Ordered D1 migrations for messages, runs, interrupts, and metadata. */
export const d1Migrations: ReadonlyArray<D1Migration> = [
  {
    id: '0000_tanstack_ai_initial',
    filename: '0000_tanstack_ai_initial.sql',
    sql: initialMigrationSql,
  },
]
