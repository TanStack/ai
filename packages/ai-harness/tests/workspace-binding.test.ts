import { describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin, logIdOf } from '../src'
import { WorkspaceStranded } from '../src/first-party/coding/events'
import { workspaceTools } from '../src/first-party/coding/workspace'
import {
  CRASHING_OWNERSHIP,
  appendToLog,
  canOtherHostTake,
  mockAdapter,
  ownershipExpired,
  text,
  toolCall,
} from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { HarnessPersistence, HarnessPlugin } from '../src'
import type {
  BoundWorkspace,
  WorkspaceBackend,
  WorkspaceBinding,
} from '../src/first-party/coding/backend'
import type {
  WorkspaceBinder,
  WorkspaceToolsOptions,
} from '../src/first-party/coding/workspace'

const THREAD = 't'
const LOG = logIdOf({ logId: THREAD })
const SANDBOX = {
  kind: 'sandbox',
  provider: 'fake',
  sandboxId: 'sb-1',
} as const
/** What `read_file` gives for `a.txt`, as JSON. */
const READ = JSON.stringify('1\tone')

/** A backend with one file, `/ws/a.txt`. No links, no commands. */
function backend(extra: Partial<WorkspaceBackend> = {}) {
  const files = new Map([['/ws/a.txt', new TextEncoder().encode('one')]])
  const workspace: WorkspaceBackend = {
    shell: 'sh',
    readFile: async (path) => {
      const data = files.get(path)
      if (!data) throw new Error(`No file ${path}`)
      return data
    },
    writeFile: async () => undefined,
    stat: async (path) => {
      const data = files.get(path)
      if (data) return { type: 'file', size: data.length, mtimeMs: 0 }
      return path === '/ws' ? { type: 'dir', size: 0, mtimeMs: 0 } : undefined
    },
    realpath: async (path) => path,
    readdir: async () => [],
    exec: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    ...extra,
  }
  return workspace
}

/** A workspace in the sandbox {@link SANDBOX}, at `/ws`. */
const sandboxWorkspace = (): BoundWorkspace => ({
  ...backend(),
  binding: () => SANDBOX,
  root: '/ws',
})

/** Open the thread on a new host on `persistence`, with `plugins`. */
function open(options: {
  persistence: HarnessPersistence
  adapter: AnyTextAdapter
  plugins: Array<HarnessPlugin>
  crashes?: boolean
}) {
  const host = createHarnessHost({
    persistence: options.persistence,
    ...(options.crashes ? { ownership: CRASHING_OWNERSHIP } : {}),
  })
  const opened = host.open(
    defineHarness({
      name: 'test/workspace-binding',
      adapter: options.adapter,
      plugins: () => options.plugins,
    }),
    { threadId: THREAD },
  )
  return { host, opened }
}

/**
 * One turn that reads `a.txt` with the tool call `id`, then answers. Each
 * host of a thread needs its own id: the log keeps the result of each id.
 */
const readTurn = (id: string) =>
  mockAdapter([
    () => toolCall('read_file', { path: 'a.txt' }, id),
    () => text('done'),
  ])

/** The result of the tool call `id`, as the model saw it in its last call. */
function resultOf(calls: ReturnType<typeof mockAdapter>['calls'], id: string) {
  return JSON.stringify(
    calls
      .at(-1)
      ?.messages.find(
        (message: { toolCallId?: string }) => message.toolCallId === id,
      )?.content,
  )
}

/** The records of `type` in the log of the thread. */
async function recordsOf(persistence: HarnessPersistence, type: string) {
  const entries = await persistence.stores.log.read({ logId: LOG })
  return entries
    .map(({ record }) => record)
    .filter((record) => record.type === type)
}

/**
 * Open the thread with the tools of `options` on a new host, run one read
 * turn with the tool call `id`, and close. Gives the result of the call.
 */
async function readOnce(
  persistence: HarnessPersistence,
  options: WorkspaceToolsOptions,
  id: string,
) {
  const { adapter, calls } = readTurn(id)
  const { host, opened } = open({
    persistence,
    adapter,
    plugins: [workspaceTools({ ...options, web: false })],
  })
  const session = await opened
  await session.send('read')
  await host.close()
  return resultOf(calls, id)
}

/** The tools of a sandbox workspace, with no `reattach`. */
const inSandbox: WorkspaceToolsOptions = {
  workspace: { bind: async () => sandboxWorkspace() },
}

describe('the workspace binding in the session log', () => {
  it('logs a folder on the host once, at the first tool call', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      () => toolCall('read_file', { path: 'a.txt' }, 'c0'),
      () => toolCall('read_file', { path: 'a.txt' }, 'c1'),
      () => text('done'),
    ])
    const { host, opened } = open({
      persistence,
      adapter,
      plugins: [
        workspaceTools({ root: '/ws', backend: backend(), web: false }),
      ],
    })
    const session = await opened

    await session.send('read twice')

    expect(await recordsOf(persistence, 'harness.workspace.bound')).toEqual([
      {
        type: 'harness.workspace.bound',
        binding: { kind: 'host', root: '/ws' },
      },
    ])
    await host.close()
  })

  it('logs the sandbox of a backend with a binding', async () => {
    const persistence = memoryPersistence()

    expect(await readOnce(persistence, inSandbox, 'c0')).toBe(READ)

    expect(await recordsOf(persistence, 'harness.workspace.bound')).toEqual([
      {
        type: 'harness.workspace.bound',
        binding: { ...SANDBOX, root: '/ws' },
      },
    ])
  })

  it('reattaches the sandbox on the next host, and does not bind again', async () => {
    const persistence = memoryPersistence()
    await readOnce(persistence, inSandbox, 'c0')
    const bind = vi.fn(async () => sandboxWorkspace())
    const reattach = vi.fn<NonNullable<WorkspaceBinder['reattach']>>(async () =>
      sandboxWorkspace(),
    )
    const workspace: WorkspaceBinder = { bind, reattach }

    expect(await readOnce(persistence, { workspace }, 'c1')).toBe(READ)

    expect(bind).not.toHaveBeenCalled()
    expect(reattach).toHaveBeenCalledTimes(1)
    expect(reattach.mock.calls[0]?.[0]).toMatchObject({
      binding: { ...SANDBOX, root: '/ws' },
      run: { threadId: THREAD },
    })
  })

  it('fails the tool calls and reports stranded when the sandbox is gone', async () => {
    const persistence = memoryPersistence()
    await readOnce(persistence, inSandbox, 'c0')
    const stranded: Array<{ binding: WorkspaceBinding; message: string }> = []
    const listener = definePlugin({
      name: 'test/stranded',
      setup: (ctx) => {
        ctx.on(WorkspaceStranded, (event) => stranded.push(event))
      },
    })
    const bind = vi.fn(async () => sandboxWorkspace())
    const { adapter, calls } = readTurn('c1')
    const { host, opened } = open({
      persistence,
      adapter,
      // No reattach: the sandbox of the log cannot come back.
      plugins: [listener, workspaceTools({ workspace: { bind }, web: false })],
    })
    const session = await opened

    await session.send('read')

    expect(resultOf(calls, 'c1')).toContain(
      'The workspace of this thread, /ws in the fake sandbox sb-1, is gone',
    )
    expect(bind).not.toHaveBeenCalled()
    expect(stranded[0]).toMatchObject({ binding: { ...SANDBOX, root: '/ws' } })
    await host.close()
  })

  it('pins the log to the host of a folder binding, and works nowhere else', async () => {
    const persistence = memoryPersistence()
    const { log } = persistence.stores
    const binding = { kind: 'host', hostId: 'host-a', root: '/ws' }
    await appendToLog(log, { threadId: THREAD }, [
      { type: 'harness.workspace.bound', binding },
    ])
    expect(await canOtherHostTake(log, LOG)).toBe(true)

    const result = await readOnce(
      persistence,
      { root: '/ws', backend: backend() },
      'c0',
    )

    expect(result).toContain(
      'The workspace of this thread is /ws on the host host-a. Only that host can continue the thread.',
    )
    // Only host-a acquires the log now.
    expect(await canOtherHostTake(log, LOG)).toBe(false)
  })

  it('stops a job that a crashed host left running, and notes it', async () => {
    const persistence = memoryPersistence()
    const spawn = () => ({
      wait: () => new Promise<{ exitCode: number }>(() => {}),
      kill: () => {},
      output: () => '',
      jobId: Promise.resolve('job-7'),
    })
    const first = mockAdapter([
      () => toolCall('bash', { command: 'serve', background: true }, 'c0'),
      () => text('started'),
    ])
    const crashed = open({
      persistence,
      adapter: first.adapter,
      crashes: true,
      plugins: [
        workspaceTools({
          root: '/ws',
          backend: backend({ spawn }),
          web: false,
        }),
      ],
    })
    await (await crashed.opened).send('serve')
    expect(await recordsOf(persistence, 'harness.job')).toMatchObject([
      { jobId: 'bash-1', ended: false, backendId: 'job-7' },
    ])
    // The first host never closes, like a process that stopped.
    await ownershipExpired()
    const killJob = vi.fn(async () => true)
    const { adapter } = readTurn('c1')
    const next = open({
      persistence,
      adapter,
      plugins: [
        workspaceTools({
          root: '/ws',
          backend: backend({ killJob }),
          web: false,
        }),
      ],
    })
    const session = await next.opened

    await session.send('read')

    expect(killJob).toHaveBeenCalledWith('job-7')
    expect(await recordsOf(persistence, 'harness.job')).toMatchObject([
      { jobId: 'bash-1', ended: false },
      { jobId: 'bash-1', ended: true },
    ])
    const notes = await recordsOf(persistence, 'harness.note')
    expect(notes.map((record) => record.note)).toEqual([
      'Background job bash-1 was stopped: it ran on a host before the session moved to this one.',
    ])
    await next.host.close()
  })
})
