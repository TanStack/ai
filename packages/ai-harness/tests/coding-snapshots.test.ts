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
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin, logIdOf } from '../src'
import { FileChanged, SnapshotFailed } from '../src/first-party/coding/events'
import { hostBackend } from '../src/first-party/coding/backend'
import { quoteArg } from '../src/first-party/coding/search'
import { purgeSnapshots, snapshots } from '../src/first-party/coding/snapshots'
import { workspaceTools } from '../src/first-party/coding/workspace'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
} from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { HarnessPersistence, HarnessSession, HarnessUser } from '../src'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'
import type { FileChange } from '../src/first-party/coding/events'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })
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
 * tool runs the next function of `changes`. With `workspace`, the session
 * also has `workspaceTools()` on `root`. The thread is `THREAD`, unless
 * `threadId` names another.
 */
async function open(options: {
  replies: Array<Reply>
  changes?: Array<() => Promise<unknown>>
  persistence?: HarnessPersistence
  backend?: WorkspaceBackend
  workspace?: boolean
  threadId?: string
  user?: HarnessUser
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
  // The messages of the `tanstack/snapshots:failed` events, and the
  // `FileChanged` values. The listener comes first, so it also gets an event
  // that `snapshots()` sends in its setup.
  const failures: Array<string> = []
  const fileChanges: Array<FileChange> = []
  const listener = definePlugin({
    name: 'test/snapshot-events',
    setup: (ctx) => {
      ctx.on(SnapshotFailed, ({ message }) => failures.push(message))
      ctx.on(FileChanged, (change) => fileChanges.push(change))
    },
  })
  const { adapter, calls } = mockAdapter(options.replies)
  const persistence = options.persistence ?? memoryPersistence()
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/snapshots',
      adapter,
      tools: [change],
      plugins: () =>
        options.workspace
          ? [listener, workspaceTools({ root, web: false }), plugin]
          : [listener, plugin],
    }),
    {
      threadId: options.threadId ?? THREAD,
      user: options.user,
    },
  )
  return {
    host,
    session,
    plugin,
    calls,
    failures,
    fileChanges,
    log: persistence.stores.log,
  }
}

/** The `tanstack/snapshots:step` records of the thread in `log`. */
async function savedSteps(log: LogStore) {
  const entries = await log.read({ logId: LOG, after: 0 })
  return entries.flatMap(({ record }) =>
    record.type === 'tanstack/snapshots:step' &&
    typeof record.from === 'string' &&
    typeof record.to === 'string' &&
    Array.isArray(record.files)
      ? [{ ...record, from: record.from, to: record.to, files: record.files }]
      : [],
  )
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
    realpath: fail,
    readdir: fail,
    exec,
  }
  return backend
}

/**
 * A backend with a fake git. Each save of the files gives a new tree id, and
 * each diff gives `a.txt`. The first `locked` saves fail, like git when
 * another git process holds the index lock.
 */
function fakeGit({ locked = 0 } = {}) {
  let trees = 0
  let failures = locked
  return fakeBackend(async (command) => {
    if (!/write-tree/.test(command)) {
      const isDiff = / diff --name-only /.test(command)
      return { exitCode: 0, stdout: isDiff ? 'a.txt\0' : '', stderr: '' }
    }
    if (failures > 0) {
      failures -= 1
      return {
        exitCode: 128,
        stdout: '',
        stderr: "fatal: Unable to create '/data/index.lock': File exists.",
      }
    }
    trees += 1
    return {
      exitCode: 0,
      stdout: `${trees.toString(16).padStart(40, '0')}\n`,
      stderr: '',
    }
  })
}

/** The one shadow repository in the data folder. */
async function onlyRepo() {
  const [repo, ...others] = await readdir(dataDir)
  if (repo === undefined || others.length > 0) {
    throw new Error('The data folder must have one repository.')
  }
  return join(dataDir, repo)
}

/** The paths of the files in the tree `tree` of the repository `repo`. */
async function filesOfTree(repo: string, tree: string) {
  const quote = (value: string) => quoteArg(value, process.platform)
  const result = await hostBackend.exec(
    `git --git-dir ${quote(repo)} ls-tree -r --name-only ${tree}`,
  )
  return result.stdout.split('\n').filter((line) => line !== '')
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

    await session.send('Edit the file')

    const commands = exec.mock.calls.map(([command]) => command)
    // `git --version` and `git init` once, the turn start, and one snapshot
    // after each tool step. Step starts reuse the snapshot before them.
    expect(
      commands.filter((command) => /write-tree/.test(command)),
    ).toHaveLength(3)
    // The first step changed a file that no workspace tool reported, so it
    // needs a second diff for the patch of its `FileChanged`. The second
    // step changed nothing, so it needs no diff.
    expect(commands.filter((command) => / diff /.test(command))).toHaveLength(2)
    expect(commands.length).toBeLessThanOrEqual(7)
    await host.close()
  })

  it('writes the changed files of each step as a log record', async () => {
    await put('a.txt', 'one')
    const { host, session, log } = await open({
      replies: editTurn('Done.'),
      changes: [
        async () => {
          await put('a.txt', 'two')
          await put('src/b.txt', 'new')
        },
      ],
    })

    await session.send('Edit the files')

    const [step, ...more] = await savedSteps(log)
    expect(more).toEqual([])
    expect(step).toMatchObject({ files: ['a.txt', 'src/b.txt'] })
    expect(step?.from).toMatch(TREE)
    expect(step?.to).toMatch(TREE)
    expect(step?.to).not.toBe(step?.from)
    await host.close()
  })

  it('gives the changed files and a unified diff between two trees', async () => {
    await put('a.txt', 'one\n')
    const { host, session, plugin, log } = await open({
      replies: editTurn('Done.'),
      changes: [() => put('a.txt', 'two\n')],
    })
    await session.send('Edit a.txt')
    const [step] = await savedSteps(log)
    if (!step) throw new Error('No step in the log.')

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
    await session.send('Hello')
    await session.send('Edit the files')

    expect(await session.runCommand({ name: 'undo' })).toBe(
      'Undid the last turn. Files restored: 3.',
    )
    expect(await read('a.txt')).toBe('one')
    expect(await read('sub/keep.txt')).toBe('keep')
    expect((await readdir(root)).sort()).toEqual(['a.txt', 'sub'])
    expect(await session.transcript()).toMatchObject([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi.' },
    ])
    expect(await session.runCommand({ name: 'undo' })).toBe('Nothing to undo.')
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
    await session.send('Edit the files')
    const edited = await session.transcript()
    await session.runCommand({ name: 'undo' })

    expect(await session.runCommand({ name: 'redo' })).toBe(
      'Redid the last turn.',
    )
    expect(await read('a.txt')).toBe('two')
    expect(await read('new/c.txt')).toBe('added')
    expect(await session.transcript()).toEqual(edited)
    // The turn is back, so it can be undone again.
    await session.runCommand({ name: 'undo' })
    expect(await read('a.txt')).toBe('one')
    await host.close()
  })

  it('/undo and /redo keep the files that the turn did not change', async () => {
    await put('a.txt', 'one')
    await put('c.txt', 'one')
    const { host, session } = await open({
      replies: editTurn('Done.'),
      changes: [() => put('a.txt', 'two')],
    })
    await session.send('Edit a.txt')
    // The user adds and edits files after the turn.
    await put('b.txt', 'mine')
    await put('c.txt', 'mine')

    expect(await session.runCommand({ name: 'undo' })).toBe(
      'Undid the last turn. Files restored: 1.',
    )
    expect(await read('a.txt')).toBe('one')
    expect(await read('b.txt')).toBe('mine')
    expect(await read('c.txt')).toBe('mine')

    await put('c.txt', 'later')
    expect(await session.runCommand({ name: 'redo' })).toBe(
      'Redid the last turn.',
    )
    expect(await read('a.txt')).toBe('two')
    expect(await read('b.txt')).toBe('mine')
    expect(await read('c.txt')).toBe('later')
    await host.close()
  })

  it('/undo removes a file that the turn added, and /redo brings it back', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open({
      replies: editTurn('Done.'),
      changes: [() => put('new/c.txt', 'added')],
    })
    await session.send('Add a file')

    await session.runCommand({ name: 'undo' })
    expect(await readdir(root)).toEqual(['a.txt'])
    // A file that the user adds between /undo and /redo stays.
    await put('mine.txt', 'mine')
    await session.runCommand({ name: 'redo' })
    expect(await read('new/c.txt')).toBe('added')
    expect(await read('mine.txt')).toBe('mine')
    await host.close()
  })

  it('restores paths with a space or a glob character', async () => {
    await put('my file.txt', 'one')
    await put('x.txt', 'one')
    const { host, session } = await open({
      replies: editTurn('Done.'),
      changes: [
        async () => {
          await put('my file.txt', 'two')
          await put('[x].txt', 'added')
        },
      ],
    })
    await session.send('Edit the files')
    await put('x.txt', 'mine')
    // No file has the name `[x].txt` now. As a glob, it matches `x.txt`, so
    // git must read it as a plain name.
    await rm(join(root, '[x].txt'))

    expect(await session.runCommand({ name: 'undo' })).toBe(
      'Undid the last turn. Files restored: 2.',
    )
    expect(await read('my file.txt')).toBe('one')
    expect(await read('x.txt')).toBe('mine')
    expect((await readdir(root)).sort()).toEqual(['my file.txt', 'x.txt'])
    await host.close()
  })

  it('clears redo when a new turn starts', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open({
      replies: [...editTurn('Done.'), () => text('Sure.')],
      changes: [() => put('a.txt', 'two')],
    })
    await session.send('Edit a.txt')
    await session.runCommand({ name: 'undo' })
    await session.send('Something else')

    expect(await session.runCommand({ name: 'redo' })).toBe('Nothing to redo.')
    expect(await read('a.txt')).toBe('one')
    await host.close()
  })

  it('/undo and /redo work on the next host of the session', async () => {
    await put('a.txt', 'one')
    const persistence = memoryPersistence()
    const first = await open({
      replies: editTurn('Done.'),
      changes: [() => put('a.txt', 'two')],
      persistence,
    })
    await first.session.send('Edit a.txt')
    await first.host.close()

    const second = await open({ replies: [], persistence })
    expect(await second.session.runCommand({ name: 'undo' })).toBe(
      'Undid the last turn. Files restored: 1.',
    )
    expect(await read('a.txt')).toBe('one')
    await second.host.close()

    const third = await open({ replies: [], persistence })
    expect(await third.session.runCommand({ name: 'redo' })).toBe(
      'Redid the last turn.',
    )
    expect(await read('a.txt')).toBe('two')
    await third.host.close()
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
    const { host, session, log } = await open({
      replies: editTurn('Done.'),
      changes: [() => put('b.txt', 'new')],
    })

    await session.send('Add b.txt')
    await session.runCommand({ name: 'undo' })

    expect(await savedSteps(log)).toMatchObject([{ files: ['b.txt'] }])
    expect(await filesUnder(projectGit)).toEqual(before)
    await host.close()
  })
})

describe.skipIf(!hasGit)('snapshots with a workspace for each thread', () => {
  it('keeps the snapshots in the workspace that bind gave the thread', async () => {
    // The workspace of each thread is a folder of its own, not `root`.
    const own = join(base, 'thread-a')
    await mkdir(own)
    await writeFile(join(own, 'a.txt'), 'one')
    const { adapter } = mockAdapter([
      () => toolCall('write_file', { path: 'a.txt', content: 'two' }, 'w-1'),
      () => text('Done.'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/snapshots-bind',
        adapter,
        plugins: () => [
          workspaceTools({
            workspace: { bind: async () => ({ ...hostBackend, root: own }) },
            web: false,
          }),
          snapshots({ dataDir }),
        ],
      }),
      { threadId: THREAD },
    )

    await session.send('Write a.txt')
    expect(await readFile(join(own, 'a.txt'), 'utf8')).toBe('two')
    expect(await session.runCommand({ name: 'undo' })).toBe(
      'Undid the last turn. Files restored: 1.',
    )
    expect(await readFile(join(own, 'a.txt'), 'utf8')).toBe('one')
    await host.close()
  })

  it('unreverts on a new host, which opens the workspace of the thread again from the log', async () => {
    const own = join(base, 'thread-a')
    await mkdir(own)
    await writeFile(join(own, 'a.txt'), 'one')
    const persistence = memoryPersistence()
    const openOn = (replies: Array<Reply>) => {
      const host = createHarnessHost({ persistence })
      const harness = defineHarness({
        name: 'test/snapshots-bind',
        adapter: mockAdapter(replies).adapter,
        plugins: () => [
          workspaceTools({
            workspace: { bind: async () => ({ ...hostBackend, root: own }) },
            web: false,
          }),
          snapshots({ dataDir }),
        ],
      })
      return { host, opened: host.open(harness, { threadId: THREAD }) }
    }
    const first = openOn([
      () => toolCall('write_file', { path: 'a.txt', content: 'two' }, 'w-1'),
      () => text('First.'),
      () => toolCall('write_file', { path: 'a.txt', content: 'three' }, 'w-2'),
      () => text('Second.'),
    ])
    const session = await first.opened
    await session.send('One')
    await session.send('Two')
    const answer = (await session.transcript()).find(
      (message) => message.content === 'First.',
    )
    await session.revert({ messageId: answer?.id ?? '' })
    expect(await readFile(join(own, 'a.txt'), 'utf8')).toBe('two')
    await first.host.close()

    // No turn ran on this host, so the workspace of the thread is not open.
    const second = openOn([])
    const again = await second.opened

    expect(await again.unrevert()).toMatchObject({ status: 'accepted' })
    expect(await readFile(join(own, 'a.txt'), 'utf8')).toBe('three')
    await second.host.close()
  })
})

describe.skipIf(!hasGit)('snapshots of many runs', () => {
  it("/undo of run A keeps the change that run B made during A's step", async () => {
    await put('a.txt', 'one')
    // B runs on the same thread and root, so both use one shadow repository.
    const runB = await open({
      workspace: true,
      replies: [
        () => toolCall('write_file', { path: 'b.txt', content: 'B' }, 'b-1'),
        () => text('B done.'),
      ],
    })
    const runA = await open({
      workspace: true,
      replies: [
        // B writes its file while the step of A runs.
        async function* () {
          await runB.session.send('Write b.txt')
          yield* toolCall('write_file', { path: 'a.txt', content: 'A' }, 'a-1')
        },
        () => text('A done.'),
      ],
    })

    await runA.session.send('Write a.txt')
    expect(await read('b.txt')).toBe('B')
    expect(await savedSteps(runA.log)).toMatchObject([{ files: ['a.txt'] }])
    expect(await runA.session.runCommand({ name: 'undo' })).toBe(
      'Undid the last turn. Files restored: 1.',
    )

    expect(await read('a.txt')).toBe('one')
    expect(await read('b.txt')).toBe('B')
    await runA.host.close()
    await runB.host.close()
  })

  it('gives two tenants on one root and one thread id two repositories', async () => {
    const first = await open({
      replies: [() => text('Hi.')],
      user: { id: 'user', tenantId: 'acme' },
    })
    const second = await open({
      replies: [() => text('Hi.')],
      user: { id: 'user', tenantId: 'globex' },
    })

    expect(await readdir(dataDir)).toHaveLength(2)
    await first.host.close()
    await second.host.close()
  })

  it('never stores a .env file', async () => {
    await put('a.txt', 'one')
    await put('.env', 'SECRET=1')
    await put('.env.local', 'SECRET=2')
    const { host, session, log } = await open({
      replies: editTurn('Done.'),
      changes: [
        async () => {
          await put('a.txt', 'two')
          await put('.env', 'SECRET=3')
        },
      ],
    })

    await session.send('Edit the files')

    const [step] = await savedSteps(log)
    if (!step) throw new Error('No step in the log.')
    expect(step.files).toEqual(['a.txt'])
    const repo = await onlyRepo()
    expect(await filesOfTree(repo, step.from)).toEqual(['a.txt'])
    expect(await filesOfTree(repo, step.to)).toEqual(['a.txt'])
    await host.close()
  })

  it('purgeSnapshots removes the repository of that thread only', async () => {
    const first = await open({ replies: [() => text('Hi.')] })
    const second = await open({ replies: [() => text('Hi.')], threadId: 't2' })
    await first.host.close()
    await second.host.close()
    expect(await readdir(dataDir)).toHaveLength(2)

    await purgeSnapshots({ root, dataDir }, { threadId: THREAD })
    expect(await readdir(dataDir)).toHaveLength(1)
    await purgeSnapshots({ root, dataDir }, { threadId: 't2' })
    expect(await readdir(dataDir)).toEqual([])
    // A thread with no repository: nothing to remove.
    await expect(
      purgeSnapshots({ root, dataDir }, { threadId: THREAD }),
    ).resolves.toBeUndefined()
  })

  it('host.sessions.delete removes the repository of that thread, also when no session has it open', async () => {
    const first = await open({ replies: [() => text('Hi.')] })
    await first.session.close()
    const second = await first.host.open(
      defineHarness({
        name: 'test/snapshots',
        adapter: mockAdapter([]).adapter,
        plugins: () => [snapshots({ root, dataDir })],
      }),
      { threadId: 't2' },
    )
    await second.close()
    expect(await readdir(dataDir)).toHaveLength(2)

    await first.host.sessions.delete({ threadId: THREAD })

    // The repository of the other thread stays.
    expect(await readdir(dataDir)).toHaveLength(1)
    await first.host.close()
  })
})

describe.skipIf(!hasGit)('snapshots FileChanged', () => {
  /** The rows of a patch, each with a line ending. */
  const lines = (...rows: Array<string>) =>
    rows.map((row) => `${row}\n`).join('')

  /**
   * `changes` with no `index` line in a patch. That line has short blob ids,
   * and the git config of the user sets their length.
   */
  const withoutIndex = (changes: ReadonlyArray<FileChange>) =>
    changes.map(({ patch, ...change }) =>
      patch === undefined
        ? change
        : { ...change, patch: patch.replace(/^index .+\n/m, '') },
    )

  /** The path and the tool call of each value of `changes`. */
  const sources = (changes: ReadonlyArray<FileChange>) =>
    changes.map(({ path, toolCallId }) => ({ path, toolCallId }))

  /** One turn: one model call makes the tool calls `first` and `second`. */
  const twoCallsTurn = (
    first: Array<StreamChunk>,
    second: Array<StreamChunk>,
  ): Array<Reply> => [
    // Without the end of `first` and the start of `second`, one model call
    // has both.
    () => [...first.slice(0, -1), ...second.slice(1)],
    () => text('Done.'),
  ]

  it('sends the git patch of each file that a tool like bash changed', async () => {
    await put('a.txt', 'one\n')
    await put('d.txt', 'gone\nnow\n')
    const { host, session, fileChanges } = await open({
      replies: editTurn('Done.'),
      changes: [
        async () => {
          await put('a.txt', 'two\n')
          await rm(join(root, 'd.txt'))
          await put('new/c.txt', 'added\n')
        },
      ],
    })

    await session.send('Change the files')

    // The events come in the order of git, and name the one tool call.
    expect(withoutIndex(fileChanges)).toEqual([
      {
        path: join(root, 'a.txt'),
        change: 'updated',
        patch: lines(
          'diff --git a/a.txt b/a.txt',
          '--- a/a.txt',
          '+++ b/a.txt',
          '@@ -1 +1 @@',
          '-one',
          '+two',
        ),
        additions: 1,
        deletions: 1,
        toolCallId: 'call-1',
      },
      {
        path: join(root, 'd.txt'),
        change: 'deleted',
        patch: lines(
          'diff --git a/d.txt b/d.txt',
          'deleted file mode 100644',
          '--- a/d.txt',
          '+++ /dev/null',
          '@@ -1,2 +0,0 @@',
          '-gone',
          '-now',
        ),
        additions: 0,
        deletions: 2,
        toolCallId: 'call-1',
      },
      {
        path: join(root, 'new', 'c.txt'),
        change: 'created',
        patch: lines(
          'diff --git a/new/c.txt b/new/c.txt',
          'new file mode 100644',
          '--- /dev/null',
          '+++ b/new/c.txt',
          '@@ -0,0 +1 @@',
          '+added',
        ),
        additions: 1,
        deletions: 0,
        toolCallId: 'call-1',
      },
    ])
    await host.close()
  })

  it('sends no second event for a file that write_file wrote in the step', async () => {
    await put('a.txt', 'one\n')
    const { host, session, fileChanges } = await open({
      workspace: true,
      replies: twoCallsTurn(
        toolCall('write_file', { path: 'b.txt', content: 'B\n' }, 'w-1'),
        toolCall('change', {}, 'c-1'),
      ),
      changes: [() => put('a.txt', 'two\n')],
    })

    await session.send('Change the files')

    // `write_file` sends the event of b.txt, and `snapshots()` the one of
    // a.txt.
    expect(sources(fileChanges)).toEqual([
      { path: join(root, 'b.txt'), toolCallId: 'w-1' },
      { path: join(root, 'a.txt'), toolCallId: 'c-1' },
    ])
    await host.close()
  })

  it('names no tool call when two calls of the step do not send FileChanged', async () => {
    const { host, session, fileChanges } = await open({
      replies: twoCallsTurn(
        toolCall('change', {}, 'c-1'),
        toolCall('change', {}, 'c-2'),
      ),
      changes: [() => put('a.txt', 'one\n'), async () => undefined],
    })

    await session.send('Change the files')

    expect(sources(fileChanges)).toEqual([
      { path: join(root, 'a.txt'), toolCallId: undefined },
    ])
    await host.close()
  })

  it('sends no patch for a binary file or a patch over 256 KiB', async () => {
    const { host, session, fileChanges } = await open({
      replies: editTurn('Done.'),
      changes: [
        async () => {
          await writeFile(join(root, 'image.bin'), Buffer.from([0, 1, 2, 255]))
          await put('big.txt', 'line\n'.repeat(60_000))
        },
      ],
    })

    await session.send('Add the files')

    const unpatched = { change: 'created', additions: 0, deletions: 0 }
    expect(fileChanges).toEqual([
      { path: join(root, 'big.txt'), ...unpatched, toolCallId: 'call-1' },
      { path: join(root, 'image.bin'), ...unpatched, toolCallId: 'call-1' },
    ])
    await host.close()
  })

  it('sends at most 100 events for one step', async () => {
    const names = Array.from(
      { length: 101 },
      (_, index) => `f-${String(index).padStart(3, '0')}.txt`,
    )
    const { host, session, fileChanges } = await open({
      replies: editTurn('Done.'),
      changes: [
        async () => {
          for (const name of names) await put(name, 'new\n')
        },
      ],
    })

    await session.send('Add the files')

    expect(fileChanges.map((change) => change.path)).toEqual(
      names.slice(0, 100).map((name) => join(root, name)),
    )
    await host.close()
  })

  it('runs no git diff for the events when the workspace tools reported each change', async () => {
    await put('a.txt', 'one\n')
    const { host, session, fileChanges } = await open({
      workspace: true,
      replies: [
        () =>
          toolCall('write_file', { path: 'a.txt', content: 'two\n' }, 'w-1'),
        () => text('Done.'),
      ],
    })
    const exec = vi.spyOn(hostBackend, 'exec')

    await session.send('Write a.txt')

    const commands = exec.mock.calls.map(([command]) => command)
    expect(
      commands.filter((command) => / diff --no-color /.test(command)),
    ).toEqual([])
    expect(sources(fileChanges)).toEqual([
      { path: join(root, 'a.txt'), toolCallId: 'w-1' },
    ])
    await host.close()
  })

  it('sends the events without patches when the git diff fails, and no failed event', async () => {
    await put('a.txt', 'one\n')
    // The diff for the patches fails, like one over the output cap of `exec`.
    const backend: WorkspaceBackend = {
      ...hostBackend,
      exec: async (command, options) =>
        / diff --no-color /.test(command)
          ? { exitCode: 1, stdout: '', stderr: 'fatal: out of memory' }
          : hostBackend.exec(command, options),
    }
    const { host, session, fileChanges, failures } = await open({
      replies: editTurn('Done.'),
      changes: [() => put('a.txt', 'two\n')],
      backend,
    })

    await session.send('Edit a.txt')

    expect(fileChanges).toEqual([
      {
        path: join(root, 'a.txt'),
        change: 'updated',
        additions: 0,
        deletions: 0,
        toolCallId: 'call-1',
      },
    ])
    expect(failures).toEqual([])
    await host.close()
  })
})

/** Three turns. Each one changes the files once, with its own tool call. */
const threeTurns = () => ({
  replies: (['First.', 'Second.', 'Third.'] as const).flatMap(
    (answer, index): Array<Reply> => [
      () => toolCall('change', {}, `call-${index}`),
      () => text(answer),
    ],
  ),
  changes: [
    () => put('a.txt', 'two'),
    () => put('a.txt', 'three'),
    () => put('b.txt', 'new'),
  ],
})

/** Run the three turns of {@link threeTurns}. Gives the id of the first answer. */
async function runThreeTurns(session: HarnessSession) {
  await session.send('One')
  await session.send('Two')
  await session.send('Three')
  const transcript = await session.transcript()
  const first = transcript.find((message) => message.content === 'First.')
  if (!first?.id) throw new Error('The first answer has no id.')
  return { transcript, firstId: first.id }
}

describe.skipIf(!hasGit)('session.revert', () => {
  it('reverts two turns back: the files and the transcript', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open(threeTurns())
    const { transcript, firstId } = await runThreeTurns(session)
    expect(transcript).toHaveLength(12)

    expect(await session.revert({ messageId: firstId })).toMatchObject({
      status: 'accepted',
    })

    expect(await read('a.txt')).toBe('two')
    expect(await readdir(root)).toEqual(['a.txt'])
    expect(await session.transcript()).toEqual(transcript.slice(0, 4))
    await host.close()
  })

  it('unrevert brings back the files and the messages', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open(threeTurns())
    const { transcript, firstId } = await runThreeTurns(session)
    await session.revert({ messageId: firstId })

    expect(await session.unrevert()).toMatchObject({ status: 'accepted' })

    expect(await read('a.txt')).toBe('three')
    expect(await read('b.txt')).toBe('new')
    expect(await session.transcript()).toEqual(transcript)
    await host.close()
  })

  it('the next prompt drops the hidden messages for good', async () => {
    await put('a.txt', 'one')
    const turns = threeTurns()
    const { host, session, calls } = await open({
      ...turns,
      replies: [...turns.replies, () => text('Fourth.')],
    })
    const { transcript, firstId } = await runThreeTurns(session)
    await session.revert({ messageId: firstId })

    await session.send('Four')

    expect(messageTexts(calls.at(-1))).toEqual([
      'One',
      'null',
      'changed',
      'First.',
      'Four',
    ])
    expect(await session.transcript()).toMatchObject([
      ...transcript.slice(0, 4),
      { role: 'user', content: 'Four' },
      { role: 'assistant', content: 'Fourth.' },
    ])
    // The revert ended, so unrevert changes nothing.
    await session.unrevert()
    expect(await read('a.txt')).toBe('two')
    expect(await session.transcript()).toHaveLength(6)
    await host.close()
  })

  it('is refused while a turn runs, and for an unknown message', async () => {
    const wait = gate()
    const { host, session } = await open({
      replies: [() => text('Hi.'), after(wait.opened, 'Later.')],
    })
    await session.send('Hello')
    const [message] = await session.transcript()
    const running = session.send('Again')
    await waitFor(() => expect(session.snapshot().status).toBe('running'))

    expect(
      await session.revert({ messageId: message?.id ?? '' }),
    ).toMatchObject({
      status: 'rejected',
      reason: 'busy',
    })
    wait.open()
    await running
    expect(await session.revert({ messageId: 'no-such-id' })).toMatchObject({
      status: 'rejected',
      reason: 'unknown_message',
    })
    expect(await session.transcript()).toHaveLength(4)
    await host.close()
  })

  it('keeps the revert after a restart', async () => {
    await put('a.txt', 'one')
    const persistence = memoryPersistence()
    const first = await open({ ...threeTurns(), persistence })
    const { transcript, firstId } = await runThreeTurns(first.session)
    await first.session.revert({ messageId: firstId })
    await first.host.close()

    const second = await open({ replies: [], persistence })

    expect(await second.session.transcript()).toEqual(transcript.slice(0, 4))
    await second.session.unrevert()
    expect(await read('a.txt')).toBe('three')
    expect(await read('b.txt')).toBe('new')
    expect(await second.session.transcript()).toEqual(transcript)
    await second.host.close()
  })
})

describe.skipIf(!hasGit)('session.revert keeps the edits of the user', () => {
  it('keeps a user edit between two hidden turns', async () => {
    await put('a.txt', 'one')
    await put('c.txt', 'one')
    const { host, session } = await open(threeTurns())
    await session.send('One')
    await session.send('Two')
    // The user edits a file that no turn changes.
    await put('c.txt', 'mine')
    await session.send('Three')
    const first = (await session.transcript()).find(
      (message) => message.content === 'First.',
    )

    await session.revert({ messageId: first?.id ?? '' })

    expect(await read('a.txt')).toBe('two')
    expect(await read('c.txt')).toBe('mine')
    expect((await readdir(root)).sort()).toEqual(['a.txt', 'c.txt'])
    await host.close()
  })

  it('keeps a user edit after the last hidden step on unrevert', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open(threeTurns())
    const { firstId } = await runThreeTurns(session)
    // The user edits a file that a hidden turn changed.
    await put('a.txt', 'mine')

    await session.revert({ messageId: firstId })
    expect(await read('a.txt')).toBe('two')
    await session.unrevert()

    expect(await read('a.txt')).toBe('mine')
    expect(await read('b.txt')).toBe('new')
    await host.close()
  })

  it('holds a prompt that arrives during a revert', async () => {
    await put('a.txt', 'one')
    const wait = gate()
    const reached = gate()
    let blocking = false
    // A backend that stops at the git checkout of the revert.
    const backend: WorkspaceBackend = {
      ...hostBackend,
      exec: async (command, options) => {
        if (blocking && / checkout /.test(command)) {
          reached.open()
          await wait.opened
        }
        return hostBackend.exec(command, options)
      },
    }
    const turns = threeTurns()
    const { host, session } = await open({
      ...turns,
      backend,
      replies: [...turns.replies, () => text('Fourth.')],
    })
    const { firstId } = await runThreeTurns(session)
    blocking = true
    const reverting = session.revert({ messageId: firstId })
    await reached.opened

    const prompting = session.send('Four')
    await waitFor(() => expect(session.snapshot().queuedTurns).toBe(1))
    expect(session.snapshot().status).toBe('idle')
    blocking = false
    wait.open()
    await reverting
    await prompting

    expect(await session.transcript()).toMatchObject([
      { role: 'user', content: 'One' },
      { role: 'assistant' },
      { role: 'tool' },
      { role: 'assistant', content: 'First.' },
      { role: 'user', content: 'Four' },
      { role: 'assistant', content: 'Fourth.' },
    ])
    await host.close()
  })

  it('adds a note that arrives during a revert after the commit', async () => {
    await put('a.txt', 'one')
    await mkdir(join(root, 'sub'))
    const turns = threeTurns()
    const { host, session } = await open({
      ...turns,
      replies: [...turns.replies, () => text('Fourth.')],
    })
    const { firstId } = await runThreeTurns(session)
    await session.revert({ messageId: firstId })

    await session.updateThreadSettings({ settings: { cwd: 'sub' } })
    await session.send('Four')

    expect(
      (await session.transcript()).slice(4).map((message) => message.content),
    ).toEqual([
      'The working folder is now sub. Paths are relative to it.',
      'Four',
      'Fourth.',
    ])
    await host.close()
  })

  it('adds a note that arrives during a revert after unrevert', async () => {
    await put('a.txt', 'one')
    await mkdir(join(root, 'sub'))
    const { host, session } = await open(threeTurns())
    const { transcript, firstId } = await runThreeTurns(session)
    await session.revert({ messageId: firstId })

    await session.updateThreadSettings({ settings: { cwd: 'sub' } })
    await session.unrevert()

    expect(
      (await session.transcript()).map((message) => message.content),
    ).toEqual([
      ...transcript.map((message) => message.content),
      'The working folder is now sub. Paths are relative to it.',
    ])
    await host.close()
  })

  it('refuses /undo and /redo while a revert stands', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open(threeTurns())
    const { transcript, firstId } = await runThreeTurns(session)
    await session.revert({ messageId: firstId })

    const refused = 'A revert stands. Run unrevert, or send a prompt, first.'
    expect(await session.runCommand({ name: 'undo' })).toBe(refused)
    expect(await session.runCommand({ name: 'redo' })).toBe(refused)

    expect(await read('a.txt')).toBe('two')
    await session.unrevert()
    expect(await session.transcript()).toEqual(transcript)
    expect(await read('a.txt')).toBe('three')
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

    await session.send('Hello')

    // `git --version`, then the init of the shadow repository.
    expect(commands[1]).toMatch(
      /^git -c core\.fsmonitor= -c core\.hooksPath= init --bare -q \^".+\^"$/,
    )
    await host.close()
  })
})

describe('snapshots git safety', () => {
  // The model can write the workspace files, so git must not run a program
  // that a config names.
  it('runs every git command with no fsmonitor, no hooks, and no system config', async () => {
    const runs: Array<{ command: string; env?: Record<string, string> }> = []
    const backend = fakeBackend(async (command, options) => {
      runs.push({ command, env: options?.env })
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    const { host, session } = await open({
      replies: [() => text('Hi.')],
      backend,
    })

    await session.send('Hello')

    expect(runs.length).toBeGreaterThan(1)
    for (const run of runs) {
      expect(run.command).toMatch(
        /^git -c core\.fsmonitor= -c core\.hooksPath= /,
      )
      expect(run.env).toMatchObject({ GIT_CONFIG_NOSYSTEM: '1' })
    }
    await host.close()
  })
})

describe('snapshots with a fake git', () => {
  it('reverts with the last 500 steps of the log only', async () => {
    // 11 turns of 46 steps: 506 steps. A turn has at most 50 model calls.
    let callId = 0
    const replies = Array.from(
      { length: 11 },
      (): Array<Reply> => [
        ...Array.from({ length: 46 }, (): Reply => {
          const id = `call-${callId++}`
          return () => toolCall('change', {}, id)
        }),
        () => text('Done.'),
      ],
    ).flat()
    const git = fakeGit()
    const commands: Array<string> = []
    const backend: WorkspaceBackend = {
      ...git,
      exec: (command, options) => {
        commands.push(command)
        return git.exec(command, options)
      },
    }
    const { host, session, log } = await open({ replies, backend })
    for (let turn = 0; turn < 11; turn += 1) await session.send('Edit')
    const steps = await savedSteps(log)
    expect(steps).toHaveLength(506)
    const first = (await session.transcript()).find(
      (message) => message.role === 'assistant',
    )
    if (!first?.id) throw new Error('No answer.')

    // The steps of call-1 to call-505 come after the first answer. Of them,
    // the revert uses the last 500: from call-6 on.
    await session.revert({ messageId: first.id })

    const restores = commands.filter((command) =>
      command.includes('--name-status'),
    )
    expect(restores).toHaveLength(1)
    expect(restores[0]).toContain(steps[6]?.from)
    expect(restores[0]).not.toContain(steps[1]?.from)
    await host.close()
  }, 60_000)

  it('tries again when another git process holds the index lock', async () => {
    const { host, session, failures, log } = await open({
      replies: editTurn('Done.'),
      backend: fakeGit({ locked: 2 }),
    })

    await session.send('Edit a.txt')

    expect(await savedSteps(log)).toMatchObject([{ files: ['a.txt'] }])
    expect(failures).toEqual([])
    await host.close()
  })

  it('sends the events without patches when the diff has no section for each changed file', async () => {
    // The fake git gives `a.txt` as the changed file, and an empty diff.
    const { host, session, fileChanges, failures } = await open({
      replies: editTurn('Done.'),
      backend: fakeGit(),
    })

    await session.send('Edit a.txt')

    expect(fileChanges).toEqual([
      {
        path: join(root, 'a.txt'),
        change: 'updated',
        additions: 0,
        deletions: 0,
        toolCallId: 'call-1',
      },
    ])
    expect(failures).toEqual([])
    await host.close()
  })

  it('reports an index lock that stays with an event, and the turn still runs', async () => {
    const { host, session, failures } = await open({
      replies: [() => text('Hi.')],
      backend: fakeGit({ locked: Infinity }),
    })

    await session.send('Hello')

    expect(await session.transcript()).toMatchObject([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi.' },
    ])
    expect(failures).toEqual([
      expect.stringMatching(
        /^snapshots: another git process holds the index lock of .+: fatal: Unable to create/,
      ),
    ])
    await host.close()
  })
})

describe('snapshots without git', () => {
  it('adds no commands, sends one failed event, and the turn still runs', async () => {
    // Every command fails, like a machine with no git.
    const { host, session, plugin, failures } = await open({
      replies: [() => text('Hi.')],
      backend: fakeBackend(async () => ({
        exitCode: 127,
        stdout: '',
        stderr: 'not found',
      })),
    })

    await session.send('Hello')

    expect(session.commands()).toEqual([])
    expect(await session.transcript()).toMatchObject([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi.' },
    ])
    expect(failures).toEqual([
      'snapshots: git was not found. Snapshots are off.',
    ])
    await expect(plugin.diff('abc')).rejects.toThrow(
      'snapshots: git is not available.',
    )
    await host.close()
  })
})
