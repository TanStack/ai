import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { publishStagedDocs } from './publish-staged-docs'

const roots: Array<string> = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function makeDirs() {
  const root = await mkdtemp(join(tmpdir(), 'docs-gen-'))
  roots.push(root)
  const stagingDir = join(root, 'staging')
  const outputDir = join(root, 'output')
  await mkdir(stagingDir)
  await mkdir(outputDir)
  return { stagingDir, outputDir }
}

describe('publishStagedDocs', () => {
  it('keeps existing docs when staging has no index.md', async () => {
    const { stagingDir, outputDir } = await makeDirs()
    await writeFile(join(outputDir, 'index.md'), 'keep me')

    await expect(publishStagedDocs(stagingDir, outputDir)).rejects.toThrow(
      /index\.md/,
    )

    expect(await readFile(join(outputDir, 'index.md'), 'utf8')).toBe('keep me')
  })

  it('replaces existing docs when staging has index.md', async () => {
    const { stagingDir, outputDir } = await makeDirs()
    await writeFile(join(outputDir, 'index.md'), 'old')
    await writeFile(join(outputDir, 'stale.md'), 'gone')
    await writeFile(join(stagingDir, 'index.md'), 'new')
    await writeFile(join(stagingDir, 'chat.md'), 'chat')

    await publishStagedDocs(stagingDir, outputDir)

    expect(await readFile(join(outputDir, 'index.md'), 'utf8')).toBe('new')
    expect(await readFile(join(outputDir, 'chat.md'), 'utf8')).toBe('chat')
    await expect(
      readFile(join(outputDir, 'stale.md'), 'utf8'),
    ).rejects.toThrow()
    expect(existsSync(`${outputDir}.next`)).toBe(false)
    expect(existsSync(stagingDir)).toBe(false)
  })
})
