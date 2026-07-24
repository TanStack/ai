import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

/** Stable thread id for the single-conversation demo. */
export const PERSISTENT_CHAT_THREAD_ID = 'persistent-chat'

let instance: ReturnType<typeof sqlitePersistence> | undefined

/**
 * One SQLite-backed persistence store for the persistent-chat demo, shared by
 * the API route (POST writes the transcript, GET replays / reconstructs it) and
 * the history server function the page loader calls. Lazily opened so importing
 * this module (e.g. from a server-fn module that a client route also imports)
 * never opens the database in the browser bundle.
 *
 * Uses the stock default schema and runtime table bootstrap (not a shipped
 * migration journal). Production apps should emit a schema with
 * `tanstack-ai-drizzle-schema` and migrate via their own drizzle-kit journal.
 * `.data/` is gitignored.
 */
export function persistentChatPersistence() {
  return (instance ??= sqlitePersistence({
    url: './.data/persistent-chat.db',
  }))
}
