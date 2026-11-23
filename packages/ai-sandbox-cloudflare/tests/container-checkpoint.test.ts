/**
 * Crash and restore proof for containerSandbox, without the Workers runtime.
 *
 * The fake `ctx.container` runs each command as a real child process, and the
 * fake `Files` works on the real disk. Both use one temp dir as the container
 * disk. A crash deletes that dir. A new temp dir is the new container.
 *
 * How the paths line up: the provider gets `workspaceRoot` = the temp dir.
 * The checkpoint code uses the virtual root `/workspace`. The handle maps
 * `/workspace/...` to `<temp dir>/...` with `resolveHarnessCwd` before it
 * calls `exec` or `Files`. So the fakes get real paths and need no mapping.
 */
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  InMemorySandboxCheckpointStore,
  captureSandboxCheckpoint,
  restoreSandboxCheckpoint,
} from '@tanstack/ai-sandbox'
import { containerSandbox } from '../src/container'
import type { ChildProcess } from 'node:child_process'
import type { Dirent, Stats } from 'node:fs'
import type { Readable } from 'node:stream'
import type { ContainerLike, FilesLike } from '../src/container'

const THREAD_ID = 'thread-1'

/** The error shape of `Files`: name `SandboxFileError` and a code like `ENOENT`. */
class FileError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'SandboxFileError'
    this.code = code
  }
}

/** Runs a `node:fs` call and turns its error into a `Files` error. */
async function fileCall<T>(work: () => Promise<T>) {
  try {
    return await work()
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
    )
      throw new FileError(error.code, error.message)
    throw error
  }
}

function fileType(entry: Stats | Dirent) {
  if (entry.isFile()) return 'file'
  if (entry.isDirectory()) return 'directory'
  if (entry.isSymbolicLink()) return 'symlink'
  if (entry.isFIFO()) return 'fifo'
  if (entry.isSocket()) return 'socket'
  if (entry.isBlockDevice()) return 'blockDevice'
  return 'characterDevice'
}

/** A `Files` over the real disk. The provider sends absolute paths. */
const diskFiles: FilesLike = {
  readFile: (path) =>
    fileCall(async () => new Response(new Uint8Array(await readFile(path)))),
  writeFile: (path, content) => fileCall(() => writeFile(path, content)),
  lstat: (path) =>
    fileCall(async () => {
      const entry = await lstat(path)
      return {
        type: fileType(entry),
        size: BigInt(entry.size),
        mode: entry.mode,
      }
    }),
  readDirectory: (path) =>
    fileCall(async () => {
      const entries = await readdir(path, { withFileTypes: true })
      return entries.map((entry) => ({
        name: entry.name,
        type: fileType(entry),
      }))
    }),
  mkdir: (path, options) =>
    fileCall(async () => {
      await mkdir(path, { recursive: options?.recursive })
    }),
  rename: (source, destination) => fileCall(() => rename(source, destination)),
  remove: (path, options) =>
    fileCall(() =>
      rm(path, { recursive: options?.recursive, force: options?.force }),
    ),
}

/**
 * A web stream over a Node stream. `Readable.toWeb` returns the
 * `node:stream/web` type, which does not match the Workers global
 * `ReadableStream` type that `ContainerLike` uses, so build the global one.
 */
function webReadable(stream: Readable) {
  const chunks = stream[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next()
      if (next.done === true) controller.close()
      else controller.enqueue(new Uint8Array(next.value))
    },
  })
}

async function bytesOf(stream: ReadableStream<Uint8Array> | null) {
  if (stream === null) return new Uint8Array()
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * A `ctx.container` that runs the argv as a real child process, with no
 * extra shell. It keeps each child in `children` so the test can kill it.
 */
function processContainer(children: Set<ChildProcess>): ContainerLike {
  return {
    async exec(argv, options = {}) {
      const [command, ...args] = argv
      if (command === undefined) throw new Error('exec needs a command')
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { PATH: process.env.PATH, ...options.env },
        stdio: [options.stdin === 'pipe' ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        signal: options.signal,
      })
      children.add(child)
      // ponytail: a process that a signal stopped has no exit code; 128 stands in.
      const exitCode = new Promise<number>((resolve) => {
        child.once('close', (code) => resolve(code ?? 128))
      })
      await once(child, 'spawn')
      const stdout = child.stdout === null ? null : webReadable(child.stdout)
      const stderr = child.stderr === null ? null : webReadable(child.stderr)
      return {
        stdout,
        stderr,
        stdin: child.stdin === null ? null : Writable.toWeb(child.stdin),
        exitCode,
        kill: (signal) => {
          child.kill(signal)
        },
        output: async () => {
          const [code, out, err] = await Promise.all([
            exitCode,
            bytesOf(stdout),
            bytesOf(stderr),
          ])
          return { exitCode: code, stdout: out, stderr: err }
        },
      }
    },
  }
}

/** A blob store in memory, with the shape the checkpoint code needs. */
function memoryBlobs() {
  const store = new Map<string, Uint8Array<ArrayBuffer>>()
  return {
    get: (key: string) => {
      const body = store.get(key)
      return Promise.resolve(body === undefined ? null : new Response(body))
    },
    head: (key: string) => Promise.resolve(store.get(key) ?? null),
    put: (key: string, body: Uint8Array) => {
      store.set(key, new Uint8Array(body))
      return Promise.resolve()
    },
  }
}

// The flow needs a POSIX `sh`, `ln -s` and `chmod` with real mode bits.
// CI runs on Linux. On Windows, links and modes do not work this way.
describe.skipIf(process.platform === 'win32')(
  'containerSandbox checkpoint across a container crash',
  () => {
    const dirs: Array<string> = []
    const children = new Set<ChildProcess>()

    afterEach(async () => {
      for (const child of children) child.kill('SIGKILL')
      children.clear()
      await Promise.all(
        dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
      )
      vi.restoreAllMocks()
    })

    /** A new container over a new, empty temp dir, and a new provider and handle. */
    async function newContainer() {
      const root = await mkdtemp(join(tmpdir(), 'container-checkpoint-'))
      dirs.push(root)
      const provider = containerSandbox({
        container: processContainer(children),
        files: diskFiles,
        workspaceRoot: root,
      })
      return { root, handle: await provider.create({}) }
    }

    it('restores files, the +x bit, a link and an empty folder into a new container', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const checkpoints = new InMemorySandboxCheckpointStore()
      const blobs = memoryBlobs()

      // Container A: the run writes its files.
      const a = await newContainer()
      expect(await a.handle.process.exec('echo hi > hello.txt')).toEqual({
        exitCode: 0,
        stdout: '',
        stderr: '',
      })
      await a.handle.fs.mkdir('/workspace/src/deep')
      await a.handle.fs.write('/workspace/src/deep/note.txt', 'nested')
      await a.handle.fs.mkdir('/workspace/bin')
      await a.handle.fs.write('/workspace/bin/run.sh', '#!/bin/sh\necho run\n')
      await a.handle.fs.mkdir('/workspace/empty')
      const setup = await a.handle.process.exec(
        'chmod 755 bin/run.sh && ln -s bin/run.sh latest',
      )
      expect(setup.exitCode).toBe(0)

      // Capture mid-run: a process still runs in container A.
      const running = await a.handle.process.spawn('exec sleep 30')
      await captureSandboxCheckpoint({
        handle: a.handle,
        checkpoints,
        blobs,
        threadId: THREAD_ID,
      })
      await running.kill()
      await running.wait()
      await a.handle.fs.write('/workspace/after.txt', 'after the checkpoint')

      // The crash: container A and its disk are gone.
      await rm(a.root, { recursive: true, force: true })

      // Container B starts empty, with a new provider and handle.
      const b = await newContainer()
      await restoreSandboxCheckpoint({
        handle: b.handle,
        checkpoints,
        blobs,
        threadId: THREAD_ID,
      })

      expect(await readFile(join(b.root, 'hello.txt'), 'utf8')).toBe('hi\n')
      expect(await readFile(join(b.root, 'src/deep/note.txt'), 'utf8')).toBe(
        'nested',
      )
      expect((await stat(join(b.root, 'bin/run.sh'))).mode & 0o777).toBe(0o755)
      expect((await lstat(join(b.root, 'latest'))).isSymbolicLink()).toBe(true)
      expect(await readlink(join(b.root, 'latest'))).toBe('bin/run.sh')
      expect((await stat(join(b.root, 'empty'))).isDirectory()).toBe(true)
      expect(await readdir(join(b.root, 'empty'))).toEqual([])
      await expect(stat(join(b.root, 'after.txt'))).rejects.toMatchObject({
        code: 'ENOENT',
      })
      // The restored link runs the restored +x script in container B.
      expect(await b.handle.process.exec('./latest')).toEqual({
        exitCode: 0,
        stdout: 'run\n',
        stderr: '',
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  },
)
