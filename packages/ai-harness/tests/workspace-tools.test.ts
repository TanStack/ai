import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostBackend } from '../src/first-party/coding/backend'
import { createWorkspaceTools } from '../src/first-party/coding/workspace'
import type { AnyTool } from '@tanstack/ai'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'
import type {
  OutsideAccess,
  WorkspaceToolsOptions,
} from '../src/first-party/coding/workspace'

/** A backend that keeps files in a map, by absolute path. It runs no commands. */
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
    stat: async (path) => {
      const data = files.get(path)
      if (!data) return undefined
      return { type: 'file', size: data.length, mtimeMs: 0 }
    },
    readdir: async (path) => {
      const prefix = path.endsWith(sep) ? path : path + sep
      const entries = new Map<string, 'file' | 'dir'>()
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue
        const [name = '', ...rest] = file.slice(prefix.length).split(sep)
        entries.set(name, rest.length > 0 ? 'dir' : 'file')
      }
      // Sorted by name, like the host.
      return [...entries]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, type]) => ({ name, type }))
    },
    exec: async (command, options) => ({
      exitCode: 3,
      stdout: `ran ${command} in ${options?.cwd}`,
      stderr: 'warn',
    }),
  }
  return backend
}

/** A backend, and how to make and remove an empty folder on it. */
interface Fixture {
  name: string
  backend: WorkspaceBackend
  folder: (prefix: string) => Promise<string>
  remove: (folder: string) => Promise<void>
}

let memoryFolders = 0
const fixtures: Array<Fixture> = [
  {
    name: 'host',
    backend: hostBackend,
    folder: (prefix) => mkdtemp(join(tmpdir(), prefix)),
    remove: (folder) => rm(folder, { recursive: true, force: true }),
  },
  {
    name: 'memory',
    backend: memoryBackend(),
    folder: async (prefix) => {
      memoryFolders += 1
      return resolve(tmpdir(), `${prefix}${memoryFolders}`)
    },
    remove: async () => undefined,
  },
]

const decoder = new TextDecoder()

/** The tools by name, for `options` and the user's `access`. */
function toolsOf(options: WorkspaceToolsOptions, access?: OutsideAccess) {
  return new Map(
    createWorkspaceTools(options, { access }).tools.map(
      (tool): [string, AnyTool] => [tool.name, tool],
    ),
  )
}

const runIn = (
  set: Map<string, AnyTool>,
  name: string,
  args: unknown,
): Promise<string> => {
  const tool = set.get(name)
  if (!tool?.execute) throw new Error(`No tool ${name}`)
  return Promise.resolve(tool.execute(args))
}

describe.each(fixtures)('workspace tools on the $name backend', (fixture) => {
  const { backend } = fixture
  let root: string
  let tools: Map<string, AnyTool>

  const run = (name: string, args: unknown) => runIn(tools, name, args)
  const write = (path: string, text: string) =>
    backend.writeFile(join(root, path), text)
  const read = async (path: string) =>
    decoder.decode(await backend.readFile(join(root, path)))

  beforeAll(async () => {
    root = await fixture.folder('harness-workspace-')
    await write('src/a.ts', 'one\ntwo\nthree\nfour\n')
    await write('src/deep/b.ts', 'const two = 2\n')
    await write('notes.md', 'two words\n')
    await write('node_modules/pkg/index.js', 'two\n')
    await write('big.txt', `two\n${'x'.repeat(1_100_000)}`)
    tools = toolsOf({ root, backend })
  })

  afterAll(async () => {
    await fixture.remove(root)
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
      await expect(
        run('read_file', { path: '../outside.txt' }),
      ).rejects.toThrow('outside the workspace')
      await expect(
        run('read_file', { path: join(tmpdir(), 'elsewhere.txt') }),
      ).rejects.toThrow('outside the workspace')
      await expect(run('read_file', {})).rejects.toThrow(
        'Argument "path" must be a string.',
      )
      await expect(run('read_file', null)).rejects.toThrow('must be a string')
    })

    it('cuts very long output', async () => {
      await write('long.txt', 'y'.repeat(25_000))
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
      expect(await read('new/dir/c.txt')).toBe('hi')
      await expect(run('write_file', { path: 'x.txt' })).rejects.toThrow(
        'Argument "content" must be a string.',
      )
    })

    it('edits one match, refuses ambiguous or missing text, and replaces all when asked', async () => {
      await write('e.txt', 'a b a')
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
      expect(
        await run('edit_file', { path: 'e.txt', old: 'b', new: 'c' }),
      ).toBe('Edited e.txt (1 change).')
      expect(await read('e.txt')).toBe('q c q')
    })

    it('runs edits to one file one at a time, so none is lost', async () => {
      await write('race.txt', 'a b')
      await Promise.all([
        run('edit_file', { path: 'race.txt', old: 'a', new: 'x' }),
        run('edit_file', { path: 'race.txt', old: 'b', new: 'y' }),
      ])
      expect(await read('race.txt')).toBe('x y')
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

  describe('outside the workspace', () => {
    let outside: string
    beforeAll(async () => {
      outside = await fixture.folder('harness-outside-')
      await backend.writeFile(join(outside, 'docs', 'a.md'), 'alpha')
      await backend.writeFile(join(outside, 'docs', 'b.md'), 'beta')
      await backend.writeFile(join(outside, 'top.md'), 'top')
    })
    afterAll(async () => {
      await fixture.remove(outside)
    })

    /** Tools that ask about outside paths. The user answers from `answers`. */
    function asking(answers: Array<unknown>, mode = 'default') {
      const questions: Array<string> = []
      const set = toolsOf(
        { root, backend, outside: 'ask' },
        {
          ask: async (message) => {
            questions.push(message)
            return answers.shift()
          },
          mode: () => mode,
        },
      )
      return { set, questions }
    }

    it('refuses outside paths without the outside option', async () => {
      await expect(
        run('read_file', { path: join(outside, 'top.md') }),
      ).rejects.toThrow('outside the workspace')
    })

    it('asks once for a folder, then allows it for the session', async () => {
      const { set, questions } = asking([true])
      expect(
        await runIn(set, 'read_file', { path: join(outside, 'docs', 'a.md') }),
      ).toBe('1\talpha')
      expect(
        await runIn(set, 'read_file', { path: join(outside, 'docs', 'b.md') }),
      ).toBe('1\tbeta')
      expect(questions).toHaveLength(1)
      expect(questions[0]).toContain(`Allow ${join(outside, 'docs')}`)
    })

    it('asks again for another folder, and refuses after a no', async () => {
      const { set, questions } = asking([true, 'n'])
      await runIn(set, 'read_file', { path: join(outside, 'docs', 'a.md') })
      await expect(
        runIn(set, 'read_file', { path: join(outside, 'top.md') }),
      ).rejects.toThrow('The user did not allow')
      expect(questions).toHaveLength(2)
    })

    it('asks one question for calls at the same time', async () => {
      const { set, questions } = asking([true])
      await Promise.all([
        runIn(set, 'read_file', { path: join(outside, 'docs', 'a.md') }),
        runIn(set, 'read_file', { path: join(outside, 'docs', 'b.md') }),
      ])
      expect(questions).toHaveLength(1)
    })

    it('lists and searches an allowed outside folder with full paths', async () => {
      const { set } = asking([true])
      const folder = join(outside, 'docs')
      const shown = folder.split(sep).join('/')
      expect(await runIn(set, 'list_files', { path: folder })).toBe(
        `${shown}/a.md\n${shown}/b.md`,
      )
      expect(await runIn(set, 'grep', { pattern: 'beta', path: folder })).toBe(
        `${shown}/b.md:1: beta`,
      )
    })

    it('does not ask in bypass mode', async () => {
      const { set, questions } = asking([], 'bypass')
      expect(
        await runIn(set, 'read_file', { path: join(outside, 'top.md') }),
      ).toBe('1\ttop')
      expect(questions).toHaveLength(0)
    })
  })
})

describe('bash', () => {
  it('reports the exit code and stderr on the host', async () => {
    const set = toolsOf({
      root: tmpdir(),
      backend: hostBackend,
      bashTimeoutMs: 20_000,
    })
    const ok = await runIn(set, 'bash', {
      command: `node -e "console.log('out'); console.error('warn')"`,
    })
    expect(ok).toMatch(/^exit code: 0\nout/)
    expect(ok).toContain('stderr:\nwarn')
    const failed = await runIn(set, 'bash', {
      command: `node -e "process.exit(3)"`,
    })
    expect(failed).toMatch(/^exit code: 3/)
  })

  it('runs the command through the backend, in the workspace folder', async () => {
    const root = resolve(tmpdir(), 'harness-bash')
    const set = toolsOf({ root, backend: memoryBackend() })
    expect(await runIn(set, 'bash', { command: 'make' })).toBe(
      `exit code: 3\nran make in ${root}\nstderr:\nwarn`,
    )
  })
})
