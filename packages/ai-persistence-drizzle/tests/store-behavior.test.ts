import { afterEach, describe, expect, it } from 'vitest'
import { sqlitePersistence } from '../src/sqlite'

type Persistence = ReturnType<typeof sqlitePersistence>

const open: Array<Persistence> = []

function persistence(): Persistence {
  const created = sqlitePersistence({ url: ':memory:', migrate: true })
  open.push(created)
  return created
}

afterEach(() => {
  for (const created of open.splice(0)) created.close()
})

describe('drizzle metadata nullish values', () => {
  it('rejects nullish values with a clear error instead of a NOT NULL crash', async () => {
    const { stores } = persistence()

    // A NOT NULL json column cannot store nullish; surface a clear, actionable
    // error (consistent with the Prisma backend) rather than a driver crash.
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

describe('drizzle blob list — collation-agnostic prefix matching', () => {
  it('matches mixed-case and non-ASCII prefixes literally', async () => {
    const store = persistence().stores.blobs
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
    const store = persistence().stores.blobs
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
