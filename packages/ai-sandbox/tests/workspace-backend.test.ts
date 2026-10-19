import { posix } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
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
/** The output that a background job keeps: 1 MiB. */
const MIB = 1024 * 1024

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
  const files = new Map<string, Uint8Array>(
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
  return { fs, files, dirs, links }
}

/** The `awk` program of the page command of `readLines`. */
const PAGE_AWK = `'NR >= e { more = 1; exit } NR >= o { print; n += length($0) + 1; if (n > max) e = NR + 1 } END { if (more) print "more"; else print "total " NR }'`

/** The page command of `readLines` for `name`, from line `first` to `end`. */
const pageCommand = (name: string, first: number, end: number) =>
  `wc -c < '${name}' && od -An -v -tx1 -N 8192 '${name}' && echo @lines && awk -v o=${first} -v e=${end} -v max=65536 ${PAGE_AWK} '${name}'`

/** The page command with any name and range: the name, the first line, the end. */
const PAGE_COMMAND =
  /^wc -c < '(.+)' && od -An -v -tx1 -N 8192 '\1' && echo @lines && awk -v o=(\d+) -v e=(\d+) -v max=65536 '.+' '\1'$/

/**
 * What `wc -c`, `od -An -v -tx1 -N 8192`, `echo @lines`, and the `awk`
 * program print for a file of `data`, for the lines from `first` to before
 * `end`. It does not stop after 64 KiB.
 */
function pageOutput(data: Uint8Array, first: number, end: number) {
  const text = decoder.decode(data)
  const lines = text === '' ? [] : text.split('\n')
  if (text.endsWith('\n')) lines.pop()
  const hex: Array<string> = []
  const head = data.subarray(0, 8192)
  for (let at = 0; at < head.length; at += 16) {
    const row = [...head.subarray(at, at + 16)]
    hex.push(
      row.map((byte) => ` ${byte.toString(16).padStart(2, '0')}`).join(''),
    )
  }
  const page = lines.slice(first - 1, end - 1)
  const status = lines.length >= end ? 'more' : `total ${lines.length}`
  return [`${data.byteLength}`, ...hex, '@lines', ...page, status, ''].join(
    '\n',
  )
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
 * is killed, then ends with 143. `nope` does not start. `flood` prints 1 MiB
 * of `x` before `flood out`.
 *
 * `readlink -- '<name>'` prints the target of the link `name` in the folder,
 * from `links`, like `readlink` in a sandbox. The page command of
 * `readLines` prints what `wc`, `od`, and `awk` print for a file in `files`
 * (see {@link pageOutput}). `commands` lists each command and its folder.
 */
function fakeProcesses(
  links: ReadonlyMap<string, string> = new Map(),
  files: ReadonlyMap<string, Uint8Array> = new Map(),
) {
  const aborted: Array<string> = []
  const killed: Array<string> = []
  const commands: Array<{ command: string; cwd?: string }> = []
  // The pids that run, and the start time that `ps` gives for each.
  const starts = new Map([['7', 'Mon Oct 19 13:00:00 2026']])
  const process: SandboxHandle['process'] = {
    exec: (command, options = {}) => {
      commands.push({ command, cwd: options.cwd })
      const ps = /^LC_ALL=C ps -o lstart= -p (\d+)$/.exec(command)
      if (ps) {
        const start = starts.get(ps[1] ?? '')
        return Promise.resolve(
          start === undefined
            ? { exitCode: 1, stdout: '', stderr: '' }
            : { exitCode: 0, stdout: `${start}\n`, stderr: '' },
        )
      }
      if (/^kill -0 \d+$/.test(command)) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
      }
      if (command.startsWith('kill -9 ')) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
      }
      const page = PAGE_COMMAND.exec(command)
      if (page) {
        const [, quoted = '', first = '', end = ''] = page
        // The shell reads `'\''` in single quotes as one `'`.
        const name = quoted.replaceAll(`'\\''`, `'`)
        const data = files.get(posix.join(options.cwd ?? '/', name))
        return Promise.resolve(
          data === undefined
            ? {
                exitCode: 1,
                stdout: '',
                stderr: `sh: ${name}: No such file or directory`,
              }
            : {
                exitCode: 0,
                stdout: pageOutput(data, Number(first), Number(end)),
                stderr: '',
              },
        )
      }
      const readlink = /^readlink -- '(.+)'$/.exec(command)
      if (readlink) {
        const target = links.get(
          posix.join(options.cwd ?? '/', readlink[1] ?? ''),
        )
        return Promise.resolve(
          target === undefined
            ? { exitCode: 1, stdout: '', stderr: 'not a link' }
            : { exitCode: 0, stdout: `${target}\n`, stderr: '' },
        )
      }
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
        if (command === 'flood') yield 'x'.repeat(MIB)
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
  return { process, aborted, killed, commands, starts }
}

/**
 * A sandbox handle with `memoryFs` and `fakeProcesses`, and its backend.
 * `sandbox.destroyed` tells whether the sandbox was destroyed.
 */
function fakeSandbox(
  seed: FsSeed = {},
  options: {
    withLstat?: boolean
    caps?: SandboxCapabilities
    owned?: boolean
  } = {},
) {
  const { fs, files, dirs, links } = memoryFs(seed, options.withLstat)
  const { process, aborted, killed, commands, starts } = fakeProcesses(
    links,
    files,
  )
  const sandbox = makeFakeHandle('sandbox-1', 'fake', options.caps)
  const handle: SandboxHandle = { ...sandbox, fs, process }
  const backend = sandboxWorkspaceBackend(handle, { owned: options.owned })
  return {
    backend,
    fs,
    files,
    dirs,
    aborted,
    killed,
    commands,
    starts,
    sandbox,
  }
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
  it('uses POSIX paths and quoting', () => {
    const { backend } = fakeSandbox()
    expect(backend.shell).toBe('sh')
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

  it('stat of a link does not read the file, when the sandbox has lstat', async () => {
    const { backend, fs } = fakeSandbox(SEED)
    const readBytes = vi.spyOn(fs, 'readBytes')
    expect(await backend.stat('/workspace/to-file')).toEqual({
      type: 'file',
      size: 5,
      mtimeMs: 0,
    })
    expect(readBytes).not.toHaveBeenCalled()
  })

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

describe('sandboxWorkspaceBackend realpath', () => {
  /** SEED, plus a link out of the workspace, a relative link, and a loop. */
  const LINKS: FsSeed = {
    files: { ...SEED.files, '/home/app/.ssh/id_rsa': 'KEY' },
    dirs: [...(SEED.dirs ?? []), '/home', '/home/app', '/home/app/.ssh'],
    links: {
      ...SEED.links,
      '/workspace/docs': '/home/app',
      '/workspace/src/up': '../a.txt',
      '/workspace/loop-a': 'loop-b',
      '/workspace/loop-b': 'loop-a',
    },
  }

  it.each([
    ['/workspace/a.txt', '/workspace/a.txt'],
    ['/workspace/to-file', '/workspace/a.txt'],
    ['/workspace/to-src', '/workspace/src'],
    ['/workspace/src/up', '/workspace/a.txt'],
    ['/workspace/docs/.ssh/id_rsa', '/home/app/.ssh/id_rsa'],
  ])('resolves %s to %s', async (path, real) => {
    const { backend } = fakeSandbox(LINKS)
    expect(await backend.realpath(path)).toBe(real)
  })

  it('gives undefined when nothing is at the path', async () => {
    const { backend } = fakeSandbox(LINKS)
    expect(await backend.realpath('/workspace/gone')).toBeUndefined()
    expect(await backend.realpath('/workspace/to-src/gone.ts')).toBeUndefined()
  })

  it('throws for a link to a missing target, and for a loop of links', async () => {
    const { backend } = fakeSandbox(LINKS)
    await expect(backend.realpath('/workspace/broken')).rejects.toThrow(
      'ENOENT',
    )
    await expect(backend.realpath('/workspace/loop-a')).rejects.toThrow('ELOOP')
  })

  it('throws when the sandbox has no lstat, so no link goes unchecked', async () => {
    const { backend } = fakeSandbox(LINKS, { withLstat: false })
    await expect(backend.realpath('/workspace/a.txt')).rejects.toThrow(
      'This sandbox has no lstat',
    )
  })
})

describe('sandboxWorkspaceBackend readLines', () => {
  /** A sandbox with `/workspace/notes.txt`, five lines. */
  function notes() {
    const sandbox = fakeSandbox({
      files: { '/workspace/notes.txt': 'one\ntwo\nthree\nfour\nfive\n' },
      dirs: ['/workspace'],
    })
    const readBytes = vi.spyOn(sandbox.fs, 'readBytes')
    return { ...sandbox, readBytes }
  }

  it('reads one page in the sandbox, so the file does not come out whole', async () => {
    const { backend, commands, readBytes } = notes()
    const page = await backend.readLines?.('/workspace/notes.txt', {
      offset: 2,
      limit: 2,
    })
    expect(commands).toEqual([
      { command: pageCommand('./notes.txt', 2, 4), cwd: '/workspace' },
    ])
    expect(page).toEqual({
      head: encoder.encode('one\ntwo\nthree\nfour\nfive\n'),
      size: 24,
      lines: ['two', 'three'],
      total: undefined,
    })
    expect(readBytes).not.toHaveBeenCalled()
  })

  it('counts the lines when the page gets to the end of the file', async () => {
    const { backend } = notes()
    const page = await backend.readLines?.('/workspace/notes.txt', {
      offset: 4,
      limit: 10,
    })
    expect(page).toMatchObject({ lines: ['four', 'five'], total: 5 })
  })

  it('gives one empty line for an empty file, like the host', async () => {
    const { backend } = fakeSandbox({
      files: { '/workspace/empty.txt': '' },
      dirs: ['/workspace'],
    })
    const page = await backend.readLines?.('/workspace/empty.txt', {
      offset: 1,
      limit: 10,
    })
    expect(page).toEqual({
      head: new Uint8Array(),
      size: 0,
      lines: [''],
      total: 1,
    })
  })

  it('throws with the error of the sandbox for a missing file', async () => {
    const { backend } = notes()
    await expect(
      backend.readLines?.('/workspace/gone.txt', { offset: 1, limit: 10 }),
    ).rejects.toThrow(
      'Cannot read /workspace/gone.txt: sh: ./gone.txt: No such file or directory',
    )
  })

  it('quotes a file name with a quote, and keeps a leading - from being an option', async () => {
    const { backend, commands } = fakeSandbox({
      files: { "/workspace/-it's.txt": 'a\n' },
      dirs: ['/workspace'],
    })
    const page = await backend.readLines?.("/workspace/-it's.txt", {
      offset: 1,
      limit: 1,
    })
    expect(commands[0]?.command).toContain(`wc -c < './-it'\\''s.txt'`)
    expect(page).toMatchObject({ lines: ['a'], total: 1 })
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

  it('gives each chunk of the output to onOutput as it comes', async () => {
    const { backend } = fakeSandbox()
    const chunks: Array<string> = []
    const job = backend.spawn?.('build', {
      onOutput: (text) => chunks.push(text),
    })
    await job?.wait()
    // stdout and stderr come at the same time, so their order is not fixed.
    expect(chunks.sort()).toEqual(['build err\n', 'build out\n'])
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

  it('keeps the newest 1 MiB of the output, and tells how much was dropped', async () => {
    const { backend } = fakeSandbox()
    const job = backend.spawn?.('flood')
    await job?.wait()
    // 1 MiB of x, then `flood out\n` and `flood err\n`: 20 bytes too many.
    const marker = '[20 earlier bytes were dropped.]\n'
    const output = job?.output() ?? ''
    expect(output.startsWith(marker)).toBe(true)
    expect(output.length).toBe(marker.length + MIB)
    expect(output.endsWith('xflood err\nflood out\n')).toBe(true)
  })
})

describe('sandboxWorkspaceBackend close', () => {
  it('kills its jobs, and leaves a sandbox that it did not create', async () => {
    const { backend, killed, sandbox } = fakeSandbox()
    const job = backend.spawn?.('serve')
    await backend.close({ reason: 'closed' })
    expect(await job?.wait()).toEqual({ exitCode: 143 })
    expect(killed).toEqual(['serve'])
    expect(sandbox.destroyed).toBe(false)
  })

  it('destroys a sandbox that it owns', async () => {
    const { backend, sandbox } = fakeSandbox({}, { owned: true })
    await backend.close({ reason: 'closed' })
    expect(sandbox.destroyed).toBe(true)
  })

  it('keeps the jobs and an owned sandbox when the session moves', async () => {
    const { backend, killed, sandbox } = fakeSandbox({}, { owned: true })
    backend.spawn?.('serve')
    await backend.close({ reason: 'moved' })
    expect(killed).toEqual([])
    expect(sandbox.destroyed).toBe(false)
  })
})

describe('sandboxWorkspaceBackend on another machine', () => {
  it('gives the provider and the id of the sandbox as its binding', () => {
    const { backend } = fakeSandbox()
    expect(backend.binding()).toEqual({
      kind: 'sandbox',
      provider: 'fake',
      sandboxId: 'sandbox-1',
    })
  })

  it('gives the pid and the start time of a job as its id, and kills only that process', async () => {
    const { backend, commands } = fakeSandbox()
    const job = backend.spawn?.('serve')
    const jobId = await job?.jobId
    expect(jobId).toBe('7:Mon Oct 19 13:00:00 2026')

    // After a restart, another process can have the pid.
    expect(await backend.killJob('7:Sun Oct 18 09:00:00 2026')).toBe(false)
    expect(await backend.killJob(jobId ?? '')).toBe(true)

    const kills = commands
      .map(({ command }) => command)
      .filter((command) => command.startsWith('kill -9'))
    expect(kills).toEqual(['kill -9 -- -7 2>/dev/null || kill -9 7'])
    job?.kill()
  })

  it('rejects for a job that runs when ps gives no start time', async () => {
    const { backend, starts } = fakeSandbox()
    // Like busybox: no `ps -o lstart`, but the process runs.
    starts.clear()
    await expect(backend.killJob('7:Mon Oct 19 13:00:00 2026')).rejects.toThrow(
      'Cannot check that process 7 in the sandbox is the job',
    )
  })

  it('runs no command for a job id that is not a pid', async () => {
    const { backend, commands } = fakeSandbox()
    expect(await backend.killJob('7; rm -rf /')).toBe(false)
    expect(commands).toEqual([])
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
      {
        threadId: 't',
      },
    )
    await session.send('work')
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

  it('refuses a read through a link that leads out of /workspace', async () => {
    const sandbox = fakeSandbox({
      files: { '/home/app/.ssh/id_rsa': 'PRIVATE KEY' },
      dirs: ['/workspace', '/home', '/home/app', '/home/app/.ssh'],
      links: { '/workspace/docs': '/home/app' },
    })
    const { adapter, calls } = scriptedModel([
      toolCall('c1', 'read_file', { path: 'docs/.ssh/id_rsa' }),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/sandbox-links',
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
    await session.send('read the key')
    await host.close()

    const seen = JSON.stringify(calls[1]?.messages)
    expect(seen).toContain('outside the workspace')
    expect(seen).not.toContain('PRIVATE KEY')
  })
})
