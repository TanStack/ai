/**
 * SandboxHandle backed by a Cloudflare Sandbox (Containers + Durable Objects),
 * via `@cloudflare/sandbox`. Runs at the edge inside a Worker.
 *
 * fs is implemented over `exec` with base64 piping (binary-safe), matching the
 * Docker provider. The container disk is EPHEMERAL (wiped to the image on
 * restart) and snapshots are not yet GA, so `capabilities.snapshots` and
 * `durableFilesystem` are false — `withSandbox` re-bootstraps under the same
 * identity across cold starts.
 *
 * LIMITATION: Cloudflare background processes do not expose a writable stdin,
 * so `spawn().stdin.write` throws. Harness adapters that feed the prompt via
 * stdin (e.g. the Claude Code adapter) therefore need a stdin-capable provider
 * (local-process / Docker) or a future Cloudflare stdin path. `exec` (one-shot)
 * works fully.
 *
 * NOTE: not runtime-verified in this repo (requires a Workers runtime); it
 * compiles against the real `@cloudflare/sandbox` types and follows the proven
 * provider contract.
 */
import { createExecBackedGit } from '@tanstack/ai-sandbox'
import type { Sandbox } from '@cloudflare/sandbox'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

export const CLOUDFLARE_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  snapshots: false,
  networkPolicy: false,
  durableFilesystem: false,
  fork: false,
}

/** POSIX single-quote escape for embedding paths in `sh -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** A push-driven async string queue used to adapt CF's onOutput callback. */
class OutputQueue {
  private readonly buffer: Array<string> = []
  private readonly waiters: Array<(r: IteratorResult<string>) => void> = []
  private ended = false

  push(value: string): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value, done: false })
    else this.buffer.push(value)
  }

  end(): void {
    this.ended = true
    let waiter = this.waiters.shift()
    while (waiter) {
      waiter({ value: undefined, done: true })
      waiter = this.waiters.shift()
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    while (!this.ended || this.buffer.length > 0) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift() as string
        continue
      }
      const next = await new Promise<IteratorResult<string>>((resolve) =>
        this.waiters.push(resolve),
      )
      if (next.done) return
      yield next.value
    }
  }
}

export class CloudflareHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'cloudflare'
  readonly capabilities = CLOUDFLARE_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: Sandbox
  private readonly workdir: string
  private readonly previewHostname: string | undefined

  constructor(
    id: string,
    sandbox: Sandbox,
    workdir: string,
    previewHostname?: string,
  ) {
    this.id = id
    this.sandbox = sandbox
    this.workdir = workdir
    this.previewHostname = previewHostname

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
      set: (vars) => this.sandbox.setEnvVars(vars),
    }
  }

  private abs(p: string): string {
    if (this.workdir === '/workspace') return p
    if (p === '/workspace') return this.workdir
    if (p.startsWith('/workspace/')) {
      return `${this.workdir}/${p.slice('/workspace/'.length)}`
    }
    return p
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const result = await this.sandbox.exec(command, {
      ...(opts?.cwd ? { cwd: this.abs(opts.cwd) } : { cwd: this.workdir }),
      ...(opts?.env ? { env: opts.env } : {}),
    })
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const stdout = new OutputQueue()
    const stderr = new OutputQueue()
    let resolveExit: (code: number) => void
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = resolve
    })

    const proc = await this.sandbox.startProcess(command, {
      ...(opts?.cwd ? { cwd: this.abs(opts.cwd) } : { cwd: this.workdir }),
      ...(opts?.env ? { env: opts.env } : {}),
      onOutput: (stream, data) => {
        if (stream === 'stdout') stdout.push(data)
        else stderr.push(data)
      },
      onExit: (code) => {
        stdout.end()
        stderr.end()
        resolveExit(code ?? 0)
      },
    })

    return {
      pid: -1,
      stdout,
      stderr,
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'cloudflare: background processes do not expose stdin. Use exec(), or a stdin-capable provider (local-process / docker) for stdin-fed harnesses.',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: () => exitPromise,
      kill: (signal) =>
        proc.kill(typeof signal === 'string' ? signal : undefined),
    }
  }

  private async connectPort(port: number): Promise<SandboxChannel> {
    if (this.previewHostname === undefined) {
      throw new Error(
        'cloudflare: ports.connect requires a previewHostname. Pass previewHostname (your Worker request hostname) to cloudflareSandbox(...).',
      )
    }
    const { url } = await this.sandbox.exposePort(port, {
      hostname: this.previewHostname,
    })
    return { url }
  }

  async destroy(): Promise<void> {
    await this.sandbox.destroy()
  }
}
