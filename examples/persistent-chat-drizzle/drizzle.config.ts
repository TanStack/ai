import { defineConfig } from 'drizzle-kit'

// `src/db/tanstack-ai-schema.ts` is the app-owned schema starter emitted from
// `@tanstack/ai-persistence-drizzle` (self-contained drizzle-orm tables), so
// `drizzle-kit generate` emits DDL for the TanStack AI tables into ./drizzle.
// Those SQL files are committed and applied by scripts/migrate.mjs (no
// drizzle-kit runtime driver).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/tanstack-ai-schema.ts',
  out: './drizzle',
})
