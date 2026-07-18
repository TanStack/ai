import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { DrizzleSchemaError, drizzlePersistence, schema } from '../src/index'
import { variantDdl, variantSchema } from './variant-schema'
import type { TanstackAiSqliteSchema } from '../src/index'
import type { DrizzleSqliteDb } from '../src/index'

function createVariantDb(): { db: DrizzleSqliteDb; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:')
  for (const statement of variantDdl) sqlite.exec(statement)
  const db = drizzle((sql, params, method) => {
    const statement = sqlite.prepare(sql)
    if (method === 'run') {
      statement.run(...params)
      return Promise.resolve({ rows: [] })
    }
    if (method === 'get') {
      const row = statement.get(...params)
      return Promise.resolve({ rows: row ? Object.values(row) : [] })
    }
    const rows = statement.all(...params)
    return Promise.resolve({ rows: rows.map((row) => Object.values(row)) })
  })
  return { db, sqlite }
}

// The full store contract must hold when the runtime operates over a schema
// whose table and column database names all differ from the bundled ones.
runPersistenceConformance(
  'drizzle-sqlite (injected variant schema)',
  () => drizzlePersistence(createVariantDb().db, { schema: variantSchema }),
  // This backend has no distributed lock primitive.
  { skip: ['locks'] },
)

describe('drizzlePersistence with an injected schema', () => {
  it('writes through the injected table and column names', async () => {
    const { db, sqlite } = createVariantDb()
    const persistence = drizzlePersistence(db, { schema: variantSchema })

    await persistence.stores.messages.saveThread('thread-1', [
      { role: 'user', content: 'hello' },
    ])

    const row = sqlite
      .prepare('SELECT threadId, messagesJson FROM app_ai_messages')
      .get()
    expect(row?.threadId).toBe('thread-1')
    expect(JSON.parse(String(row?.messagesJson))).toEqual([
      { role: 'user', content: 'hello' },
    ])
  })

  it('coexists with app-owned columns on the same tables', async () => {
    const { db, sqlite } = createVariantDb()
    const persistence = drizzlePersistence(db, { schema: variantSchema })

    await persistence.stores.messages.saveThread('thread-owned', [
      { role: 'user', content: 'mine' },
    ])
    // The app claims ownership through its own extension column.
    await db
      .update(variantSchema.messages)
      .set({ userId: 'user-42' })
      .where(eq(variantSchema.messages.threadId, 'thread-owned'))

    // Store updates leave the app-owned column untouched.
    await persistence.stores.messages.saveThread('thread-owned', [
      { role: 'user', content: 'mine' },
      { role: 'assistant', content: 'yours' },
    ])

    const row = sqlite
      .prepare('SELECT userId FROM app_ai_messages WHERE threadId = ?')
      .get('thread-owned')
    expect(row?.userId).toBe('user-42')
    expect(
      await persistence.stores.messages.loadThread('thread-owned'),
    ).toHaveLength(2)
  })

  it('rejects a schema with missing tables or columns', () => {
    const { db } = createVariantDb()

    const { blobs: _dropped, ...withoutBlobs } = schema
    expect(() =>
      drizzlePersistence(db, {
        schema: withoutBlobs as unknown as TanstackAiSqliteSchema,
      }),
    ).toThrow(DrizzleSchemaError)
    expect(() =>
      drizzlePersistence(db, {
        schema: withoutBlobs as unknown as TanstackAiSqliteSchema,
      }),
    ).toThrow(/`blobs` is not a Drizzle SQLite table/)

    const incompleteMessages = sqliteTable('messages', {
      threadId: text('thread_id').primaryKey(),
    })
    expect(() =>
      drizzlePersistence(db, {
        schema: {
          ...schema,
          messages: incompleteMessages,
        } as unknown as TanstackAiSqliteSchema,
      }),
    ).toThrow(/`messages\.messagesJson` is missing/)
  })
})
