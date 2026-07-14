import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { drizzleSchemaFilename, drizzleSchemaSource } from '../src/index'
import { runDrizzleSchemaCli } from '../src/schema-cli'

const temporaryDirectories: Array<string> = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tanstack-ai-drizzle-schema-'))
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

describe('Drizzle schema CLI', () => {
  it('prints the schema module to stdout', async () => {
    let output = ''
    await runDrizzleSchemaCli(['--stdout'], {
      writeStdout(value) {
        output += value
      },
    })
    expect(output).toBe(`${drizzleSchemaSource.trimEnd()}\n`)
    expect(output).toContain('sqliteTable')
    expect(output).toContain('interrupts: transactionExecutor')
  })

  it('copies the schema without overwriting divergent files by default', async () => {
    const directory = await createTemporaryDirectory()
    await runDrizzleSchemaCli(['--out', directory])

    const destination = join(directory, drizzleSchemaFilename)
    expect(await readFile(destination, 'utf8')).toBe(drizzleSchemaSource)

    // Re-running against an identical file is a no-op.
    await runDrizzleSchemaCli(['--out', directory])

    await writeFile(destination, 'user-owned contents', 'utf8')
    await expect(runDrizzleSchemaCli(['--out', directory])).rejects.toThrow(
      /refusing to overwrite/i,
    )
    expect(await readFile(destination, 'utf8')).toBe('user-owned contents')

    await runDrizzleSchemaCli(['--out', directory, '--force'])
    expect(await readFile(destination, 'utf8')).toBe(drizzleSchemaSource)
  })

  it('fails on ambiguous or incomplete output options', async () => {
    const directory = await createTemporaryDirectory()
    await expect(runDrizzleSchemaCli([])).rejects.toThrow(/--out.*--stdout/i)
    await expect(
      runDrizzleSchemaCli(['--stdout', '--out', directory]),
    ).rejects.toThrow(/exactly one/i)
    await expect(runDrizzleSchemaCli(['--stdout', '--force'])).rejects.toThrow(
      /--force can only be used with --out/i,
    )
  })
})
