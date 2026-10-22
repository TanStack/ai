import { mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as nodePath from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  harnessAgent,
} from '../src'
import { permissions } from '../src/first-party/permissions'
import { hostBackend } from '../src/first-party/coding/backend'
import {
  FileChanged,
  JobEnded,
  JobOutput,
  JobStarted,
} from '../src/first-party/coding/events'
import {
  createWorkspaceTools,
  workspaceTools,
} from '../src/first-party/coding/workspace'
import { mockAdapter, text, toolCall } from './helpers'
import type { PlatformPath } from 'node:path'
import type { AnyTextAdapter, AnyTool } from '@tanstack/ai'
import type { HarnessPlugin } from '../src'
import type {
  CallResources,
  PermissionDecision,
  PermissionRule,
} from '../src/first-party/permissions'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'
import type {
  OutsideAccess,
  WorkspaceBinder,
  WorkspaceToolsOptions,
} from '../src/first-party/coding/workspace'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const { posix } = nodePath

/**
 * A backend that keeps files in a map, by absolute POSIX path, like a Linux
 * sandbox. Its commands answer with the command and the folder. `extra`
 * replaces parts of it.
 */
function memoryBackend(extra: Partial<WorkspaceBackend> = {}) {
  const files = new Map<string, Uint8Array>()
  const backend: WorkspaceBackend = {
    shell: 'sh',
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
    // No links: each path is its own real path.
    realpath: async (path) => path,
    readdir: async (path) => {
      const prefix = path.endsWith('/') ? path : `${path}/`
      const entries = new Map<string, 'file' | 'dir'>()
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue
        const [name = '', ...rest] = file.slice(prefix.length).split('/')
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
    ...extra,
  }
  return { backend, files }
}

/** A backend, its path functions, and how to make and remove a folder on it. */
interface Fixture {
  name: string
  backend: WorkspaceBackend
  paths: PlatformPath
  folder: (prefix: string) => Promise<string>
  remove: (folder: string) => Promise<void>
}

let memoryFolders = 0
const fixtures: Array<Fixture> = [
  {
    name: 'host',
    backend: hostBackend,
    paths: nodePath,
    folder: (prefix) => mkdtemp(nodePath.join(tmpdir(), prefix)),
    remove: (folder) => rm(folder, { recursive: true, force: true }),
  },
  {
    name: 'memory',
    backend: memoryBackend().backend,
    paths: posix,
    folder: async (prefix) => {
      memoryFolders += 1
      return `/${prefix}${memoryFolders}`
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

/** A session with `plugins`, whose model is `adapter`. */
async function openSession(
  adapter: AnyTextAdapter,
  plugins: Array<HarnessPlugin>,
) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({
      name: 'test/workspace-tools',
      adapter,
      plugins: () => plugins,
    }),
    {
      threadId: 't',
    },
  )
  return { host, session }
}

/** The names of the tools that the model got in `call`. */
const toolNames = (call: { tools: Array<{ name: string }> }) =>
  call.tools.map((tool) => tool.name)

/** Is the process `pid` still running? */
function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe.each(fixtures)('workspace tools on the $name backend', (fixture) => {
  const { backend, paths } = fixture
  let root: string
  let tools: Map<string, AnyTool>

  const run = (name: string, args: unknown) => runIn(tools, name, args)
  const write = (path: string, text: string) =>
    backend.writeFile(paths.join(root, path), text)
  const read = async (path: string) =>
    decoder.decode(await backend.readFile(paths.join(root, path)))

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
        run('read_file', {
          path: paths.join(paths.dirname(root), 'elsewhere.txt'),
        }),
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

  describe('patch', () => {
    it('adds a file in the workspace', async () => {
      const patch = [
        '*** Begin Patch',
        '*** Add File: patched/p.txt',
        '+patched',
        '*** End Patch',
      ].join('\n')
      expect(await run('patch', { patch })).toBe(
        'Applied the patch:\nadded patched/p.txt',
      )
      expect(await read('patched/p.txt')).toBe('patched\n')
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
      await backend.writeFile(paths.join(outside, 'docs', 'a.md'), 'alpha')
      await backend.writeFile(paths.join(outside, 'docs', 'b.md'), 'beta')
      await backend.writeFile(paths.join(outside, 'top.md'), 'top')
    })
    afterAll(async () => {
      await fixture.remove(outside)
    })

    /**
     * Tools with `outside: 'ask'`. `decision` is what the permission rules
     * say now about a call. A call that runs was approved before it ran.
     */
    function approved(
      decision: PermissionDecision | null = 'ask',
      mode = 'default',
    ) {
      const options = { root, backend, outside: 'ask' as const }
      // `null`: no permissions(). The rules decide only the outside paths.
      const decide = (_tool: string, resources: CallResources) =>
        resources.outside?.length ? (decision ?? 'allow') : 'allow'
      const access = {
        mode: () => mode,
        ...(decision ? { rules: () => decide } : {}),
      }
      const created = createWorkspaceTools(options, { access })
      return {
        set: new Map(created.tools.map((tool) => [tool.name, tool])),
        resources: created.resources,
      }
    }

    it('refuses outside paths without the outside option', async () => {
      await expect(
        run('read_file', { path: paths.join(outside, 'top.md') }),
      ).rejects.toThrow('outside the workspace')
    })

    it('tells the rules the real outside path, so the call asks before it runs', async () => {
      const { resources } = approved()
      const docs = paths.join(outside, 'docs')
      // The real path: the temp folder can be a link.
      const real = (await backend.realpath(docs)) ?? docs
      const input = { path: paths.join(docs, 'a.md') }
      expect(await resources.read_file?.outside?.(input)).toEqual([
        paths.join(real, 'a.md'),
      ])
      expect(
        await resources.read_file?.outside?.({ path: 'src/a.ts' }),
      ).toEqual([])
    })

    it('runs an approved outside call, and refuses one that a rule denies', async () => {
      const { set } = approved('ask')
      expect(
        await runIn(set, 'read_file', { path: paths.join(outside, 'top.md') }),
      ).toBe('1\ttop')
      await expect(
        runIn(approved('deny').set, 'read_file', {
          path: paths.join(outside, 'top.md'),
        }),
      ).rejects.toThrow('The permission rules do not allow read_file')
    })

    it('refuses an outside path without permissions(), because nobody can approve it', async () => {
      await expect(
        runIn(approved(null).set, 'read_file', {
          path: paths.join(outside, 'top.md'),
        }),
      ).rejects.toThrow('outside the workspace')
    })

    it('lists and searches an approved outside folder with full paths', async () => {
      const { set } = approved()
      const folder = paths.join(outside, 'docs')
      // The tools show the real path: the temp folder can be a link.
      const real = (await backend.realpath(folder)) ?? folder
      const shown = real.split(paths.sep).join('/')
      expect(await runIn(set, 'list_files', { path: folder })).toBe(
        `${shown}/a.md\n${shown}/b.md`,
      )
      expect(await runIn(set, 'grep', { pattern: 'beta', path: folder })).toBe(
        `${shown}/b.md:1: beta`,
      )
    })

    it('runs in bypass mode, also without permissions()', async () => {
      const { set } = approved(null, 'bypass')
      expect(
        await runIn(set, 'read_file', { path: paths.join(outside, 'top.md') }),
      ).toBe('1\ttop')
    })
  })
})

describe('a sandbox backend with POSIX paths', () => {
  it('keeps the root /workspace, also on a Windows host', async () => {
    const { backend, files } = memoryBackend()
    const set = toolsOf({ root: '/workspace', backend })
    expect(
      await runIn(set, 'write_file', { path: 'src/a.ts', content: 'one' }),
    ).toBe('Wrote src/a.ts.')
    expect([...files.keys()]).toEqual(['/workspace/src/a.ts'])
    expect(await runIn(set, 'list_files', {})).toBe('src/a.ts')
    expect(await runIn(set, 'bash', { command: 'make' })).toBe(
      'exit code: 3\nran make in /workspace\nstderr:\nwarn',
    )
    await expect(
      runIn(set, 'read_file', { path: '/etc/passwd' }),
    ).rejects.toThrow('outside the workspace')
  })
})

describe('the tools of workspaceTools', () => {
  const names = (options: Pick<WorkspaceToolsOptions, 'web'> = {}) =>
    createWorkspaceTools({
      root: '/workspace',
      backend: memoryBackend().backend,
      ...options,
    }).tools.map((tool) => tool.name)
  const search = { search: async () => [] }

  it('has the file, shell, and webfetch tools by default', () => {
    expect(names()).toEqual([
      'read_file',
      'write_file',
      'edit_file',
      'patch',
      'list_files',
      'grep',
      'bash',
      'webfetch',
    ])
  })

  it('adds websearch with a search provider, and no web tools for web: false', () => {
    expect(names({ web: { search } }).slice(-2)).toEqual([
      'webfetch',
      'websearch',
    ])
    expect(names({ web: false })).not.toContain('webfetch')
  })
})

describe('editStyle', () => {
  const EDIT_TOOLS = ['write_file', 'edit_file', 'patch']

  it.each([
    { editStyle: undefined, model: 'gpt-5', tools: ['write_file', 'patch'] },
    { editStyle: undefined, model: 'o3', tools: ['write_file', 'patch'] },
    {
      editStyle: undefined,
      model: 'openai/gpt-4.1',
      tools: ['write_file', 'patch'],
    },
    {
      editStyle: undefined,
      model: 'claude-sonnet-4-5',
      tools: ['write_file', 'edit_file'],
    },
    {
      editStyle: 'edit' as const,
      model: 'gpt-5',
      tools: ['write_file', 'edit_file'],
    },
    {
      editStyle: 'patch' as const,
      model: 'claude-sonnet-4-5',
      tools: ['write_file', 'patch'],
    },
  ])(
    'gives $model the edit tools $tools with editStyle $editStyle',
    async ({ editStyle, model, tools }) => {
      const { adapter, calls } = mockAdapter([() => text('ok')])
      const { host, session } = await openSession({ ...adapter, model }, [
        workspaceTools({
          root: '/workspace',
          backend: memoryBackend().backend,
          editStyle,
        }),
      ])
      await session.send('hi')
      expect(
        toolNames(calls[0]).filter((name) => EDIT_TOOLS.includes(name)),
      ).toEqual(tools)
      await host.close()
    },
  )
})

describe('the afterWrite hooks', () => {
  it.each([
    ['write_file', { path: 'a.ts', content: 'one' }],
    ['edit_file', { path: 'a.ts', old: 'zero', new: 'one' }],
  ])(
    'run after %s gives the file lock back, so a hook (a formatter) can write the file',
    async (name, args) => {
      const { backend, files } = memoryBackend()
      files.set('/workspace/a.ts', new TextEncoder().encode('zero'))
      let isFormatted = false
      const { tools } = createWorkspaceTools(
        { root: '/workspace', backend },
        {
          hooks: () => [
            {
              // Writes the file again, as a formatter does. Inside the lock
              // of the call, this write would wait for ever.
              afterWrite: async () => {
                if (isFormatted) return undefined
                isFormatted = true
                await runIn(set, 'write_file', {
                  path: 'a.ts',
                  content: 'formatted',
                })
                return 'Formatted.'
              },
            },
          ],
        },
      )
      const set = new Map(
        tools.map((tool): [string, AnyTool] => [tool.name, tool]),
      )

      expect(await runIn(set, name, args)).toContain('Formatted.')
      expect(new TextDecoder().decode(files.get('/workspace/a.ts'))).toBe(
        'formatted',
      )
    },
  )
})

describe('FileChanged', () => {
  /** A unified diff of `rows`, each with a line ending. */
  const diff = (...rows: Array<string>) =>
    rows.map((row) => `${row}\n`).join('')

  /** The tools for `options`, and the `FileChanged` values that they send. */
  function tracked(options: WorkspaceToolsOptions) {
    const changes: Array<unknown> = []
    const { tools } = createWorkspaceTools(options, {
      emit: (event, value) => {
        if (event === FileChanged) changes.push(value)
      },
    })
    const set = new Map(
      tools.map((tool): [string, AnyTool] => [tool.name, tool]),
    )
    return { set, changes }
  }

  /**
   * {@link tracked} on a memory workspace at `/workspace` that starts with
   * `files`, by path from the root.
   */
  function workspaceWith(files: Record<string, string> = {}) {
    const memory = memoryBackend()
    for (const [path, text] of Object.entries(files)) {
      memory.files.set(`/workspace/${path}`, new TextEncoder().encode(text))
    }
    return tracked({ root: '/workspace', backend: memory.backend })
  }

  it('sends created for a new file, then updated with the diff for each change', async () => {
    const { set, changes } = workspaceWith()
    await runIn(set, 'write_file', { path: 'src/a.ts', content: 'one\ntwo\n' })
    await runIn(set, 'write_file', { path: 'src/a.ts', content: 'one\n2\n' })
    await runIn(set, 'edit_file', { path: 'src/a.ts', old: 'one', new: '1' })

    const path = '/workspace/src/a.ts'
    const git = 'diff --git a/src/a.ts b/src/a.ts'
    const both = [git, '--- a/src/a.ts', '+++ b/src/a.ts']
    // No tool call id: a call from code mode sends the event too.
    expect(changes).toEqual([
      {
        path,
        change: 'created',
        patch: diff(
          git,
          'new file mode 100644',
          '--- /dev/null',
          '+++ b/src/a.ts',
          '@@ -0,0 +1,2 @@',
          '+one',
          '+two',
        ),
        additions: 2,
        deletions: 0,
      },
      {
        path,
        change: 'updated',
        patch: diff(...both, '@@ -1,2 +1,2 @@', ' one', '-two', '+2'),
        additions: 1,
        deletions: 1,
      },
      {
        path,
        change: 'updated',
        patch: diff(...both, '@@ -1,2 +1,2 @@', '-one', '+1', ' 2'),
        additions: 1,
        deletions: 1,
      },
    ])
  })

  it('sends nothing when the write leaves the text as it was', async () => {
    const { set, changes } = workspaceWith({ 'a.txt': 'same\n' })
    await runIn(set, 'write_file', { path: 'a.txt', content: 'same\n' })
    expect(changes).toEqual([])
  })

  /** Writes of `a.txt` that send an event without a patch. */
  const unpatched: Array<{
    name: string
    files: Record<string, string>
    content: string
    change: string
  }> = [
    { name: 'a binary file', files: {}, content: 'a\0b\n', change: 'created' },
    {
      // The old text is not read, so it is not known.
      name: 'a file that was over 1 MiB',
      files: { 'a.txt': 'x'.repeat(1024 * 1024 + 1) },
      content: 'small\n',
      change: 'updated',
    },
    {
      name: 'a patch over 256 KiB',
      files: {},
      content: 'line\n'.repeat(60_000),
      change: 'created',
    },
  ]

  it.each(unpatched)(
    'sends no patch for $name',
    async ({ files, content, change }) => {
      const { set, changes } = workspaceWith(files)
      await runIn(set, 'write_file', { path: 'a.txt', content })
      expect(changes).toEqual([
        { path: '/workspace/a.txt', change, additions: 0, deletions: 0 },
      ])
    },
  )

  it('gives paths with / in the patch for a Windows root', async () => {
    const { set, changes } = tracked({
      root: 'C:/work',
      backend: memoryBackend({ shell: 'cmd' }).backend,
    })
    await runIn(set, 'write_file', { path: 'src/a.ts', content: 'one\n' })
    expect(changes).toEqual([
      {
        path: 'C:\\work\\src\\a.ts',
        change: 'created',
        patch: diff(
          'diff --git a/src/a.ts b/src/a.ts',
          'new file mode 100644',
          '--- /dev/null',
          '+++ b/src/a.ts',
          '@@ -0,0 +1 @@',
          '+one',
        ),
        additions: 1,
        deletions: 0,
      },
    ])
  })

  /**
   * A session where the model calls `write_file` with `args` once, as tool
   * call `c1`. `plugins` come before the workspace tools. Resolves to the
   * `FileChanged` values that a plugin got.
   */
  async function writeInSession(
    args: Record<string, unknown>,
    plugins: Array<HarnessPlugin> = [],
  ) {
    const changes: Array<unknown> = []
    const listener = definePlugin({
      name: 'test/file-changes',
      setup: (ctx) => {
        ctx.on(FileChanged, (change) => changes.push(change))
      },
    })
    const { adapter } = mockAdapter([
      () => toolCall('write_file', args, 'c1'),
      () => text('done'),
    ])
    const { host, session } = await openSession(adapter, [
      ...plugins,
      workspaceTools({ root: '/workspace', backend: memoryBackend().backend }),
      listener,
    ])
    await session.send('write')
    await host.close()
    return changes
  }

  it('reaches the plugins of a session, with the tool call id', async () => {
    const changes = await writeInSession({ path: 'a.txt', content: 'one\n' })
    expect(changes).toEqual([
      {
        path: '/workspace/a.txt',
        change: 'created',
        patch: diff(
          'diff --git a/a.txt b/a.txt',
          'new file mode 100644',
          '--- /dev/null',
          '+++ b/a.txt',
          '@@ -0,0 +1 @@',
          '+one',
        ),
        additions: 1,
        deletions: 0,
        toolCallId: 'c1',
      },
    ])
  })

  it('sends no patch for a .env file, also with no permission rules', async () => {
    const { set, changes } = workspaceWith()
    await runIn(set, 'write_file', {
      path: 'app/.env.local',
      content: 'KEY=hunter2\n',
    })
    expect(changes).toEqual([
      {
        path: '/workspace/app/.env.local',
        change: 'created',
        additions: 0,
        deletions: 0,
      },
    ])
  })

  it('sends no patch for a file that the permission rules protect, like .env', async () => {
    // A rule allows the write. A read_file of .env still asks, so the
    // rules protect the file.
    const rules: Array<PermissionRule> = [
      { tool: 'write_file', resource: '.env', decision: 'allow' },
    ]
    const changes = await writeInSession(
      { path: '.env', content: 'KEY=hunter2\n' },
      [permissions({ root: '/workspace', rules })],
    )
    expect(changes).toEqual([
      {
        path: '/workspace/.env',
        change: 'created',
        additions: 0,
        deletions: 0,
        toolCallId: 'c1',
      },
    ])
  })
})

describe('permission resources', () => {
  const { resources } = createWorkspaceTools({
    root: '/workspace',
    backend: memoryBackend().backend,
  })

  it('gives each call its paths, from the root', async () => {
    expect(await resources.read_file?.paths?.({ path: 'src/a.ts' })).toEqual([
      '/workspace/src/a.ts',
    ])
    expect(await resources.edit_file?.paths?.({ path: '/etc/hosts' })).toEqual([
      '/etc/hosts',
    ])
    expect(await resources.write_file?.paths?.({ path: '../x.txt' })).toEqual([
      '/x.txt',
    ])
    expect(await resources.list_files?.paths?.({})).toEqual(['/workspace'])
    expect(
      await resources.grep?.paths?.({ pattern: 'a', path: 'src' }),
    ).toEqual(['/workspace/src'])
  })

  it('gives every path of a patch, also the target of a move', async () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: a.ts',
      '+a',
      '*** Update File: old.ts',
      '*** Move to: lib/new.ts',
      '@@',
      '-x',
      '+y',
      '*** End Patch',
    ].join('\n')
    expect(await resources.patch?.paths?.({ patch })).toEqual([
      '/workspace/a.ts',
      '/workspace/old.ts',
      '/workspace/lib/new.ts',
    ])
  })

  it('gives the command parts of bash', () => {
    expect(resources.bash?.commands?.({ command: 'ls && rm x' })).toEqual([
      'ls',
      'rm x',
    ])
  })

  it('throws, so the call is refused, when the input has no path or patch', async () => {
    await expect(
      Promise.resolve().then(() => resources.read_file?.paths?.({})),
    ).rejects.toThrow('Argument "path" must be a string.')
    await expect(
      Promise.resolve().then(() =>
        resources.patch?.paths?.({ patch: 'not a patch' }),
      ),
    ).rejects.toThrow('Patch line 1')
  })

  it('reach permissions(), so an allow rule for a path skips the question', async () => {
    const { backend, files } = memoryBackend()
    const patch = (path: string) =>
      ['*** Begin Patch', `*** Add File: ${path}`, '+a', '*** End Patch'].join(
        '\n',
      )
    const { adapter } = mockAdapter([
      () => toolCall('patch', { patch: patch('src/a.ts') }, 'c1'),
      () => text('done'),
    ])
    const { host, session } = await openSession(adapter, [
      permissions({
        root: '/workspace',
        rules: [{ tool: 'patch', resource: 'src/**', decision: 'allow' }],
      }),
      workspaceTools({ root: '/workspace', backend, editStyle: 'patch' }),
    ])
    await session.send('work')
    expect(session.snapshot().pendingWaits).toEqual([])
    expect([...files.keys()]).toEqual(['/workspace/src/a.ts'])
    await host.close()
  })
})

describe('permission rules, links, and grep', () => {
  const SECRET = 'KEY=hunter2'
  const SKIPPED_TWO = '[Skipped 2 files that the permission rules protect.]'

  /**
   * A memory backend with `files` (from `/workspace`) and `links` (a link
   * path to its target, both from `/workspace`). A path through a link reads
   * as its target, and readdir marks the link, like the host.
   */
  function linkedBackend(
    files: Record<string, string>,
    links: Record<string, string> = {},
  ) {
    const base = memoryBackend()
    for (const [path, text] of Object.entries(files)) {
      base.files.set(`/workspace/${path}`, new TextEncoder().encode(text))
    }
    const real = (path: string) => {
      for (const [link, target] of Object.entries(links)) {
        const from = `/workspace/${link}`
        if (path === from || path.startsWith(`${from}/`)) {
          return `/workspace/${target}${path.slice(from.length)}`
        }
      }
      return path
    }
    const backend: WorkspaceBackend = {
      ...base.backend,
      realpath: async (path) => real(path),
      readFile: (path) => base.backend.readFile(real(path)),
      stat: (path) => base.backend.stat(real(path)),
      readdir: async (path) => {
        const entries = await base.backend.readdir(real(path))
        const linked = Object.keys(links)
          .filter((link) => posix.dirname(`/workspace/${link}`) === path)
          .map((link) => ({
            name: posix.basename(link),
            type: 'link' as const,
          }))
        return [...entries, ...linked]
      },
    }
    return backend
  }

  /** A session where the model calls `tools` in order, in `mode`. */
  async function callTools(
    backend: WorkspaceBackend,
    tools: Array<[string, Record<string, unknown>]>,
    options: { rules?: Array<PermissionRule>; mode?: string } = {},
  ) {
    const { adapter, calls } = mockAdapter([
      ...tools.map(
        ([name, args], index) =>
          () =>
            toolCall(name, args, `c${index}`),
      ),
      () => text('done'),
    ])
    const { host, session } = await openSession(adapter, [
      permissions({ root: '/workspace', rules: options.rules }),
      workspaceTools({ root: '/workspace', backend, web: false }),
    ])
    if (options.mode)
      await session.runCommand({ name: 'mode', input: options.mode })
    /** Everything the model saw in its last call. */
    const seen = () => JSON.stringify(calls.at(-1)?.messages)
    /** The result of the tool call with id `id`, as the model saw it. */
    const result = (id: string) =>
      JSON.stringify(
        calls
          .at(-1)
          ?.messages.find(
            (message: { toolCallId?: string }) => message.toolCallId === id,
          )?.content,
      )
    return { host, session, seen, result }
  }

  it('asks before read_file reads .env through a link with another name', async () => {
    const backend = linkedBackend({ '.env': SECRET }, { notes: '.env' })
    const { host, session, seen } = await callTools(backend, [
      ['read_file', { path: 'notes' }],
    ])
    // The rules see the real path before the call, so the turn stops for
    // an approval and the file is not read.
    const turn = await session.send('read the notes')
    expect(turn.interrupts).toHaveLength(1)
    const [wait] = session.snapshot().pendingWaits
    expect(wait?.kind).toBe('approval')
    expect(seen()).not.toContain('hunter2')
    if (!wait) throw new Error('No approval.')
    await session.resolve({
      resume: [
        {
          interruptId: wait.waitId,
          status: 'resolved',
          payload: { answer: 'reject' },
        },
      ],
      inputId: 'no',
    })
    await session.settled({ inputId: 'no' })
    expect(seen()).toContain('The user denied this tool call.')
    expect(seen()).not.toContain('hunter2')
    await host.close()
  })

  it('applies a deny rule to the real path of a linked folder', async () => {
    const backend = linkedBackend(
      { 'secrets/key.txt': SECRET },
      { docs: 'secrets' },
    )
    const { host, session, seen, result } = await callTools(
      backend,
      [['read_file', { path: 'docs/key.txt' }]],
      {
        rules: [
          { tool: 'read_file', resource: 'secrets/**', decision: 'deny' },
        ],
      },
    )
    await session.send('read the key')
    expect(session.snapshot().pendingWaits).toEqual([])
    // The rules see the real path before the call, so it never runs.
    expect(result('c0')).toContain('A permission rule denies this tool.')
    expect(seen()).not.toContain('hunter2')
    await host.close()
  })

  it('refuses a linked .env in plan mode without a question', async () => {
    const backend = linkedBackend({ '.env': SECRET }, { notes: '.env' })
    const { host, session, seen } = await callTools(
      backend,
      [['read_file', { path: 'notes' }]],
      { mode: 'plan' },
    )
    await session.send('read the notes')
    expect(session.snapshot().pendingWaits).toEqual([])
    expect(seen()).not.toContain('hunter2')
    await host.close()
  })

  it.each(['default', 'plan'])(
    'grep in %s mode skips the files a read_file rule protects, whatever the pattern',
    async (mode) => {
      const backend = linkedBackend({
        '.env': SECRET,
        'secrets/key.txt': 'KEY=2',
        'src/a.ts': 'KEY=1',
      })
      const { host, session, seen, result } = await callTools(
        backend,
        [
          ['grep', { pattern: 'KEY' }],
          // Matches no protected file. The note must not tell that.
          ['grep', { pattern: 'KEY=1' }],
        ],
        {
          rules: [
            { tool: 'read_file', resource: 'secrets/**', decision: 'deny' },
          ],
          mode,
        },
      )
      await session.send('search')
      expect(session.snapshot().pendingWaits).toEqual([])
      for (const id of ['c0', 'c1']) {
        expect(result(id)).toBe(`"src/a.ts:1: KEY=1\\n${SKIPPED_TWO}"`)
      }
      expect(seen()).not.toContain('hunter2')
      expect(seen()).not.toContain('KEY=2')
      await host.close()
    },
  )

  it('grep in a linked folder checks the real paths of its files', async () => {
    const backend = linkedBackend(
      { 'secrets/key.txt': SECRET },
      { docs: 'secrets' },
    )
    const { host, session, seen, result } = await callTools(
      backend,
      [['grep', { pattern: 'KEY', path: 'docs' }]],
      {
        rules: [
          { tool: 'read_file', resource: 'secrets/**', decision: 'deny' },
        ],
      },
    )
    await session.send('search')
    expect(result('c0')).toBe(
      '"No matches.\\n[Skipped 1 file that the permission rules protect.]"',
    )
    expect(seen()).not.toContain('hunter2')
    await host.close()
  })
})

describe('webfetch approval', () => {
  /** The page that every request gets, so no request leaves the test. */
  const fetchPage: typeof fetch = async () =>
    new Response('fetched body', {
      headers: { 'content-type': 'text/plain' },
    })

  /** A session where the model calls webfetch once. `rules` go to permissions(). */
  async function fetchOnce(rules: Array<PermissionRule> = []) {
    const { adapter, calls } = mockAdapter([
      () => toolCall('webfetch', { url: 'https://example.com/' }, 'c1'),
      () => text('done'),
    ])
    const { host, session } = await openSession(adapter, [
      permissions({ root: '/workspace', rules }),
      workspaceTools({
        root: '/workspace',
        backend: memoryBackend().backend,
        // So the URL check does no DNS lookup.
        web: { fetch: fetchPage, allowPrivateHosts: true },
      }),
    ])
    return { host, session, calls }
  }

  it('asks before webfetch by default', async () => {
    const { host, session } = await fetchOnce()
    await session.send('read the page')
    const [wait] = session.snapshot().pendingWaits
    if (!wait) throw new Error('No approval.')
    expect(wait.message).toContain('Allow webfetch')
    await session.resolve({
      resume: [
        {
          interruptId: wait.waitId,
          status: 'resolved',
          payload: { answer: 'reject' },
        },
      ],
      inputId: 'no',
    })
    expect(await session.settled({ inputId: 'no' })).toMatchObject({
      outcome: 'completed',
    })
    await host.close()
  })

  it('runs webfetch without a question when a user rule allows it', async () => {
    const { host, session, calls } = await fetchOnce([
      { tool: 'webfetch', decision: 'allow' },
    ])
    await session.send('read the page')
    expect(session.snapshot().pendingWaits).toEqual([])
    expect(JSON.stringify(calls[1].messages)).toContain('fetched body')
    await host.close()
  })
})

describe('background bash in a session', () => {
  it('notes the end of a job, and starts a turn for it', async () => {
    const { backend } = memoryBackend({
      spawn: () => ({
        wait: async () => ({ exitCode: 0 }),
        kill: () => undefined,
        output: () => 'built\n',
      }),
    })
    const { adapter, calls } = mockAdapter([
      () => toolCall('bash', { command: 'make', background: true }, 'c1'),
      () => text('started'),
      () => text('saw the note'),
    ])
    const { host, session } = await openSession(adapter, [
      workspaceTools({ root: '/workspace', backend }),
    ])
    await session.send('build')
    await waitFor(() => expect(calls).toHaveLength(3))
    expect(JSON.stringify(calls[2].messages)).toContain(
      'Background job bash-1 ended.\\nexit code: 0\\nbuilt',
    )
    await host.close()
  })

  it('sends the start, the output, and the end of a job as plugin events', async () => {
    const { backend } = memoryBackend({
      spawn: (_command, options) => {
        options?.onOutput?.('built\n')
        return {
          wait: async () => ({ exitCode: 0 }),
          kill: () => undefined,
          output: () => 'built\n',
        }
      },
    })
    const events: Array<unknown> = []
    const listener = definePlugin({
      name: 'test/job-events',
      setup: (ctx) => {
        ctx.on(JobStarted, (value) => events.push(['started', value]))
        ctx.on(JobOutput, (value) => events.push(['output', value]))
        ctx.on(JobEnded, (value) => events.push(['ended', value]))
      },
    })
    const { adapter } = mockAdapter([
      () => toolCall('bash', { command: 'make', background: true }, 'c1'),
      () => text('started'),
    ])
    const { host, session } = await openSession(adapter, [
      workspaceTools({ root: '/workspace', backend }),
      listener,
    ])
    await session.send('build')
    await waitFor(() => expect(events).toHaveLength(3))
    expect(events).toEqual([
      ['started', { jobId: 'bash-1', command: 'make' }],
      ['output', { jobId: 'bash-1', output: 'built\n' }],
      ['ended', { jobId: 'bash-1', exitCode: 0 }],
    ])
    await host.close()
  })

  it('kills a job that still runs when the session closes', async () => {
    let killed = false
    const { backend } = memoryBackend({
      spawn: () => {
        let end: (exitCode: number) => void = () => undefined
        const exited = new Promise<{ exitCode: number }>((done) => {
          end = (exitCode) => done({ exitCode })
        })
        return {
          wait: () => exited,
          kill: () => {
            killed = true
            end(143)
          },
          output: () => '',
        }
      },
    })
    const { adapter } = mockAdapter([
      () => toolCall('bash', { command: 'serve', background: true }, 'c1'),
      () => text('started'),
    ])
    const { host, session } = await openSession(adapter, [
      workspaceTools({ root: '/workspace', backend }),
    ])
    await session.send('serve')
    expect(killed).toBe(false)
    await host.close()
    expect(killed).toBe(true)
  })
})

describe('links on the host', () => {
  let dir = ''
  let root = ''
  let outside = ''
  // A link to a file can need admin rights on Windows. The tests that need
  // one skip without it.
  let hasFileLinks = false
  let tools: Map<string, AnyTool>
  const run = (name: string, args: unknown) => runIn(tools, name, args)
  const put = (path: string, text: string) =>
    hostBackend.writeFile(nodePath.join(dir, path), text)

  beforeAll(async () => {
    dir = await mkdtemp(nodePath.join(tmpdir(), 'harness-links-'))
    root = nodePath.join(dir, 'root')
    outside = nodePath.join(dir, 'outside')
    await put('root/src/a.ts', 'inside\n')
    await put('outside/secret.txt', 'secret\n')
    // A junction on Windows needs no admin rights. Elsewhere it is a link.
    await symlink(outside, nodePath.join(root, 'linked'), 'junction')
    await symlink(
      nodePath.join(root, 'src'),
      nodePath.join(root, 'inner'),
      'junction',
    )
    hasFileLinks = await symlink(
      nodePath.join(outside, 'missing.txt'),
      nodePath.join(root, 'dangling.txt'),
      'file',
    ).then(
      () => true,
      () => false,
    )
    tools = toolsOf({ root, backend: hostBackend })
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('marks links in readdir', async () => {
    const entries = await hostBackend.readdir(root)
    const sorted = entries.sort((a, b) => (a.name < b.name ? -1 : 1))
    expect(sorted.filter((entry) => entry.name !== 'dangling.txt')).toEqual([
      { name: 'inner', type: 'link' },
      { name: 'linked', type: 'link' },
      { name: 'src', type: 'dir' },
    ])
  })

  it('refuses a link inside the workspace that leads out of it', async () => {
    await expect(
      run('read_file', { path: 'linked/secret.txt' }),
    ).rejects.toThrow('outside the workspace')
    await expect(run('list_files', { path: 'linked' })).rejects.toThrow(
      'outside the workspace',
    )
    await expect(
      run('write_file', { path: 'linked/new.txt', content: 'x' }),
    ).rejects.toThrow('outside the workspace')
    expect(await hostBackend.stat(nodePath.join(outside, 'new.txt'))).toBe(
      undefined,
    )
  })

  it('refuses a write through a link to a missing file', async (context) => {
    if (!hasFileLinks) context.skip()
    await expect(
      run('write_file', { path: 'dangling.txt', content: 'x' }),
    ).rejects.toThrow('ENOENT')
    expect(await hostBackend.stat(nodePath.join(outside, 'missing.txt'))).toBe(
      undefined,
    )
  })

  it('allows a link that stays inside the workspace', async () => {
    expect(await run('read_file', { path: 'inner/a.ts' })).toBe('1\tinside')
  })

  it('applies a deny rule for the real path of a link with permissions()', async () => {
    const { adapter, calls } = mockAdapter([
      () => toolCall('read_file', { path: 'inner/a.ts' }, 'c0'),
      () => text('done'),
    ])
    const { host, session } = await openSession(adapter, [
      permissions({
        root,
        rules: [{ tool: 'read_file', resource: 'src/**', decision: 'deny' }],
      }),
      workspaceTools({ root, backend: hostBackend, web: false }),
    ])
    await session.send('read through the link')
    const seen = JSON.stringify(calls[1].messages)
    // The rules see the real path before the call, so it never runs.
    expect(seen).toContain('A permission rule denies this tool.')
    expect(seen).not.toContain('inside')
    await host.close()
  })

  it('tells the rules the real folder of a linked path with outside: ask', async () => {
    const { resources } = createWorkspaceTools(
      { root, backend: hostBackend, outside: 'ask' },
      { access: { mode: () => 'default' } },
    )
    expect(
      await resources.read_file?.outside?.({ path: 'linked/secret.txt' }),
    ).toEqual([nodePath.join(await realpath(outside), 'secret.txt')])
  })
})

describe('bash', () => {
  it('reports the exit code and stderr on the host', async () => {
    // Its own folder: the shared system temp folder churns while the other
    // tests run, and a process that starts there can take seconds.
    const root = await mkdtemp(nodePath.join(tmpdir(), 'harness-bash-host-'))
    try {
      const set = toolsOf({
        root,
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
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('runs the command through the backend, in the workspace folder', async () => {
    const set = toolsOf({
      root: '/harness-bash',
      backend: memoryBackend().backend,
    })
    expect(await runIn(set, 'bash', { command: 'make' })).toBe(
      'exit code: 3\nran make in /harness-bash\nstderr:\nwarn',
    )
  })

  it(
    'stops the commands that a command started when the timeout ends it',
    { timeout: 60_000 },
    async () => {
      const cwd = await mkdtemp(nodePath.join(tmpdir(), 'harness-exec-tree-'))
      try {
        // The shell starts node, then waits for it, so node is a child of
        // the shell. A killed shell alone leaves node running.
        const child = `node -e "require('fs').writeFileSync('child.pid', String(process.pid)); setTimeout(function () {}, 60000)"`
        const result = await hostBackend.exec(`${child} && echo after`, {
          cwd,
          timeoutMs: 3000,
        })
        expect(result.exitCode).toBe(124)
        expect(result.stdout).not.toContain('after')
        const pid = Number(
          await readFile(nodePath.join(cwd, 'child.pid'), 'utf8'),
        )
        await waitFor(() => expect(isRunning(pid)).toBe(false), {
          timeout: 5000,
        })
      } finally {
        await rm(cwd, { recursive: true, force: true, maxRetries: 5 })
      }
    },
  )
})

describe('a network path', () => {
  it('is refused before realpath can connect to its server', async () => {
    const realpath = vi.fn(async (path: string) => path)
    const backend: WorkspaceBackend = {
      shell: 'cmd',
      realpath,
      readFile: async () => new Uint8Array(),
      writeFile: async () => undefined,
      stat: async () => undefined,
      readdir: async () => [],
      exec: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    }
    const tools = toolsOf({ root: 'C:/work', backend })
    await expect(
      runIn(tools, 'read_file', { path: '//attacker/share/a.txt' }),
    ).rejects.toThrow('outside the workspace')
    expect(realpath.mock.calls.flat().join()).not.toContain('attacker')
  })
})

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

describe('a workspace for each thread', () => {
  const encoder = new TextEncoder()

  /**
   * Workspaces in memory at `/ws/<thread>`. Thread `a` has `mine.txt` and a
   * link `peek` to the folder of thread `b`, which has `secret.txt`. `binds`
   * lists the thread of each `bind` call. With `failFirst`, the first bind
   * throws.
   */
  function threadWorkspaces(failFirst = false) {
    const { backend, files } = memoryBackend()
    files.set('/ws/a/mine.txt', encoder.encode('mine'))
    files.set('/ws/b/secret.txt', encoder.encode('hunter2'))
    const real = (path: string) =>
      path.replace(/^\/ws\/a\/peek(?=\/|$)/, '/ws/b')
    const linked: WorkspaceBackend = {
      ...backend,
      realpath: async (path) => real(path),
      readFile: (path) => backend.readFile(real(path)),
    }
    const binds: Array<string> = []
    const workspace: WorkspaceBinder = {
      bind: async ({ run }) => {
        binds.push(run.threadId)
        if (failFirst && binds.length === 1) throw new Error('No sandbox yet.')
        return { ...linked, root: `/ws/${run.threadId}` }
      },
    }
    return { files, workspace, binds }
  }

  /** Open thread `threadId` on `host`, with the tools of `workspace`. */
  function openThread(
    host: ReturnType<typeof createHarnessHost>,
    workspace: WorkspaceBinder,
    adapter: AnyTextAdapter,
    threadId: string,
  ) {
    return host.open(
      defineHarness({
        name: 'test/workspace-bind',
        adapter,
        plugins: () => [workspaceTools({ workspace, web: false })],
      }),
      { threadId },
    )
  }

  it('closes the workspace that bind gave as moved when the session closes, so the thread can reattach it', async () => {
    const { workspace } = threadWorkspaces()
    const closed: Array<string> = []
    const closing: WorkspaceBinder = {
      bind: async (input) => ({
        ...(await workspace.bind(input)),
        close: async ({ reason }) => {
          closed.push(reason)
        },
      }),
    }
    const { adapter } = mockAdapter([
      () => toolCall('read_file', { path: 'mine.txt' }, 'c0'),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await openThread(host, closing, adapter, 'a')
    await session.send('read')
    expect(closed).toEqual([])

    await host.close()

    // A session close does not end the thread: a sandbox stays.
    expect(closed).toEqual(['moved'])
  })

  it('destroys the sandbox of a thread that host.sessions.delete purges, also when no session has the thread open', async () => {
    const { workspace } = threadWorkspaces()
    const closed: Array<string> = []
    const reattached: Array<string> = []
    const sandbox = async (input: Parameters<WorkspaceBinder['bind']>[0]) => ({
      ...(await workspace.bind(input)),
      binding: () => ({
        kind: 'sandbox' as const,
        provider: 'test',
        sandboxId: `sb-${input.run.threadId}`,
      }),
      close: async ({ reason }: { reason: 'closed' | 'moved' }) => {
        closed.push(reason)
      },
    })
    const owned: WorkspaceBinder = {
      bind: sandbox,
      reattach: async ({ run, binding }) => {
        reattached.push(binding.kind === 'sandbox' ? binding.sandboxId : '')
        return sandbox({ run })
      },
    }
    const { adapter } = mockAdapter([
      () => toolCall('read_file', { path: 'mine.txt' }, 'c0'),
      () => text('done'),
    ])
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    const session = await openThread(host, owned, adapter, 'a')
    await session.send('read')
    await session.close()
    await waitFor(() => expect(closed).toEqual(['moved']))

    await host.sessions.delete({ threadId: 'a' })

    // The purge reattached the sandbox from the log, then destroyed it.
    expect(reattached).toEqual(['sb-a'])
    expect(closed).toEqual(['moved', 'closed'])
    await host.close()
  })

  it('destroys the sandbox on a host that never opened the harness, when its harnesses option has it, and warns when not', async () => {
    const { workspace } = threadWorkspaces()
    const closed: Array<string> = []
    const sandbox = async (input: Parameters<WorkspaceBinder['bind']>[0]) => ({
      ...(await workspace.bind(input)),
      binding: () => ({
        kind: 'sandbox' as const,
        provider: 'test',
        sandboxId: `sb-${input.run.threadId}`,
      }),
      close: async ({ reason }: { reason: 'closed' | 'moved' }) => {
        closed.push(`${input.run.threadId}:${reason}`)
      },
    })
    const owned: WorkspaceBinder = {
      bind: sandbox,
      reattach: async ({ run }) => sandbox({ run }),
    }
    const { adapter } = mockAdapter([
      () => toolCall('read_file', { path: 'mine.txt' }, 'c0'),
      () => text('done'),
      () => toolCall('read_file', { path: 'mine.txt' }, 'c1'),
      () => text('done'),
    ])
    const harness = defineHarness({
      name: 'test/workspace-delete',
      adapter,
      plugins: () => [workspaceTools({ workspace: owned, web: false })],
    })
    const persistence = memoryPersistence()
    const first = createHarnessHost({ persistence })
    for (const threadId of ['a', 'b']) {
      const session = await first.open(harness, { threadId })
      await session.send('read')
    }
    await first.close()
    closed.length = 0
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // A new host, after a deploy: it never opened the harness.
    const knows = createHarnessHost({ persistence, harnesses: [harness] })
    await knows.sessions.delete({ threadId: 'a' })
    const blind = createHarnessHost({ persistence })
    await blind.sessions.delete({ threadId: 'b' })

    expect(closed).toEqual(['a:closed'])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('does not know the harness'),
    )
    warn.mockRestore()
    await knows.close()
    await blind.close()
  })

  it('destroys the sandbox of a harness child thread when host.sessions.delete purges its root', async () => {
    const { workspace } = threadWorkspaces()
    const closed: Array<string> = []
    const sandbox = async (input: Parameters<WorkspaceBinder['bind']>[0]) => ({
      ...(await workspace.bind(input)),
      binding: () => ({
        kind: 'sandbox' as const,
        provider: 'test',
        sandboxId: `sb-${input.run.threadId}`,
      }),
      close: async ({ reason }: { reason: 'closed' | 'moved' }) => {
        closed.push(reason)
      },
    })
    const child = defineHarness({
      name: 'test/workspace-child',
      adapter: mockAdapter([
        () => toolCall('read_file', { path: 'mine.txt' }, 'c0'),
        () => text('Child done.'),
      ]).adapter,
      plugins: () => [
        workspaceTools({
          workspace: { bind: sandbox, reattach: ({ run }) => sandbox({ run }) },
          web: false,
        }),
      ],
    })
    const agent = harnessAgent(child)
    const lead = defineHarness({
      name: 'test/workspace-lead',
      adapter: mockAdapter([
        () => toolCall(agent.name, { prompt: 'Read it.' }),
        () => text('Done.'),
      ]).adapter,
      subagents: { agents: [agent] },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(lead, { threadId: 't' })
    await session.send('Go.')
    await waitFor(() => expect(closed).toEqual(['moved']))

    await host.sessions.delete({ threadId: 't' })

    // The child lives in the log of its root: the purge reads it there.
    expect(closed).toEqual(['moved', 'closed'])
    await host.close()
  })

  it('keeps a thread in its root: no path through .. or a link reaches another root', async () => {
    const { workspace } = threadWorkspaces()
    const { adapter, calls } = mockAdapter([
      () => toolCall('read_file', { path: 'mine.txt' }, 'c0'),
      () => toolCall('read_file', { path: '../b/secret.txt' }, 'c1'),
      () => toolCall('read_file', { path: 'peek/secret.txt' }, 'c2'),
      () => toolCall('read_file', { path: '/ws/b/secret.txt' }, 'c3'),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await openThread(host, workspace, adapter, 'a')
    await session.send('read')
    expect(resultOf(calls, 'c0')).toBe('"1\\tmine"')
    for (const id of ['c1', 'c2', 'c3']) {
      expect(resultOf(calls, id)).toContain('outside the workspace')
    }
    expect(JSON.stringify(calls.at(-1)?.messages)).not.toContain('hunter2')
    await host.close()
  })

  it('binds each thread once, names its root in the prompt, and works there', async () => {
    const { files, workspace, binds } = threadWorkspaces()
    const { adapter, calls } = mockAdapter([
      () => toolCall('write_file', { path: 'a.txt', content: 'A' }, 'c0'),
      () => toolCall('write_file', { path: 'a2.txt', content: 'A' }, 'c1'),
      () => text('done'),
      () => toolCall('write_file', { path: 'b.txt', content: 'B' }, 'c2'),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const a = await openThread(host, workspace, adapter, 'a')
    await a.send('write twice')
    expect(JSON.stringify(calls[0].systemPrompts)).toContain(
      'Your workspace is /ws/a.',
    )
    const b = await openThread(host, workspace, adapter, 'b')
    await b.send('write once')
    expect(JSON.stringify(calls[3].systemPrompts)).toContain(
      'Your workspace is /ws/b.',
    )
    expect(binds).toEqual(['a', 'b'])
    expect(files.has('/ws/a/a.txt')).toBe(true)
    expect(files.has('/ws/a/a2.txt')).toBe(true)
    expect(files.has('/ws/b/b.txt')).toBe(true)
    await host.close()
  })

  it('binds again at the tool call when the bind before the turn failed', async () => {
    const { workspace, binds } = threadWorkspaces(true)
    const { adapter, calls } = mockAdapter([
      () => toolCall('read_file', { path: 'mine.txt' }, 'c0'),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await openThread(host, workspace, adapter, 'a')
    await session.send('read')
    expect(binds).toEqual(['a', 'a'])
    expect(resultOf(calls, 'c0')).toBe('"1\\tmine"')
    await host.close()
  })
})

describe('real paths', () => {
  it('writes to the resolved path of a link', async () => {
    const { backend, files } = memoryBackend()
    files.set('/workspace/real.txt', new TextEncoder().encode('real'))
    // `alias.txt` is a link to `real.txt`.
    const linked: WorkspaceBackend = {
      ...backend,
      realpath: async (path) =>
        path === '/workspace/alias.txt' ? '/workspace/real.txt' : path,
    }
    const set = toolsOf({ root: '/workspace', backend: linked })
    expect(
      await runIn(set, 'write_file', { path: 'alias.txt', content: 'new' }),
    ).toBe('Wrote real.txt.')
    expect(decoder.decode(files.get('/workspace/real.txt'))).toBe('new')
    expect(files.has('/workspace/alias.txt')).toBe(false)
  })

  it('refuses a write when a link appears between the check and the write', async () => {
    const { backend, files } = memoryBackend()
    let checks = 0
    // The first check sees a file. Then a link to a folder outside takes
    // its place, before the write.
    const swapping: WorkspaceBackend = {
      ...backend,
      realpath: async (path) => {
        if (path !== '/workspace/swap.txt') return path
        checks += 1
        return checks === 1 ? path : '/elsewhere/swap.txt'
      },
    }
    const set = toolsOf({ root: '/workspace', backend: swapping })
    await expect(
      runIn(set, 'write_file', { path: 'swap.txt', content: 'x' }),
    ).rejects.toThrow('swap.txt changed while the tool ran')
    expect([...files.keys()]).toEqual([])
  })

  it('refuses every path when the backend has no realpath', async () => {
    const { backend } = memoryBackend()
    // A backend from JavaScript, where the type cannot ask for realpath.
    Reflect.deleteProperty(backend, 'realpath')
    const set = toolsOf({ root: '/workspace', backend })
    await expect(runIn(set, 'read_file', { path: 'a.txt' })).rejects.toThrow(
      'The workspace backend has no realpath',
    )
  })

  it('refuses a working folder outside the workspace', async () => {
    const set = toolsOf(
      { root: '/workspace', backend: memoryBackend().backend },
      { mode: () => 'default', cwd: () => '../other' },
    )
    await expect(runIn(set, 'read_file', { path: 'a.txt' })).rejects.toThrow(
      'The working folder ../other is outside the workspace.',
    )
  })
})
