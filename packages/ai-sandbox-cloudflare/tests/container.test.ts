/**
 * containerSandbox over fakes of the three boundaries it talks to:
 * `container.exec`, `Files` and `DirectoryBackup`. No Workers runtime.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UnsupportedCapabilityError } from '@tanstack/ai-sandbox'
import { containerSandbox } from '../src/container'
import type {
  ContainerExecOptions,
  ContainerLike,
  ContainerProcessLike,
  DirectoryBackupLike,
  DirectoryBackupRecordLike,
  FileTypeLike,
  FilesLike,
  FilesOptionsLike,
} from '../src/container'

const decoder = new TextDecoder()

class FakeFileError extends Error {
  readonly code: string
  constructor(code: string, path: string) {
    super(`${code}: ${path}`)
    this.name = 'SandboxFileError'
    this.code = code
  }
}

interface FakeEntry {
  type: FileTypeLike
  mode: number
  data: Uint8Array<ArrayBuffer>
}

/** An in-memory `Files`. Paths are absolute. */
class FakeFiles implements FilesLike {
  readonly entries = new Map<string, FakeEntry>()
  readonly failures = new Map<string, string>()

  add(path: string, entry: Partial<FakeEntry>) {
    this.entries.set(path, {
      type: 'file',
      mode: 0o100644,
      data: new Uint8Array(),
      ...entry,
    })
  }

  private get(path: string) {
    const failure = this.failures.get(path)
    if (failure !== undefined) throw new FakeFileError(failure, path)
    const entry = this.entries.get(path)
    if (entry === undefined) throw new FakeFileError('ENOENT', path)
    return entry
  }

  readFile(path: string) {
    return Promise.resolve(new Response(this.get(path).data))
  }

  writeFile(path: string, content: string | Uint8Array) {
    const data =
      typeof content === 'string'
        ? new TextEncoder().encode(content)
        : new Uint8Array(content)
    this.add(path, { data })
    return Promise.resolve()
  }

  lstat(path: string) {
    const entry = this.get(path)
    return Promise.resolve({
      type: entry.type,
      mode: entry.mode,
      size: BigInt(entry.data.byteLength),
    })
  }

  readDirectory(path: string) {
    const prefix = `${path}/`
    const children = [...this.entries]
      .filter(([key]) => key.startsWith(prefix))
      .filter(([key]) => !key.slice(prefix.length).includes('/'))
      .map(([key, entry]) => ({
        name: key.slice(prefix.length),
        type: entry.type,
      }))
    return Promise.resolve(children)
  }

  mkdir(path: string) {
    this.add(path, { type: 'directory', mode: 0o40755 })
    return Promise.resolve()
  }

  rename(source: string, destination: string) {
    this.entries.set(destination, this.get(source))
    this.entries.delete(source)
    return Promise.resolve()
  }

  remove(path: string, options?: FilesOptionsLike) {
    if (options?.force !== true) this.get(path)
    for (const key of [...this.entries.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) this.entries.delete(key)
    }
    return Promise.resolve()
  }
}

interface ExecCall {
  command: Array<string>
  options: ContainerExecOptions | undefined
}

/** A container whose processes print `stdout` and exit with `exitCode`. */
class FakeContainer implements ContainerLike {
  readonly calls: Array<ExecCall> = []
  readonly stdinWrites: Array<string> = []
  readonly kills: Array<number | undefined> = []
  stdout = ''
  stderr = ''
  exitCode = 0

  exec(command: Array<string>, options?: ContainerExecOptions) {
    this.calls.push({ command, options })
    const encoder = new TextEncoder()
    const process: ContainerProcessLike = {
      stdout: new Response(this.stdout).body,
      stderr: new Response(this.stderr).body,
      stdin: new WritableStream<Uint8Array>({
        write: (chunk) => {
          this.stdinWrites.push(decoder.decode(chunk))
        },
      }),
      exitCode: Promise.resolve(this.exitCode),
      kill: (signal) => {
        this.kills.push(signal)
      },
      output: () =>
        Promise.resolve({
          exitCode: this.exitCode,
          stdout: encoder.encode(this.stdout),
          stderr: encoder.encode(this.stderr),
        }),
    }
    return Promise.resolve(process)
  }
}

const RECORD: DirectoryBackupRecordLike = {
  id: '6f1c1d5e-backup',
  dir: '/workspace',
  size: 42,
  name: 'before-tests',
  sha256: 'abc123',
  format: 'tar+zstd/1',
}

class FakeBackup implements DirectoryBackupLike {
  readonly backups: Array<{ dir: string; name?: string }> = []
  readonly restores: Array<{
    record: DirectoryBackupRecordLike
    dir: string | undefined
  }> = []

  backup(options: { dir: string; name?: string }) {
    this.backups.push({ dir: options.dir, name: options.name })
    return Promise.resolve(RECORD)
  }

  restore(record: DirectoryBackupRecordLike, options?: { dir?: string }) {
    this.restores.push({ record, dir: options?.dir })
    return Promise.resolve()
  }
}

function setup(
  options: {
    backup?: FakeBackup
    workspaceRoot?: string
    onDestroy?: () => Promise<void>
  } = {},
) {
  const container = new FakeContainer()
  const files = new FakeFiles()
  const provider = containerSandbox({ container, files, ...options })
  return { container, files, provider }
}

async function collect(stream: AsyncIterable<string>) {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('containerSandbox process', () => {
  it('runs exec as sh -c in the workspace with the merged env', async () => {
    const { container, provider } = setup()
    const handle = await provider.create({ id: 'thread-1', env: { A: '1' } })
    await handle.env.set({ B: '2' })
    container.stdout = 'hello\n'
    container.stderr = 'warn\n'
    container.exitCode = 3

    const result = await handle.process.exec('echo hello', {
      env: { B: 'call', C: '3' },
    })

    expect(result).toEqual({ stdout: 'hello\n', stderr: 'warn\n', exitCode: 3 })
    expect(container.calls).toEqual([
      {
        command: ['sh', '-c', 'echo hello'],
        options: { cwd: '/workspace', env: { A: '1', B: 'call', C: '3' } },
      },
    ])
  })

  it('maps a /workspace cwd onto a custom workspace root', async () => {
    const { container, provider } = setup({ workspaceRoot: '/app' })
    const handle = await provider.create({})

    await handle.process.exec('ls', { cwd: '/workspace/src' })

    expect(container.calls[0]?.options).toEqual({ cwd: '/app/src' })
  })

  it('streams spawn output, writes stdin and kills with a signal number', async () => {
    const { container, provider } = setup()
    const handle = await provider.create({})
    container.stdout = 'line 1\nline 2\n'
    container.exitCode = 7

    const child = await handle.process.spawn('cat')
    await child.stdin.write('prompt')
    await child.kill('SIGKILL')

    expect(await collect(child.stdout)).toBe('line 1\nline 2\n')
    expect(await child.wait()).toBe(7)
    expect(container.stdinWrites).toEqual(['prompt'])
    expect(container.kills).toEqual([9])
  })
})

describe('containerSandbox fs', () => {
  it('round-trips text and bytes through Files', async () => {
    const { provider } = setup()
    const handle = await provider.create({})

    await handle.fs.write('/workspace/a.txt', 'hi')
    await handle.fs.write('/workspace/b.bin', new Uint8Array([0, 255, 7]))

    expect(await handle.fs.read('/workspace/a.txt')).toBe('hi')
    expect(await handle.fs.readBytes('/workspace/b.bin')).toEqual(
      new Uint8Array([0, 255, 7]),
    )
  })

  it('lists entries as dir or file', async () => {
    const { files, provider } = setup()
    const handle = await provider.create({})
    files.add('/workspace/src', { type: 'directory', mode: 0o40755 })
    files.add('/workspace/src/index.ts', {})
    files.add('/workspace/link', { type: 'symlink', mode: 0o120777 })

    expect(await handle.fs.list('/workspace')).toEqual([
      { name: 'src', path: '/workspace/src', type: 'dir' },
      { name: 'link', path: '/workspace/link', type: 'file' },
    ])
  })

  it('returns the full mode bits from lstat', async () => {
    const { files, provider } = setup()
    const handle = await provider.create({})
    files.add('/workspace/run.sh', {
      mode: 0o100755,
      data: new TextEncoder().encode('#!/'),
    })
    files.add('/workspace/link', { type: 'symlink', mode: 0o120777 })

    expect(await handle.fs.lstat?.('/workspace/run.sh')).toEqual({
      type: 'file',
      mode: 0o100755,
      size: 3,
    })
    expect(await handle.fs.lstat?.('/workspace/link')).toEqual({
      type: 'symlink',
      mode: 0o120777,
    })
  })

  it('reports a missing path as undefined and false', async () => {
    const { provider } = setup()
    const handle = await provider.create({})

    expect(await handle.fs.lstat?.('/workspace/nope')).toBeUndefined()
    expect(await handle.fs.exists('/workspace/nope')).toBe(false)
  })

  it('rejects lstat on a failure that is not ENOENT', async () => {
    const { files, provider } = setup()
    const handle = await provider.create({})
    files.failures.set('/workspace/secret', 'EACCES')

    await expect(handle.fs.lstat?.('/workspace/secret')).rejects.toThrow(
      'EACCES: /workspace/secret',
    )
  })

  it('renames and removes', async () => {
    const { provider } = setup()
    const handle = await provider.create({})
    await handle.fs.mkdir('/workspace/dir')
    await handle.fs.write('/workspace/dir/a.txt', 'a')

    await handle.fs.rename('/workspace/dir/a.txt', '/workspace/b.txt')
    await handle.fs.remove('/workspace/dir')

    expect(await handle.fs.exists('/workspace/dir')).toBe(false)
    expect(await handle.fs.read('/workspace/b.txt')).toBe('a')
  })
})

describe('containerSandbox lifecycle', () => {
  it('creates the workspace root and keeps the given id', async () => {
    const { files, provider } = setup()

    const handle = await provider.create({ id: 'thread-9' })

    expect(handle.id).toBe('thread-9')
    expect(files.entries.get('/workspace')?.type).toBe('directory')
  })

  it('rejects ports.connect as unsupported', async () => {
    const { provider } = setup()
    const handle = await provider.create({})

    await expect(handle.ports.connect(3000)).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    )
    expect(handle.capabilities.ports).toBe(false)
  })

  it('destroy calls onDestroy and never runs anything in the container', async () => {
    const onDestroy = vi.fn(() => Promise.resolve())
    const { container, provider } = setup({ onDestroy })
    const handle = await provider.create({ id: 'thread-1' })

    await handle.destroy()
    await provider.destroy({ id: 'thread-1' })

    expect(onDestroy).toHaveBeenCalledTimes(2)
    expect(container.calls).toEqual([])
  })
})

describe('containerSandbox snapshots', () => {
  it('has no snapshots without a backup', async () => {
    const { provider } = setup()
    const handle = await provider.create({})

    expect(provider.capabilities().snapshots).toBe(false)
    expect(handle.snapshot).toBeUndefined()
    expect(provider.restoreSnapshot).toBeUndefined()
  })

  it('backs up the workspace and restores the record', async () => {
    const backup = new FakeBackup()
    const { provider } = setup({ backup })
    const handle = await provider.create({})

    const ref = await handle.snapshot?.('before-tests')
    const restored = await provider.restoreSnapshot?.({
      snapshotId: ref?.id ?? '',
    })

    expect(provider.capabilities().snapshots).toBe(true)
    expect(backup.backups).toEqual([
      { dir: '/workspace', name: 'before-tests' },
    ])
    expect(ref?.label).toBe('before-tests')
    expect(backup.restores).toEqual([{ record: RECORD, dir: '/workspace' }])
    expect(restored?.workspaceRoot).toBe('/workspace')
  })

  it('rejects a snapshotId that is not a backup record', async () => {
    const backup = new FakeBackup()
    const { provider } = setup({ backup })

    for (const snapshotId of ['not json', '{"id":"x"}']) {
      await expect(provider.restoreSnapshot?.({ snapshotId })).rejects.toThrow(
        'the snapshotId is not a DirectoryBackup record',
      )
    }
    expect(backup.restores).toEqual([])
  })
})

it('never calls fetch', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  const { container, provider } = setup({ backup: new FakeBackup() })
  container.stdout = 'ok'

  const handle = await provider.create({ env: { A: '1' } })
  await handle.process.exec('true')
  const child = await handle.process.spawn('true')
  await child.wait()
  await handle.fs.write('/workspace/a.txt', 'a')
  await handle.fs.read('/workspace/a.txt')
  await handle.fs.lstat?.('/workspace/a.txt')
  const ref = await handle.snapshot?.()
  await provider.restoreSnapshot?.({ snapshotId: ref?.id ?? '' })
  await handle.destroy()

  expect(fetchSpy).not.toHaveBeenCalled()
})
