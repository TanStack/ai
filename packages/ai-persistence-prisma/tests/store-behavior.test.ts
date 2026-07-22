import { rm } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { prismaPersistence } from '../src/index'

const clients: Array<PrismaClient> = []
const directories: Array<string> = []

// Only the tables these tests query need to exist; the generated client carries
// all delegates regardless of which tables the database has.
const schema = `
  CREATE TABLE metadata (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    PRIMARY KEY (scope, key)
  );
`

function makePersistence(): ReturnType<typeof prismaPersistence> {
  const dir = mkdtempSync(join(tmpdir(), 'tanstack-ai-prisma-behavior-'))
  directories.push(dir)
  const dbPath = join(dir, 'state.db').replace(/\\/g, '/')
  const database = new DatabaseSync(dbPath)
  try {
    database.exec(schema)
  } finally {
    database.close()
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
  })
  clients.push(prisma)
  return prismaPersistence(prisma)
}

afterAll(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()))
  await Promise.all(
    directories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('prisma metadata nullish values', () => {
  it('rejects nullish values with a clear error instead of a NOT NULL crash', async () => {
    const { stores } = makePersistence()

    // A NOT NULL column cannot store nullish; surface a clear, actionable error
    // (consistent with the Drizzle backend) rather than a driver crash.
    await expect(stores.metadata.set('scope', 'u', undefined)).rejects.toThrow(
      /metadata values must be defined/,
    )
    await expect(stores.metadata.set('scope', 'n', null)).rejects.toThrow(
      /metadata values must be defined/,
    )
    expect(await stores.metadata.get('scope', 'u')).toBeNull()

    // Falsy-but-defined values are stored and round-trip.
    await stores.metadata.set('scope', 'zero', 0)
    expect(await stores.metadata.get('scope', 'zero')).toBe(0)
    await stores.metadata.set('scope', 'empty', '')
    expect(await stores.metadata.get('scope', 'empty')).toBe('')
    await stores.metadata.set('scope', 'obj', { a: 1 })
    expect(await stores.metadata.get('scope', 'obj')).toEqual({ a: 1 })
  })
})
