import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import type { Client } from '@run-cloud/sdk'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SnapshotRef,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

export const RUN_CLOUD_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: false,
  snapshots: true,
  networkPolicy: false,
  durableFilesystem: true,
  fork: false,
}

class AsyncChunkQueue implements AsyncIterable<string> {
  private readonly chunks: Array<string> = []
  private readonly waiters: Array<(result: IteratorResult<string>) => void> = []
  private ended = false

  push(chunk: string): void {
    if (chunk === '') return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: chunk, done: false })
    else this.chunks.push(chunk)
  }

  end(): void {
    this.ended = true
    let waiter = this.waiters.shift()
    while (waiter) {
      waiter({ value: undefined, done: true })
      waiter = this.waiters.shift()
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: () => {
        const chunk = this.chunks.shift()
        if (chunk !== undefined) {
          return Promise.resolve({ value: chunk, done: false })
        }
        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise((resolve) => this.waiters.push(resolve))
      },
    }
  }
}

export interface RunCloudHandleDeps {
  client: Client
  sandboxId: string
  workdir: string
  tunnelTtlSeconds?: number
  env?: Record<string, string>
}

export class RunCloudHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'run-cloud'
  readonly workspaceRoot: string
  readonly capabilities = RUN_CLOUD_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly client: Client
  private readonly workdir: string
  private readonly tunnelTtlSeconds?: number
  private readonly envVars: Record<string, string>

  constructor(deps: RunCloudHandleDeps) {
    this.client = deps.client
    this.id = deps.sandboxId
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.tunnelTtlSeconds = deps.tunnelTtlSeconds
    this.envVars = { ...deps.env }

    this.process = {
      exec: (command, options) => this.exec(command, options),
      spawn: (command, options) => this.spawn(command, options),
    }

    this.fs = {
      read: async (path) =>
        new TextDecoder().decode(
          await this.client.sandboxes.readFile(this.id, this.abs(path)),
        ),
      readBytes: (path) =>
        this.client.sandboxes.readFile(this.id, this.abs(path)),
      write: (path, data) =>
        this.client.sandboxes.writeFile(
          this.id,
          this.abs(path),
          typeof data === 'string' ? new TextEncoder().encode(data) : data,
        ),
      list: async (path) => {
        const result = await this.exec(`ls -1Ap ${quote(this.abs(path))}`)
        if (result.exitCode !== 0)
          throw new Error(`list failed: ${errorText(result)}`)
        const base = path.replace(/\/$/, '')
        return result.stdout
          .split('\n')
          .filter(Boolean)
          .map((entry) => {
            const isDirectory = entry.endsWith('/')
            const name = isDirectory ? entry.slice(0, -1) : entry
            return {
              name,
              path: `${base}/${name}`,
              type: isDirectory ? ('dir' as const) : ('file' as const),
            }
          })
      },
      mkdir: async (path) => {
        const result = await this.exec(`mkdir -p ${quote(this.abs(path))}`)
        if (result.exitCode !== 0)
          throw new Error(`mkdir failed: ${errorText(result)}`)
      },
      remove: async (path) => {
        const result = await this.exec(`rm -rf ${quote(this.abs(path))}`)
        if (result.exitCode !== 0)
          throw new Error(`remove failed: ${errorText(result)}`)
      },
      rename: async (from, to) => {
        const result = await this.exec(
          `mv ${quote(this.abs(from))} ${quote(this.abs(to))}`,
        )
        if (result.exitCode !== 0)
          throw new Error(`rename failed: ${errorText(result)}`)
      },
      exists: async (path) =>
        (await this.exec(`test -e ${quote(this.abs(path))}`)).exitCode === 0,
    }

    this.git = createExecBackedGit(this.process, this.workdir)
    this.ports = { connect: (port) => this.connectPort(port) }
    this.env = {
      set: (values) => {
        Object.assign(this.envVars, values)
        return Promise.resolve()
      },
    }
  }

  private abs(path: string): string {
    if (this.workdir === '/workspace') return path
    if (path === '/workspace') return this.workdir
    if (path.startsWith('/workspace/'))
      return `${this.workdir}/${path.slice('/workspace/'.length)}`
    return path
  }

  private mergedEnv(extra?: Record<string, string>): Record<string, string> {
    return { ...this.envVars, ...extra }
  }

  private async exec(
    command: string,
    options?: ProcessOptions,
  ): Promise<ExecResult> {
    const result = await this.client.sandboxes.exec(this.id, command, {
      cwd: options?.cwd ? this.abs(options.cwd) : this.workdir,
      env: this.mergedEnv(options?.env),
      ...(options?.signal ? { signal: options.signal } : {}),
    })
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    }
  }

  private spawn(
    command: string,
    options?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    if (options?.signal?.aborted) controller.abort()
    else options?.signal?.addEventListener('abort', abort, { once: true })

    const stdout = new AsyncChunkQueue()
    const stderr = new AsyncChunkQueue()
    const stdoutDecoder = new TextDecoder()
    const stderrDecoder = new TextDecoder()
    const process = this.client.sandboxes
      .exec(this.id, command, {
        cwd: options?.cwd ? this.abs(options.cwd) : this.workdir,
        env: this.mergedEnv(options?.env),
        signal: controller.signal,
        onStdout: (chunk) =>
          stdout.push(stdoutDecoder.decode(chunk, { stream: true })),
        onStderr: (chunk) =>
          stderr.push(stderrDecoder.decode(chunk, { stream: true })),
      })
      .finally(() => {
        options?.signal?.removeEventListener('abort', abort)
        stdout.push(stdoutDecoder.decode())
        stderr.push(stderrDecoder.decode())
        stdout.end()
        stderr.end()
      })

    return Promise.resolve({
      pid: -1,
      stdout,
      stderr,
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'run-cloud: background process stdin is not writable (see capabilities.writableStdin)',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: async () => (await process).exitCode,
      kill: () => {
        controller.abort()
        return Promise.resolve()
      },
    })
  }

  private async connectPort(port: number): Promise<SandboxChannel> {
    const tunnel = await this.client.sandboxes.openTunnel(this.id, port, {
      ...(this.tunnelTtlSeconds === undefined
        ? {}
        : { ttlSeconds: this.tunnelTtlSeconds }),
    })
    return { url: tunnel.url }
  }

  async snapshot(label?: string): Promise<SnapshotRef> {
    const snapshot = await this.client.sandboxes.snapshot(this.id, {
      ...(label === undefined ? {} : { label }),
    })
    return {
      id: snapshot.id,
      ...(label === undefined ? {} : { label }),
    }
  }

  fork = (): Promise<SandboxHandle> => {
    throw new UnsupportedCapabilityError('run-cloud', 'fork')
  }

  destroy(): Promise<void> {
    return this.client.sandboxes.destroy(this.id)
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function errorText(result: { stdout: string; stderr: string }): string {
  return result.stderr.trim() || result.stdout.trim() || '(no output)'
}
