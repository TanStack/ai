import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'
import { composePersistence } from '@tanstack/ai-persistence'

/**
 * Durable **state** persistence for the persistent-chat demo.
 *
 * Persistence v2 ships a Node SQLite backend (Drizzle + bundled migrations)
 * through {@link sqlitePersistence}. Other SQL databases can implement the
 * persistence store interfaces over their existing database client.
 * Replaying a dropped SSE connection (resumable streams) is a separate
 * transport concern, not handled here.
 */
type ChatPersistence = ReturnType<typeof createChatPersistenceBackend>

let persistence: ChatPersistence | undefined

function createChatPersistenceBackend() {
  return composePersistence(
    sqlitePersistence({
      url:
        process.env.SQLITE_CHAT_DB_URL ?? 'file:./sqlite-chat-persistence.db',
      migrate: true,
    }),
    {
      overrides: {
        metadata: false,
        locks: false,
        artifacts: false,
        blobs: false,
      },
    },
  )
}

export function createChatPersistence(): ChatPersistence {
  persistence ??= createChatPersistenceBackend()
  return persistence
}
