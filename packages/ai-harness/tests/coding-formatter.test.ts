import { tmpdir } from 'node:os'
import * as nodePath from 'node:path'
import { describe, expect, it } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { workspaceTools } from '../src/first-party/coding'
import {
  FormatFailed,
  formatOnWrite,
  formatter,
} from '../src/first-party/coding/formatter'
import { mockAdapter, text, toolCall } from './helpers'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'
import type {
  FormatFailure,
  Formatter,
  FormatterOptions,
} from '../src/first-party/coding/formatter'

const { join, posix, resolve } = nodePath
const root = resolve(tmpdir(), 'harness-format')
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type Exec = (command: string) => Awaited<ReturnType<WorkspaceBackend['exec']>>

const ok: Exec = () => ({ exitCode: 0, stdout: '', stderr: '' })

/** `path` from the root, as the fake POSIX shell gets it. */
const quoted = (path: string) => `'${join(root, path)}'`

/**
 * A project in memory that starts as `files`, by path from its root. `exec`
 * answers each command. `runs` lists each command with its options. With
 * `shell: 'sh'`, the project is at `/workspace` with POSIX paths, like a
 * Linux sandbox. Else it is at `root` on this machine.
 */
function project(files: Record<string, string>, exec: Exec = ok, shell?: 'sh') {
  const paths = shell === 'sh' ? posix : nodePath
  const base = shell === 'sh' ? '/workspace' : root
  const store = new Map<string, Uint8Array>()
  const put = (path: string, content: string) =>
    store.set(paths.join(base, path), encoder.encode(content))
  for (const [path, content] of Object.entries(files)) put(path, content)
  const runs: Array<{ command: string; cwd?: string; timeoutMs?: number }> = []
  const backend: WorkspaceBackend = {
    shell,
    readFile: async (path) => {
      const data = store.get(path)
      if (!data) throw new Error(`No file ${path}`)
      return data
    },
    writeFile: async (path, data) => {
      store.set(path, typeof data === 'string' ? encoder.encode(data) : data)
    },
    stat: async (path) => {
      const data = store.get(path)
      return data && { type: 'file', size: data.length, mtimeMs: 0 }
    },
    readdir: async (dir) =>
      [...store.keys()]
        .filter((path) => paths.dirname(path) === dir)
        .map((path) => ({ name: paths.basename(path), type: 'file' as const })),
    exec: async (command, options) => {
      runs.push({ command, cwd: options?.cwd, timeoutMs: options?.timeoutMs })
      return exec(command)
    },
  }
  const read = (path: string) =>
    decoder.decode(store.get(paths.join(base, path)))
  return { backend, runs, put, read }
}

/** Run the hook once for `path` in a project of `files`. */
async function formatIn(
  files: Record<string, string>,
  path: string,
  options: Omit<FormatterOptions, 'root' | 'backend'> = {},
  exec: Exec = ok,
) {
  const { backend, runs } = project(files, exec)
  const failures: Array<FormatFailure> = []
  const afterWrite = formatOnWrite({ root, backend, ...options }, (failure) =>
    failures.push(failure),
  )
  await afterWrite(join(root, path))
  return { runs, commands: runs.map((run) => run.command), failures }
}

const prettier = { '.prettierrc': '{}' }
const mine: Formatter = {
  name: 'mine',
  extensions: ['.ts'],
  command: (file) => `mine ${file}`,
}

describe('formatOnWrite', () => {
  it.each([
    ['.prettierrc', prettier, 'a.ts', 'npx --no-install prettier --write'],
    [
      'prettier.config.js',
      { 'prettier.config.js': '' },
      'a.css',
      'npx --no-install prettier --write',
    ],
    [
      'a prettier key in package.json',
      { 'package.json': '{"prettier": {}}' },
      'a.md',
      'npx --no-install prettier --write',
    ],
    [
      'biome.json',
      { 'biome.json': '{}' },
      'a.tsx',
      'npx --no-install biome format --write',
    ],
    [
      '.oxfmtrc.json',
      { '.oxfmtrc.json': '{}' },
      'a.ts',
      'npx --no-install oxfmt',
    ],
    [
      'oxfmt in devDependencies',
      { 'package.json': '{"devDependencies": {"oxfmt": "^0.59.0"}}' },
      'a.json',
      'npx --no-install oxfmt',
    ],
    ['ruff.toml', { 'ruff.toml': '' }, 'a.py', 'ruff format'],
    [
      '[tool.ruff] in pyproject.toml',
      { 'pyproject.toml': '[tool.ruff]\nline-length = 88\n' },
      'a.py',
      'ruff format',
    ],
    ['go.mod', { 'go.mod': 'module a\n' }, 'main.go', 'gofmt -w'],
    ['Cargo.toml', { 'Cargo.toml': '' }, 'src/main.rs', 'rustfmt'],
  ])(
    'detects %s and runs its command in the root',
    async (_, files, path, command) => {
      const { runs } = await formatIn(files, path)
      expect(runs).toEqual([
        { command: `${command} ${quoted(path)}`, cwd: root, timeoutMs: 20_000 },
      ])
    },
  )

  it.each([
    ['no config file', {}, 'a.ts'],
    [
      'a pyproject.toml without ruff',
      { 'pyproject.toml': '[project]\n' },
      'a.py',
    ],
    ['a file type no formatter takes', { 'go.mod': 'module a\n' }, 'a.ts'],
    ['a package.json that is not JSON', { 'package.json': '{' }, 'a.ts'],
  ])('runs nothing for %s', async (_, files, path) => {
    expect(await formatIn(files, path)).toEqual({
      runs: [],
      commands: [],
      failures: [],
    })
  })

  it('quotes the path, so a space and a & stay in one argument', async () => {
    const { commands } = await formatIn(prettier, 'src/my file & co.ts')
    expect(commands).toEqual([
      `npx --no-install prettier --write '${join(root, 'src', 'my file & co.ts')}'`,
    ])
  })

  it('runs a user formatter before the built-in one', async () => {
    const { commands } = await formatIn(prettier, 'a.ts', {
      formatters: [mine],
    })
    expect(commands).toEqual([`mine ${quoted('a.ts')}`])
  })

  it('reads the root files for when, and skips a formatter that says no', async () => {
    const taplo: Formatter = {
      name: 'taplo',
      extensions: ['.toml'],
      command: (file) => `taplo fmt ${file}`,
      when: async (project) =>
        (await project.read('taplo.toml')).includes('[formatting]'),
    }
    const used = await formatIn({ 'taplo.toml': '[formatting]\n' }, 'a.toml', {
      formatters: [taplo],
    })
    const skipped = await formatIn({}, 'a.toml', { formatters: [taplo] })
    expect(used.commands).toEqual([`taplo fmt ${quoted('a.toml')}`])
    expect(skipped.commands).toEqual([])
  })

  it('keeps POSIX paths in a sandbox, also on a Windows host', async () => {
    const { backend, runs } = project(prettier, ok, 'sh')
    const afterWrite = formatOnWrite(
      { root: '/workspace', backend },
      () => undefined,
    )
    await afterWrite('/workspace/src/a.ts')
    expect(runs).toEqual([
      {
        command: `npx --no-install prettier --write '/workspace/src/a.ts'`,
        cwd: '/workspace',
        timeoutMs: 20_000,
      },
    ])
  })

  it('runs no built-in formatter with builtins: false', async () => {
    const { commands } = await formatIn(prettier, 'a.ts', { builtins: false })
    expect(commands).toEqual([])
  })

  it('checks the config files once, at the first write', async () => {
    const { backend, runs, put } = project({})
    const afterWrite = formatOnWrite({ root, backend }, () => undefined)
    await afterWrite(join(root, 'a.ts'))
    put('.prettierrc', '{}')
    await afterWrite(join(root, 'a.ts'))
    expect(runs).toEqual([])
  })

  it.each([
    [
      'a non-zero exit, with the first stderr line',
      { exitCode: 2, stdout: '', stderr: '[error] a.ts: SyntaxError\nat 1:1' },
      'prettier failed: [error] a.ts: SyntaxError',
    ],
    [
      'a missing formatter, with the exit code',
      { exitCode: 127, stdout: '', stderr: '' },
      'prettier failed: exit code 127',
    ],
    [
      'a timeout',
      { exitCode: 124, stdout: '', stderr: '' },
      'prettier failed: it took longer than 5 seconds',
    ],
  ])('reports %s, and does not throw', async (_, result, message) => {
    const { runs, failures } = await formatIn(
      prettier,
      'a.ts',
      { timeoutMs: 5000 },
      () => result,
    )
    expect(runs[0]?.timeoutMs).toBe(5000)
    expect(failures).toEqual([{ path: join(root, 'a.ts'), message }])
  })

  it('reports a backend that throws, and does not throw', async () => {
    const { failures } = await formatIn(prettier, 'a.ts', {}, () => {
      throw new Error('spawn sh ENOENT')
    })
    expect(failures).toEqual([
      { path: join(root, 'a.ts'), message: 'spawn sh ENOENT' },
    ])
  })
})

describe('formatter', () => {
  it('formats after write_file and edit_file, and a failure keeps the file and the tool result', async () => {
    const { backend, runs, read } = project(prettier, () => ({
      exitCode: 2,
      stdout: '',
      stderr: 'SyntaxError',
    }))
    const failures: Array<FormatFailure> = []
    const listener = definePlugin({
      name: 'test/listener',
      setup: (ctx) => {
        ctx.on(FormatFailed, (failure) => failures.push(failure))
      },
    })
    const { adapter, calls } = mockAdapter([
      () => toolCall('write_file', { path: 'a.ts', content: 'let a=1' }, 'c1'),
      () =>
        toolCall('edit_file', { path: 'a.ts', old: 'a=1', new: 'a=2' }, 'c2'),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/formatter',
        adapter,
        plugins: () => [
          workspaceTools({ root, backend }),
          formatter({ root, backend }),
          listener,
        ],
      }),
      { threadId: 't' },
    )

    await session.prompt('work')
    await host.close()

    const command = `npx --no-install prettier --write ${quoted('a.ts')}`
    const failure = {
      path: join(root, 'a.ts'),
      message: 'prettier failed: SyntaxError',
    }
    expect(runs.map((run) => run.command)).toEqual([command, command])
    expect(failures).toEqual([failure, failure])
    expect(read('a.ts')).toBe('let a=2')
    expect(JSON.stringify(calls[2].messages)).toContain(
      'Edited a.ts (1 change).',
    )
  })
})
