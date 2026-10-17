import { mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as nodePath from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { permissions } from '../src/first-party/permissions'
import { hostBackend } from '../src/first-party/coding/backend'
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
  WorkspaceToolsOptions,
} from '../src/first-party/coding/workspace'

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
      const real = (await backend.realpath?.(docs)) ?? docs
      const input = { path: paths.join(docs, 'a.md') }
      expect(await resources.read_file?.outside?.(input)).toEqual([
        paths.join(real, 'a.md'),
      ])
      expect(await resources.read_file?.outside?.({ path: 'src/a.ts' })).toEqual(
        [],
      )
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
      const shown = folder.split(paths.sep).join('/')
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
  const names = (options: Partial<WorkspaceToolsOptions> = {}) =>
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

describe('permission resources', () => {
  const { resources } = createWorkspaceTools({
    root: '/workspace',
    backend: memoryBackend().backend,
  })

  it('gives each call its paths, from the root', async () => {
    expect(await resources.read_file?.paths?.({ path: 'src/a.ts' })).toEqual([
      '/workspace/src/a.ts',
    ])
    expect(await resources.edit_file?.paths?.({ path: '/etc/hosts' })).toEqual(
      ['/etc/hosts'],
    )
    expect(await resources.write_file?.paths?.({ path: '../x.txt' })).toEqual(
      ['/x.txt'],
    )
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
    expect(session.snapshot().pendingQuestions).toHaveLength(0)
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
      await session.command({ name: 'mode', input: options.mode })
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
    const [wait] = session.snapshot().pendingWaits ?? []
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
    expect(session.snapshot().pendingQuestions).toHaveLength(0)
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
      expect(session.snapshot().pendingQuestions).toHaveLength(0)
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
    const [wait] = session.snapshot().pendingWaits ?? []
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
    expect(session.snapshot().pendingQuestions).toHaveLength(0)
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
    await vi.waitFor(() => expect(calls).toHaveLength(3))
    expect(JSON.stringify(calls[2].messages)).toContain(
      'Background job bash-1 ended.\\nexit code: 0\\nbuilt',
    )
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
        await vi.waitFor(() => expect(isRunning(pid)).toBe(false), {
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
