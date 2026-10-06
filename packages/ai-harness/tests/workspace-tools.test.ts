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
import type { PermissionRule } from '../src/first-party/permissions'
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
    { threadId: 't' },
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

    /** Tools that ask about outside paths. The user answers from `answers`. */
    function asking(answers: Array<unknown>, mode = 'default') {
      const questions: Array<string> = []
      const set = toolsOf(
        { root, backend, outside: 'ask' },
        {
          ask: async (message) => {
            questions.push(message)
            return answers.shift()
          },
          mode: () => mode,
        },
      )
      return { set, questions }
    }

    it('refuses outside paths without the outside option', async () => {
      await expect(
        run('read_file', { path: paths.join(outside, 'top.md') }),
      ).rejects.toThrow('outside the workspace')
    })

    it('asks once for a folder, then allows it for the session', async () => {
      const { set, questions } = asking([true])
      const docs = paths.join(outside, 'docs')
      expect(
        await runIn(set, 'read_file', { path: paths.join(docs, 'a.md') }),
      ).toBe('1\talpha')
      expect(
        await runIn(set, 'read_file', { path: paths.join(docs, 'b.md') }),
      ).toBe('1\tbeta')
      expect(questions).toHaveLength(1)
      // The question names the real folder: the temp folder can be a link.
      const real = (await backend.realpath?.(docs)) ?? docs
      expect(questions[0]).toContain(`Allow ${real} `)
    })

    it('asks again for another folder, and refuses after a no', async () => {
      const { set, questions } = asking([true, 'n'])
      await runIn(set, 'read_file', {
        path: paths.join(outside, 'docs', 'a.md'),
      })
      await expect(
        runIn(set, 'read_file', { path: paths.join(outside, 'top.md') }),
      ).rejects.toThrow('The user did not allow')
      expect(questions).toHaveLength(2)
    })

    it('asks one question for calls at the same time', async () => {
      const { set, questions } = asking([true])
      await Promise.all([
        runIn(set, 'read_file', { path: paths.join(outside, 'docs', 'a.md') }),
        runIn(set, 'read_file', { path: paths.join(outside, 'docs', 'b.md') }),
      ])
      expect(questions).toHaveLength(1)
    })

    it('lists and searches an allowed outside folder with full paths', async () => {
      const { set } = asking([true])
      const folder = paths.join(outside, 'docs')
      const shown = folder.split(paths.sep).join('/')
      expect(await runIn(set, 'list_files', { path: folder })).toBe(
        `${shown}/a.md\n${shown}/b.md`,
      )
      expect(await runIn(set, 'grep', { pattern: 'beta', path: folder })).toBe(
        `${shown}/b.md:1: beta`,
      )
    })

    it('does not ask in bypass mode', async () => {
      const { set, questions } = asking([], 'bypass')
      expect(
        await runIn(set, 'read_file', { path: paths.join(outside, 'top.md') }),
      ).toBe('1\ttop')
      expect(questions).toHaveLength(0)
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
      await session.prompt('hi')
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

  it('gives each call its paths, from the root', () => {
    expect(resources.read_file?.paths?.({ path: 'src/a.ts' })).toEqual([
      '/workspace/src/a.ts',
    ])
    expect(resources.edit_file?.paths?.({ path: '/etc/hosts' })).toEqual([
      '/etc/hosts',
    ])
    expect(resources.write_file?.paths?.({ path: '../x.txt' })).toEqual([
      '/x.txt',
    ])
    expect(resources.list_files?.paths?.({})).toEqual(['/workspace'])
    expect(resources.grep?.paths?.({ pattern: 'a', path: 'src' })).toEqual([
      '/workspace/src',
    ])
  })

  it('gives every path of a patch, also the target of a move', () => {
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
    expect(resources.patch?.paths?.({ patch })).toEqual([
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

  it('throws, so the call is refused, when the input has no path or patch', () => {
    expect(() => resources.read_file?.paths?.({})).toThrow(
      'Argument "path" must be a string.',
    )
    expect(() => resources.patch?.paths?.({ patch: 'not a patch' })).toThrow(
      'Patch line 1',
    )
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
    await session.prompt('work')
    expect(session.snapshot().pendingQuestions).toHaveLength(0)
    expect([...files.keys()]).toEqual(['/workspace/src/a.ts'])
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
    const turn = session.prompt('read the page')
    await vi.waitFor(() =>
      expect(session.snapshot().pendingQuestions).toHaveLength(1),
    )
    const [question] = session.snapshot().pendingQuestions
    if (!question) throw new Error('No question.')
    expect(question.message).toContain('Allow webfetch')
    await session.answer(question.questionId, { answer: 'reject' })
    await turn
    await host.close()
  })

  it('runs webfetch without a question when a user rule allows it', async () => {
    const { host, session, calls } = await fetchOnce([
      { tool: 'webfetch', decision: 'allow' },
    ])
    await session.prompt('read the page')
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
    await session.prompt('build')
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
    await session.prompt('serve')
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

  it('asks about the real folder of a linked path with outside: ask', async () => {
    const questions: Array<string> = []
    const set = toolsOf(
      { root, backend: hostBackend, outside: 'ask' },
      {
        ask: async (message) => {
          questions.push(message)
          return 'n'
        },
        mode: () => 'default',
      },
    )
    await expect(
      runIn(set, 'read_file', { path: 'linked/secret.txt' }),
    ).rejects.toThrow('The user did not allow')
    expect(questions[0]).toContain(`Allow ${await realpath(outside)} `)
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
