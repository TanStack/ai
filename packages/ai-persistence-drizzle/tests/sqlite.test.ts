import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
      migrate: true,
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
})
