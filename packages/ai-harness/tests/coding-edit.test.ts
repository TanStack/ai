import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWorkspaceTools } from '../src/first-party/coding/workspace'
import type { AnyTool } from '@tanstack/ai'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'

/** A backend that keeps files in a map, by absolute path. */
function memoryBackend() {
  const files = new Map<string, Uint8Array>()
  const backend: WorkspaceBackend = {
    readFile: async (path) => {
      const data = files.get(path)
      if (!data) throw new Error(`No file ${path}`)
      return data
    },
    writeFile: async (path, data) => {
      files.set(
        path,
        typeof data === 'string' ? new TextEncoder().encode(data) : data,
      )
    },
    stat: async () => undefined,
    readdir: async () => [],
    exec: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  }
  return backend
}

const root = resolve(tmpdir(), 'harness-edit')
const backend = memoryBackend()
const tools: Array<AnyTool> = createWorkspaceTools({ root, backend }).tools
// Keep a byte order mark in the text, so the tests can see it.
const decoder = new TextDecoder('utf-8', { ignoreBOM: true })

async function run(name: string, args: object) {
  const tool = tools.find((item) => item.name === name)
  if (!tool?.execute) throw new Error(`No tool ${name}`)
  const result: string = await tool.execute(args)
  return result
}

async function read(path: string) {
  return decoder.decode(await backend.readFile(join(root, path)))
}

/** Write `text` to `path`, run `edit_file` on it, and read the file back. */
async function edit(
  path: string,
  text: string,
  change: { old: string; new: string; replaceAll?: boolean },
) {
  await backend.writeFile(join(root, path), text)
  const result = await run('edit_file', { path, ...change })
  return { result, text: await read(path) }
}

describe('edit_file', () => {
  it('replaces the exact text', async () => {
    expect(
      await edit('exact.txt', 'let a = 1\nlet b = 2\n', {
        old: 'a = 1',
        new: 'a = 3',
      }),
    ).toEqual({
      result: 'Edited exact.txt (1 change).',
      text: 'let a = 3\nlet b = 2\n',
    })
  })

  it('matches text in another Unicode form, and keeps the rest of the file', async () => {
    // The file is in NFD form. The old text is in NFC form.
    const { text } = await edit('nfd.txt', 'café and naïve\n', {
      old: 'café',
      new: 'tea',
    })
    expect(text).toBe('tea and naïve\n')
  })

  it('ignores spaces and tabs at the end of lines', async () => {
    const { text } = await edit('trailing.txt', 'a  \nb\t\nc  \n', {
      old: 'a\nb',
      new: 'x',
    })
    expect(text).toBe('x\nc  \n')
  })

  it('prefers an exact match over a looser one', async () => {
    // With trailing spaces ignored, `foo\n` is in the file twice.
    const { text } = await edit('prefer.txt', 'foo\nfoo  \n', {
      old: 'foo\n',
      new: 'bar\n',
    })
    expect(text).toBe('bar\nfoo  \n')
  })

  it('refuses text that is not unique at the level that finds it, unless replaceAll', async () => {
    const file = 'foo \nbar\nfoo\t\nbar\n'
    await expect(
      edit('twice.txt', file, { old: 'foo\nbar', new: 'x' }),
    ).rejects.toThrow('The old text appears 2 times.')
    expect(
      await edit('twice.txt', file, {
        old: 'foo\nbar',
        new: 'x',
        replaceAll: true,
      }),
    ).toEqual({ result: 'Edited twice.txt (2 changes).', text: 'x\nx\n' })
  })

  it('refuses text that is not in the file, and empty text', async () => {
    await expect(
      edit('missing.txt', 'abc\n', { old: 'zzz', new: 'q' }),
    ).rejects.toThrow('The old text is not in the file.')
    await expect(
      edit('missing.txt', 'abc\n', { old: '', new: 'q' }),
    ).rejects.toThrow('The old text is not in the file.')
  })

  it.each([
    {
      name: 'a CRLF file with LF text',
      file: 'one\r\ntwo\r\nthree\r\n',
      old: 'one\ntwo',
      new: '1\n2',
      expected: '1\r\n2\r\nthree\r\n',
    },
    {
      name: 'an LF file with CRLF text',
      file: 'one\ntwo\nthree\n',
      old: 'one\r\ntwo',
      new: '1\r\n2',
      expected: '1\n2\nthree\n',
    },
  ])('edits $name, and keeps the line endings of the file', async (example) => {
    const { text } = await edit('endings.txt', example.file, {
      old: example.old,
      new: example.new,
    })
    expect(text).toBe(example.expected)
  })

  it.each([
    { name: 'without the mark', old: 'first' },
    { name: 'that starts with the mark', old: '﻿first' },
  ])('keeps the byte order mark, with old text $name', async ({ old }) => {
    const { text } = await edit('bom.txt', '﻿first\nsecond\n', {
      old,
      new: '1st',
    })
    expect(text).toBe('﻿1st\nsecond\n')
  })
})

describe('write_file', () => {
  it('writes the content as given', async () => {
    expect(
      await run('write_file', { path: 'new/w.txt', content: 'hi\r\n' }),
    ).toBe('Wrote new/w.txt.')
    expect(await read('new/w.txt')).toBe('hi\r\n')
  })
})
