/**
 * A SandboxHandle over a Cloudflare container that the app owns
 * (`ctx.container` in its own Durable Object).
 *
 * The app starts, stops and configures the container. This provider only
 * runs commands with `container.exec` and moves files with the `Files` class
 * of `@cloudflare/sandbox` 1.x. It never starts, stops or destroys the
 * container, and it sets no egress, outbound handler, `enableInternet` or
 * `sleepAfter`.
 *
 * The types below are local structural shapes. This file imports no code and
 * no types from `@cloudflare/sandbox`, so it works with the 1.x SDK while the
 * rest of this package stays on 0.12.
 */
import {
  DEFAULT_WORKSPACE_ROOT,
  UnsupportedCapabilityError,
  createExecBackedGit,
  resolveHarnessCwd,
} from '@tanstack/ai-sandbox'
import { OutputQueue } from './handle'
import type {
  SandboxCapabilities,
  SandboxEnv,
  SandboxFs,
  SandboxFsStat,
  SandboxGit,
  SandboxHandle,
  SandboxPorts,
  SandboxProcess,
  SandboxProvider,
  SnapshotRef,
} from '@tanstack/ai-sandbox'

const PROVIDER = 'cloudflare-container'

/* oxlint-disable typescript/method-signature-style -- method syntax keeps the
   real `ctx.container`, `Files` and `DirectoryBackup` assignable to these
   shapes (method parameters are bivariant), also when the SDK has narrower
   option or record types. */

/** The options this provider passes to `container.exec`. */
export interface ContainerExecOptions {
  cwd?: string
  env?: Record<string, string>
  signal?: AbortSignal
  stdin?: 'pipe'
  stdout?: 'pipe'
  stderr?: 'pipe'
}

/** A process that `container.exec` started. */
export interface ContainerProcessLike {
  readonly stdout: ReadableStream<Uint8Array> | null
  readonly stderr: ReadableStream<Uint8Array> | null
  readonly stdin: WritableStream<Uint8Array> | null
  readonly exitCode: Promise<number>
  kill(signal: number): void
  output(): Promise<{
    exitCode: number
    stdout: Uint8Array
    stderr: Uint8Array
  }>
}

/** The `exec` of the Workers Container API (`ctx.container`). */
export interface ContainerLike {
  exec(
    command: Array<string>,
    options?: ContainerExecOptions,
  ): Promise<ContainerProcessLike>
}

/** The options this provider passes to a `Files` call. */
export interface FilesOptionsLike {
  cwd?: string
  signal?: AbortSignal
  recursive?: boolean
  force?: boolean
}

/** The file types that `Files` reports. */
export type FileTypeLike =
  | 'file'
  | 'directory'
  | 'symlink'
  | 'blockDevice'
  | 'characterDevice'
  | 'fifo'
  | 'socket'

/** The `Files` class of `@cloudflare/sandbox` 1.x. */
export interface FilesLike {
  readFile(path: string, options?: FilesOptionsLike): Promise<Response>
  writeFile(
    path: string,
    content: string | Uint8Array,
    options?: FilesOptionsLike,
  ): Promise<void>
  lstat(
    path: string,
    options?: FilesOptionsLike,
  ): Promise<{ type: FileTypeLike; size: bigint; mode: number }>
  readDirectory(
    path: string,
    options?: FilesOptionsLike,
  ): Promise<Array<{ name: string; type: FileTypeLike }>>
  mkdir(path: string, options?: FilesOptionsLike): Promise<void>
  rename(
    source: string,
    destination: string,
    options?: FilesOptionsLike,
  ): Promise<void>
  remove(path: string, options?: FilesOptionsLike): Promise<void>
}

/** The `DirectoryBackupRecord` of `@cloudflare/sandbox` 1.x. */
export interface DirectoryBackupRecordLike {
  readonly id: string
  readonly dir: string
  readonly size: number
  readonly name?: string
  readonly sha256: string
  readonly format: string
}

/** The `DirectoryBackup` class of `@cloudflare/sandbox` 1.x. */
export interface DirectoryBackupLike {
  backup(options: {
    dir: string
    name?: string
    signal?: AbortSignal
  }): Promise<DirectoryBackupRecordLike>
  restore(
    record: DirectoryBackupRecordLike,
    options?: { dir?: string; signal?: AbortSignal },
  ): Promise<void>
}
/* oxlint-enable typescript/method-signature-style */

export interface ContainerSandboxConfig {
  /** The container of your Durable Object (`ctx.container`). Start it before you use the sandbox. */
  container: ContainerLike
  /** A `Files` instance over the same container. */
  files: FilesLike
  /** The workspace directory in the container. Defaults to `/workspace`. */
  workspaceRoot?: string
  /** A `DirectoryBackup`. When set, the handle can take snapshots and the provider can restore them. */
  backup?: DirectoryBackupLike
  /** Runs when a handle or the provider is destroyed. The container itself keeps running. */
  onDestroy?: () => Promise<void>
}

const decoder = new TextDecoder()
const encoder = new TextEncoder()

// ponytail: only these names map to a number; any other name sends SIGTERM.
const SIGNAL_NUMBERS: Partial<Record<NodeJS.Signals, number>> = {
  SIGINT: 2,
  SIGKILL: 9,
  SIGTERM: 15,
}

/** The 1.x SDK checks its options strictly, so leave `signal` out when it is not set. */
function signalOf(options: { signal?: AbortSignal } | undefined) {
  return options?.signal === undefined ? {} : { signal: options.signal }
}

/** True for the `ENOENT` error of `Files`. A structural check, so errors that crossed RPC also match. */
function isMissingPath(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'SandboxFileError' &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

async function lstatOf(
  files: FilesLike,
  path: string,
  options: FilesOptionsLike,
) {
  let stat: Awaited<ReturnType<FilesLike['lstat']>>
  try {
    stat = await files.lstat(path, options)
  } catch (error) {
    if (isMissingPath(error)) return undefined
    throw error
  }
  const { mode } = stat
  switch (stat.type) {
    case 'file':
      return {
        type: 'file',
        mode,
        size: Number(stat.size),
      } satisfies SandboxFsStat
    case 'directory':
      return { type: 'dir', mode } satisfies SandboxFsStat
    case 'symlink':
      return { type: 'symlink', mode } satisfies SandboxFsStat
    case 'blockDevice':
    case 'characterDevice':
    case 'fifo':
    case 'socket':
      return { type: 'other', mode } satisfies SandboxFsStat
  }
}

/** Reads a stream of bytes into a queue of strings, then ends the queue. */
async function drain(
  stream: ReadableStream<Uint8Array> | null,
  queue: OutputQueue,
) {
  try {
    if (stream === null) return
    const streamDecoder = new TextDecoder()
    const reader = stream.getReader()
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      queue.push(streamDecoder.decode(chunk.value, { stream: true }))
    }
    const tail = streamDecoder.decode()
    if (tail !== '') queue.push(tail)
  } finally {
    queue.end()
  }
}

function isBackupRecord(value: unknown): value is DirectoryBackupRecordLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'dir' in value &&
    typeof value.dir === 'string' &&
    'size' in value &&
    typeof value.size === 'number' &&
    'sha256' in value &&
    typeof value.sha256 === 'string' &&
    'format' in value &&
    typeof value.format === 'string' &&
    (!('name' in value) || typeof value.name === 'string')
  )
}

function parseBackupRecord(snapshotId: string) {
  let value: unknown
  try {
    value = JSON.parse(snapshotId)
  } catch {
    value = undefined
  }
  if (!isBackupRecord(value)) {
    throw new Error(
      `${PROVIDER}: the snapshotId is not a DirectoryBackup record. Use the id that handle.snapshot() returned.`,
    )
  }
  return value
}

class ContainerHandle implements SandboxHandle {
  readonly id: string
  readonly provider = PROVIDER
  readonly workspaceRoot: string
  readonly capabilities: SandboxCapabilities
  readonly fs: SandboxFs
  readonly process: SandboxProcess
  readonly git: SandboxGit
  readonly ports: SandboxPorts
  readonly env: SandboxEnv
  readonly snapshot?: (
    label?: string,
    options?: { signal?: AbortSignal },
  ) => Promise<SnapshotRef>

  private readonly config: ContainerSandboxConfig
  private vars: Record<string, string>

  constructor(input: {
    id: string
    workspaceRoot: string
    capabilities: SandboxCapabilities
    config: ContainerSandboxConfig
    env: Record<string, string> | undefined
  }) {
    this.id = input.id
    this.workspaceRoot = input.workspaceRoot
    this.capabilities = input.capabilities
    this.config = input.config
    this.vars = { ...input.env }

    const { container, files, backup } = input.config
    const at = (path: string) => resolveHarnessCwd(this, path)
    const fileOptions = (options?: { signal?: AbortSignal }) => ({
      cwd: this.workspaceRoot,
      ...signalOf(options),
    })

    this.fs = {
      read: async (path, options) => {
        const response = await files.readFile(at(path), fileOptions(options))
        return response.text()
      },
      readBytes: async (path, options) => {
        const response = await files.readFile(at(path), fileOptions(options))
        return new Uint8Array(await response.arrayBuffer())
      },
      write: (path, data, options) =>
        files.writeFile(at(path), data, fileOptions(options)),
      list: async (path, options) => {
        const entries = await files.readDirectory(
          at(path),
          fileOptions(options),
        )
        const parent = path.replace(/\/$/, '')
        return entries.map((entry) => ({
          name: entry.name,
          path: `${parent}/${entry.name}`,
          type: entry.type === 'directory' ? 'dir' : 'file',
        }))
      },
      mkdir: (path, options) =>
        files.mkdir(at(path), { ...fileOptions(options), recursive: true }),
      remove: (path, options) =>
        files.remove(at(path), {
          ...fileOptions(options),
          recursive: true,
          force: true,
        }),
      rename: (from, to, options) =>
        files.rename(at(from), at(to), fileOptions(options)),
      exists: async (path, options) =>
        (await lstatOf(files, at(path), fileOptions(options))) !== undefined,
      lstat: (path, options) => lstatOf(files, at(path), fileOptions(options)),
    }

    const execOptions = (options?: {
      cwd?: string
      env?: Record<string, string>
      signal?: AbortSignal
    }) => {
      const env = { ...this.vars, ...options?.env }
      const hasEnv = Object.keys(env).length > 0
      return {
        cwd: at(options?.cwd ?? this.workspaceRoot),
        ...(hasEnv ? { env } : {}),
        ...signalOf(options),
      }
    }

    this.process = {
      exec: async (command, options) => {
        const child = await container.exec(
          ['sh', '-c', command],
          execOptions(options),
        )
        const result = await child.output()
        return {
          exitCode: result.exitCode,
          stdout: decoder.decode(result.stdout),
          stderr: decoder.decode(result.stderr),
        }
      },
      spawn: async (command, options) => {
        const child = await container.exec(['sh', '-c', command], {
          ...execOptions(options),
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
        })
        // Read both streams all the time, so a full pipe never blocks the process.
        const stdout = new OutputQueue()
        const stderr = new OutputQueue()
        const drained = Promise.all([
          drain(child.stdout, stdout),
          drain(child.stderr, stderr),
        ])
        const stdin = child.stdin?.getWriter()
        return {
          pid: -1,
          stdout,
          stderr,
          stdin: {
            write: (data) =>
              stdin === undefined
                ? Promise.reject(
                    new Error(`${PROVIDER}: the process has no stdin.`),
                  )
                : stdin.write(encoder.encode(data)),
            end: () =>
              stdin === undefined ? Promise.resolve() : stdin.close(),
          },
          wait: async () => {
            const [exitCode] = await Promise.all([child.exitCode, drained])
            return exitCode
          },
          kill: (signal) => {
            const signalNumber =
              typeof signal === 'number'
                ? signal
                : (SIGNAL_NUMBERS[signal ?? 'SIGTERM'] ?? 15)
            try {
              child.kill(signalNumber)
            } catch {
              // The process already exited. The SDK ignores this case too.
            }
            return Promise.resolve()
          },
        }
      },
    }

    this.git = createExecBackedGit(this.process, this.workspaceRoot)

    this.ports = {
      connect: () =>
        Promise.reject(
          new UnsupportedCapabilityError(
            PROVIDER,
            'ports',
            'Route requests to the container from your own Worker.',
          ),
        ),
    }

    this.env = {
      set: (vars) => {
        this.vars = { ...this.vars, ...vars }
        return Promise.resolve()
      },
    }

    if (backup !== undefined) {
      this.snapshot = async (label, options) => {
        const record = await backup.backup({
          dir: this.workspaceRoot,
          ...(label === undefined ? {} : { name: label }),
          ...signalOf(options),
        })
        return { id: JSON.stringify(record), label }
      }
    }
  }

  async destroy() {
    await this.config.onDestroy?.()
  }
}

/**
 * A sandbox provider over a Cloudflare container that your app owns.
 *
 * The app starts and stops the container. The provider runs commands with
 * `container.exec`, moves files with `Files`, and never stops the container.
 * Pass a `DirectoryBackup` as `backup` to turn on `handle.snapshot()` and
 * `provider.restoreSnapshot()`.
 *
 * @param config - `container` (`ctx.container`), `files` (a `Files` over the
 *   same container), and the optional `workspaceRoot`, `backup` and
 *   `onDestroy`.
 *
 * @example
 * ```ts
 * import { DirectoryBackup, Files } from '@cloudflare/sandbox'
 * import { containerSandbox } from '@tanstack/ai-sandbox-cloudflare/container'
 *
 * const container = this.ctx.container
 * if (!container.running) container.start({ enableInternet: false })
 *
 * const provider = containerSandbox({
 *   container,
 *   files: new Files(container),
 *   backup: new DirectoryBackup(container, this.ctx.exports.DirectoryBackupGateway, {
 *     binding: 'BACKUPS',
 *   }),
 * })
 * const handle = await provider.create({ id: 'thread-1' })
 * await handle.process.exec('npm test')
 * ```
 */
export function containerSandbox(config: ContainerSandboxConfig) {
  const { backup } = config
  const workspaceRoot = config.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT
  const capabilities: SandboxCapabilities = {
    fs: true,
    exec: true,
    env: true,
    ports: false,
    backgroundProcesses: true,
    writableStdin: true,
    killableProcesses: true,
    snapshots: backup !== undefined,
    networkPolicy: false,
    durableFilesystem: false,
    fork: false,
  }
  const open = (id: string, env: Record<string, string> | undefined) =>
    new ContainerHandle({ id, workspaceRoot, capabilities, config, env })

  const provider: SandboxProvider = {
    name: PROVIDER,
    capabilities: () => capabilities,
    create: async (input) => {
      await config.files.mkdir(workspaceRoot, {
        recursive: true,
        ...signalOf(input),
      })
      return open(input.id ?? crypto.randomUUID(), input.env)
    },
    resume: (input) => Promise.resolve(open(input.id, undefined)),
    destroy: async () => {
      await config.onDestroy?.()
    },
  }
  if (backup !== undefined) {
    provider.restoreSnapshot = async (input) => {
      const record = parseBackupRecord(input.snapshotId)
      await backup.restore(record, { dir: workspaceRoot, ...signalOf(input) })
      return open(crypto.randomUUID(), input.env)
    }
  }
  return provider
}
