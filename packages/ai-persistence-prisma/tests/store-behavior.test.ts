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
  CREATE TABLE blobs (
    key TEXT NOT NULL PRIMARY KEY,
    content_type TEXT,
    size BIGINT,
    etag TEXT,
    custom_metadata_json TEXT,
    created_at BIGINT,
    updated_at BIGINT,
    body BLOB
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

describe('prisma blob list — collation-agnostic prefix matching', () => {
  it('matches mixed-case and non-ASCII prefixes literally', async () => {
    const { stores } = makePersistence()
    const store = stores.blobs
    const keys = [
      'Café/1',
      'Café/2',
      'café/3',
      'CAFE/4',
      'Zürich/5',
      'zürich/6',
    ]
    for (const key of keys) await store.put(key, key)

    expect(
      (await store.list({ prefix: 'Café/' })).objects
        .map((object) => object.key)
        .sort(),
    ).toEqual(['Café/1', 'Café/2'])
    expect(
      (await store.list({ prefix: 'café/' })).objects.map(
        (object) => object.key,
      ),
    ).toEqual(['café/3'])
    expect(
      (await store.list({ prefix: 'Zürich/' })).objects.map(
        (object) => object.key,
      ),
    ).toEqual(['Zürich/5'])
  })

  it('paginates by byte order with a stable cursor (no skips or dupes)', async () => {
    const { stores } = makePersistence()
    const store = stores.blobs
    const keys = ['k/1', 'k/2', 'k/3', 'k/4', 'k/5']
    for (const key of keys) await store.put(key, key)

    const seen: Array<string> = []
    let cursor: string | undefined
    do {
      const page = await store.list({
        prefix: 'k/',
        limit: 2,
        ...(cursor !== undefined ? { cursor } : {}),
      })
      seen.push(...page.objects.map((object) => object.key))
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor !== undefined)

    expect(seen).toEqual(keys)
    expect(new Set(seen).size).toBe(keys.length)
  })
})
