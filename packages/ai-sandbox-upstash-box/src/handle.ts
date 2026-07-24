/**
 * SandboxHandle backed by an Upstash Box cloud sandbox (via `@upstash/box`).
 * Real isolation: fs/exec/git operate inside the remote box. The conventional
 * `/workspace` virtual root maps to Box's session home, `/workspace/home`
 * (`Box.WORKSPACE`).
 *
 * Filesystem read/write/list use Box's native file API; mkdir/remove/rename/
 * exists desugar to `process.exec` (the box image provides `sh` + coreutils).
 *
 * NOTES on parity with the contract:
 * - Box's `exec.command` returns a single combined `result` string plus an
 *   `exitCode`; there is no separate stderr channel, so {@link ExecResult.stderr}
 *   is always empty for this provider.
 * - `exec.command` takes no per-call cwd/env arguments, and the SDK's `cd()` /
 *   `box.cwd` is in-memory client state that resets when a box is re-fetched with
 *   `Box.get()`. So cwd and env are applied by shell-wrapping every command
 *   (`cd <cwd> && export … && <command>`).
 * - Background processes (`process.spawn`) run on Box's `exec.stream`: stdout is
 *   streamed, `wait()` resolves with the exit code. There is no writable stdin
 *   (`capabilities.writableStdin` is false) and no host-visible pid, and `kill()`
 *   only stops consuming the stream (the server-side command keeps running) —
 *   the same shape as the Daytona provider's session-backed spawn.
 */
import { Buffer } from 'node:buffer'
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import type { Box, ExecStreamChunk } from '@upstash/box'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SnapshotRef,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

export const UPSTASH_BOX_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  // spawn() streams a background command via Box's exec.stream.
  backgroundProcesses: true,
  // The streamed command has no host->process stdin; adapters that feed a prompt
  // over stdin must deliver it via a file + shell redirection instead.
  writableStdin: false,
  // Native box.snapshot / Box.fromSnapshot.
  snapshots: true,
  networkPolicy: false,
  // The box filesystem persists across exec calls and pause/resume until deleted.
  durableFilesystem: true,
  fork: false,
}

/** The `/workspace` virtual root maps to Box's session home. */
export const WORKSPACE_ROOT = '/workspace/home'

/** POSIX single-quote escape for embedding a value in a `sh -c` command. */
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

/** Auth to request when minting a public URL for a port (Box's shape). */
export interface PublicUrlAuth {
  bearerToken?: boolean
  basicAuth?: boolean
}

export interface UpstashBoxHandleDeps {
  /** The live Upstash Box object. */
  box: Box
  /** Auth requested for `ports.connect` public URLs. Defaults to none. */
  publicUrlAuth?: PublicUrlAuth
}

export class UpstashBoxHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'upstash-box'
  readonly workspaceRoot = WORKSPACE_ROOT
  readonly capabilities = UPSTASH_BOX_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly box: Box
  private readonly publicUrlAuth?: PublicUrlAuth
  private readonly envVars: Record<string, string> = {}

  constructor(deps: UpstashBoxHandleDeps) {
    this.box = deps.box
    this.publicUrlAuth = deps.publicUrlAuth
    this.id = deps.box.id

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: (p) => this.box.files.read(this.abs(p)),
      readBytes: async (p) => {
        const b64 = await this.box.files.read(this.abs(p), {
          encoding: 'base64',
        })
        return new Uint8Array(Buffer.from(b64, 'base64'))
      },
      write: async (p, data) => {
        const abs = this.abs(p)
        // Box's file API does not guarantee parent-dir creation; ensure it.
        const dir = abs.replace(/\/[^/]*$/, '') || '/'
        const mk = await this.exec(`mkdir -p ${q(dir)}`)
        if (mk.exitCode !== 0)
          throw new Error(`write failed (mkdir): ${mk.stdout.trim()}`)
        if (typeof data === 'string') {
          await this.box.files.write({ path: abs, content: data })
        } else {
          await this.box.files.write({
            path: abs,
            content: Buffer.from(data).toString('base64'),
            encoding: 'base64',
          })
        }
      },
      list: async (p) => {
        const entries = await this.box.files.list(this.abs(p))
        // Return paths in the caller's virtual namespace (/workspace/...),
        // not Box's physical /workspace/home/... paths.
        const base = p.replace(/\/$/, '')
        return entries.map((e) => ({
          name: e.name,
          path: `${base}/${e.name}`,
          type: e.is_dir ? ('dir' as const) : ('file' as const),
        }))
      },
      mkdir: async (p) => {
        const r = await this.exec(`mkdir -p ${q(this.abs(p))}`)
        if (r.exitCode !== 0)
          throw new Error(`mkdir failed: ${r.stdout.trim()}`)
      },
      remove: async (p) => {
        const r = await this.exec(`rm -rf ${q(this.abs(p))}`)
        if (r.exitCode !== 0)
          throw new Error(`remove failed: ${r.stdout.trim()}`)
      },
      rename: async (from, to) => {
        const r = await this.exec(`mv ${q(this.abs(from))} ${q(this.abs(to))}`)
        if (r.exitCode !== 0)
          throw new Error(`rename failed: ${r.stdout.trim()}`)
      },
      exists: async (p) => {
        const r = await this.exec(`test -e ${q(this.abs(p))}`)
        return r.exitCode === 0
      },
    }

    this.git = createExecBackedGit(this.process, this.workspaceRoot)

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

  /** Map the conventional `/workspace` virtual root to the box home. */
  private abs(p: string): string {
    // Already an absolute box-home path — leave untouched.
    if (p === this.workspaceRoot || p.startsWith(`${this.workspaceRoot}/`)) {
      return p
    }
    if (p === '/workspace') return this.workspaceRoot
    if (p.startsWith('/workspace/')) {
      return `${this.workspaceRoot}/${p.slice('/workspace/'.length)}`
    }
    return p
  }

  /**
   * Prefix a command with `export`s for the accumulated env vars (and any
   * per-command overrides) so they apply to the executed command. Applied
   * in-shell because Box's `exec.command` has no env argument.
   */
  private withEnv(command: string, extra?: Record<string, string>): string {
    const merged = { ...this.envVars, ...extra }
    const exports = Object.entries(merged)
      .map(([k, v]) => `export ${k}=${q(v)}; `)
      .join('')
    return `${exports}${command}`
  }

  /**
   * Wrap a command with `cd <cwd>` and env exports. Done in-shell because Box's
   * `exec.command`/`exec.stream` take no cwd/env args and the SDK's cwd resets
   * when a box is re-fetched with `Box.get()`.
   */
  private wrap(command: string, opts?: ProcessOptions): string {
    const cwd = this.abs(opts?.cwd ?? this.workspaceRoot)
    // Env exports go BEFORE `cd` so a failed `cd` (guarded by `&&`) prevents the
    // command from running. Wrapping the exports around `cd … && command` — i.e.
    // `export …; cd … && command` — keeps the command `&&`-gated on cd success;
    // putting exports between `cd &&` and the command would let a `;`-separated
    // command run even when cd failed.
    return this.withEnv(`cd ${q(cwd)} && ${command}`, opts?.env)
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    // The Box SDK can't cancel an in-flight command, so this is a best-effort
    // pre-flight check rather than true mid-flight cancellation.
    opts?.signal?.throwIfAborted()
    const run = await this.box.exec.command(this.wrap(command, opts))
    return {
      // Box returns a single combined output string; there is no separate
      // stderr channel for blocking exec.
      stdout: run.result,
      stderr: '',
      exitCode: run.exitCode ?? 1,
    }
  }

  /**
   * Background process backed by Box's `exec.stream`. stdout is streamed;
   * `wait()` resolves with the exit code. There is no writable stdin and no
   * host-visible pid; `kill()` stops consuming the stream (the server-side
   * command keeps running).
   */
  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    opts?.signal?.throwIfAborted()
    // Awaited so a failed stream start rejects spawn() rather than only
    // surfacing later on wait()/stdout.
    const stream = await this.box.exec.stream(this.wrap(command, opts))

    const stdoutQ = new AsyncChunkQueue()
    // Box's stream merges stderr into stdout; expose an empty, closed stderr.
    const stderrQ = new AsyncChunkQueue()
    let exitCode = 0
    // kill() and the caller's signal both feed this controller; its
    // `signal.aborted` flag stops the consume loop.
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    opts?.signal?.addEventListener('abort', onAbort, { once: true })

    // Resolves as a terminated iterator result the moment the controller aborts,
    // so a killed but silent long-running stream unblocks `wait()` immediately
    // instead of hanging until the next chunk/exit arrives.
    const aborted = new Promise<IteratorResult<ExecStreamChunk>>((resolve) => {
      const done = (): void => resolve({ done: true, value: undefined })
      if (controller.signal.aborted) done()
      else controller.signal.addEventListener('abort', done, { once: true })
    })

    const pump = (async (): Promise<void> => {
      const iterator = stream[Symbol.asyncIterator]()
      try {
        for (;;) {
          const nextResult = iterator.next()
          // Guard against an unhandled rejection if next() loses the race to
          // `aborted` and later rejects; the winning branch still surfaces below.
          nextResult.catch(() => undefined)
          const result = await Promise.race([nextResult, aborted])
          if (result.done) break
          const chunk = result.value
          if (chunk.type === 'output') stdoutQ.push(chunk.data)
          else exitCode = chunk.exitCode
        }
      } finally {
        // Best-effort: close the underlying stream reader on kill/exit.
        await iterator.return?.().catch(() => undefined)
        opts?.signal?.removeEventListener('abort', onAbort)
        stdoutQ.end()
        stderrQ.end()
      }
    })()

    return {
      pid: -1,
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'upstash-box: background process stdin is not writable (see capabilities.writableStdin)',
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
    const link = await this.box.getPublicURL(port, this.publicUrlAuth)
    if (link.token) {
      return {
        url: link.url,
        token: link.token,
        headers: { Authorization: `Bearer ${link.token}` },
      }
    }
    if (link.username && link.password) {
      const basic = Buffer.from(`${link.username}:${link.password}`).toString(
        'base64',
      )
      return { url: link.url, headers: { Authorization: `Basic ${basic}` } }
    }
    return { url: link.url }
  }

  snapshot = async (label?: string): Promise<SnapshotRef> => {
    const name = label ?? `tanstack-ai-${Date.now()}`
    const snap = await this.box.snapshot({ name })
    return { id: snap.id, label: snap.name }
  }

  fork = (): Promise<SandboxHandle> => {
    throw new UnsupportedCapabilityError('upstash-box', 'fork')
  }

  async destroy(): Promise<void> {
    await this.box.delete()
  }
}
