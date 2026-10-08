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
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
} from './helpers'
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
  const { adapter, calls } = mockAdapter(options.replies)
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
  return { host, session, plugin, calls }
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
    expect(
      commands.filter((command) => /write-tree/.test(command)),
    ).toHaveLength(3)
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

  it('/undo and /redo keep the files that the turn did not change', async () => {
    await put('a.txt', 'one')
    await put('c.txt', 'one')
    const { host, session } = await open({
      replies: editTurn('Done.'),
      changes: [() => put('a.txt', 'two')],
    })
    await session.prompt('Edit a.txt')
    // The user adds and edits files after the turn.
    await put('b.txt', 'mine')
    await put('c.txt', 'mine')

    expect(await session.command('undo')).toBe(
      'Undid the last turn. Files restored: 1.',
    )
    expect(await read('a.txt')).toBe('one')
    expect(await read('b.txt')).toBe('mine')
    expect(await read('c.txt')).toBe('mine')

    await put('c.txt', 'later')
    expect(await session.command('redo')).toBe('Redid the last turn.')
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
    await session.prompt('Add a file')

    await session.command('undo')
    expect(await readdir(root)).toEqual(['a.txt'])
    // A file that the user adds between /undo and /redo stays.
    await put('mine.txt', 'mine')
    await session.command('redo')
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
    await session.prompt('Edit the files')
    await put('x.txt', 'mine')
    // No file has the name `[x].txt` now. As a glob, it matches `x.txt`, so
    // git must read it as a plain name.
    await rm(join(root, '[x].txt'))

    expect(await session.command('undo')).toBe(
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
  await session.prompt('One')
  await session.prompt('Two')
  await session.prompt('Three')
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

    expect(await session.revert(firstId)).toMatchObject({ status: 'accepted' })

    expect(await read('a.txt')).toBe('two')
    expect(await readdir(root)).toEqual(['a.txt'])
    expect(await session.transcript()).toEqual(transcript.slice(0, 4))
    await host.close()
  })

  it('unrevert brings back the files and the messages', async () => {
    await put('a.txt', 'one')
    const { host, session } = await open(threeTurns())
    const { transcript, firstId } = await runThreeTurns(session)
    await session.revert(firstId)

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
    await session.revert(firstId)

    await session.prompt('Four')

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
    await session.prompt('Hello')
    const [message] = await session.transcript()
    const running = session.prompt('Again')
    await vi.waitFor(() => expect(session.snapshot().status).toBe('running'))

    expect(await session.revert(message?.id ?? '')).toMatchObject({
      status: 'rejected',
      reason: 'busy',
    })
    wait.open()
    await running
    expect(await session.revert('no-such-id')).toMatchObject({
      status: 'rejected',
      reason: 'unknown_message',
    })
    expect(await session.transcript()).toHaveLength(4)
    await host.close()
  })

  it('keeps the revert after a restart on a durable host', async () => {
    await put('a.txt', 'one')
    const { runs, metadata } = memoryPersistence().stores
    const persistence = { stores: { log: memoryLogStore(), runs, metadata } }
    const first = await open({ ...threeTurns(), persistence })
    const { transcript, firstId } = await runThreeTurns(first.session)
    await first.session.revert(firstId)
    await first.host.close()

    const second = await open({ replies: [], persistence })

    expect(await second.session.transcript()).toEqual(transcript.slice(0, 4))
    await second.session.unrevert()
    expect(await read('a.txt')).toBe('three')
    expect(await second.session.transcript()).toEqual(transcript)
    await second.host.close()
  })

  it('keeps the revert after a restart on a host without a log', async () => {
    await put('a.txt', 'one')
    const persistence = memoryPersistence()
    const first = await open({ ...threeTurns(), persistence })
    const { transcript, firstId } = await runThreeTurns(first.session)
    await first.session.revert(firstId)
    await first.host.close()

    const second = await open({ replies: [], persistence })

    expect(await second.session.transcript()).toEqual(transcript.slice(0, 4))
    await second.session.unrevert()
    expect(await read('b.txt')).toBe('new')
    await second.host.close()
  })
})

describe.skipIf(!hasGit)('session.revert keeps the edits of the user', () => {
  it('keeps a user edit between two hidden turns', async () => {
    await put('a.txt', 'one')
    await put('c.txt', 'one')
    const { host, session } = await open(threeTurns())
    await session.prompt('One')
    await session.prompt('Two')
    // The user edits a file that no turn changes.
    await put('c.txt', 'mine')
    await session.prompt('Three')
    const first = (await session.transcript()).find(
      (message) => message.content === 'First.',
    )

    await session.revert(first?.id ?? '')

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

    await session.revert(firstId)
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
    const reverting = session.revert(firstId)
    await reached.opened

    const prompting = session.prompt('Four')
    await vi.waitFor(() => expect(session.snapshot().queuedTurns).toBe(1))
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
    await session.revert(firstId)

    await session.configure({ cwd: 'sub' })
    await session.prompt('Four')

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
    await session.revert(firstId)

    await session.configure({ cwd: 'sub' })
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
    await session.revert(firstId)

    const refused = 'A revert stands. Run unrevert, or send a prompt, first.'
    expect(await session.command('undo')).toBe(refused)
    expect(await session.command('redo')).toBe(refused)

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
