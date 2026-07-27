import { sqlitePersistence } from './sqlite-persistence'

/** Stable thread id for the single-conversation demo. */
export const PERSISTENT_CHAT_THREAD_ID = 'persistent-chat'

let instance: ReturnType<typeof sqlitePersistence> | undefined

/**
 * One SQLite-backed persistence store for the persistent-chat demo, shared by
 * the API route (POST writes the transcript, GET replays / reconstructs it) and
 * the history server function the page loader calls. Lazily opened so importing
 * this module (e.g. from a server-fn module that a client route also imports)
 * never opens the database in the browser bundle. `migrate: true` creates the
 * TanStack AI tables on first open. The `sqlitePersistence` implementation lives
 * in `./sqlite-persistence` — a self-contained `node:sqlite` backend built on the
 * `@tanstack/ai-persistence` core, demonstrating how to roll your own. `.data/`
 * is gitignored.
 */
export function persistentChatPersistence() {
  return (instance ??= sqlitePersistence({
    url: './.data/persistent-chat.db',
    migrate: true,
  }))
}
