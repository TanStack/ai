import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parsePatch,
  patchPaths,
  patchTools,
} from '../src/first-party/coding/patch'
import type { AnyTool } from '@tanstack/ai'
import type {
  ToolEnv,
  WorkspaceBackend,
} from '../src/first-party/coding/backend'

const root = resolve(tmpdir(), 'harness-patch')
const encoder = new TextEncoder()
// Keep a byte order mark in the text, so the tests can see it.
const decoder = new TextDecoder('utf-8', { ignoreBOM: true })

/** A workspace path, with `/` between the parts. */
const shown = (full: string) => relative(root, full).split(sep).join('/')

/** A patch with `lines` between the begin and end lines. */
function patch(...lines: Array<string>) {
  return ['*** Begin Patch', ...lines, '*** End Patch'].join('\n')
}

/**
 * The patch tool on files in memory that start as `files`. `written` lists
 * the files that the `afterWrite` hook saw, in order. With `canRemove:
 * false`, the backend has no `remove`.
 */
function workspace(files: Record<string, string>, { canRemove = true } = {}) {
  const store = new Map<string, Uint8Array>()
  for (const [path, text] of Object.entries(files)) {
    store.set(join(root, path), encoder.encode(text))
  }
  const backend: WorkspaceBackend = {
    readFile: async (path) => {
      const data = store.get(path)
      if (!data) throw new Error(`No file ${path}`)
      return data
    },
    writeFile: async (path, data) => {
      store.set(path, typeof data === 'string' ? encoder.encode(data) : data)
    },
    remove: canRemove
      ? async (path) => {
          if (!store.delete(path)) throw new Error(`No file ${path}`)
        }
      : undefined,
    stat: async (path) => {
      const data = store.get(path)
      return data && { type: 'file', size: data.length, mtimeMs: 0 }
    },
    readdir: async () => [],
    exec: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  }
  const written: Array<string> = []
  const env: ToolEnv = {
    backend,
    root,
    hooks: () => [
      {
        afterWrite: async (path) => {
          written.push(shown(path))
        },
      },
    ],
    lock: (_path, fn) => fn(),
    reach: async (path) => resolve(root, path),
    shown,
  }
  const tools: Array<AnyTool> = patchTools(env)
  const [tool] = tools
  return {
    written,
    run: async (text: string) => {
      if (!tool?.execute) throw new Error('No patch tool')
      const result: string = await tool.execute({ patch: text })
      return result
    },
    /** Every file, by workspace path. */
    files: () =>
      Object.fromEntries(
        [...store].map(
          ([full, data]) => [shown(full), decoder.decode(data)] as const,
        ),
      ),
  }
}

/** Apply `text` to a workspace with one file, `a.txt`, and read it back. */
async function patchFile(content: string, text: string) {
  const files = workspace({ 'a.txt': content })
  await files.run(text)
  return files.files()['a.txt']
}

describe('parsePatch', () => {
  it('reads added, deleted, and updated files, and a move', () => {
    const text = patch(
      '*** Add File: src/new.ts',
      '+export const a = 1',
      '+',
      '*** Delete File: old.txt',
      '*** Update File: src/app.ts',
      '*** Move to: src/main.ts',
      '@@ function main() {',
      ' const x = 1',
      '-const y = 2',
      '+const y = 3',
    )
    expect(parsePatch(text)).toEqual([
      { type: 'add', path: 'src/new.ts', content: 'export const a = 1\n\n' },
      { type: 'delete', path: 'old.txt' },
      {
        type: 'update',
        path: 'src/app.ts',
        movePath: 'src/main.ts',
        chunks: [
          {
            context: 'function main() {',
            oldLines: ['const x = 1', 'const y = 2'],
            newLines: ['const x = 1', 'const y = 3'],
            endOfFile: false,
          },
        ],
      },
    ])
  })

  it('reads several chunks, a first chunk without @@, End of File, and CRLF text', () => {
    const text = patch(
      '*** Update File: a.txt',
      '-one',
      '+1',
      '@@',
      ' two',
      '',
      '-three',
      '*** End of File',
    ).replaceAll('\n', '\r\n')
    expect(parsePatch(text)).toEqual([
      {
        type: 'update',
        path: 'a.txt',
        chunks: [
          {
            oldLines: ['one'],
            newLines: ['1'],
            endOfFile: false,
          },
          {
            oldLines: ['two', '', 'three'],
            newLines: ['two', ''],
            endOfFile: true,
          },
        ],
      },
    ])
  })

  it.each([
    {
      name: 'a missing begin line',
      text: '\n*** Update File: a.txt\n*** End Patch',
      error: 'Patch line 2: the patch must start with "*** Begin Patch".',
    },
    {
      name: 'a missing end line',
      text: '*** Begin Patch\n*** Delete File: a.txt\n',
      error: 'Patch line 2: the patch must end with "*** End Patch".',
    },
    {
      name: 'an unknown header',
      text: patch('*** Rename File: a.txt'),
      error:
        'Patch line 2: expected "*** Add File:", "*** Delete File:", or "*** Update File:".',
    },
    {
      name: 'an added line without +',
      text: patch('*** Add File: a.txt', '+one', 'two'),
      error:
        'Patch line 4: each line of an added file must start with "+".',
    },
    {
      name: 'a chunk line without a prefix',
      text: patch('*** Update File: a.txt', '@@', ' one', 'two'),
      error:
        'Patch line 5: each chunk line must start with " ", "-", or "+".',
    },
    {
      name: 'an update without changes',
      text: patch('*** Update File: a.txt', '@@', '*** Delete File: b.txt'),
      error: 'Patch line 2: "*** Update File: a.txt" has no changes.',
    },
    {
      name: 'a header without a path',
      text: patch('*** Add File: '),
      error: 'Patch line 2: the path is missing.',
    },
  ])('refuses $name', ({ text, error }) => {
    expect(() => parsePatch(text)).toThrow(error)
  })
})

describe('patchPaths', () => {
  it('lists every path, with the move targets', () => {
    const text = patch(
      '*** Add File: new.txt',
      '+x',
      '*** Delete File: old.txt',
      '*** Update File: src/a.ts',
      '*** Move to: src/b.ts',
      '-x',
    )
    expect(patchPaths(text)).toEqual([
      'new.txt',
      'old.txt',
      'src/a.ts',
      'src/b.ts',
    ])
  })

  it('throws when the patch does not parse', () => {
    expect(() => patchPaths('*** Delete File: a.txt')).toThrow(
      'Patch line 1: the patch must start with "*** Begin Patch".',
    )
  })
})

describe('patch tool', () => {
  it('adds and updates files, and lists them', async () => {
    const files = workspace({ 'src/a.ts': 'const a = 1\nconst b = 2\n' })
    const result = await files.run(
      patch(
        '*** Add File: src/new.ts',
        '+hello',
        '*** Update File: src/a.ts',
        '@@',
        '-const b = 2',
        '+const b = 3',
      ),
    )
    expect(result).toBe(
      'Applied the patch:\nadded src/new.ts\nupdated src/a.ts',
    )
    expect(files.files()).toEqual({
      'src/a.ts': 'const a = 1\nconst b = 3\n',
      'src/new.ts': 'hello\n',
    })
  })

  it('searches from the @@ line', async () => {
    const file = 'function a() {\n  return 1\n}\nfunction b() {\n  return 1\n}\n'
    const text = patch(
      '*** Update File: a.txt',
      '@@ function b() {',
      '-  return 1',
      '+  return 2',
    )
    expect(await patchFile(file, text)).toBe(
      'function a() {\n  return 1\n}\nfunction b() {\n  return 2\n}\n',
    )
  })

  it('puts only added lines below the @@ line', async () => {
    const text = patch('*** Update File: a.txt', '@@ two', '+two and a half')
    expect(await patchFile('one\ntwo\nthree\n', text)).toBe(
      'one\ntwo\ntwo and a half\nthree\n',
    )
  })

  it('searches each chunk after the chunk before it', async () => {
    // `x` is in the file twice, but once after the first chunk.
    const text = patch('*** Update File: a.txt', '@@', '-a', '+A', '@@', '-x', '+X')
    expect(await patchFile('x\na\nx\n', text)).toBe('x\nA\nX\n')
  })

  it('matches the end of the file after End of File', async () => {
    const text = patch(
      '*** Update File: a.txt',
      '@@',
      '-end',
      '+END',
      '*** End of File',
    )
    expect(await patchFile('end\nmiddle\nend\n', text)).toBe(
      'end\nmiddle\nEND\n',
    )
  })

  it('sees the changes of an earlier section on the same file', async () => {
    const text = patch(
      '*** Update File: a.txt',
      '-one',
      '+1',
      '*** Update File: a.txt',
      '-1',
      '+uno',
    )
    expect(await patchFile('one\n', text)).toBe('uno\n')
  })

  it.each([
    {
      name: 'a CRLF file stays CRLF',
      file: 'one\r\ntwo\r\nthree\r\n',
      expected: 'one\r\n2\r\nthree\r\n',
    },
    {
      name: 'a byte order mark stays',
      file: '﻿one\ntwo\nthree\n',
      expected: '﻿one\n2\nthree\n',
    },
    {
      name: 'a file without a last line ending stays without it',
      file: 'one\ntwo',
      expected: 'one\n2',
    },
  ])('$name', async ({ file, expected }) => {
    const text = patch('*** Update File: a.txt', '@@', ' one', '-two', '+2')
    expect(await patchFile(file, text)).toBe(expected)
  })

  it('matches lines in another Unicode form', async () => {
    // The file is in NFD form. The patch is in NFC form.
    const file = 'café\nnaïve\n'
    const text = patch('*** Update File: a.txt', '@@', '-café', '+tea')
    expect(await patchFile(file, text)).toBe('tea\nnaïve\n')
  })

  it.each([
    {
      name: 'old lines that are not in the file',
      file: 'x\nmid\nx\n',
      lines: ['@@', '-zzz', '+q'],
      error: 'Chunk 1 of a.txt: the old lines are not in the file.',
    },
    {
      name: 'old lines that are in the file twice',
      file: 'x\nmid\nx\n',
      lines: ['@@', '-x', '+y'],
      error:
        'Chunk 1 of a.txt: the old lines appear 2 times. Add context lines.',
    },
    {
      name: 'an @@ line that is not in the file',
      file: 'x\nmid\nx\n',
      lines: ['@@ function nope() {', '-x', '+y'],
      error: 'Chunk 1 of a.txt: "@@ function nope() {" is not in the file.',
    },
    {
      // The file has `x` only at the end of the line `ax`.
      name: 'old lines that start inside a line',
      file: 'ax\nb\n',
      lines: ['@@', '-x', '+y'],
      error: 'Chunk 1 of a.txt: the old lines are not in the file.',
    },
  ])('refuses $name, and changes nothing', async ({ file, lines, error }) => {
    const files = workspace({ 'a.txt': file })
    await expect(
      files.run(patch('*** Update File: a.txt', ...lines)),
    ).rejects.toThrow(error)
    expect(files.files()).toEqual({ 'a.txt': file })
  })

  it('changes no file when a later file does not fit', async () => {
    const files = workspace({ 'a.txt': 'a\n', 'b.txt': 'b\n' })
    const text = patch(
      '*** Update File: a.txt',
      '-a',
      '+A',
      '*** Add File: c.txt',
      '+c',
      '*** Update File: b.txt',
      '-zzz',
      '+Z',
    )
    await expect(files.run(text)).rejects.toThrow(
      'Chunk 1 of b.txt: the old lines are not in the file.',
    )
    expect(files.files()).toEqual({ 'a.txt': 'a\n', 'b.txt': 'b\n' })
    expect(files.written).toEqual([])
  })

  it('runs the afterWrite hook once for each written file', async () => {
    const files = workspace({ 'a.txt': 'a\n', 'b.txt': 'b\n' })
    await files.run(
      patch(
        '*** Update File: a.txt',
        '-a',
        '+A',
        '*** Update File: b.txt',
        '-b',
        '+B',
        '*** Update File: a.txt',
        '-A',
        '+AA',
      ),
    )
    expect(files.written).toEqual(['a.txt', 'b.txt'])
  })

  it('deletes a file, and runs no hook for it', async () => {
    const files = workspace({ 'a.txt': 'a\n', 'b.txt': 'b\n' })
    const result = await files.run(
      patch('*** Add File: c.txt', '+c', '*** Delete File: a.txt'),
    )
    expect(result).toBe('Applied the patch:\nadded c.txt\ndeleted a.txt')
    expect(files.files()).toEqual({ 'b.txt': 'b\n', 'c.txt': 'c\n' })
    expect(files.written).toEqual(['c.txt'])
  })

  it('moves a file, and applies its chunks', async () => {
    const files = workspace({ 'a.txt': 'one\ntwo\n' })
    const result = await files.run(
      patch(
        '*** Update File: a.txt',
        '*** Move to: src/b.txt',
        '@@',
        ' one',
        '-two',
        '+2',
      ),
    )
    expect(result).toBe('Applied the patch:\nmoved a.txt to src/b.txt')
    expect(files.files()).toEqual({ 'src/b.txt': 'one\n2\n' })
    expect(files.written).toEqual(['src/b.txt'])
  })

  it.each([
    {
      name: 'a delete of a missing file',
      lines: ['*** Delete File: missing.txt'],
      error: 'Cannot delete missing.txt: no such file.',
    },
    {
      name: 'a move onto a file that is there',
      lines: ['*** Update File: a.txt', '*** Move to: b.txt'],
      error: 'Cannot move a.txt to b.txt: b.txt already exists.',
    },
  ])('refuses $name, and changes nothing', async ({ lines, error }) => {
    const before = { 'a.txt': 'a\n', 'b.txt': 'b\n', 'd.txt': 'd\n' }
    const files = workspace(before)
    await expect(
      files.run(
        patch('*** Add File: c.txt', '+c', '*** Delete File: d.txt', ...lines),
      ),
    ).rejects.toThrow(error)
    expect(files.files()).toEqual(before)
  })

  it.each([
    {
      name: 'a delete',
      lines: ['*** Delete File: a.txt'],
      error: 'Cannot delete a.txt: the workspace cannot remove files.',
    },
    {
      name: 'a move',
      lines: ['*** Update File: a.txt', '*** Move to: b.txt'],
      error: 'Cannot move a.txt: the workspace cannot remove files.',
    },
  ])(
    'refuses $name when the backend cannot remove files, and changes nothing',
    async ({ lines, error }) => {
      const files = workspace({ 'a.txt': 'a\n' }, { canRemove: false })
      await expect(
        files.run(patch('*** Add File: c.txt', '+c', ...lines)),
      ).rejects.toThrow(error)
      expect(files.files()).toEqual({ 'a.txt': 'a\n' })
    },
  )
})
