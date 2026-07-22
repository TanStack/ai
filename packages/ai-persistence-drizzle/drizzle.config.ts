import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit config for the SQLite schema. Migrations are generated from
 * `src/schema.ts` into `drizzle/`, shipped with the package, exposed through
 * `sqliteMigrations`, and applied by the Node-only `sqlitePersistence` factory.
 *
 * Regenerate with `pnpm db:generate` after any schema change. `sqliteMigrations`
 * and the D1 sibling load the DUPLICATE at `src/assets/0000_tanstack_ai_initial.sql`,
 * which `db:generate` does NOT update — copy the regenerated
 * `drizzle/0000_tanstack_ai_initial.sql` over it (the package-contract test
 * "keeps the shipped drizzle-kit migration equal to the embedded asset" guards
 * the two against drift).
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
})
