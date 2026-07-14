import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { sqliteMigrations } from '../src/migrations'
import { runDrizzleMigrationsCli } from '../src/migration-cli'

const temporaryDirectories: Array<string> = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tanstack-ai-drizzle-cli-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('drizzle migrations CLI', () => {
  it('prints canonical migration SQL to stdout', async () => {
    let output = ''
    await runDrizzleMigrationsCli(['--stdout'], {
      writeStdout(value) {
        output += value
      },
    })

    expect(output).toBe(
      `${sqliteMigrations.map((migration) => migration.sql.trimEnd()).join('\n\n')}\n`,
    )
  })

  it('copies migrations without overwriting divergent files by default', async () => {
    const directory = await createTemporaryDirectory()
    await runDrizzleMigrationsCli(['--out', directory])

    for (const migration of sqliteMigrations) {
      expect(await readFile(join(directory, migration.filename), 'utf8')).toBe(
        migration.sql,
      )
    }

    const migration = sqliteMigrations[1]
    expect(migration).toBeDefined()
    if (!migration) return
    const destination = join(directory, migration.filename)

    await writeFile(destination, 'user-owned contents', 'utf8')
    await expect(runDrizzleMigrationsCli(['--out', directory])).rejects.toThrow(
      /refusing to overwrite/i,
    )
    expect(await readFile(destination, 'utf8')).toBe('user-owned contents')

    await runDrizzleMigrationsCli(['--out', directory, '--force'])
    expect(await readFile(destination, 'utf8')).toBe(migration.sql)
  })

  it('fails on ambiguous or incomplete output options', async () => {
    const directory = await createTemporaryDirectory()
    await expect(runDrizzleMigrationsCli([])).rejects.toThrow(
      /--out.*--stdout/i,
    )
    await expect(
      runDrizzleMigrationsCli(['--stdout', '--out', directory]),
    ).rejects.toThrow(/exactly one/i)
  })
})
