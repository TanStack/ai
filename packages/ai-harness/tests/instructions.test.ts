import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { projectInstructions } from '../src/first-party'
import { workspaceTools } from '../src/first-party/coding'
import { mockAdapter, text, toolCall } from './helpers'
import type { AnyTextAdapter, ModelMessage } from '@tanstack/ai'
import type { HarnessPlugin } from '../src'

// `~` in a global path is the home folder. Each test points it into its own
// folder.
const home = vi.hoisted(() => ({ dir: '' }))
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  homedir: () => home.dir,
}))

// A fake git: real git can take seconds to start on a busy machine, more
// than the plugin waits. It names `git.branch` for `git rev-parse` in
// `git.cwd`, and fails for anything else.
const git = vi.hoisted(() => {
  const fake: { cwd: string; branch: string | undefined } = {
    cwd: '',
    branch: undefined,
  }
  return fake
})
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  exec: (
    command: string,
    options: { cwd?: string },
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const isBranchQuery =
      command === 'git rev-parse --abbrev-ref HEAD' &&
      options.cwd === git.cwd &&
      git.branch !== undefined
    if (isBranchQuery) callback(null, `${git.branch}\n`, '')
    else callback(Object.assign(new Error('git failed'), { code: 128 }), '', '')
  },
}))

let dir = ''
/** The `root` of the plugin, in the test folder. */
let root = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'harness-instructions-'))
  home.dir = join(dir, 'home')
  root = join(dir, 'project')
  await mkdir(root)
})
afterEach(async () => {
  vi.useRealTimers()
  await rm(dir, { recursive: true, force: true })
})

/** Write `content` to `path` in the test folder, and make its folders. */
async function put(path: string, content: string) {
  const full = join(dir, path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, content)
}

/** Write `content` to `path`, with an mtime `minutes` in the future. */
async function change(path: string, content: string, minutes: number) {
  await put(path, content)
  const time = Date.now() / 1000 + minutes * 60
  await utimes(join(dir, path), time, time)
}

/** A model that answers 'ok', on a model with mid-conversation changes. */
function okModel() {
  const { adapter, calls } = mockAdapter(() => text('ok'))
  const withChannels: AnyTextAdapter = {
    ...adapter,
    midConversationChannels: { tools: true, systemPrompts: true },
  }
  return { adapter: withChannels, calls }
}

/** Open a session on `adapter` with `plugins`. */
async function open(adapter: AnyTextAdapter, plugins: Array<HarnessPlugin>) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({
      name: 'test/instructions',
      adapter,
      plugins: () => plugins,
    }),
    { threadId: 't' },
  )
  return { host, session }
}

/** The system prompts of one turn with `projectInstructions(options)`. */
async function promptsOfOneTurn(
  options: Parameters<typeof projectInstructions>[0],
) {
  const { adapter, calls } = okModel()
  const { host, session } = await open(adapter, [projectInstructions(options)])
  await session.prompt('hi')
  await host.close()
  return calls[0].systemPrompts
}

describe('projectInstructions', () => {
  it('puts global files first, then the files from the repo root down to root', async () => {
    await put('home/.config/AGENTS.md', 'Global rule.')
    await mkdir(join(dir, 'repo', '.git'), { recursive: true })
    await put('repo/AGENTS.md', 'Repo rule.')
    await put('repo/pkg/AGENTS.md', 'Package rule.')
    await put('repo/pkg/CLAUDE.md', 'Claude rule.')

    expect(
      await promptsOfOneTurn({
        root: join(dir, 'repo', 'pkg'),
        global: ['~/.config/AGENTS.md'],
        env: false,
      }),
    ).toEqual([
      'Global instructions from ~/.config/AGENTS.md:\nGlobal rule.',
      'Project instructions from ../AGENTS.md:\nRepo rule.',
      'Project instructions from AGENTS.md:\nPackage rule.',
      'Project instructions from CLAUDE.md:\nClaude rule.',
    ])
  })

  it('reads only root when no folder has .git', async () => {
    await put('AGENTS.md', 'Outer rule.')
    await put('project/AGENTS.md', 'Inner rule.')

    expect(await promptsOfOneTurn({ root, env: false })).toEqual([
      'Project instructions from AGENTS.md:\nInner rule.',
    ])
  })

  it('adds a changed file at the end, as a mid-conversation change', async () => {
    await put('project/AGENTS.md', 'Use tabs.')
    const { adapter, calls } = okModel()
    const { host, session } = await open(adapter, [
      projectInstructions({ root, env: false }),
    ])

    await session.prompt('one')
    await change('project/AGENTS.md', 'Use spaces.', 1)
    await session.prompt('two')
    await host.close()

    expect(calls[1].systemPrompts).toEqual([
      'Project instructions from AGENTS.md:\nUse tabs.',
      'Project instructions from AGENTS.md changed. Follow this text instead:\nUse spaces.',
    ])
    expect(calls[1].midConversationChanges).toEqual({
      start: { tools: [], systemPrompts: 1 },
      changes: [{ before: calls[1].messages.length, systemPrompts: 1 }],
    })
  })

  it('notes a removed file and a new file', async () => {
    await put('project/AGENTS.md', 'Use tabs.')
    const { adapter, calls } = okModel()
    const { host, session } = await open(adapter, [
      projectInstructions({ root, env: false }),
    ])

    await session.prompt('one')
    await rm(join(root, 'AGENTS.md'))
    await put('project/CLAUDE.md', 'Be brief.')
    await session.prompt('two')
    await host.close()

    expect(calls[1].systemPrompts).toEqual([
      'Project instructions from AGENTS.md:\nUse tabs.',
      'Project instructions from AGENTS.md were removed.',
      'Project instructions from CLAUDE.md:\nBe brief.',
    ])
  })

  it('builds the prompt again when no spare slot is left', async () => {
    await put('project/AGENTS.md', 'Version 0.')
    const { adapter, calls } = okModel()
    // One file and 8 spare slots: 9 slots in all.
    const { host, session } = await open(adapter, [
      projectInstructions({ root, files: ['AGENTS.md'], env: false }),
    ])

    await session.prompt('turn 0')
    for (let version = 1; version <= 9; version++) {
      await change('project/AGENTS.md', `Version ${version}.`, version)
      await session.prompt(`turn ${version}`)
    }
    await host.close()

    expect(calls[8].systemPrompts.at(-1)).toBe(
      'Project instructions from AGENTS.md changed. Follow this text instead:\nVersion 8.',
    )
    expect(calls[9].systemPrompts).toEqual([
      'Project instructions from AGENTS.md:\nVersion 9.',
    ])
  })

  it('adds an environment block with the date, platform, and folder', async () => {
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'))

    expect(await promptsOfOneTurn({ root })).toEqual([
      `Environment:\n- Date: 2026-03-04\n- Platform: ${process.platform}\n- Working folder: ${root}\n- Git repository: no`,
    ])
  })

  it('names the git branch in a git repository', async () => {
    await mkdir(join(root, '.git'))
    git.cwd = root
    git.branch = 'instructions-test'

    const [environment] = await promptsOfOneTurn({ root })
    expect(environment).toMatch(
      /- Git repository: yes\n- Git branch: instructions-test$/,
    )
  })

  it('leaves out the branch when git cannot name it', async () => {
    await mkdir(join(root, '.git'))
    git.cwd = root
    git.branch = undefined

    const [environment] = await promptsOfOneTurn({ root })
    expect(environment).toMatch(/- Git repository: yes$/)
  })

  it('adds a nested instruction file to read_file once', async () => {
    await put('project/AGENTS.md', 'Root rule.')
    await put('project/src/AGENTS.md', 'Src rule.')
    await put('project/src/lib/AGENTS.md', 'Lib rule.')
    await put('project/src/lib/a.ts', 'a')
    await put('project/src/b.ts', 'b')
    const { adapter, calls } = mockAdapter([
      () => toolCall('read_file', { path: 'src/b.ts' }, 'c1'),
      () => toolCall('read_file', { path: 'src/lib/AGENTS.md' }, 'c2'),
      () => toolCall('read_file', { path: 'src/lib/a.ts' }, 'c3'),
      () => text('done'),
    ])
    const { host, session } = await open(adapter, [
      workspaceTools({ root }),
      projectInstructions({ root, env: false }),
    ])

    await session.prompt('read')
    await host.close()

    // What each read added after the lines of the file.
    const messages: Array<ModelMessage> = calls[3].messages
    const added = messages
      .filter((message) => message.role === 'tool')
      .map((message) => String(message.content).split('\n\n').slice(1))
    expect(added).toEqual([
      ['Instructions from src/AGENTS.md:\nSrc rule.'],
      [],
      [],
    ])
  })
})
