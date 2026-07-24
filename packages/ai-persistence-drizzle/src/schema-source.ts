import sqliteSource from './assets/tanstack-ai-schema.ts?raw'
import pgSource from './assets/tanstack-ai-schema-pg.ts?raw'

/** Filename used by the schema emit CLI (both dialects). */
export const drizzleSchemaFilename = 'tanstack-ai-schema.ts'

/** Dialects the schema emit CLI can target. */
export type DrizzleSchemaDialect = 'sqlite' | 'pg'

/**
 * Source text of the user-facing TanStack AI Drizzle schema module per
 * dialect, emitted by `tanstack-ai-drizzle-schema`. Each is structurally
 * identical to its default-schema factory (a test enforces it). The file is
 * written into the project so **their** drizzle-kit journal owns the DDL —
 * this package never ships or applies SQL migrations.
 */
export const drizzleSchemaSources: Record<DrizzleSchemaDialect, string> = {
  sqlite: sqliteSource,
  pg: pgSource,
}

/** @deprecated Use {@link drizzleSchemaSources}.sqlite. */
export const drizzleSchemaSource: string = sqliteSource
