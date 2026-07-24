import source from './assets/tanstack-ai-schema.ts?raw'

/** Filename used by the schema emit CLI. */
export const drizzleSchemaFilename = 'tanstack-ai-schema.ts'

/**
 * Source text of the user-facing TanStack AI Drizzle schema module, emitted by
 * `tanstack-ai-drizzle-schema`. Structurally identical to
 * {@link createDefaultSqliteSchema} (a test enforces it). The file is written
 * into the project so **their** drizzle-kit journal owns the DDL — this package
 * never ships or applies SQL migrations.
 */
export const drizzleSchemaSource: string = source
