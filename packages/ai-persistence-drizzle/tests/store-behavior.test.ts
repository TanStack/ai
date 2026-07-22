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
