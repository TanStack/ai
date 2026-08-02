/**
 * SandboxHandle backed by a Daytona cloud sandbox (via `@daytona/sdk`). Real
 * isolation: fs/exec/git operate inside the remote sandbox; paths are real
 * sandbox paths (default workdir `/home/daytona/workspace`).
 *
 * fs is implemented over `process.executeCommand` with base64 piping
 * (binary-safe, no extra round trips); the sandbox image must provide `sh`,
 * `base64`, and coreutils (true for the default Daytona images).
 *
 * NOTE: Daytona's `executeCommand` returns a single combined `result` string
 * (stdout+stderr interleaved) plus an `exitCode`; there is no separate stderr
 * channel for blocking exec, so {@link ExecResult.stderr} is always empty for
 * this provider. Background processes (spawn) DO surface stdout/stderr
 * separately via Daytona sessions.
 */
import { randomUUID } from 'node:crypto'
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import type { Sandbox } from '@daytona/sdk'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

export const DAYTONA_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  // Daytona background commands run in a session; there is no host→process
  // stdin stream, so adapters that feed a prompt over stdin must deliver it via
  // a file + shell redirection instead.
  writableStdin: false,
  snapshots: false,
  networkPolicy: false,
  // The sandbox filesystem persists for the sandbox's lifetime (across exec
  // calls and stop/resume) until it is deleted.
  durableFilesystem: true,
  fork: false,
}

/** POSIX single-quote escape for embedding paths in `sh -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

export interface DaytonaHandleDeps {
  /** The live Daytona sandbox object. */
  sandbox: Sandbox
  /** Working directory inside the sandbox (the `/workspace` virtual root maps here). */
  workdir: string
}

export class DaytonaHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'daytona'
  readonly workspaceRoot: string
  readonly capabilities = DAYTONA_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: Sandbox
  private readonly workdir: string
  private readonly envVars: Record<string, string> = {}

  constructor(deps: DaytonaHandleDeps) {
    this.sandbox = deps.sandbox
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.id = deps.sandbox.id

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: async (p) => {
        const r = await this.exec(`base64 ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`read failed: ${r.stdout.trim()}`)
        return Buffer.from(r.stdout, 'base64').toString('utf8')
      },
      readBytes: async (p) => {
        const r = await this.exec(`base64 ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`read failed: ${r.stdout.trim()}`)
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
          throw new Error(`write failed: ${r.stdout.trim()}`)
      },
      list: async (p) => {
        const r = await this.exec(`ls -1Ap ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`list failed: ${r.stdout.trim()}`)
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

  /**
   * Prefix a command with `export`s for the sandbox env vars so they apply to
   * the executed command. Done in-shell rather than via the SDK's env argument
   * to stay independent of `executeCommand`'s positional-argument ordering.
   */
  private withEnv(command: string, extra?: Record<string, string>): string {
    const merged = { ...this.envVars, ...extra }
    const exports = Object.entries(merged)
      .map(([k, v]) => `export ${k}=${q(v)}; `)
      .join('')
    return `${exports}${command}`
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const cwd = opts?.cwd ? this.abs(opts.cwd) : this.workdir
    const response = await this.sandbox.process.executeCommand(
      this.withEnv(command, opts?.env),
      cwd,
    )
    return {
      // Daytona returns a single combined output string; there is no separate
      // stderr channel for blocking exec.
      stdout: response.result,
      stderr: '',
      exitCode: response.exitCode,
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const sessionId = `tanstack-ai-spawn-${randomUUID()}`
    await this.sandbox.process.createSession(sessionId)

    const cwd = opts?.cwd ? this.abs(opts.cwd) : this.workdir
    const wrapped = this.withEnv(`cd ${q(cwd)} && ${command}`, opts?.env)
    const started = await this.sandbox.process.executeSessionCommand(
      sessionId,
      { command: wrapped, runAsync: true },
    )
    const cmdId = started.cmdId
    if (!cmdId) {
      await this.sandbox.process.deleteSession(sessionId).catch(() => {})
      throw new Error('daytona: session command did not return a cmdId')
    }

    const stdoutQ = new AsyncChunkQueue()
    const stderrQ = new AsyncChunkQueue()
    let exitCode = 0

    // `kill()` and the caller's signal both feed this controller; its
    // `signal.aborted` flag stops the poll loop.
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    opts?.signal?.addEventListener('abort', onAbort, { once: true })

    // Poll the session command logs + status. Daytona surfaces cumulative
    // stdout/stderr buffers, so we emit only the newly appended bytes.
    const pump = (async (): Promise<void> => {
      let lastOut = 0
      let lastErr = 0
      const flush = async (): Promise<boolean> => {
        const logs = await this.sandbox.process.getSessionCommandLogs(
          sessionId,
          cmdId,
        )
        const out = logs.stdout ?? ''
        const err = logs.stderr ?? ''
        if (out.length > lastOut) {
          stdoutQ.push(out.slice(lastOut))
          lastOut = out.length
        }
        if (err.length > lastErr) {
          stderrQ.push(err.slice(lastErr))
          lastErr = err.length
        }
        const cmd = await this.sandbox.process.getSessionCommand(
          sessionId,
          cmdId,
        )
        if (cmd.exitCode !== undefined) {
          exitCode = cmd.exitCode
          return true
        }
        return false
      }
      try {
        while (!controller.signal.aborted) {
          if (await flush()) break
          await sleep(400)
        }
        // Final flush to capture any bytes written between the last poll and exit.
        await flush()
      } finally {
        opts?.signal?.removeEventListener('abort', onAbort)
        stdoutQ.end()
        stderrQ.end()
        await this.sandbox.process.deleteSession(sessionId).catch(() => {})
      }
    })()

    return {
      pid: -1, // Daytona session commands do not surface a host-visible pid.
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'daytona: background process stdin is not writable (see capabilities.writableStdin)',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: async () => {
        await pump
        return exitCode
      },
      kill: () => {
        controller.abort()
        return Promise.resolve()
      },
    }
  }

  private async connectPort(port: number): Promise<SandboxChannel> {
    const link = await this.sandbox.getPreviewLink(port)
    if (!link.token) {
      return { url: link.url }
    }

    // Standard preview URLs need `x-daytona-preview-token` on every request —
    // browsers cannot send that when the user clicks a link. Mint a signed URL
    // (token embedded in the hostname) so preview links open without custom headers.
    // Signed and standard tokens are not interchangeable; do not attach the
    // standard token as headers when returning a signed URL.
    const signed = await this.sandbox.getSignedPreviewUrl(port, 3600)
    return { url: signed.url, token: signed.token }
  }

  // Daytona snapshots/fork are not wired through the uniform handle yet.
  snapshot = undefined

  fork = (): Promise<SandboxHandle> => {
    throw new UnsupportedCapabilityError('daytona', 'fork')
  }

  async destroy(): Promise<void> {
    await this.sandbox.delete()
  }
}
