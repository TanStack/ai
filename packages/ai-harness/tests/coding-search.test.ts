import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { hostBackend } from '../src/first-party/coding/backend'
import { quoteArg } from '../src/first-party/coding/search'
import { createWorkspaceTools } from '../src/first-party/coding/workspace'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'

// The bundled rg of `@vscode/ripgrep`. It points at a file that exists, so
// no test needs the real binary. No test runs it.
const ripgrep = vi.hoisted(() => ({ rgPath: process.execPath }))
vi.mock('@vscode/ripgrep', () => ({
  get rgPath() {
    return ripgrep.rgPath
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
  ripgrep.rgPath = process.execPath
})

interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

const ok = (stdout: string): ExecResult => ({ exitCode: 0, stdout, stderr: '' })
const NOT_FOUND: ExecResult = { exitCode: 127, stdout: '', stderr: 'not found' }
const GIT = 'git ls-files -z --cached --others --exclude-standard'
const NOT_GIT: ExecResult = {
  exitCode: 128,
  stdout: '',
  stderr: 'fatal: not a git repository',
}
const FILES_NOTE =
  '[Not all files are shown. Use a pattern or a folder to see fewer.]'
const MATCHES_NOTE =
  '[Not all matches are shown. Use a narrower pattern, glob, or folder.]'

const root = resolve(tmpdir(), 'coding-search')
const hasGit = (await hostBackend.exec('git --version')).exitCode === 0
// A real process can take seconds to start on a busy machine.
const SPAWN_TIMEOUT = 60_000

/**
 * A backend with `files` in memory, by path from `root`. `script` answers
 * each command. A command that it does not answer is not found.
 */
function fakeBackend(
  files: Record<string, string>,
  script: (command: string) => ExecResult | undefined = () => undefined,
) {
  const encoder = new TextEncoder()
  const byPath = new Map(
    Object.entries(files).map(([path, text]) => [
      join(root, path),
      encoder.encode(text),
    ]),
  )
  const commands: Array<string> = []
  const backend: WorkspaceBackend = {
    readFile: async (path) => {
      const data = byPath.get(path)
      if (!data) throw new Error(`No file ${path}`)
      return data
    },
    writeFile: async () => {
      throw new Error('Read only')
    },
    stat: async (path) => {
      const data = byPath.get(path)
      if (!data) return undefined
      return { type: 'file', size: data.length, mtimeMs: 0 }
    },
    readdir: async (path) => {
      const prefix = path + sep
      const entries = new Map<string, 'file' | 'dir'>()
      for (const file of byPath.keys()) {
        if (!file.startsWith(prefix)) continue
        const [name = '', ...rest] = file.slice(prefix.length).split(sep)
        entries.set(name, rest.length > 0 ? 'dir' : 'file')
      }
      // Sorted by name, like the host.
      return [...entries]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, type]) => ({ name, type }))
    },
    exec: async (command) => {
      commands.push(command)
      return script(command) ?? NOT_FOUND
    },
  }
  return { backend, commands }
}

/** `list_files` and `grep` on `backend`, with the workspace at `folder`. */
function searchOn(backend: WorkspaceBackend, folder = root) {
  const { tools } = createWorkspaceTools({ root: folder, backend })
  const run = async (name: string, args: object) => {
    const tool = tools.find((each) => each.name === name)
    if (!tool?.execute) throw new Error(`No tool ${name}`)
    const result: unknown = await tool.execute(args)
    if (typeof result !== 'string') throw new Error(`${name} gave no text`)
    return result
  }
  return {
    listFiles: (args: object = {}) => run('list_files', args),
    grep: (args: object) => run('grep', args),
  }
}

/** Run `script` for the commands of the host backend, not a real shell. */
function scriptHostExec(script: (command: string) => ExecResult | undefined) {
  return vi
    .spyOn(hostBackend, 'exec')
    .mockImplementation(async (command) => script(command) ?? NOT_FOUND)
}

describe('list_files and grep engines', () => {
  const long = `two${'x'.repeat(3000)}`
  const files = {
    'src/b.ts': 'const two = 2\r\n',
    'src/a.ts': 'one\ntwo\n',
    'long.txt': `${long}\n`,
    '.github/ci.yml': 'two: yes\n',
    'image.png': 'two\0',
    'node_modules/pkg/i.js': 'two\n',
    '.git/HEAD': 'two\n',
  }
  // What rg prints for `files`: not sorted, with `./`, NUL after each path.
  // A long line is cut after 2000 bytes, with a note after it.
  const rgFiles = './src/b.ts\0./src/a.ts\0./long.txt\0./image.png\0./.github/ci.yml\0'
  const rgMatches = [
    './src/b.ts\x001:const two = 2\r',
    './.github/ci.yml\x001:two: yes',
    `./long.txt\x001:${long.slice(0, 2000)} [... omitted end of long line]`,
    './src/a.ts\x002:two',
    '',
  ].join('\n')
  const gitFiles =
    '.github/ci.yml\0image.png\0long.txt\0node_modules/pkg/i.js\0src/a.ts\0src/b.ts\0'

  const engines = [
    {
      name: 'rg on the PATH',
      script: (command: string) => {
        if (command === 'rg --version') return ok('ripgrep 14.1.0')
        if (command.startsWith('rg --files ')) return ok(rgFiles)
        const isGrepForTwo =
          command.startsWith('rg --line-number ') &&
          command.endsWith(` -e 'two' .`)
        return isGrepForTwo ? ok(rgMatches) : undefined
      },
      commands: [
        'rg --version',
        expect.stringMatching(/^rg --files /),
        expect.stringMatching(/^rg --line-number /),
      ],
    },
    {
      name: 'git ls-files',
      script: (command: string) => (command === GIT ? ok(gitFiles) : undefined),
      commands: ['rg --version', GIT, GIT],
    },
    {
      name: 'the JS walk',
      script: (command: string) => (command === GIT ? NOT_GIT : undefined),
      commands: ['rg --version', GIT, GIT],
    },
  ]

  it.each(engines)(
    '$name gives the same files and matches',
    async ({ script, commands }) => {
      const fake = fakeBackend(files, script)
      const { listFiles, grep } = searchOn(fake.backend)

      expect(await listFiles()).toBe(
        '.github/ci.yml\nimage.png\nlong.txt\nsrc/a.ts\nsrc/b.ts',
      )
      expect(await grep({ pattern: 'two' })).toBe(
        [
          '.github/ci.yml:1: two: yes',
          `long.txt:1: two${'x'.repeat(1997)}`,
          'src/a.ts:2: two',
          'src/b.ts:1: const two = 2',
        ].join('\n'),
      )
      // The engine order, and rg looked for once.
      expect(fake.commands).toEqual(commands)

      expect(await listFiles({ pattern: 'src/**' })).toBe('src/a.ts\nsrc/b.ts')
      expect(await grep({ pattern: 'two', glob: 'src/**' })).toBe(
        'src/a.ts:2: two\nsrc/b.ts:1: const two = 2',
      )
    },
  )

  it('runs the bundled rg with the host backend, and does not look on the PATH', async () => {
    const exec = scriptHostExec(() => ok('./a.ts\0'))
    expect(await searchOn(hostBackend, tmpdir()).listFiles()).toBe('a.ts')
    const commands = exec.mock.calls.map(([command]) => command)
    expect(commands).toHaveLength(1)
    const bundled = quoteArg(process.execPath, process.platform)
    expect(commands[0]?.startsWith(`${bundled} --files `)).toBe(true)
  })

  it('looks for rg on the PATH when the bundled binary is missing', async () => {
    ripgrep.rgPath = join(tmpdir(), 'no-such-rg-binary')
    const exec = scriptHostExec((command) => {
      if (command === 'rg --version') return ok('ripgrep 14.1.0')
      return command.startsWith('rg --files ') ? ok('./a.ts\0') : undefined
    })
    expect(await searchOn(hostBackend, tmpdir()).listFiles()).toBe('a.ts')
    expect(exec.mock.calls.map(([command]) => command)).toEqual([
      'rg --version',
      expect.stringMatching(/^rg --files /),
    ])
  })

  it.each([
    {
      exitCode: 2,
      stderr: 'regex parse error',
      message: 'The search failed: regex parse error',
    },
    {
      exitCode: 124,
      stderr: '',
      message: 'The search failed: it took longer than 30 seconds',
    },
  ])(
    'throws when rg ends with exit code $exitCode and no output',
    async ({ exitCode, stderr, message }) => {
      const fake = fakeBackend({}, (command) =>
        command === 'rg --version'
          ? ok('ripgrep 14.1.0')
          : { exitCode, stdout: '', stderr },
      )
      await expect(
        searchOn(fake.backend).grep({ pattern: 'two' }),
      ).rejects.toThrow(message)
    },
  )

  it('refuses a pattern with a line break', async () => {
    const { grep } = searchOn(fakeBackend({}).backend)
    await expect(grep({ pattern: 'a\nb' })).rejects.toThrow(
      'The pattern must be one line.',
    )
  })
})

describe('quoting for the shell of the backend', () => {
  /** rg on the PATH answers every rg command with no output. */
  const rgOnPath = (command: string) =>
    command.startsWith('rg ') ? ok('') : undefined

  /** The rg command that a grep for `a b` runs on `backend`. */
  async function grepCommand(backend: WorkspaceBackend) {
    await searchOn(backend).grep({ pattern: 'a b' })
    return (
      exec.mock.calls
        .map(([command]) => command)
        .find((command) => command.startsWith('rg --line-number')) ?? ''
    )
  }
  const exec = vi.fn(async (command: string) => rgOnPath(command) ?? NOT_FOUND)

  afterEach(() => {
    exec.mockClear()
  })

  it.each([
    { shell: undefined, quoted: `'a b'` },
    { shell: 'sh' as const, quoted: `'a b'` },
    { shell: 'cmd' as const, quoted: '^"a^ b^"' },
  ])('quotes the pattern for shell $shell', async ({ shell, quoted }) => {
    const backend = { ...fakeBackend({}).backend, shell, exec }
    expect(await grepCommand(backend)).toContain(` -e ${quoted} .`)
  })

  it('quotes for the shell of this host in a copy of hostBackend', async () => {
    const quoted = process.platform === 'win32' ? '^"a^ b^"' : `'a b'`
    expect(await grepCommand({ ...hostBackend, exec })).toContain(
      ` -e ${quoted} .`,
    )
  })
})

describe('limits', () => {
  /** `count` files named `f0000.txt` and up, each with `text`. */
  const numbered = (count: number, text = '') =>
    Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `f${String(index).padStart(4, '0')}.txt`,
        text,
      ]),
    )

  it('lists 1000 files, then a note', async () => {
    const lines = (
      await searchOn(fakeBackend(numbered(1001)).backend).listFiles()
    ).split('\n')
    expect(lines).toHaveLength(1001)
    expect(lines[999]).toBe('f0999.txt')
    expect(lines[1000]).toBe(FILES_NOTE)
  })

  it('shows 200 matches, then a note', async () => {
    const fake = fakeBackend({ 'a.txt': 'two\n'.repeat(201) })
    const lines = (await searchOn(fake.backend).grep({ pattern: 'two' })).split(
      '\n',
    )
    expect(lines).toHaveLength(201)
    expect(lines[199]).toBe('a.txt:200: two')
    expect(lines[200]).toBe(MATCHES_NOTE)
  })

  it('says so when the JS walk stops before the end', async () => {
    const fake = fakeBackend({ ...numbered(5001), 'z.md': '' })
    expect(await searchOn(fake.backend).listFiles({ pattern: '*.md' })).toBe(
      `No files.\n${FILES_NOTE}`,
    )
  })
})

describe('on the host', () => {
  /** The host backend, but rg is never found. */
  const withoutRg: WorkspaceBackend = {
    ...hostBackend,
    exec: (command, options) =>
      command.startsWith('rg ')
        ? Promise.resolve(NOT_FOUND)
        : hostBackend.exec(command, options),
  }
  /** The host backend, but no command runs, so the JS walk runs. */
  const walkOnly: WorkspaceBackend = {
    ...hostBackend,
    exec: async () => NOT_FOUND,
  }
  const put = (dir: string, path: string, text: string) =>
    hostBackend.writeFile(join(dir, path), text)

  it.skipIf(!hasGit)(
    'leaves out what .gitignore names, through git ls-files',
    { timeout: SPAWN_TIMEOUT },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'coding-search-git-'))
      try {
        await put(dir, '.gitignore', 'ignored/\n*.log\n')
        await put(dir, 'src/a.ts', 'two\n')
        await put(dir, 'ignored/b.ts', 'two\n')
        await put(dir, 'debug.log', 'two\n')
        await put(dir, 'node_modules/pkg/i.js', 'two\n')
        const init = await hostBackend.exec('git init -q', { cwd: dir })
        expect(init.exitCode).toBe(0)

        const { listFiles, grep } = searchOn(withoutRg, dir)
        expect(await listFiles()).toBe('.gitignore\nsrc/a.ts')
        expect(await grep({ pattern: 'two' })).toBe('src/a.ts:1: two')
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  )

  describe('links to outside the workspace', () => {
    let dir = ''
    let outside = ''
    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'coding-search-walk-'))
      outside = await mkdtemp(join(tmpdir(), 'coding-search-outside-'))
      await put(dir, 'a.txt', 'two\n')
      await put(outside, 'secret.txt', 'two\n')
      // A junction on Windows needs no admin rights. Elsewhere it is a link.
      await symlink(outside, join(dir, 'linked'), 'junction')
      // A link to a file can need admin rights on Windows. Without it, the
      // folder link still covers the tests.
      await symlink(
        join(outside, 'secret.txt'),
        join(dir, 'secret-link.txt'),
        'file',
      ).catch(() => undefined)
    })
    afterAll(async () => {
      await rm(outside, { recursive: true, force: true })
      await rm(dir, { recursive: true, force: true })
    })

    it('the JS walk leaves the links out', async () => {
      const { listFiles, grep } = searchOn(walkOnly, dir)
      expect(await listFiles()).toBe('a.txt')
      expect(await grep({ pattern: 'two' })).toBe('a.txt:1: two')
    })

    it.skipIf(!hasGit)(
      'the git list leaves the links out, and the files in a linked folder',
      { timeout: SPAWN_TIMEOUT },
      async () => {
        const init = await hostBackend.exec('git init -q', { cwd: dir })
        expect(init.exitCode).toBe(0)
        const { listFiles, grep } = searchOn(withoutRg, dir)
        expect(await listFiles()).toBe('a.txt')
        expect(await grep({ pattern: 'two' })).toBe('a.txt:1: two')
      },
    )
  })
})

describe('quoteArg', () => {
  const hostile = [
    {
      value: '"; rm -rf x',
      posix: `'"; rm -rf x'`,
      win32: '^"\\^"^;^ rm^ -rf^ x^"',
    },
    { value: '$(x)', posix: `'$(x)'`, win32: '^"$^(x^)^"' },
    { value: '`x`', posix: "'`x`'", win32: '^"^`x^`^"' },
    { value: '%PATH%', posix: `'%PATH%'`, win32: '^"^%PATH^%^"' },
    { value: 'a & b', posix: `'a & b'`, win32: '^"a^ ^&^ b^"' },
    { value: 'a | b', posix: `'a | b'`, win32: '^"a^ ^|^ b^"' },
    { value: `it's`, posix: `'it'\\''s'`, win32: `^"it's^"` },
    { value: 'C:\\dir\\', posix: `'C:\\dir\\'`, win32: '^"C:\\dir\\\\^"' },
  ]

  it.each(hostile)('quotes $value for sh and cmd.exe', ({ value, posix, win32 }) => {
    expect(quoteArg(value, 'linux')).toBe(posix)
    expect(quoteArg(value, 'win32')).toBe(win32)
  })

  it('refuses a line break for cmd.exe', () => {
    expect(() => quoteArg('a\nb', 'win32')).toThrow('line break')
  })

  it(
    'passes hostile values through the real shell of this host unchanged',
    { timeout: SPAWN_TIMEOUT },
    async () => {
      const values = [...hostile.map((row) => row.value), '']
      const quote = (value: string) => quoteArg(value, process.platform)
      const script = 'console.log(JSON.stringify(process.argv.slice(1)))'
      const command = [process.execPath, '-e', script, ...values]
        .map(quote)
        .join(' ')
      const result = await hostBackend.exec(command)
      expect(JSON.parse(result.stdout)).toEqual(values)
    },
  )
})
