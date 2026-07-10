import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit config for the SQLite schema. Migrations are generated from
 * `src/schema.ts` into `drizzle/`, shipped with the package, exposed through
 * `sqliteMigrations`, and applied by the Node-only `sqlitePersistence` factory.
 *
 * Regenerate with `pnpm db:generate` after any schema change.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
})
