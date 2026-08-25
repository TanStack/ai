/**
 * SandboxHandle backed by an Upstash Box cloud sandbox (via `@upstash/box`).
 * The `/workspace` virtual root maps to Box's session home, `/workspace/home`.
 *
 * `exec()` is shell-wrapped for cwd/env because `exec.command` takes neither and
 * the SDK's cwd resets on `Box.get()`. `spawn()` runs on `exec.session`, which
 * takes both natively and adds a real pid, stdin, and server-side signals — but
 * owns its process: dropping the connection kills it and it cannot be
 * reattached, so `spawn()` is scoped to this handle, not the box.
 */
import { Buffer } from 'node:buffer'
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import { Box, BoxError } from '@upstash/box'
import type { BoxConfig, ExecSessionHandle } from '@upstash/box'
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
  // spawn() runs the command as a live exec.session.
  backgroundProcesses: true,
  // exec.session carries a real host->process stdin (`write` / `endStdin`).
  writableStdin: true,
  // Measured: the agent signals the process TREE server-side, not a client-side
  // stream abort. See `tests/journal.conformance.test.ts`.
  killableProcesses: true,
  // Native box.snapshot / Box.fromSnapshot.
  snapshots: true,
  // `policy.capabilities.network: 'deny'` maps to Box's deny-all egress policy.
  networkPolicy: true,
  // The box filesystem persists across exec calls and pause/resume until deleted.
  durableFilesystem: true,
  // snapshot() + Box.fromSnapshot(), the same shape as docker's commit + create.
  fork: true,
}

/** The `/workspace` virtual root maps to Box's session home. */
export const WORKSPACE_ROOT = '/workspace/home'

/**
 * A missing path, a missing box, and a deleted box all answer 404. Anything
 * else (401, a transport failure) is a real error and must not be flattened
 * into "absent".
 */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof BoxError && error.statusCode === 404
}

/**
 * Env names reach a shell through `export <key>=...`, so a key carrying `;`
 * would inject commands. Values are quoted; keys cannot be, so they are
 * rejected instead.
 */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertEnvName(key: string): void {
  if (!ENV_NAME.test(key)) {
    throw new Error(
      `upstash-box: invalid environment variable name ${JSON.stringify(key)}`,
    )
  }
}

/** Signals the box agent accepts; anything else is delivered as TERM. */
const BOX_SIGNALS = new Set(['TERM', 'KILL', 'INT', 'HUP'])

const SIGNAL_NUMBERS: Record<number, string> = {
  1: 'HUP',
  2: 'INT',
  9: 'KILL',
  15: 'TERM',
}

/** Map a Node signal name/number onto the box agent's allowlist. */
function toBoxSignal(signal?: NodeJS.Signals | number): string {
  if (signal === undefined) return 'TERM'
  const name =
    typeof signal === 'number'
      ? SIGNAL_NUMBERS[signal]
      : signal.replace(/^SIG/, '')
  return name !== undefined && BOX_SIGNALS.has(name) ? name : 'TERM'
}

/** POSIX single-quote escape for embedding a value in a `sh -c` command. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Per-stream cap for a spawned process, matching other cloud providers. */
const MAX_STREAM_BYTES = 8 * 1024 * 1024

/**
 * A push-driven async iterable: push chunks, `end()` once. Bounded, so a chatty
 * process whose consumer lags cannot grow the buffer without limit.
 */
class AsyncChunkQueue implements AsyncIterable<string> {
  private readonly chunks: Array<string> = []
  private readonly waiters: Array<(r: IteratorResult<string>) => void> = []
  private ended = false
  private bytes = 0
  private truncated = false

  constructor(
    private readonly label: string,
    private readonly onOverflow?: () => void,
  ) {}

  push(chunk: string): void {
    if (chunk === '' || this.ended) return
    this.bytes += Buffer.byteLength(chunk)
    if (this.bytes > MAX_STREAM_BYTES) {
      // Announce the truncation rather than silently dropping output, then stop
      // the process so it isn't left writing into a stream nobody reads.
      this.truncated = true
      this.emit(
        `\n[upstash-box] ${this.label} exceeded ${MAX_STREAM_BYTES} bytes; output truncated\n`,
      )
      this.end()
      this.onOverflow?.()
      return
    }
    this.emit(chunk)
  }

  /** Whether the cap was hit. */
  get overflowed(): boolean {
    return this.truncated
  }

  private emit(chunk: string): void {
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
  /** Config used to mint a new box; required for `fork()`. */
  boxConfig?: BoxConfig
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
  private readonly boxConfig?: BoxConfig
  private readonly envVars: Record<string, string> = {}

  constructor(deps: UpstashBoxHandleDeps) {
    this.box = deps.box
    this.publicUrlAuth = deps.publicUrlAuth
    this.boxConfig = deps.boxConfig
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
        await this.box.files.mkdir(dir, { parents: true })
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
      mkdir: (p) => this.box.files.mkdir(this.abs(p), { parents: true }),
      remove: (p) => this.box.files.remove(this.abs(p), { recursive: true }),
      rename: (from, to) =>
        this.box.files.rename(this.abs(from), this.abs(to)),
      exists: async (p) => {
        try {
          await this.box.files.stat(this.abs(p))
          return true
        } catch (error) {
          if (isNotFoundError(error)) return false
          throw error
        }
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

  /** Accumulated env plus per-command overrides, as Box's `KEY=VALUE` list. */
  private envList(extra?: Record<string, string>): Array<string> {
    return Object.entries({ ...this.envVars, ...extra }).map(([k, v]) => {
      assertEnvName(k)
      return `${k}=${v}`
    })
  }

  /** Prefix a command with `export`s for the accumulated env vars. */
  private withEnv(command: string, extra?: Record<string, string>): string {
    const merged = { ...this.envVars, ...extra }
    const exports = Object.entries(merged)
      .map(([k, v]) => {
        assertEnvName(k)
        return `export ${k}=${q(v)}; `
      })
      .join('')
    return `${exports}${command}`
  }

  /** Wrap a blocking command with `cd <cwd>` and env exports. */
  private wrap(command: string, opts?: ProcessOptions): string {
    const cwd = this.abs(opts?.cwd ?? this.workspaceRoot)
    // Exports go BEFORE `cd` so a failed `cd` still `&&`-gates the command.
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
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.exitCode ?? 1,
    }
  }

  /** Background process backed by a live `exec.session`. */
  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    opts?.signal?.throwIfAborted()

    // Overflow stops the process: a stream nobody can read any more should not
    // keep a billed command running. The queues can overflow while the
    // handshake is still settling, so this reads the session through a holder
    // rather than closing over a binding that is still in its temporal dead
    // zone, which would throw a ReferenceError instead of killing anything.
    const started: { session?: ExecSessionHandle } = {}
    const onOverflow = (): void => {
      started.session?.kill('TERM')
    }
    const stdoutQ = new AsyncChunkQueue('stdout', () => onOverflow())
    const stderrQ = new AsyncChunkQueue('stderr', () => onOverflow())
    // Streaming decoders: a multi-byte char can split across frames.
    const outDecoder = new TextDecoder()
    const errDecoder = new TextDecoder()

    // Awaited so a failed start rejects spawn(), not a later wait().
    const session: ExecSessionHandle = await this.box.exec.session({
      cmd: command,
      cwd: this.abs(opts?.cwd ?? this.workspaceRoot),
      env: this.envList(opts?.env),
      onStdout: (data) =>
        stdoutQ.push(outDecoder.decode(data, { stream: true })),
      onStderr: (data) =>
        stderrQ.push(errDecoder.decode(data, { stream: true })),
    })

    started.session = session
    // A queue can overflow while the handshake is still settling, when
    // `onOverflow` had no session to kill. Re-check now that there is one.
    if (stdoutQ.overflowed || stderrQ.overflowed) session.kill('TERM')

    const onAbort = (): void => session.kill('TERM')
    opts?.signal?.addEventListener('abort', onAbort, { once: true })

    const exit = session.wait().finally(() => {
      opts?.signal?.removeEventListener('abort', onAbort)
      stdoutQ.push(outDecoder.decode())
      stderrQ.push(errDecoder.decode())
      stdoutQ.end()
      stderrQ.end()
    })
    // spawn() is often fire-and-forget, so `exit` may never be observed via
    // wait(). Mark it handled here; wait() still surfaces the rejection.
    exit.catch(() => undefined)

    // The SDK cannot cancel an in-flight handshake, so an abort raised while it
    // was settling is only observable now. Signal the process and reject, as
    // the pre-flight check would have, rather than handing back a handle for an
    // operation the caller already cancelled.
    if (opts?.signal?.aborted === true) {
      onAbort()
      opts.signal.throwIfAborted()
    }

    return {
      pid: session.pid,
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: {
        write: (data) => {
          session.write(data)
          return Promise.resolve()
        },
        end: () => {
          session.endStdin()
          return Promise.resolve()
        },
      },
      wait: () => exit,
      kill: (signal) => {
        session.kill(toBoxSignal(signal))
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

  fork = async (): Promise<SandboxHandle> => {
    if (this.boxConfig === undefined) {
      throw new UnsupportedCapabilityError('upstash-box', 'fork')
    }
    // Box has no native branch, but snapshot + fromSnapshot is the same shape as
    // docker's commit + create-from-image. Costs a full snapshot round trip.
    const snap = await this.box.snapshot({ name: `tanstack-fork-${Date.now()}` })
    const { name: _name, ...config } = this.boxConfig
    try {
      const box = await Box.fromSnapshot(snap.id, config)
      return new UpstashBoxHandle({
        box,
        boxConfig: this.boxConfig,
        ...(this.publicUrlAuth ? { publicUrlAuth: this.publicUrlAuth } : {}),
      })
    } finally {
      // The snapshot is scratch for the copy: the child box exists on its own
      // once fromSnapshot returns, so keeping it would bill snapshot storage
      // that accumulates with every fork, including the failed ones.
      await this.box.deleteSnapshot(snap.id).catch(() => undefined)
    }
  }

  async destroy(): Promise<void> {
    await this.box.delete()
  }
}
