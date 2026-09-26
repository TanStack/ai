import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { workspaceTools } from '../src/first-party'
import type { AnyTool } from '@tanstack/ai'

let root: string
let tools: Map<string, AnyTool>

const run = (name: string, args: unknown): Promise<string> => {
  const tool = tools.get(name)
  if (!tool?.execute) throw new Error(`No tool ${name}`)
  return Promise.resolve(tool.execute(args))
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'harness-workspace-'))
  await mkdir(join(root, 'src', 'deep'), { recursive: true })
  await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true })
  await writeFile(join(root, 'src', 'a.ts'), 'one\ntwo\nthree\nfour\n')
  await writeFile(join(root, 'src', 'deep', 'b.ts'), 'const two = 2\n')
  await writeFile(join(root, 'notes.md'), 'two words\n')
  await writeFile(join(root, 'node_modules', 'pkg', 'index.js'), 'two\n')
  await writeFile(join(root, 'big.txt'), `two\n${'x'.repeat(1_100_000)}`)
  const plugin = workspaceTools({ root, bashTimeoutMs: 20_000 })
  const contributions = await plugin.setup()
  tools = new Map(
    (contributions.tools ?? []).map((tool): [string, AnyTool] => [
      tool.name,
      tool,
    ]),
  )
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('read_file', () => {
  it('reads a window of numbered lines', async () => {
    expect(
      await run('read_file', { path: 'src/a.ts', offset: 2, limit: 2 }),
    ).toBe('2\ttwo\n3\tthree')
    expect(
      await run('read_file', { path: 'src/a.ts', offset: -4, limit: 1 }),
    ).toBe('1\tone')
  })

  it('refuses paths outside the workspace and missing arguments', async () => {
    await expect(run('read_file', { path: '../outside.txt' })).rejects.toThrow(
      'outside the workspace',
    )
    await expect(
      run('read_file', { path: join(tmpdir(), 'elsewhere.txt') }),
    ).rejects.toThrow('outside the workspace')
    await expect(run('read_file', {})).rejects.toThrow(
      'Argument "path" must be a string.',
    )
    await expect(run('read_file', null)).rejects.toThrow('must be a string')
  })

  it('cuts very long output', async () => {
    await writeFile(join(root, 'long.txt'), 'y'.repeat(25_000))
    const text = await run('read_file', { path: 'long.txt' })
    expect(text).toContain('more characters]')
    expect(text.length).toBeLessThan(21_000)
  })
})

describe('write_file and edit_file', () => {
  it('creates folders and files', async () => {
    expect(
      await run('write_file', { path: 'new/dir/c.txt', content: 'hi' }),
    ).toBe('Wrote new/dir/c.txt.')
    expect(await readFile(join(root, 'new', 'dir', 'c.txt'), 'utf8')).toBe('hi')
    await expect(run('write_file', { path: 'x.txt' })).rejects.toThrow(
      'Argument "content" must be a string.',
    )
  })

  it('edits one match, refuses ambiguous or missing text, and replaces all when asked', async () => {
    await writeFile(join(root, 'e.txt'), 'a b a')
    await expect(
      run('edit_file', { path: 'e.txt', old: 'zzz', new: 'q' }),
    ).rejects.toThrow('not in the file')
    await expect(
      run('edit_file', { path: 'e.txt', old: 'a', new: 'q' }),
    ).rejects.toThrow('appears 2 times')
    expect(
      await run('edit_file', {
        path: 'e.txt',
        old: 'a',
        new: 'q',
        replaceAll: true,
      }),
    ).toBe('Edited e.txt (2 changes).')
    expect(await run('edit_file', { path: 'e.txt', old: 'b', new: 'c' })).toBe(
      'Edited e.txt (1 change).',
    )
    expect(await readFile(join(root, 'e.txt'), 'utf8')).toBe('q c q')
  })
})

describe('list_files and grep', () => {
  it('lists files, skips dependency folders, and filters by glob', async () => {
    const all = await run('list_files', {})
    expect(all).toContain('src/deep/b.ts')
    expect(all).not.toContain('node_modules')
    expect(await run('list_files', { pattern: 'src/**/*.ts' })).toBe(
      'src/a.ts\nsrc/deep/b.ts',
    )
    expect(await run('list_files', { pattern: '*.none' })).toBe('No files.')
  })

  it('finds lines, skips big files, and filters by glob', async () => {
    const hits = await run('grep', { pattern: 'two' })
    expect(hits).toContain('src/a.ts:2: two')
    expect(hits).toContain('notes.md:1: two words')
    expect(hits).not.toContain('big.txt')
    expect(hits).not.toContain('node_modules')
    expect(await run('grep', { pattern: 'two', glob: '**/*.md' })).toBe(
      'notes.md:1: two words',
    )
    expect(await run('grep', { pattern: 'nothing-like-this' })).toBe(
      'No matches.',
    )
  })
})

describe('bash', () => {
  it('reports the exit code and stderr', async () => {
    const ok = await run('bash', {
      command: `node -e "console.log('out'); console.error('warn')"`,
    })
    expect(ok).toMatch(/^exit code: 0\nout/)
    expect(ok).toContain('stderr:\nwarn')
    const failed = await run('bash', { command: `node -e "process.exit(3)"` })
    expect(failed).toMatch(/^exit code: 3/)
  })
})
