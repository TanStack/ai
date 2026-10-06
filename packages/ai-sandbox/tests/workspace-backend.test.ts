import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { sandboxWorkspaceBackend } from '../src/harness'
import { FULL_CAPS, makeFakeHandle } from './fakes'
import type { AnyTextAdapter, StreamChunk, TextOptions } from '@tanstack/ai'
import type {
  ExecResult,
  SandboxCapabilities,
  SandboxFs,
  SandboxHandle,
} from '../src/contracts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface FsSeed {
  files?: Record<string, string>
  dirs?: Array<string>
  /** A link and its target. */
  links?: Record<string, string>
  /** Paths that are not a file, a folder, or a link, like a fifo. */
  others?: Array<string>
}

/**
 * A sandbox file system in memory, by POSIX path. Like a real sandbox:
 * `readBytes`, `exists`, and `list` follow links, `lstat` does not, `write`
 * makes the parent folders, and `remove` is `rm -rf`. With
 * `withLstat: false`, it has no `lstat`.
 */
function memoryFs(seed: FsSeed, withLstat = true) {
  const files = new Map(
    Object.entries(seed.files ?? {}).map(([path, text]) => [
      path,
      encoder.encode(text),
    ]),
  )
  const dirs = new Set(['/', ...(seed.dirs ?? [])])
  const links = new Map(Object.entries(seed.links ?? {}))
  const others = new Set(seed.others ?? [])
  const target = (path: string) => links.get(path) ?? path
  const parent = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/'
  const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
  const paths = () => [...files.keys(), ...dirs, ...links.keys(), ...others]

  const lstat: SandboxFs['lstat'] = async (path) => {
    const data = files.get(path)
    if (links.has(path)) return { type: 'symlink', mode: 0o120777 }
    if (data) return { type: 'file', mode: 0o100644, size: data.byteLength }
    if (dirs.has(path)) return { type: 'dir', mode: 0o40755 }
    if (others.has(path)) return { type: 'other', mode: 0o10644 }
    return undefined
  }
  const readBytes: SandboxFs['readBytes'] = async (path) => {
    const data = files.get(target(path))
    if (data) return data
    throw new Error(`${dirs.has(target(path)) ? 'EISDIR' : 'ENOENT'}: ${path}`)
  }
  const fs: SandboxFs = {
    read: async (path) => decoder.decode(await readBytes(path)),
    readBytes,
    write: async (path, data) => {
      for (let dir = parent(path); !dirs.has(dir); dir = parent(dir)) {
        dirs.add(dir)
      }
      files.set(path, typeof data === 'string' ? encoder.encode(data) : data)
    },
    list: async (path) => {
      if (!dirs.has(target(path))) throw new Error(`ENOENT: ${path}`)
      const names = paths()
        .filter((each) => each !== '/' && parent(each) === target(path))
        .map(baseName)
        .sort()
      return names.map((name) => {
        const type: 'file' | 'dir' = dirs.has(target(`${path}/${name}`))
          ? 'dir'
          : 'file'
        return { name, path: `${path}/${name}`, type }
      })
    },
    mkdir: async (path) => {
      dirs.add(path)
    },
    remove: async (path) => {
      const gone = paths().filter(
        (each) => each === path || each.startsWith(`${path}/`),
      )
      for (const each of gone) {
        files.delete(each)
        dirs.delete(each)
        links.delete(each)
      }
    },
    rename: () => Promise.reject(new Error('rename is not used')),
    exists: async (path) => files.has(target(path)) || dirs.has(target(path)),
    ...(withLstat ? { lstat } : {}),
  }
  return { fs, files, dirs }
}

async function* fromChunks(chunks: Array<string>) {
  for (const chunk of chunks) yield chunk
}

/**
 * Sandbox processes. `exec` answers like a shell that prints the command,
 * the folder, and `$AGENT`. A `sleep` command never ends, like in a sandbox
 * that cannot stop it, and only notes the abort in `aborted`.
 *
 * `spawn` prints `<command> out` and `<command> err`. `serve` runs until it
 * is killed, then ends with 143. `nope` does not start.
 */
function fakeProcesses() {
  const aborted: Array<string> = []
  const killed: Array<string> = []
  const process: SandboxHandle['process'] = {
    exec: (command, options = {}) => {
      if (command.startsWith('sleep')) {
        options.signal?.addEventListener('abort', () => aborted.push(command))
        return new Promise<ExecResult>(() => {})
      }
      return Promise.resolve({
        exitCode: 3,
        stdout: `ran ${command} in ${options.cwd} with AGENT=${options.env?.AGENT}`,
        stderr: 'warn',
      })
    },
    spawn: async (command) => {
      if (command === 'nope') throw new Error('nope: not found')
      let end = () => {}
      const ended =
        command === 'serve'
          ? new Promise<void>((resolve) => (end = resolve))
          : Promise.resolve()
      async function* stdout() {
        yield `${command} out\n`
        await ended
      }
      return {
        pid: 7,
        stdout: stdout(),
        stderr: fromChunks([`${command} err\n`]),
        stdin: { write: async () => {}, end: async () => {} },
        wait: async () => {
          await ended
          return command === 'serve' ? 143 : 0
        },
        kill: async () => {
          killed.push(command)
          end()
        },
      }
    },
  }
  return { process, aborted, killed }
}

/** A sandbox handle with `memoryFs` and `fakeProcesses`. */
function fakeSandbox(
  seed: FsSeed = {},
  options: { withLstat?: boolean; caps?: SandboxCapabilities } = {},
) {
  const { fs, files, dirs } = memoryFs(seed, options.withLstat)
  const { process, aborted, killed } = fakeProcesses()
  const handle: SandboxHandle = {
    ...makeFakeHandle('sandbox-1', 'fake', options.caps),
    fs,
    process,
  }
  const backend = sandboxWorkspaceBackend(handle)
  return { backend, files, dirs, aborted, killed }
}

const SEED: FsSeed = {
  files: { '/workspace/a.txt': 'hello' },
  dirs: ['/workspace', '/workspace/src'],
  links: {
    '/workspace/to-file': '/workspace/a.txt',
    '/workspace/to-src': '/workspace/src',
    '/workspace/broken': '/workspace/gone',
  },
  others: ['/workspace/pipe'],
}

describe('sandboxWorkspaceBackend files', () => {
  it('uses POSIX paths and quoting, and checks no links', () => {
    const { backend } = fakeSandbox()
    expect(backend.shell).toBe('sh')
    expect(backend).not.toHaveProperty('realpath')
  })

  it('reads and writes the bytes of a file in the sandbox', async () => {
    const { backend, files } = fakeSandbox(SEED)
    expect(decoder.decode(await backend.readFile('/workspace/a.txt'))).toBe(
      'hello',
    )
    await backend.writeFile('/workspace/new/b.txt', 'made')
    await backend.writeFile('/workspace/c.bin', new Uint8Array([1, 2]))
    expect(decoder.decode(files.get('/workspace/new/b.txt'))).toBe('made')
    expect(files.get('/workspace/c.bin')).toEqual(new Uint8Array([1, 2]))
  })

  it.each([
    { withLstat: true, path: '/workspace/a.txt', type: 'file', size: 5 },
    { withLstat: true, path: '/workspace/src', type: 'dir', size: 0 },
    { withLstat: true, path: '/workspace/to-file', type: 'file', size: 5 },
    { withLstat: true, path: '/workspace/to-src', type: 'dir', size: 0 },
    { withLstat: true, path: '/workspace/pipe', type: 'file', size: 0 },
    { withLstat: false, path: '/workspace/a.txt', type: 'file', size: 5 },
    { withLstat: false, path: '/workspace/src', type: 'dir', size: 0 },
    { withLstat: false, path: '/workspace/to-file', type: 'file', size: 5 },
  ])(
    'stat gives a $type of size $size for $path (lstat: $withLstat)',
    async ({ withLstat, path, type, size }) => {
      const { backend } = fakeSandbox(SEED, { withLstat })
      expect(await backend.stat(path)).toEqual({ type, size, mtimeMs: 0 })
    },
  )

  it.each([true, false])(
    'stat gives undefined for a missing path and a broken link (lstat: %s)',
    async (withLstat) => {
      const { backend } = fakeSandbox(SEED, { withLstat })
      expect(await backend.stat('/workspace/gone')).toBeUndefined()
      expect(await backend.stat('/workspace/broken')).toBeUndefined()
    },
  )

  it('lists a folder with links as links when the sandbox has lstat', async () => {
    const { backend } = fakeSandbox(SEED)
    expect(await backend.readdir('/workspace')).toEqual([
      { name: 'a.txt', type: 'file' },
      { name: 'broken', type: 'link' },
      { name: 'pipe', type: 'file' },
      { name: 'src', type: 'dir' },
      { name: 'to-file', type: 'link' },
      { name: 'to-src', type: 'link' },
    ])
  })

  it('lists a link with the type of its target when the sandbox has no lstat', async () => {
    const { backend } = fakeSandbox(SEED, { withLstat: false })
    expect(await backend.readdir('/workspace')).toEqual([
      { name: 'a.txt', type: 'file' },
      { name: 'broken', type: 'file' },
      { name: 'pipe', type: 'file' },
      { name: 'src', type: 'dir' },
      { name: 'to-file', type: 'file' },
      { name: 'to-src', type: 'dir' },
    ])
  })

  it('removes one file, and refuses a folder or a missing file', async () => {
    const { backend, files, dirs } = fakeSandbox({
      files: { '/workspace/a.txt': 'a', '/workspace/src/b.ts': 'b' },
      dirs: ['/workspace', '/workspace/src'],
    })
    await backend.remove('/workspace/a.txt')
    expect(files.has('/workspace/a.txt')).toBe(false)
    await expect(backend.remove('/workspace/src')).rejects.toThrow(
      'Cannot remove /workspace/src: no such file.',
    )
    await expect(backend.remove('/workspace/gone')).rejects.toThrow(
      'Cannot remove /workspace/gone: no such file.',
    )
    expect(dirs.has('/workspace/src')).toBe(true)
    expect(files.has('/workspace/src/b.ts')).toBe(true)
  })
})

describe('sandboxWorkspaceBackend exec', () => {
  it('runs a command in the sandbox with the folder and the env', async () => {
    const { backend } = fakeSandbox()
    expect(
      await backend.exec('ls', { cwd: '/workspace', env: { AGENT: '1' } }),
    ).toEqual({
      exitCode: 3,
      stdout: 'ran ls in /workspace with AGENT=1',
      stderr: 'warn',
    })
  })

  it('stops a command at the timeout with exit code 124', async () => {
    const { backend, aborted } = fakeSandbox()
    expect(await backend.exec('sleep 60', { timeoutMs: 20 })).toEqual({
      exitCode: 124,
      stdout: '',
      stderr: '',
    })
    expect(aborted).toEqual(['sleep 60'])
  })

  it('stops a command with exit code 1 when the signal aborts', async () => {
    const { backend, aborted } = fakeSandbox()
    const controller = new AbortController()
    const result = backend.exec('sleep 60', {
      timeoutMs: 60_000,
      signal: controller.signal,
    })
    controller.abort()
    expect(await result).toEqual({ exitCode: 1, stdout: '', stderr: '' })
    expect(aborted).toEqual(['sleep 60'])
  })
})

describe('sandboxWorkspaceBackend spawn', () => {
  it('gives the exit code and all output of a background command', async () => {
    const { backend } = fakeSandbox()
    const job = backend.spawn?.('build', { cwd: '/workspace' })
    expect(await job?.wait()).toEqual({ exitCode: 0 })
    expect(job?.output()).toBe('build out\nbuild err\n')
  })

  it('kills a background command, also before it started', async () => {
    const { backend, killed } = fakeSandbox()
    const job = backend.spawn?.('serve')
    job?.kill()
    expect(await job?.wait()).toEqual({ exitCode: 143 })
    expect(killed).toEqual(['serve'])
    expect(job?.output()).toBe('serve out\nserve err\n')
  })

  it('gives exit code 1 and the error when the command does not start', async () => {
    const { backend } = fakeSandbox()
    const job = backend.spawn?.('nope')
    expect(await job?.wait()).toEqual({ exitCode: 1 })
    expect(job?.output()).toBe('Error: nope: not found')
  })

  it('has no spawn when the sandbox cannot run background processes', () => {
    const { backend } = fakeSandbox(
      {},
      { caps: { ...FULL_CAPS, backgroundProcesses: false } },
    )
    expect(backend.spawn).toBeUndefined()
  })
})

const now = () => Date.now()

/** The chunks of one model reply: `chunks` in one run. */
function reply(
  finishReason: 'tool_calls' | 'stop',
  chunks: Array<StreamChunk> = [],
) {
  const all: Array<StreamChunk> = [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
    },
    ...chunks,
    {
      type: EventType.RUN_FINISHED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
      metadata: { tanstack: { finishReason } },
    },
  ]
  return all
}

/** The chunks of one model reply that calls `tool` with `args`. */
function toolCall(id: string, tool: string, args: Record<string, unknown>) {
  return reply('tool_calls', [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: id,
      toolCallName: tool,
      timestamp: now(),
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: id,
      delta: JSON.stringify(args),
      timestamp: now(),
    },
    { type: EventType.TOOL_CALL_END, toolCallId: id, timestamp: now() },
  ])
}

/**
 * A model that gives `replies` in order, then ends the turn. `calls` has the
 * options of each call.
 */
function scriptedModel(replies: Array<Array<StreamChunk>>) {
  const calls: Array<TextOptions> = []
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'scripted',
    model: 'scripted',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {},
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) => {
      calls.push(options)
      const chunks = replies[calls.length - 1] ?? reply('stop')
      return (async function* () {
        yield* chunks
      })()
    },
  }
  return { adapter, calls }
}

describe('sandboxWorkspaceBackend with workspaceTools', () => {
  it('writes and reads a file under /workspace, with POSIX paths for the model', async () => {
    const sandbox = fakeSandbox({ dirs: ['/workspace'] })
    const { adapter, calls } = scriptedModel([
      toolCall('c1', 'write_file', {
        path: 'src/a.ts',
        content: 'export const a = 1\n',
      }),
      toolCall('c2', 'read_file', { path: 'src/a.ts' }),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/sandbox-workspace',
        adapter,
        plugins: () => [
          workspaceTools({
            root: '/workspace',
            backend: sandbox.backend,
            web: false,
          }),
        ],
      }),
      { threadId: 't' },
    )
    await session.prompt('work')
    await host.close()

    expect(decoder.decode(sandbox.files.get('/workspace/src/a.ts'))).toBe(
      'export const a = 1\n',
    )
    const results = calls[2]?.messages
      .filter((message) => message.role === 'tool')
      .map((message) => message.content)
    expect(results).toEqual(['Wrote src/a.ts.', '1\texport const a = 1'])
    expect(calls[0]?.systemPrompts).toContainEqual(
      expect.stringContaining('Your workspace is /workspace.'),
    )
  })
})
