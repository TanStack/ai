/**
 * SandboxHandle backed by a Vercel Sandbox microVM (via `@vercel/sandbox`).
 * Real isolation: fs/exec/git operate inside the remote microVM; paths are real
 * sandbox paths (default workdir `/vercel/sandbox`).
 *
 * Vercel's `runCommand` executes a program directly (no implicit shell), so we
 * run shell command strings as `sh -c "<command>"`. fs is implemented over that
 * exec with base64 piping (binary-safe); the runtime image provides `sh`,
 * `base64`, and coreutils.
 */
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import type { Command, Sandbox } from '@vercel/sandbox'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

export const VERCEL_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  // Vercel detached commands stream logs out but expose no host→process stdin,
  // so adapters that feed a prompt over stdin must use a file + shell redirect.
  writableStdin: false,
  snapshots: false,
  networkPolicy: false,
  // The microVM filesystem persists for the sandbox's lifetime.
  durableFilesystem: true,
  fork: false,
}

/** POSIX single-quote escape for embedding paths in `sh -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * A push-driven async iterable. The streamer pushes decoded chunks and calls
 * `end()` once; consumers `for await` over it and terminate cleanly.
 */
class AsyncChunkQueue implements AsyncIterable<string> {
  private readonly chunks: Array<string> = []
  private readonly waiters: Array<(r: IteratorResult<string>) => void> = []
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

export interface VercelHandleDeps {
  /** The live Vercel sandbox object. */
  sandbox: Sandbox
  /** Working directory inside the sandbox (the `/workspace` virtual root maps here). */
  workdir: string
  /** Ports declared at create time (reachable via `sandbox.domain(port)`). */
  ports: Array<number>
}

export class VercelHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'vercel'
  readonly workspaceRoot: string
  readonly capabilities = VERCEL_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: Sandbox
  private readonly workdir: string
  private readonly exposedPorts: Array<number>
  private readonly envVars: Record<string, string> = {}

  constructor(deps: VercelHandleDeps) {
    this.sandbox = deps.sandbox
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.exposedPorts = deps.ports
    // v2 of `@vercel/sandbox` identifies a sandbox by its `name`; that name is
    // what `Sandbox.get({ name })` reconnects with.
    this.id = deps.sandbox.name

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: async (p) => {
        const r = await this.exec(`base64 ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`read failed: ${r.stderr.trim()}`)
        return Buffer.from(r.stdout, 'base64').toString('utf8')
      },
      readBytes: async (p) => {
        const r = await this.exec(`base64 ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`read failed: ${r.stderr.trim()}`)
        return new Uint8Array(Buffer.from(r.stdout, 'base64'))
      },
      write: async (p, data) => {
        const abs = this.abs(p)
        const b64 = Buffer.from(
          typeof data === 'string' ? Buffer.from(data, 'utf8') : data,
        ).toString('base64')
        const dir = abs.replace(/\/[^/]*$/, '') || '/'
        const r = await this.exec(
          `mkdir -p ${q(dir)} && printf %s ${q(b64)} | base64 -d > ${q(abs)}`,
        )
        if (r.exitCode !== 0)
          throw new Error(`write failed: ${r.stderr.trim()}`)
      },
      list: async (p) => {
        const r = await this.exec(`ls -1Ap ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`list failed: ${r.stderr.trim()}`)
        return r.stdout
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((entry) => {
            const isDir = entry.endsWith('/')
            const name = isDir ? entry.slice(0, -1) : entry
            return {
              name,
              path: `${p.replace(/\/$/, '')}/${name}`,
              type: isDir ? ('dir' as const) : ('file' as const),
            }
          })
      },
      mkdir: async (p) => {
        await this.exec(`mkdir -p ${q(this.abs(p))}`)
      },
      remove: async (p) => {
        await this.exec(`rm -rf ${q(this.abs(p))}`)
      },
      rename: async (from, to) => {
        await this.exec(`mv ${q(this.abs(from))} ${q(this.abs(to))}`)
      },
      exists: async (p) => {
        const r = await this.exec(`test -e ${q(this.abs(p))}`)
        return r.exitCode === 0
      },
    }

    this.git = createExecBackedGit(this.process, this.workdir)

    this.ports = {
      connect: (port) => this.connectPort(port),
    }

    this.env = {
      set: (vars) => {
        Object.assign(this.envVars, vars)
        return Promise.resolve()
      },
    }
  }

  /** Map the conventional `/workspace` virtual root to the sandbox workdir. */
  private abs(p: string): string {
    if (this.workdir === '/workspace') return p
    if (p === '/workspace') return this.workdir
    if (p.startsWith('/workspace/'))
      return `${this.workdir}/${p.slice('/workspace/'.length)}`
    return p
  }

  private mergedEnv(extra?: Record<string, string>): Record<string, string> {
    return { ...this.envVars, ...extra }
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const finished = await this.sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', command],
      cwd: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      env: this.mergedEnv(opts?.env),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    })
    const [stdout, stderr] = await Promise.all([
      finished.output('stdout'),
      finished.output('stderr'),
    ])
    return { stdout, stderr, exitCode: finished.exitCode }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const controller = new AbortController()
    if (opts?.signal) {
      opts.signal.addEventListener('abort', () => controller.abort(), {
        once: true,
      })
    }

    const cmd: Command = await this.sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', command],
      cwd: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      env: this.mergedEnv(opts?.env),
      detached: true,
      signal: controller.signal,
    })

    const stdoutQ = new AsyncChunkQueue()
    const stderrQ = new AsyncChunkQueue()

    // Fan the single interleaved log stream out into stdout/stderr iterables.
    const pump = (async (): Promise<void> => {
      try {
        for await (const log of cmd.logs()) {
          if (log.stream === 'stderr') stderrQ.push(log.data)
          else stdoutQ.push(log.data)
        }
      } catch {
        // Stream torn down (kill/abort) — fall through and close the queues.
      } finally {
        stdoutQ.end()
        stderrQ.end()
      }
    })()

    return {
      pid: -1, // Vercel commands do not surface a host-visible pid.
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'vercel: background process stdin is not writable (see capabilities.writableStdin)',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: async () => {
        const finished = await cmd.wait()
        await pump
        return finished.exitCode
      },
      kill: () => {
        controller.abort()
        return Promise.resolve()
      },
    }
  }

  private connectPort(port: number): Promise<SandboxChannel> {
    if (!this.exposedPorts.includes(port)) {
      return Promise.reject(
        new Error(
          `vercel: port ${port} is not exposed. Pass ports: [${port}] to vercelSandbox() so it can be reached via sandbox.domain().`,
        ),
      )
    }
    return Promise.resolve({ url: this.sandbox.domain(port) })
  }

  // Vercel snapshots/fork are not wired through the uniform handle yet.
  snapshot = undefined

  fork = (): Promise<SandboxHandle> => {
    throw new UnsupportedCapabilityError('vercel', 'fork')
  }

  async destroy(): Promise<void> {
    await this.sandbox.stop()
  }
}
