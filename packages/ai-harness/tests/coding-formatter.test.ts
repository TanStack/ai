import { tmpdir } from 'node:os'
import * as nodePath from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { workspaceTools } from '../src/first-party/coding'
import { permissions } from '../src/first-party/permissions'
import {
  FormatFailed,
  formatOnWrite,
  formatter,
} from '../src/first-party/coding/formatter'
import { FormatterRewrote } from '../src/first-party/coding/events'
import { mockAdapter, text, toolCall } from './helpers'
import type { HarnessSession } from '../src'
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
    // No links: each path is its own real path.
    realpath: async (path) => path,
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
  const afterWrite = formatOnWrite(
    { root, backend, ...options },
    { onFailure: (failure) => failures.push(failure) },
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
      { onFailure: () => undefined },
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

  it('checks the project again at the next write when the check failed', async () => {
    const { backend, runs } = project(prettier)
    const readdir = backend.readdir
    let fail = true
    backend.readdir = async (dir) => {
      if (fail) throw new Error('EBUSY')
      return readdir(dir)
    }
    const failures: Array<FormatFailure> = []
    const afterWrite = formatOnWrite(
      { root, backend },
      { onFailure: (failure) => failures.push(failure) },
    )
    await afterWrite(join(root, 'a.ts'))
    fail = false
    await afterWrite(join(root, 'a.ts'))
    expect(failures).toEqual([{ path: join(root, 'a.ts'), message: 'EBUSY' }])
    expect(runs).toHaveLength(1)
  })

  it('checks the config files once, at the first write', async () => {
    const { backend, runs, put } = project({})
    const afterWrite = formatOnWrite(
      { root, backend },
      { onFailure: () => undefined },
    )
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

  it.each([
    [
      'changed',
      'let a = 1\n',
      [{ path: join(root, 'a.ts'), formatter: 'prettier' }],
    ],
    ['kept', 'let a=1', []],
  ])(
    'reports a rewrite only when the formatter changed the file (%s)',
    async (_, formatted, expected) => {
      // The fake prettier writes `formatted` to the file.
      const files = project({ ...prettier, 'a.ts': 'let a=1' }, () => {
        files.put('a.ts', formatted)
        return { exitCode: 0, stdout: '', stderr: '' }
      })
      const rewrites: Array<{ path: string; formatter: string }> = []
      const afterWrite = formatOnWrite(
        { root, backend: files.backend },
        {
          onFailure: () => undefined,
          onRewrite: (rewrite) => rewrites.push(rewrite),
        },
      )
      await afterWrite(join(root, 'a.ts'))
      expect(rewrites).toEqual(expected)
    },
  )

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
      {
        threadId: 't',
      },
    )

    await session.send('work')
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

describe('formatter events', () => {
  it('sends tanstack/formatter:rewrote when the formatter changed the written file', async () => {
    // The fake prettier puts spaces around `=`.
    const files = project(prettier, () => {
      files.put('a.ts', files.read('a.ts').replace('=', ' = '))
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    const rewrites: Array<unknown> = []
    const listener = definePlugin({
      name: 'test/listener',
      setup: (ctx) => {
        ctx.on(FormatterRewrote, (rewrite) => rewrites.push(rewrite))
      },
    })
    const { adapter } = mockAdapter([
      () => toolCall('write_file', { path: 'a.ts', content: 'let a=1' }, 'c1'),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/formatter-events',
        adapter,
        plugins: () => [
          workspaceTools({ root, backend: files.backend }),
          formatter({ root, backend: files.backend }),
          listener,
        ],
      }),
      { threadId: 't' },
    )

    await session.send('work')
    await host.close()

    expect(files.read('a.ts')).toBe('let a = 1')
    expect(rewrites).toEqual([
      { path: join(root, 'a.ts'), formatter: 'prettier' },
    ])
  })
})

describe('formatter with permissions()', () => {
  /**
   * A session with the workspace tools, the formatter, and `permissions()`
   * in `mode`, in a project of `files`. Each reply writes a file. `runs`
   * lists the formatter runs.
   */
  async function openWith(
    mode: string,
    paths: Array<string>,
    persistence = memoryPersistence(),
    files: Record<string, string> = {},
  ) {
    const { backend, runs } = project(files)
    const { adapter, calls } = mockAdapter([
      ...paths.map(
        (path, index) => () =>
          toolCall('write_file', { path, content: '' }, `c${index}`),
      ),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/formatter-permissions',
        adapter,
        plugins: () => [
          permissions({ root }),
          workspaceTools({ root, backend }),
          formatter({ root, backend }),
        ],
      }),
      {
        threadId: 't',
      },
    )
    await session.command({ name: 'mode', input: mode })
    return { host, session, runs, calls }
  }

  /** Wait for the one open question, then answer it. Returns its message. */
  async function answer(session: HarnessSession, value: unknown) {
    await vi.waitFor(() =>
      expect(session.snapshot().pendingQuestions).toHaveLength(1),
    )
    const [question] = session.snapshot().pendingQuestions
    if (!question) throw new Error('No question.')
    await session.answer({ questionId: question.questionId, value })
    return question.message
  }

  it('in acceptEdits, asks before prettier runs after an edit of prettier.config.js', async () => {
    const { host, session, runs, calls } = await openWith('acceptEdits', [
      'prettier.config.js',
    ])

    const turn = session.send('change the config')
    const message = await answer(session, { answer: 'reject' })
    await turn

    expect(message).toContain('formatter:prettier')
    expect(runs).toEqual([])
    // The write stays, and the result says the formatter did not run.
    expect(JSON.stringify(calls[1].messages)).toContain(
      'Wrote prettier.config.js.\\nThe formatter prettier did not run: it is not allowed.',
    )
    await host.close()
  })

  it('stops asking after an always answer, also in a new session', async () => {
    const persistence = memoryPersistence()
    const first = await openWith(
      'acceptEdits',
      ['prettier.config.js', 'a.ts'],
      persistence,
    )
    const turn = first.session.send('write twice')
    await answer(first.session, { answer: 'always' })
    await turn
    expect(first.runs.map((run) => run.command)).toEqual([
      `npx --no-install prettier --write ${quoted('prettier.config.js')}`,
      `npx --no-install prettier --write ${quoted('a.ts')}`,
    ])
    expect(first.session.snapshot().pendingQuestions).toHaveLength(0)
    await first.host.close()

    const second = await openWith('acceptEdits', ['b.ts'], persistence, {
      'prettier.config.js': '',
    })
    await second.session.send('write again')
    expect(second.runs.map((run) => run.command)).toEqual([
      `npx --no-install prettier --write ${quoted('b.ts')}`,
    ])
    await second.host.close()
  })

  it('runs with no question in bypass', async () => {
    const { host, session, runs } = await openWith('bypass', [
      'prettier.config.js',
    ])
    await session.send('change the config')
    expect(runs.map((run) => run.command)).toEqual([
      `npx --no-install prettier --write ${quoted('prettier.config.js')}`,
    ])
    expect(session.snapshot().pendingQuestions).toHaveLength(0)
    await host.close()
  })

  it('runs with no question and no note without permissions()', async () => {
    const { backend, runs } = project({})
    const { adapter, calls } = mockAdapter([
      () => toolCall('write_file', { path: 'prettier.config.js', content: '' }),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/formatter-no-permissions',
        adapter,
        plugins: () => [
          workspaceTools({ root, backend }),
          formatter({ root, backend }),
        ],
      }),
      {
        threadId: 't',
      },
    )
    await session.send('change the config')
    expect(runs.map((run) => run.command)).toEqual([
      `npx --no-install prettier --write ${quoted('prettier.config.js')}`,
    ])
    expect(JSON.stringify(calls[1].messages)).not.toContain('did not run')
    await host.close()
  })
})
