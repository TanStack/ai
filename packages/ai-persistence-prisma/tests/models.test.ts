import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { prismaModels, prismaModelsFilename } from '../src/index'

const temporaryDirectories: Array<string> = []
const prismaCli = fileURLToPath(
  new URL('../node_modules/prisma/build/index.js', import.meta.url),
)

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tanstack-ai-prisma-models-'))
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

describe('Prisma models asset', () => {
  it('is a models-only fragment with no provider or client generator', () => {
    expect(prismaModelsFilename).toBe('tanstack-ai.prisma')
    expect(prismaModels).toContain('model Message')
    expect(prismaModels).toContain('model InterruptBatch')
    expect(prismaModels).toContain('model Blob')
    expect(prismaModels).toMatch(/generation\s+Int\s+@default\(0\)/)
    expect(prismaModels).toMatch(
      /bindingJson\s+String\?\s+@map\("binding_json"\)/,
    )
    expect(prismaModels).toMatch(
      /schemaHash\s+String\?\s+@map\("schema_hash"\)/,
    )
    expect(prismaModels).toContain('@@index([threadId, status])')
    expect(prismaModels).toContain('@@index([runId, generation, status])')
    expect(prismaModels).not.toMatch(/\bgenerator\s+\w+\s*{/)
    expect(prismaModels).not.toMatch(/\bdatasource\s+\w+\s*{/)
  })

  it('keeps the shipped models file equal to the embedded asset', async () => {
    const shipped = await readFile(
      fileURLToPath(new URL('../prisma/tanstack-ai.prisma', import.meta.url)),
      'utf8',
    )
    expect(shipped).toBe(prismaModels)
  })

  it.each([
    ['sqlite', 'file:./state.db'],
    ['postgresql', 'postgresql://user:password@localhost:5432/database'],
    ['mysql', 'mysql://user:password@localhost:3306/database'],
  ])('validates when composed into a %s schema', async (provider, url) => {
    const directory = await createTemporaryDirectory()
    const schemaPath = join(directory, 'schema.prisma')
    await writeFile(
      schemaPath,
      `datasource db {\n  provider = "${provider}"\n  url = "${url}"\n}\n\n${prismaModels}`,
      'utf8',
    )

    expect(() =>
      execFileSync(
        process.execPath,
        [prismaCli, 'validate', '--schema', schemaPath],
        { encoding: 'utf8', stdio: 'pipe' },
      ),
    ).not.toThrow()
  })
})
