import initialMigrationSql from './assets/0000_tanstack_ai_initial.sql?raw'

export interface D1Migration {
  id: string
  filename: string
  sql: string
}

/**
 * Ordered D1 migrations for messages, runs, interrupts, and metadata.
 *
 * Owned by this package for Wrangler D1 deploy workflows. Schema evolution for
 * non-Cloudflare apps goes through the app's own drizzle-kit journal after
 * emitting a schema with `tanstack-ai-drizzle-schema` — the drizzle package
 * does not ship SQL migrations.
 */
export const d1Migrations: ReadonlyArray<D1Migration> = [
  {
    id: '0000_tanstack_ai_initial',
    filename: '0000_tanstack_ai_initial.sql',
    sql: initialMigrationSql,
  },
]
