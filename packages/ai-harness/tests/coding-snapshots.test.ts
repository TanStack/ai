import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { hostBackend } from '../src/first-party/coding/backend'
import { quoteArg } from '../src/first-party/coding/search'
import { snapshots } from '../src/first-party/coding/snapshots'
import { mockAdapter, text, toolCall } from './helpers'
import type { HarnessPersistence, HarnessSession } from '../src'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'
import type { Reply } from './helpers'

const THREAD = 't1'
const hasGit = (await hostBackend.exec('git --version')).exitCode === 0

let base = ''
let root = ''
let dataDir = ''

beforeEach(async () => {
  // Each test gets its own folder. The workspace and the data folder are in it.
  base = await mkdtemp(join(tmpdir(), 'tanstack-snapshots-'))
  root = join(base, 'work')
  dataDir = join(base, 'data')
  await mkdir(root)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(base, { recursive: true, force: true })
})

/** Write `text` to `path` in the workspace. Parent folders are created. */
async function put(path: string, text: string) {
  const full = join(root, path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, text)
}

const read = (path: string) => readFile(join(root, path), 'utf8')

/** One turn: the model calls `change`, then answers `answer`. */
const editTurn = (answer: string): Array<Reply> => [
  () => toolCall('change', {}),
  () => text(answer),
]

/**
 * Open a session with `snapshots()` and a `change` tool. Each call of the
 * tool runs the next function of `changes`.
 */
async function open(options: {
  replies: Array<Reply>
  changes?: Array<() => Promise<unknown>>
  persistence?: HarnessPersistence
  backend?: WorkspaceBackend
}) {
  const changes = options.changes ?? []
  const change = toolDefinition({
    name: 'change',
    description: 'Change the files',
  }).server(async () => {
    await changes.shift()?.()
    return 'changed'
  })
  const plugin = snapshots({ root, dataDir, backend: options.backend })
  const { adapter } = mockAdapter(options.replies)
  const host = createHarnessHost({
    persistence: options.persistence ?? memoryPersistence(),
  })
  const session = await host.open(
    defineHarness({
      name: 'test/snapshots',
      adapter,
      tools: [change],
      plugins: () => [plugin],
    }),
    { threadId: THREAD },
  )
  return { host, session, plugin }
}

/** The steps that the plugin state keeps. */
function savedSteps(session: HarnessSession) {
  const steps = session.snapshot().plugins['tanstack/snapshots']
  if (!Array.isArray(steps)) throw new Error('No steps in the plugin state.')
  return steps
}

/** Every file under `folder`, by path, with its bytes. */
async function filesUnder(folder: string) {
  const entries = await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  })
  const files = new Map<string, Buffer>()
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const full = join(entry.parentPath, entry.name)
    files.set(full, await readFile(full))
  }
  return files
}

const TREE = /^[0-9a-f]{40}$/

/** A backend that keeps no files. Each command goes to `exec`. */
function fakeBackend(
  exec: WorkspaceBackend['exec'],
  shell?: WorkspaceBackend['shell'],
) {
  const fail = () => Promise.reject(new Error('Not used.'))
  const backend: WorkspaceBackend = {
    shell,
    readFile: fail,
    writeFile: async () => undefined,
    stat: fail,
    readdir: fail,
    exec,
  }
  return backend
}

describe.skipIf(!hasGit)('snapshots', () => {
  // Each git call starts a shell and a process, which is slow on Windows.
  it('starts few git commands for each step', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open({
      replies: [
        () => toolCall('change', {}),
        () => toolCall('change', {}),
        () => text('Done.'),
      ],
      changes: [async () => put('a.txt', 'two'), async () => undefined],
    })
    const exec = vi.spyOn(hostBackend, 'exec')

    await session.prompt('Edit the file')

    const commands = exec.mock.calls.map(([command]) => command)
    // `git --version` and `git init` once, the turn start, and one snapshot
    // after each tool step. Step starts reuse the snapshot before them.
    expect(commands.filter((command) => /write-tree/.test(command))).toHaveLength(3)
    // The second step changed nothing, so it needs no diff.
    expect(commands.filter((command) => / diff /.test(command))).toHaveLength(1)
    expect(commands.length).toBeLessThanOrEqual(6)
    await host.close()
  })

  it('keeps the changed files of each step in the plugin state', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open({
      replies: editTurn('Done.'),
      changes: [
        async () => {
          await put('a.txt', 'two')
          await put('src/b.txt', 'new')
        },
      ],
    })

    await session.prompt('Edit the files')

    const steps = savedSteps(session)
    expect(steps).toMatchObject([{ files: ['a.txt', 'src/b.txt'] }])
    expect(steps[0].from).toMatch(TREE)
    expect(steps[0].to).toMatch(TREE)
    expect(steps[0].to).not.toBe(steps[0].from)
    await host.close()
  })

  it('writes each step as a log record on a durable host', async () => {
    await put('a.txt', 'one')
    const { runs, metadata } = memoryPersistence().stores
    const log = memoryLogStore()
    const { host, session } = await open({
      replies: editTurn('Done.'),
      changes: [() => put('a.txt', 'two')],
      persistence: { stores: { log, runs, metadata } },
    })

    await session.prompt('Edit a.txt')

    const entries = await log.read(THREAD, { after: 0 })
    const records = entries
      .map((entry) => entry.record)
      .filter((record) => record.type === 'tanstack/snapshots:step')
    expect(records).toMatchObject([{ files: ['a.txt'] }])
    await host.close()
  })

  it('gives the changed files and a unified diff between two trees', async () => {
    await put('a.txt', 'one\n')
    const { host, session, plugin } = await open({
      replies: editTurn('Done.'),
      changes: [() => put('a.txt', 'two\n')],
    })
    await session.prompt('Edit a.txt')
    const [step] = savedSteps(session)

    const between = await plugin.diff(step.from, step.to)
    expect(between.files).toEqual(['a.txt'])
    expect(between.patch).toContain('\n-one\n+two\n')

    // Without `to`, the diff is against the files now.
    await put('c.txt', 'later\n')
    const sinceStep = await plugin.diff(step.to)
    expect(sinceStep.files).toEqual(['c.txt'])
    expect(sinceStep.patch).toContain('+later')
    await host.close()
  })

  it('/undo restores the files and removes the last turn', async () => {
    await put('a.txt', 'one')
    await put('sub/keep.txt', 'keep')
    const { host, session } = await open({
      replies: [() => text('Hi.'), ...editTurn('Done.')],
      changes: [
        async () => {
          await put('a.txt', 'two')
          await put('new/deep/c.txt', 'added')
          await rm(join(root, 'sub/keep.txt'))
        },
      ],
    })
    await session.prompt('Hello')
    await session.prompt('Edit the files')

    expect(await session.command('undo')).toBe(
      'Undid the last turn. Files restored: 3.',
    )
    expect(await read('a.txt')).toBe('one')
    expect(await read('sub/keep.txt')).toBe('keep')
    expect((await readdir(root)).sort()).toEqual(['a.txt', 'sub'])
    expect(await session.transcript()).toMatchObject([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi.' },
    ])
    expect(await session.command('undo')).toBe('Nothing to undo.')
    await host.close()
  })

  it('/redo brings back the files and the turn', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open({
      replies: editTurn('Done.'),
      changes: [
        async () => {
          await put('a.txt', 'two')
          await put('new/c.txt', 'added')
        },
      ],
    })
    await session.prompt('Edit the files')
    const edited = await session.transcript()
    await session.command('undo')

    expect(await session.command('redo')).toBe('Redid the last turn.')
    expect(await read('a.txt')).toBe('two')
    expect(await read('new/c.txt')).toBe('added')
    expect(await session.transcript()).toEqual(edited)
    // The turn is back, so it can be undone again.
    await session.command('undo')
    expect(await read('a.txt')).toBe('one')
    await host.close()
  })

  it('clears redo when a new turn starts', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open({
      replies: [...editTurn('Done.'), () => text('Sure.')],
      changes: [() => put('a.txt', 'two')],
    })
    await session.prompt('Edit a.txt')
    await session.command('undo')
    await session.prompt('Something else')

    expect(await session.command('redo')).toBe('Nothing to redo.')
    expect(await read('a.txt')).toBe('one')
    await host.close()
  })

  it("leaves the project's own .git untouched", async () => {
    // GIT_DIR keeps this init in the test folder, even inside a git hook.
    const projectGit = join(root, '.git')
    const init = await hostBackend.exec(
      `git init -q ${quoteArg(root, process.platform)}`,
      { env: { GIT_DIR: projectGit } },
    )
    expect(init.exitCode).toBe(0)
    await put('a.txt', 'one')
    const before = await filesUnder(projectGit)
    const { host, session } = await open({
      replies: editTurn('Done.'),
      changes: [() => put('b.txt', 'new')],
    })

    await session.prompt('Add b.txt')
    await session.command('undo')

    expect(savedSteps(session)).toMatchObject([{ files: ['b.txt'] }])
    expect(await filesUnder(projectGit)).toEqual(before)
    await host.close()
  })
})

describe('snapshots on a cmd.exe backend', () => {
  it('quotes the git arguments for cmd.exe', async () => {
    const commands: Array<string> = []
    const backend = fakeBackend(async (command) => {
      commands.push(command)
      return { exitCode: 0, stdout: '', stderr: '' }
    }, 'cmd')
    const { host, session } = await open({
      replies: [() => text('Hi.')],
      backend,
    })

    await session.prompt('Hello')

    // `git --version`, then the init of the shadow repository.
    expect(commands[1]).toMatch(/^git init --bare -q \^".+\^"$/)
    await host.close()
  })
})

describe('snapshots without git', () => {
  it('adds no commands, warns once, and the turn still runs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Every command fails, like a machine with no git.
    const { host, session, plugin } = await open({
      replies: [() => text('Hi.')],
      backend: fakeBackend(async () => ({
        exitCode: 127,
        stdout: '',
        stderr: 'not found',
      })),
    })

    await session.prompt('Hello')

    expect(session.commands()).toEqual([])
    expect(await session.transcript()).toMatchObject([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi.' },
    ])
    expect(warn.mock.calls).toEqual([
      ['snapshots: git was not found. Snapshots are off.'],
    ])
    await expect(plugin.diff('abc')).rejects.toThrow(
      'snapshots: git is not available.',
    )
    await host.close()
  })
})
