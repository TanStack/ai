import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prismaModels, prismaModelsFilename } from '../src/index'
import { runPrismaModelsCli } from '../src/models-cli'

const temporaryDirectories: Array<string> = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tanstack-ai-prisma-cli-'))
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

describe('Prisma models CLI', () => {
  it('prints the models fragment to stdout', async () => {
    let output = ''
    await runPrismaModelsCli(['--stdout'], {
      writeStdout(value) {
        output += value
      },
    })
    expect(output).toBe(`${prismaModels.trimEnd()}\n`)
    expect(output).toContain('model InterruptBatch')
    expect(output).toContain('bindingJson')
  })

  it('copies the fragment without overwriting divergent files by default', async () => {
    const directory = await createTemporaryDirectory()
    await runPrismaModelsCli(['--out', directory])

    const destination = join(directory, prismaModelsFilename)
    expect(await readFile(destination, 'utf8')).toBe(prismaModels)

    await writeFile(destination, 'user-owned contents', 'utf8')
    await expect(runPrismaModelsCli(['--out', directory])).rejects.toThrow(
      /refusing to overwrite/i,
    )
    expect(await readFile(destination, 'utf8')).toBe('user-owned contents')

    await runPrismaModelsCli(['--out', directory, '--force'])
    expect(await readFile(destination, 'utf8')).toBe(prismaModels)
  })

  it('fails on ambiguous or incomplete output options', async () => {
    const directory = await createTemporaryDirectory()
    await expect(runPrismaModelsCli([])).rejects.toThrow(/--out.*--stdout/i)
    await expect(
      runPrismaModelsCli(['--stdout', '--out', directory]),
    ).rejects.toThrow(/exactly one/i)
  })
})
