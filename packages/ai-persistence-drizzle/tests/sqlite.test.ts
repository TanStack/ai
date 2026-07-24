import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultSqliteSchema } from '../src/default-sqlite-schema'
import { ensureSqliteTables } from '../src/ensure-sqlite-tables'
import { sqlitePersistence } from '../src/sqlite'

const temporaryDirectories: Array<string> = []

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tanstack-ai-sqlite-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('sqlitePersistence', () => {
  it('creates a missing parent directory for a filesystem database', async () => {
    const root = await temporaryDirectory()
    const databasePath = join(root, 'nested', 'state.sqlite')
    const persistence = sqlitePersistence({
      url: `file:${databasePath}`,
    })

    try {
      await expect(stat(databasePath)).resolves.toMatchObject({
        isFile: expect.any(Function),
      })
    } finally {
      persistence.close()
    }
  })

  it('exposes an idempotent close for the database handle it owns', () => {
    const persistence = sqlitePersistence({ url: ':memory:' })

    expect(() => {
      persistence.close()
      persistence.close()
    }).not.toThrow()
  })

  it('rejects non-file URI schemes before touching the filesystem', () => {
    expect(() =>
      sqlitePersistence({ url: 'https://example.test/state.sqlite' }),
    ).toThrow(/unsupported SQLite URL/i)
  })

  it('bootstraps tables from the schema when ensureTables is true', async () => {
    const persistence = sqlitePersistence({ url: ':memory:' })
    try {
      await persistence.stores.messages.saveThread('t1', [
        { role: 'user', content: 'hi' },
      ])
      expect(await persistence.stores.messages.loadThread('t1')).toEqual([
        { role: 'user', content: 'hi' },
      ])
    } finally {
      persistence.close()
    }
  })

  it('skips runtime bootstrap when ensureTables is false', () => {
    expect(() =>
      sqlitePersistence({
        url: ':memory:',
        ensureTables: false,
      }),
    ).not.toThrow()
  })
})

describe('ensureSqliteTables', () => {
  it('is idempotent for the default schema', () => {
    const sqlite = new DatabaseSync(':memory:')
    const schema = createDefaultSqliteSchema()
    ensureSqliteTables((sql) => sqlite.exec(sql), schema)
    ensureSqliteTables((sql) => sqlite.exec(sql), schema)

    const names = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name)
    expect(names).toEqual(
      expect.arrayContaining(['interrupts', 'messages', 'metadata', 'runs']),
    )
    sqlite.close()
  })
})
