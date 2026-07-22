import source from './assets/tanstack-ai-schema.ts?raw'

/** Filename used by the schema copy CLI. */
export const drizzleSchemaFilename = 'tanstack-ai-schema.ts'

/**
 * Source text of the user-facing TanStack AI Drizzle schema module, emitted by
 * `tanstack-ai-drizzle-schema`. Structurally identical to this package's
 * bundled `schema` (a test enforces it); the copy exists so a project's own
 * drizzle-kit journal can own the DDL.
 */
export const drizzleSchemaSource: string = source
