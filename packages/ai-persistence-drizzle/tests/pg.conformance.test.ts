import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { afterAll } from 'vitest'
import {
  createDefaultPgSchema,
  drizzlePersistence,
  ensurePgTables,
} from '../src/index'

const clients: Array<PGlite> = []

runPersistenceConformance(
  'drizzle-pg',
  async () => {
    const client = new PGlite()
    clients.push(client)
    const schema = createDefaultPgSchema()
    await ensurePgTables((sql) => client.exec(sql), schema)
    return drizzlePersistence(drizzle(client), { provider: 'pg', schema })
  },
  // This backend has no distributed lock primitive.
  { skip: ['locks'] },
)

afterAll(async () => {
  await Promise.all(clients.map((client) => client.close()))
})
