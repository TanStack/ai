import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit config for the batteries-included sqlite backend. Migrations are
 * generated from `src/schema.ts` into `drizzle/` and shipped with the package
 * (see the `files` field); `sqlPersistence({ migrate: true })` applies them.
 *
 * Regenerate with `pnpm db:generate` after any schema change.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
})
