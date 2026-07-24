import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

let instance: ReturnType<typeof sqlitePersistence> | undefined

/**
 * One SQLite-backed persistence store, shared by the POST handler (writes the
 * transcript, run records, and interrupts) and the GET handler (durability
 * replay / `reconstructChat`).
 *
 * Tables are created by the committed drizzle-kit migrations in `./drizzle`,
 * generated from the app-owned `src/db/tanstack-ai-schema.ts` and applied by
 * `scripts/migrate.mjs` (which `predev` runs) — so `ensureTables: false`, no
 * runtime `CREATE TABLE IF NOT EXISTS` bootstrap. The runtime operates on the
 * package's stock default schema, which the emitted starter is structurally
 * identical to, so the migrated tables match. (Pass your own `schema` here only
 * if you customize the tables and keep a single `drizzle-orm` instance.)
 * `.data/` is gitignored.
 */
export function persistentChatPersistence() {
  return (instance ??= sqlitePersistence({
    url: './.data/persistent-chat.db',
    ensureTables: false,
  }))
}
