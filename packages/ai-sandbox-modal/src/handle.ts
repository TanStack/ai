import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import { SandboxFilesystemNotFoundError } from 'modal'
import { withCleanupFailure } from './errors'
import type { Sandbox } from 'modal'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxFsStat,
  SandboxHandle,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

export const MODAL_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: true,
  killableProcesses: false,
  snapshots: false,
  networkPolicy: true,
  durableFilesystem: false,
  fork: false,
}

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function toStat(
  info: Awaited<ReturnType<Sandbox['filesystem']['stat']>>,
): SandboxFsStat {
  const type = String(info.type).toLowerCase()
  if (type.includes('directory') || type === 'dir')
    return { type: 'dir', mode: info.mode }
  if (type.includes('symlink') || type === 'link')
    return { type: 'symlink', mode: info.mode }
  if (type.includes('file'))
    return { type: 'file', mode: info.mode, size: info.size }
  return { type: 'other', mode: info.mode }
}

export interface ModalHandleDeps {
  sandbox: Sandbox
  workdir: string
  ports: Array<number>
}

export class ModalHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'modal'
  readonly workspaceRoot: string
  readonly capabilities = MODAL_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: Sandbox
  private readonly workdir: string
  private readonly exposedPorts: Set<number>
  private readonly envVars: Record<string, string> = {}

  constructor(deps: ModalHandleDeps) {
    this.sandbox = deps.sandbox
    this.id = deps.sandbox.sandboxId
    this.workspaceRoot = deps.workdir
    this.workdir = deps.workdir
    this.exposedPorts = new Set(deps.ports)

    this.process = {
      exec: (command, options) => this.exec(command, options),
      spawn: (command, options) => this.spawn(command, options),
    }
    this.env = {
      set: async (vars) => {
        Object.assign(this.envVars, vars)
      },
    }
    this.git = createExecBackedGit(this.process, this.workspaceRoot)
    this.ports = {
      connect: async (port, options) => {
        options?.signal?.throwIfAborted()
        if (!this.exposedPorts.has(port)) {
          throw new Error(
            `modal: port ${port} was not exposed when the sandbox was created`,
          )
        }
        const tunnels = await this.sandbox.tunnels()
        options?.signal?.throwIfAborted()
        const tunnel = tunnels[port]
        if (!tunnel)
          throw new Error(`modal: no tunnel is available for port ${port}`)
        return { url: tunnel.url }
      },
    }
    this.fs = {
      read: async (path, options) => {
        options?.signal?.throwIfAborted()
        return this.sandbox.filesystem.readText(this.abs(path))
      },
      readBytes: async (path, options) => {
        options?.signal?.throwIfAborted()
        return this.sandbox.filesystem.readBytes(this.abs(path))
      },
      write: async (path, data, options) => {
        options?.signal?.throwIfAborted()
        if (typeof data === 'string') {
          await this.sandbox.filesystem.writeText(data, this.abs(path))
        } else {
          await this.sandbox.filesystem.writeBytes(data, this.abs(path))
        }
      },
      list: async (path, options) => {
        options?.signal?.throwIfAborted()
        return (await this.sandbox.filesystem.listFiles(this.abs(path))).map(
          (entry) => ({
            name: entry.name,
            path: entry.path,
            type: String(entry.type).toLowerCase().includes('dir')
              ? ('dir' as const)
              : ('file' as const),
          }),
        )
      },
      mkdir: async (path, options) => {
        options?.signal?.throwIfAborted()
        await this.sandbox.filesystem.makeDirectory(this.abs(path))
      },
      remove: async (path, options) => {
        options?.signal?.throwIfAborted()
        await this.sandbox.filesystem.remove(this.abs(path), {
          recursive: true,
        })
      },
      rename: async (from, to, options) => {
        options?.signal?.throwIfAborted()
        const result = await this.exec(
          `mv -- ${q(this.abs(from))} ${q(this.abs(to))}`,
          options,
        )
        if (result.exitCode !== 0)
          throw new Error(`modal: rename failed: ${result.stderr.trim()}`)
      },
      exists: async (path, options) => {
        options?.signal?.throwIfAborted()
        try {
          await this.sandbox.filesystem.stat(this.abs(path))
          return true
        } catch (error) {
          if (error instanceof SandboxFilesystemNotFoundError) return false
          throw error
        }
      },
      lstat: async (path, options) => {
        options?.signal?.throwIfAborted()
        try {
          return toStat(await this.sandbox.filesystem.stat(this.abs(path)))
        } catch (error) {
          if (error instanceof SandboxFilesystemNotFoundError) return undefined
          throw error
        }
      },
    }
  }

  private abs(path: string): string {
    return path.startsWith('/') ? path : `${this.workdir}/${path}`
  }

  private commandEnv(extra?: Record<string, string>): Record<string, string> {
    return { ...this.envVars, ...extra }
  }

  private async startProcess(command: string, options?: ProcessOptions) {
    let proc: Awaited<ReturnType<Sandbox['exec']>>
    try {
      proc = await this.sandbox.exec(['sh', '-c', command], {
        stdout: 'pipe',
        stderr: 'pipe',
        workdir: options?.cwd ? this.abs(options.cwd) : this.workdir,
        env: this.commandEnv(options?.env),
      })
    } catch (error) {
      if (!options?.signal?.aborted) throw error
      try {
        await this.sandbox.terminate()
      } catch (cleanupError) {
        throw withCleanupFailure(options.signal.reason, cleanupError)
      }
      options.signal.throwIfAborted()
      throw error
    }
    if (options?.signal?.aborted) {
      try {
        await this.sandbox.terminate()
      } catch (cleanupError) {
        throw withCleanupFailure(options.signal.reason, cleanupError)
      }
      options.signal.throwIfAborted()
    }
    return proc
  }

  private async exec(
    command: string,
    options?: ProcessOptions,
  ): Promise<ExecResult> {
    options?.signal?.throwIfAborted()
    const proc = await this.startProcess(command, options)
    const running = Promise.all([
      proc.stdout.readText(),
      proc.stderr.readText(),
      proc.wait(),
    ])
    const [stdout, stderr, exitCode] = await this.withAbort(
      running,
      options?.signal,
    )
    return { stdout, stderr, exitCode }
  }

  private async spawn(
    command: string,
    options?: ProcessOptions,
  ): Promise<SpawnHandle> {
    options?.signal?.throwIfAborted()
    const proc = await this.startProcess(command, options)
    let resolveAbort!: (error: unknown) => void
    const aborted = options?.signal
      ? new Promise<unknown>((resolve) => {
          resolveAbort = resolve
        })
      : undefined
    let abortTask: Promise<void> | undefined
    const abort = (): void => {
      if (abortTask) return
      const reason = options?.signal?.reason ?? new Error('aborted')
      abortTask = this.sandbox.terminate().then(
        () => resolveAbort(reason),
        (cleanupError: unknown) =>
          resolveAbort(withCleanupFailure(reason, cleanupError)),
      )
    }
    options?.signal?.addEventListener('abort', abort, { once: true })
    if (options?.signal?.aborted) {
      abort()
      options.signal.removeEventListener('abort', abort)
      await abortTask
      options.signal.throwIfAborted()
    }
    const waiting = proc.wait()
    const cleanup = (): void =>
      options?.signal?.removeEventListener('abort', abort)
    void waiting.then(cleanup, cleanup)
    const stdin = proc.stdin.getWriter()
    const reader = (stream: ReadableStream<string>): AsyncIterable<string> => ({
      async *[Symbol.asyncIterator]() {
        const streamReader = stream.getReader()
        try {
          while (true) {
            const { done, value } = await streamReader.read()
            if (done) return
            yield value
          }
        } finally {
          streamReader.releaseLock()
        }
      },
    })
    return {
      pid: -1,
      stdout: reader(proc.stdout),
      stderr: reader(proc.stderr),
      stdin: {
        write: (data) => stdin.write(data),
        end: async () => {
          await stdin.close()
          stdin.releaseLock()
        },
      },
      wait: () =>
        aborted
          ? Promise.race([
              waiting,
              aborted.then((error) => Promise.reject(error)),
            ])
          : waiting,
      kill: async () => {
        throw new UnsupportedCapabilityError('modal', 'killableProcesses')
      },
    }
  }

  private async withAbort<T>(
    running: Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!signal) return running
    if (signal.aborted) {
      try {
        await this.sandbox.terminate()
      } catch (cleanupError) {
        throw withCleanupFailure(signal.reason, cleanupError)
      }
      signal.throwIfAborted()
    }
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => {
        const reason = signal.reason ?? new Error('aborted')
        void this.sandbox.terminate().then(
          () => reject(reason),
          (cleanupError: unknown) =>
            reject(withCleanupFailure(reason, cleanupError)),
        )
      }
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
    try {
      return await Promise.race([running, aborted])
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort)
    }
  }

  destroy = async (): Promise<void> => {
    await this.sandbox.terminate()
  }
}
