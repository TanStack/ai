import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { d1Migrations } from '../src/migrations'
import { runCloudflareMigrationsCli } from '../src/migration-cli'

const temporaryDirectories: Array<string> = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tanstack-ai-cloudflare-cli-'))
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

describe('Cloudflare D1 migrations CLI', () => {
  it('prints canonical migration SQL to stdout', async () => {
    let output = ''
    await runCloudflareMigrationsCli(['--stdout'], {
      writeStdout(value) {
        output += value
      },
    })

    expect(output).toBe(
      `${d1Migrations.map((migration) => migration.sql.trimEnd()).join('\n\n')}\n`,
    )
  })

  it('copies migrations without overwriting divergent files by default', async () => {
    const directory = await createTemporaryDirectory()
    await runCloudflareMigrationsCli(['--out', directory])

    for (const migration of d1Migrations) {
      expect(await readFile(join(directory, migration.filename), 'utf8')).toBe(
        migration.sql,
      )
    }

    const migration = d1Migrations[1]
    expect(migration).toBeDefined()
    if (!migration) return
    const destination = join(directory, migration.filename)
    await writeFile(destination, 'user-owned contents', 'utf8')
    await expect(
      runCloudflareMigrationsCli(['--out', directory]),
    ).rejects.toThrow(/refusing to overwrite/i)
    expect(await readFile(destination, 'utf8')).toBe('user-owned contents')

    await runCloudflareMigrationsCli(['--out', directory, '--force'])
    expect(await readFile(destination, 'utf8')).toBe(migration.sql)
  })

  it('fails on ambiguous or incomplete output options', async () => {
    const directory = await createTemporaryDirectory()
    await expect(runCloudflareMigrationsCli([])).rejects.toThrow(
      /--out.*--stdout/i,
    )
    await expect(
      runCloudflareMigrationsCli(['--stdout', '--out', directory]),
    ).rejects.toThrow(/exactly one/i)
  })
})
