/**
 * SandboxHandle backed by an E2B cloud sandbox (via the `e2b` SDK). Real
 * isolation: fs/exec/git operate inside the remote Firecracker microVM; paths
 * are real sandbox paths (default workdir `/home/user/workspace`).
 *
 * fs uses the native E2B filesystem API. Blocking exec and spawn both go
 * through `commands.run` with `background: true`, so every command has a real
 * sandbox pid and `cwd`/`env` are passed natively (never as `export K=V;`
 * prefixes in the command string). stdout and stderr arrive on separate
 * streams. envd's own `kill()` is a SIGKILL to that one pid and a backgrounded
 * child survived it (measured), so every command runs as a `setsid` process
 * group leader and `kill()` signals the group; `tests/journal.conformance.test.ts`
 * keeps that claim falsifiable.
 */
import { Buffer } from 'node:buffer'
import { createExecBackedGit } from '@tanstack/ai-sandbox'
import { CommandExitError } from 'e2b'
import type { CommandHandle, Sandbox } from 'e2b'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxFsStat,
  SandboxHandle,
  SnapshotRef,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

export const E2B_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: true,
  // MEASURED against a real E2B sandbox. envd's own kill is a SIGKILL to the
  // shell pid and a backgrounded `( … ) & wait` child kept ticking through it;
  // every command therefore runs as a `setsid` group leader and `kill()`
  // signals the group (`kill -KILL -- -<pid>`), after which the ticker stopped.
  // The journal conformance suite re-measures this whenever `E2B_API_KEY` is
  // present.
  killableProcesses: true,
  snapshots: true,
  networkPolicy: true,
  // The sandbox filesystem persists across exec calls and pause/resume until
  // the sandbox is killed or its timeout elapses.
  durableFilesystem: true,
  fork: true,
}

/** Default working directory. `/workspace` is not writable by the sandbox user. */
export const DEFAULT_WORKDIR = '/home/user/workspace'

/**
 * Request header that authenticates HTTP traffic to a sandbox port when the
 * sandbox was created with `network.allowPublicTraffic: false`.
 */
export const TRAFFIC_TOKEN_HEADER = 'e2b-traffic-access-token'

/**
 * `0` disables the SDK's per-command deadline (its default is 60s, far too
 * short for `setup` steps such as `pnpm install`). The sandbox timeout still
 * bounds the whole run.
 */
const NO_COMMAND_TIMEOUT_MS = 0

/** Byte cap per spawned stream; exceeding it truncates and kills the process. */
const MAX_STREAM_BYTES = 8 * 1024 * 1024

/** POSIX single-quote escape for embedding paths in `sh -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Run `command` as the leader of its own process group so a kill can reach
 * every descendant. `setsid` (util-linux) ships in the default E2B template;
 * an image without it fails loudly (exit 127) instead of silently losing the
 * advertised `killableProcesses`.
 */
export function groupLeaderCommand(command: string): string {
  return `exec setsid bash -c ${q(command)}`
}

const LSTAT_MISSING = '__TANSTACK_LSTAT_MISSING__'

/** Verify a missing path by listing parent entries. `test -e` also fails for inaccessible parents. */
function lstatCommand(path: string): string {
  return `tanstack_lstat_path=${q(path)}; tanstack_lstat_output=$(stat -c '%f:%s' -- "$tanstack_lstat_path" 2>&1); tanstack_lstat_status=$?; if [ "$tanstack_lstat_status" -eq 0 ]; then printf '%s\n' "$tanstack_lstat_output"; else tanstack_lstat_missing() { tanstack_missing_path=$1; case "$tanstack_missing_path" in /|.) return 1 ;; */*) tanstack_parent=${'$'}{tanstack_missing_path%/*}; tanstack_name=${'$'}{tanstack_missing_path##*/}; [ -n "$tanstack_parent" ] || tanstack_parent=/ ;; *) tanstack_parent=.; tanstack_name=$tanstack_missing_path ;; esac; tanstack_parent_mode=$(stat -L -c '%f' -- "$tanstack_parent" 2>/dev/null); tanstack_parent_status=$?; if [ "$tanstack_parent_status" -ne 0 ]; then tanstack_lstat_missing "$tanstack_parent"; else case "$tanstack_parent_mode" in 4[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) case "$tanstack_parent" in /*) tanstack_find_parent=$tanstack_parent ;; *) tanstack_find_parent=./$tanstack_parent ;; esac; tanstack_match=$(find -H "$tanstack_find_parent" -mindepth 1 -maxdepth 1 -exec sh -c 'tanstack_target=$1; shift; for tanstack_candidate do [ "${'$'}{tanstack_candidate##*/}" = "$tanstack_target" ] && { printf 1; exit 0; }; done; exit 0' sh "$tanstack_name" '{}' + 2>/dev/null); tanstack_find_status=$?; [ "$tanstack_find_status" -eq 0 ] && [ -z "$tanstack_match" ] ;; *) return 1 ;; esac; fi; }; if tanstack_lstat_missing "$tanstack_lstat_path"; then printf '%s' '${LSTAT_MISSING}'; else printf '%s\n' "$tanstack_lstat_output" >&2; exit "$tanstack_lstat_status"; fi; fi`
}

function parseLstatOutput(output: string): SandboxFsStat {
  const fields = /^(?<mode>[0-9a-fA-F]{4}):(?<size>\d+)\n?$/.exec(output)
  const mode = fields?.groups?.mode
  const size = fields?.groups?.size
  if (!mode || !size) throw new Error(`invalid lstat output: ${output}`)
  const parsedMode = Number.parseInt(mode, 16)
  const parsedSize = Number(size)
  if (
    !Number.isSafeInteger(parsedMode) ||
    !Number.isSafeInteger(parsedSize) ||
    parsedSize < 0
  )
    throw new Error(`invalid lstat output: ${output}`)
  const type = parsedMode & 0xf000
  if (type === 0x8000)
    return { type: 'file', mode: parsedMode, size: parsedSize }
  if (type === 0x4000) return { type: 'dir', mode: parsedMode }
  if (type === 0xa000) return { type: 'symlink', mode: parsedMode }
  return { type: 'other', mode: parsedMode }
}

/**
 * E2B snapshot names are template names: keep them lower-case, `[a-z0-9-]`, and
 * unique per sandbox. Reusing a name assigns a new build to the SAME template,
 * so two sandboxes labelled `after-setup` must not share one.
 */
export function snapshotName(
  sandboxId: string,
  label: string | undefined,
): string {
  const safe = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  const suffix = safe(label ?? 'snap') || 'snap'
  // Truncate the id, never the label: the label is what keeps two snapshots
  // of one sandbox apart.
  const room = 63 - 'tanstack-ai-'.length - 1 - suffix.length
  return `tanstack-ai-${safe(sandboxId).slice(0, Math.max(room, 1))}-${suffix}`
}

/**
 * A push-driven async iterable with a byte cap. The streamer pushes decoded
 * chunks and calls `end()` once; consumers `for await` over it.
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
      this.truncated = true
      this.emit(
        `\n[e2b] ${this.label} exceeded ${MAX_STREAM_BYTES} bytes; output truncated\n`,
      )
      this.end()
      this.onOverflow?.()
      return
    }
    this.emit(chunk)
  }

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

export interface E2BHandleDeps {
  /** The live E2B sandbox object. */
  sandbox: Sandbox
  /** Working directory inside the sandbox (the `/workspace` virtual root maps here). */
  workdir: string
  /**
   * Sandbox timeout in milliseconds, forwarded to forks so a branched sandbox
   * gets the same lifetime as its parent.
   */
  timeoutMs?: number
}

export class E2BHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'e2b'
  readonly workspaceRoot: string
  readonly capabilities = E2B_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: Sandbox
  private readonly workdir: string
  private readonly timeoutMs: number | undefined
  private readonly envVars: Record<string, string> = {}

  constructor(deps: E2BHandleDeps) {
    this.sandbox = deps.sandbox
    this.workdir = deps.workdir
    this.timeoutMs = deps.timeoutMs
    this.workspaceRoot = deps.workdir
    this.id = deps.sandbox.sandboxId

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: (p) => this.sandbox.files.read(this.abs(p), { format: 'text' }),
      readBytes: (p) =>
        this.sandbox.files.read(this.abs(p), { format: 'bytes' }),
      write: async (p, data) => {
        const abs = this.abs(p)
        // envd creates missing parents on write; a Blob carries bytes verbatim.
        if (typeof data === 'string') {
          await this.sandbox.files.write(abs, data)
        } else {
          // `Blob` wants an ArrayBuffer-backed view; a caller's Uint8Array may
          // sit on a SharedArrayBuffer, so copy into a fresh one.
          const bytes = new Uint8Array(data.byteLength)
          bytes.set(data)
          await this.sandbox.files.write(abs, new Blob([bytes]))
        }
      },
      list: async (p) => {
        const entries = await this.sandbox.files.list(this.abs(p))
        const base = p.replace(/\/$/, '')
        return entries.map((entry) => ({
          name: entry.name,
          path: `${base}/${entry.name}`,
          type: entry.type === 'dir' ? ('dir' as const) : ('file' as const),
        }))
      },
      lstat: (p) => this.lstat(this.abs(p)),
      mkdir: async (p) => {
        // Resolves false when the directory already exists; both are success.
        await this.sandbox.files.makeDir(this.abs(p))
      },
      remove: (p) => this.sandbox.files.remove(this.abs(p)),
      rename: async (from, to) => {
        await this.sandbox.files.rename(this.abs(from), this.abs(to))
      },
      exists: (p) => this.sandbox.files.exists(this.abs(p)),
    }

    this.git = createExecBackedGit(this.process, this.workspaceRoot)

    this.ports = {
      connect: (port) => Promise.resolve(this.connectPort(port)),
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

  private async lstat(path: string): Promise<SandboxFsStat | undefined> {
    const r = await this.exec(lstatCommand(path))
    if (r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING) return undefined
    if (r.exitCode !== 0) {
      const output = `${r.stdout}\n${r.stderr}`
      throw new Error(`lstat failed: ${output.trim()}`)
    }
    return parseLstatOutput(r.stdout)
  }

  /**
   * Start a command with a real sandbox pid. Both `exec` and `spawn` go through
   * here so an abort can kill the sandbox-side process: the SDK's own `signal`
   * only cancels the client request and leaves the process running (measured).
   *
   * envd runs `bash -l -c <cmd>` and its `kill()` is a SIGKILL to that one pid,
   * which orphans a backgrounded child (`( … ) & wait` kept ticking, measured).
   * So the command is wrapped in `setsid`: the shell keeps envd's pid (it is not
   * a group leader, so `setsid` execs in place) and becomes the leader of a
   * fresh process group that {@link killGroup} can signal as a whole.
   */
  private async start(
    command: string,
    opts: ProcessOptions | undefined,
    io: {
      stdin: boolean
      onStdout?: (data: string) => void
      onStderr?: (data: string) => void
    },
  ): Promise<CommandHandle> {
    opts?.signal?.throwIfAborted()
    const env = this.mergedEnv(opts?.env)
    return this.sandbox.commands.run(groupLeaderCommand(command), {
      background: true,
      cwd: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      ...(Object.keys(env).length > 0 ? { envs: env } : {}),
      stdin: io.stdin,
      timeoutMs: NO_COMMAND_TIMEOUT_MS,
      ...(io.onStdout ? { onStdout: io.onStdout } : {}),
      ...(io.onStderr ? { onStderr: io.onStderr } : {}),
    })
  }

  /**
   * SIGKILL the whole process group a {@link start}ed command leads, then the
   * pid itself. The group kill is a second command because envd's `sendSignal`
   * addresses a single pid; `handle.kill()` afterwards also ends the SDK's
   * event stream so `wait()` settles.
   */
  private async killGroup(handle: CommandHandle): Promise<void> {
    await this.sandbox.commands
      .run(`kill -KILL -- -${handle.pid}`)
      .catch(() => undefined) // exit 1 when the group is already gone
    await handle.kill().catch(() => undefined)
  }

  /** Resolve the exit code; a non-zero exit is a result here, not an error. */
  private static async exitCodeOf(handle: CommandHandle): Promise<number> {
    try {
      const result = await handle.wait()
      return result.exitCode
    } catch (error) {
      if (error instanceof CommandExitError) return error.exitCode
      throw error
    }
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const handle = await this.start(command, opts, { stdin: false })
    const onAbort = (): void => {
      void this.killGroup(handle)
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })
    // An abort that landed during the start round trip has no listener yet.
    if (opts?.signal?.aborted === true) onAbort()
    try {
      const exitCode = await E2BHandle.exitCodeOf(handle)
      return { stdout: handle.stdout, stderr: handle.stderr, exitCode }
    } finally {
      opts?.signal?.removeEventListener('abort', onAbort)
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const started: { handle?: CommandHandle } = {}
    const onOverflow = (): void => {
      if (started.handle) void this.killGroup(started.handle)
    }
    const stdoutQ = new AsyncChunkQueue('stdout', onOverflow)
    const stderrQ = new AsyncChunkQueue('stderr', onOverflow)

    const handle = await this.start(command, opts, {
      stdin: true,
      onStdout: (data) => stdoutQ.push(data),
      onStderr: (data) => stderrQ.push(data),
    })
    started.handle = handle
    if (stdoutQ.overflowed || stderrQ.overflowed) onOverflow()

    const onAbort = (): void => {
      void this.killGroup(handle)
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })

    const exit = E2BHandle.exitCodeOf(handle).finally(() => {
      opts?.signal?.removeEventListener('abort', onAbort)
      stdoutQ.end()
      stderrQ.end()
    })
    exit.catch(() => undefined)

    if (opts?.signal?.aborted === true) {
      onAbort()
      opts.signal.throwIfAborted()
    }

    return {
      pid: handle.pid,
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: {
        write: (data) => handle.sendStdin(data),
        end: () => handle.closeStdin(),
      },
      wait: () => exit,
      // Always SIGKILL, to the whole group; the requested signal is not honoured.
      kill: () => this.killGroup(handle),
    }
  }

  private connectPort(port: number): SandboxChannel {
    const url = `https://${this.sandbox.getHost(port)}`
    const token = this.sandbox.trafficAccessToken
    if (!token) return { url }
    // Ports of a sandbox with public traffic disabled are gated by this
    // header; browsers cannot send it, HTTP consumers attach it verbatim.
    return { url, token, headers: { [TRAFFIC_TOKEN_HEADER]: token } }
  }

  snapshot = async (label?: string): Promise<SnapshotRef> => {
    // E2B pauses the sandbox briefly while it is captured, then resumes it.
    const snap = await this.sandbox.createSnapshot({
      name: snapshotName(this.id, label),
    })
    return { id: snap.snapshotId, ...(label !== undefined ? { label } : {}) }
  }

  fork = async (): Promise<SandboxHandle> => {
    const [forked] = await this.sandbox.fork(
      this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {},
    )
    if (forked === undefined) throw new Error('e2b: fork returned no sandbox')
    if (forked instanceof Error) throw forked
    const handle = new E2BHandle({
      sandbox: forked,
      workdir: this.workdir,
      ...(this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {}),
    })
    // The fork carries the parent's process env only for what envd stored at
    // create; mirror the overlay so per-command merging stays identical.
    await handle.env.set(this.envVars)
    return handle
  }

  async destroy(): Promise<void> {
    await this.sandbox.kill()
  }
}
