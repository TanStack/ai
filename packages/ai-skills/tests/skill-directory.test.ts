import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { generateCatalog, skillDirectory } from '../src/node'
import { staticSkills } from '../src/static'

const fixtures = fileURLToPath(new URL('./fixtures/skills', import.meta.url))

const tempDirs: Array<string> = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  )
})

describe('skillDirectory', () => {
  it('returns utf8 text for references/ and rejects SKILL.md', async () => {
    const source = skillDirectory(fixtures)
    const value = await source.readResource?.('alpha', 'references/note.md')
    expect(typeof value).toBe('string')
    expect(String(value).trimEnd()).toBe('hello')
    await expect(source.readResource?.('alpha', 'SKILL.md')).rejects.toThrow(
      'references/ or assets/',
    )
  })

  it('loads by frontmatter name when it differs from the folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-skills-'))
    tempDirs.push(root)
    await mkdir(join(root, 'foo'))
    await writeFile(
      join(root, 'foo', 'SKILL.md'),
      '---\nname: bar\ndescription: renamed\n---\n\nBody.\n',
    )
    const source = skillDirectory(root, { strict: false })
    expect((await source.list()).map((s) => s.name)).toEqual(['bar'])
    expect(await source.load('bar')).toContain('Body.')
    await expect(source.load('foo')).rejects.toThrow('no skill named "foo"')
  })
})

describe('generateCatalog', () => {
  it('lists the same metadata through staticSkills as skillDirectory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-skills-'))
    tempDirs.push(root)
    await mkdir(join(root, 'tagged'))
    await writeFile(
      join(root, 'tagged', 'SKILL.md'),
      '---\nname: tagged\ndescription: has metadata\nmetadata:\n  tags: files\n---\n\nBody.\n',
    )
    const listed = await staticSkills(await generateCatalog(root)).list()
    expect(listed).toEqual(await skillDirectory(root).list())
    expect(listed[0]?.metadata).toEqual({ tags: 'files' })
  })

  it('changes the revision when only frontmatter changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-skills-'))
    tempDirs.push(root)
    await mkdir(join(root, 'tagged'))
    const write = (tags: string) =>
      writeFile(
        join(root, 'tagged', 'SKILL.md'),
        `---\nname: tagged\ndescription: has metadata\nmetadata:\n  tags: ${tags}\n---\n\nBody.\n`,
      )
    await write('files')
    const first = await generateCatalog(root)
    expect((await generateCatalog(root)).revision).toBe(first.revision)
    await write('mail')
    expect((await generateCatalog(root)).revision).not.toBe(first.revision)
  })
})
