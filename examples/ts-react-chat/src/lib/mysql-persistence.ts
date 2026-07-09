import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'
import type { AIPersistence } from '@tanstack/ai-persistence'

/**
 * Durable **state** persistence for the persistent-chat demo.
 *
 * Persistence v2 ships a batteries-included SQLite backend (Drizzle + bundled
 * migrations) via {@link sqlPersistence}. The former hand-rolled MySQL
 * `SqlDriver` was removed — for Postgres/MySQL, construct your own Drizzle `db`
 * and use `drizzlePersistence(db)` with migrations generated from the exported
 * schema. Delivery durability (disconnect → reconnect → ordered resume) is a
 * separate transport concern handled by `toServerSentEvents(stream, { durability })`.
 */
let persistence: AIPersistence | undefined

export function createChatPersistence(): AIPersistence {
  persistence ??= sqlPersistence({
    dialect: 'sqlite',
    url: process.env.CHAT_DB_URL ?? 'file:./chat-persistence-demo.db',
    migrate: true,
  })
  return persistence
}
