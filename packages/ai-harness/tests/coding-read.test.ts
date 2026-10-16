import { tmpdir } from 'node:os'
import { join, posix, resolve, sep } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createWorkspaceTools } from '../src/first-party/coding/workspace'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'
import type { WorkspaceHooks } from '../src/first-party/workspace-hooks'

/**
 * A backend that keeps files in a map, by absolute path. It runs no
 * commands. `shell: 'sh'` gives it POSIX paths, like a Linux sandbox.
 */
function memoryBackend(shell?: 'sh') {
  const separator = shell === 'sh' ? posix.sep : sep
  const files = new Map<string, Uint8Array>()
  const backend: WorkspaceBackend = {
    shell,
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
    stat: async (path) => {
      const data = files.get(path)
      if (!data) return undefined
      return { type: 'file', size: data.length, mtimeMs: 0 }
    },
    readdir: async (path) => {
      const prefix = path + separator
      const paths = [...files.keys()].filter((file) => file.startsWith(prefix))
      // Like the host, a folder that is not there throws.
      if (paths.length === 0) throw new Error(`No folder ${path}`)
      return paths
        .map((file) => file.slice(prefix.length))
        .filter((name) => !name.includes(separator))
        .sort()
        .map((name) => ({ name, type: 'file' as const }))
    },
    exec: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  }
  return backend
}

const root = resolve(tmpdir(), 'harness-read')
const backend = memoryBackend()

const ascii = (text: string) => new TextEncoder().encode(text)
const put = (path: string, data: Uint8Array | string) =>
  backend.writeFile(join(root, path), data)

/**
 * `read_file` with `hooks`, in `workspace`. Default: the memory backend at
 * `root`.
 */
function reader(
  options: {
    hooks?: Array<WorkspaceHooks>
    workspace?: { root: string; backend: WorkspaceBackend }
  } = {},
) {
  const { hooks = [], workspace = { root, backend } } = options
  const tool = createWorkspaceTools(workspace, {
    hooks: () => hooks,
  }).tools.find((item) => item.name === 'read_file')
  return async (
    path: string,
    options: { offset?: number; limit?: number } = {},
  ) => {
    if (!tool?.execute) throw new Error('No read_file tool')
    const result: unknown = await tool.execute({ path, ...options })
    return result
  }
}

const read = reader()

/** The result of `read_file` for a text file. Throws for any other result. */
async function readText(
  path: string,
  options: { offset?: number; limit?: number } = {},
) {
  const result = await read(path, options)
  if (typeof result !== 'string') throw new Error('Not a text result')
  return result
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const pngPart = {
  type: 'image',
  source: { type: 'data', value: 'iVBORw0KGgo=', mimeType: 'image/png' },
}
const BINARY = new Uint8Array([0x49, 0x44, 0x00, 0x01])

describe('read_file text', () => {
  it('reads a file with a byte order mark without the mark', async () => {
    await put('bom.txt', new Uint8Array([0xef, 0xbb, 0xbf, ...ascii('a\nb\n')]))
    expect(await read('bom.txt')).toBe('1\ta\n2\tb')
  })

  it('cuts a line over 2000 characters, and says how much is cut', async () => {
    await put('long.txt', `${'a'.repeat(2500)}\nshort`)
    expect(await read('long.txt')).toBe(
      `1\t${'a'.repeat(2000)}... [line cut: 500 more characters]\n2\tshort`,
    )
  })

  it('reads a Git LFS pointer named .png as text', async () => {
    await put('pointer.png', 'version https://git-lfs.github.com/spec/v1\n')
    expect(await read('pointer.png')).toBe(
      '1\tversion https://git-lfs.github.com/spec/v1',
    )
  })
})

describe('read_file pages', () => {
  beforeAll(async () => {
    const lines = Array.from({ length: 2500 }, (_, index) => `L${index + 1}`)
    await put('many.txt', lines.join('\n'))
  })

  it.each([{}, { limit: 5000 }])(
    'shows at most 2000 lines, then says where the next page starts (%o)',
    async (options) => {
      const lines = (await readText('many.txt', options)).split('\n')
      expect(lines.slice(0, 2)).toEqual(['1\tL1', '2\tL2'])
      expect(lines.slice(-3)).toEqual([
        '2000\tL2000',
        '',
        '[Showing lines 1-2000 of 2500. Read more with offset 2001.]',
      ])
    },
  )

  it('reads the next page from its offset to the end, with no note', async () => {
    const lines = (await readText('many.txt', { offset: 2001 })).split('\n')
    expect(lines).toHaveLength(500)
    expect(lines[0]).toBe('2001\tL2001')
    expect(lines.at(-1)).toBe('2500\tL2500')
  })

  it('keeps a page under 50 KiB', async () => {
    // Each line is about 1 KB, so 51 lines fit in 50 KiB.
    await put(
      'wide.txt',
      Array.from({ length: 100 }, () => 'x'.repeat(1000)).join('\n'),
    )
    const lines = (await readText('wide.txt')).split('\n')
    expect(lines.at(-3)).toBe(`51\t${'x'.repeat(1000)}`)
    expect(lines.at(-1)).toBe(
      '[Showing lines 1-51 of 100. Read more with offset 52.]',
    )
  })

  it('says how many lines there are when offset is past the end', async () => {
    expect(await read('many.txt', { offset: 3000 })).toBe(
      '[No lines from line 3000. many.txt has 2500 lines.]',
    )
  })
})

describe('read_file media and binary files', () => {
  it.each([
    { file: 'a.png', bytes: PNG, part: pngPart },
    {
      file: 'a.jpg',
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      part: {
        type: 'image',
        source: { type: 'data', value: '/9j/4A==', mimeType: 'image/jpeg' },
      },
    },
    {
      file: 'a.gif',
      bytes: ascii('GIF89a'),
      part: {
        type: 'image',
        source: { type: 'data', value: 'R0lGODlh', mimeType: 'image/gif' },
      },
    },
    {
      file: 'a.webp',
      bytes: new Uint8Array([
        ...ascii('RIFF'),
        0,
        0,
        0,
        0,
        ...ascii('WEBPVP8 '),
      ]),
      part: {
        type: 'image',
        source: {
          type: 'data',
          value: 'UklGRgAAAABXRUJQVlA4IA==',
          mimeType: 'image/webp',
        },
      },
    },
    {
      file: 'a.pdf',
      bytes: ascii('%PDF-1.7'),
      part: {
        type: 'document',
        source: {
          type: 'data',
          value: 'JVBERi0xLjc=',
          mimeType: 'application/pdf',
        },
      },
    },
  ])('returns $file as a $part.type part', async ({ file, bytes, part }) => {
    await put(file, bytes)
    expect(await read(file)).toEqual([part])
  })

  it('refuses an image over 5 MB', async () => {
    const big = new Uint8Array(6 * 1024 * 1024)
    big.set(PNG)
    await put('big.png', big)
    await expect(read('big.png')).rejects.toThrow(
      'big.png is 6.0 MB. read_file sends images and PDFs up to 5 MB.',
    )
  })

  it.each([
    {
      file: 'data.bin',
      expected:
        'data.bin is a binary file (4 bytes). read_file shows text, images, and PDFs only.',
    },
    {
      file: 'clip.mp3',
      expected:
        'clip.mp3 is a binary file (4 bytes, audio/mpeg). read_file shows text, images, and PDFs only.',
    },
  ])('says $file is binary, with its size', async ({ file, expected }) => {
    await put(file, BINARY)
    expect(await read(file)).toBe(expected)
  })
})

describe('read_file on a missing file', () => {
  beforeAll(async () => {
    const names = [
      'src/Button.tsx',
      'src/button.css',
      'src/helpers.ts',
      'src/index.ts',
      'parts/a1.ts',
      'parts/a2.ts',
      'parts/a3.ts',
      'parts/a4.ts',
    ]
    await Promise.all(names.map((name) => put(name, 'x')))
  })

  it.each([
    {
      path: 'src/button.ts',
      message:
        'File not found: src/button.ts. Did you mean src/Button.tsx, src/button.css?',
    },
    {
      path: 'src/helpres.ts',
      message: 'File not found: src/helpres.ts. Did you mean src/helpers.ts?',
    },
    {
      path: 'parts/a.ts',
      message:
        'File not found: parts/a.ts. Did you mean parts/a1.ts, parts/a2.ts, parts/a3.ts?',
    },
    { path: 'nowhere/x.ts', message: 'File not found: nowhere/x.ts.' },
  ])('names similar files for $path', async ({ path, message }) => {
    await expect(read(path)).rejects.toThrow(message)
  })

  it('names them with POSIX paths in a sandbox, also on a Windows host', async () => {
    const sandbox = memoryBackend('sh')
    await sandbox.writeFile('/workspace/src/Button.tsx', 'x')
    const readInSandbox = reader({
      workspace: { root: '/workspace', backend: sandbox },
    })
    await expect(readInSandbox('src/button.tsx')).rejects.toThrow(
      'File not found: src/button.tsx. Did you mean src/Button.tsx?',
    )
  })
})

describe('read_file hooks', () => {
  it('adds afterRead text to a text file, not to media or binary files', async () => {
    const readWithHook = reader({
      hooks: [{ afterRead: async () => 'hook note' }],
    })
    await put('hooked.txt', 'hello')
    await put('hooked.png', PNG)
    await put('hooked.bin', BINARY)
    expect(await readWithHook('hooked.txt')).toBe('1\thello\n\nhook note')
    expect(await readWithHook('hooked.png')).toEqual([pngPart])
    expect(await readWithHook('hooked.bin')).toBe(
      'hooked.bin is a binary file (4 bytes). read_file shows text, images, and PDFs only.',
    )
  })
})
