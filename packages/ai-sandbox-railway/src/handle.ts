/**
 * SandboxHandle backed by a Railway sandbox (via the `railway` SDK). Real
 * isolation: fs/exec/git operate inside a remote Railway VM; the `/workspace`
 * virtual root is a real directory created at boot.
 *
 * fs uses the SDK's native file sessions, except `remove` (the SDK only deletes
 * a file or an empty directory, so recursive removal is an `rm -rf` exec) and
 * `lstat` (the SDK's `stat` follows symlinks and reports non-POSIX type bits,
 * so `lstat` is a GNU `stat` probe). Exec and spawn both go through
 * `sandbox.exec`, which streams stdout and stderr separately; `cwd` and `env`
 * travel in the exec init frame, never in the command string. Blocking `exec`
 * runs ephemeral (no durable session, killed if the connection drops);
 * `spawn` keeps a durable session with a flow-controlled stdin writer.
 */
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import { ExecControlUnsupportedError, SandboxNotFoundError } from 'railway'
import type {
  ExecHandle,
  ExecOptions,
  ExecResult as RailwayExecResult,
  ExecSignal,
  ForkOptions,
  Sandbox,
  SandboxResources,
} from 'railway'
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

/** Default workspace root inside the sandbox; created at boot. */
export const DEFAULT_WORKDIR = '/workspace'

/** Prefix of every checkpoint name this provider creates. */
export const SNAPSHOT_PREFIX = 'tsai-'

/** Byte cap per spawned stream; exceeding it truncates and kills the process. */
const MAX_STREAM_BYTES = 8 * 1024 * 1024

/** Captured-output cap per stream for a blocking exec. */
const MAX_EXEC_OUTPUT_BYTES = 8 * 1024 * 1024

/** Grace between `TERM` and the `KILL` escalation. */
const KILL_GRACE_MS = 2_000

/**
 * How long an aborted exec waits for the remote exit after `TERM` and the
 * `KILL` escalation before rejecting with the abort reason.
 */
const ABORT_SETTLE_MS = KILL_GRACE_MS + 10_000

/**
 * Capability descriptor for a Railway sandbox.
 *
 * - `ports` is true only when HTTP domains were requested at create time
 *   (Railway publishes domains at creation only, and requires `PRIVATE`).
 * - `writableStdin`: spawned processes get a flow-controlled stdin writer.
 * - `killableProcesses`: `kill()` and abort signal the remote process group,
 *   escalate to `KILL`, and settle only on the confirmed remote exit. Measured
 *   by the live suite (a marker file proves the process died in the sandbox).
 * - `networkPolicy` is false: `ISOLATED` still has public internet egress.
 * - `durableFilesystem` is false: there is no stop/start operation that keeps
 *   a sandbox's disk; an idle sandbox is destroyed. Checkpoints restore it.
 */
export function railwayCapabilities(input: {
  ports: boolean
}): SandboxCapabilities {
  return {
    fs: true,
    exec: true,
    env: true,
    ports: input.ports,
    backgroundProcesses: true,
    writableStdin: true,
    killableProcesses: true,
    snapshots: true,
    networkPolicy: false,
    durableFilesystem: false,
    fork: true,
  }
}

/** POSIX single-quote escape for embedding paths in `sh -c`. */
export function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Unique, immutable checkpoint name. Railway checkpoint names are
 * environment-scoped and capture REPLACES an existing name, so a human label
 * such as `after-setup` would overwrite another thread's checkpoint. The label
 * stays on the returned `SnapshotRef` only.
 */
export function snapshotName(sandboxId: string): string {
  return `${SNAPSHOT_PREFIX}${sandboxId}-${randomUUID()}`
}

const EXEC_SIGNALS: ReadonlyMap<string | number, ExecSignal> = new Map<
  string | number,
  ExecSignal
>([
  ['SIGTERM', 'TERM'],
  [15, 'TERM'],
  ['SIGKILL', 'KILL'],
  [9, 'KILL'],
  ['SIGINT', 'INT'],
  [2, 'INT'],
  ['SIGHUP', 'HUP'],
  [1, 'HUP'],
  ['SIGQUIT', 'QUIT'],
  [3, 'QUIT'],
])

/**
 * Map a Node signal name/number onto the SDK's group-signal names. Anything
 * the exec bridge does not carry is a request to stop, so it becomes `KILL`,
 * the one signal that cannot be ignored.
 */
export function toExecSignal(signal?: NodeJS.Signals | number): ExecSignal {
  if (signal === undefined) return 'TERM'
  return EXEC_SIGNALS.get(signal) ?? 'KILL'
}

/** The SDK reports `null` for an unknown exit and `-1` for a signalled one. */
function normalizeExitCode(code: number | null): number {
  return code ?? -1
}

const LSTAT_MISSING = '__TANSTACK_LSTAT_MISSING__'

/** Verify a missing path by listing parent entries. `test -e` also fails for inaccessible parents. */
export function lstatCommand(path: string): string {
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
 * Reject paths `rm -rf` must never see. The path is single-quoted into the
 * command, so this guards intent (wiping the root), not injection.
 */
export function assertRemovablePath(path: string): void {
  if (path.includes('\0')) throw new Error('railway: path contains a NUL byte')
  const normalized = path.replace(/\/+/g, '/').replace(/(.)\/$/, '$1')
  if (normalized === '' || normalized === '/' || !normalized.startsWith('/')) {
    throw new Error(`railway: refusing to remove ${JSON.stringify(path)}`)
  }
  if (normalized.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(
      `railway: refusing to remove a path with relative segments: ${JSON.stringify(path)}`,
    )
  }
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
        `\n[railway] ${this.label} exceeded ${MAX_STREAM_BYTES} bytes; output truncated\n`,
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

/** Creation knobs reapplied to forks so a branch keeps its parent's shape. */
export interface RailwayForkConfig {
  idleTimeoutMinutes?: number
  /** vCPU and memory for the fork; Railway does not copy the source's size. */
  resources?: SandboxResources
  networkIsolation?: 'ISOLATED' | 'PRIVATE'
  /** Ports to publish as HTTP domains on the fork (requires `PRIVATE`). */
  ports?: Array<number>
  /** Runtime env baked into the fork (the create-time env, when known). */
  env?: Record<string, string>
}

export interface RailwayHandleDeps {
  /** The live Railway sandbox object. */
  sandbox: Sandbox
  /** Directory the `/workspace` virtual root maps to. */
  workdir: string
  /** Ports requested at create time (published as Railway domains). */
  ports?: Array<number>
  /** Creation knobs a fork reapplies. */
  forkConfig?: RailwayForkConfig
  /** Handle-local env overlay applied to every exec/spawn. */
  env?: Record<string, string>
}

export class RailwayHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'railway'
  readonly workspaceRoot: string
  readonly capabilities: SandboxCapabilities
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: Sandbox
  private readonly workdir: string
  private readonly declaredPorts: Array<number>
  private readonly forkConfig: RailwayForkConfig
  private readonly envVars: Record<string, string> = {}

  constructor(deps: RailwayHandleDeps) {
    this.sandbox = deps.sandbox
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.id = deps.sandbox.id
    // A resumed handle knows its ports from the sandbox's published domains.
    this.declaredPorts =
      deps.ports ?? deps.sandbox.domains.map((domain) => domain.port)
    this.forkConfig = deps.forkConfig ?? {}
    if (deps.env) Object.assign(this.envVars, deps.env)
    this.capabilities = railwayCapabilities({
      ports: this.declaredPorts.length > 0,
    })

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: (p) => this.sandbox.files.read(this.abs(p), { format: 'text' }),
      readBytes: (p) =>
        this.sandbox.files.read(this.abs(p), { format: 'bytes' }),
      // The SDK creates missing parents and carries bytes verbatim.
      write: (p, data) => this.sandbox.files.write(this.abs(p), data),
      list: async (p) => {
        const entries = await this.sandbox.files.list(this.abs(p))
        const base = p.replace(/\/$/, '')
        return entries.map((entry) => ({
          name: entry.name,
          path: `${base}/${entry.name}`,
          type: entry.isDir ? ('dir' as const) : ('file' as const),
        }))
      },
      lstat: (p) => this.lstat(this.abs(p)),
      mkdir: (p) => this.sandbox.files.mkdir(this.abs(p)),
      remove: (p) => this.remove(this.abs(p)),
      rename: (from, to) =>
        this.sandbox.files.rename(this.abs(from), this.abs(to)),
      exists: (p) => this.sandbox.files.exists(this.abs(p)),
    }

    this.git = createExecBackedGit(this.process, this.workspaceRoot)

    this.ports = {
      connect: (port) => this.connectPort(port),
    }

    this.env = {
      // Railway has no VM-wide mutable env, so the overlay is handle-local and
      // merged into every later exec/spawn. TanStack re-applies workspace
      // secrets through this on resume and restore.
      set: (vars) => {
        Object.assign(this.envVars, vars)
        return Promise.resolve()
      },
    }
  }

  /**
   * Map the `/workspace` virtual root onto the workdir and resolve relative
   * paths against it (the sandbox's own default cwd is `/`).
   */
  private abs(p: string): string {
    if (!p.startsWith('/')) return `${this.workdir}/${p}`
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

  /** Recursive, missing-is-success removal; the SDK's own remove is not recursive. */
  private async remove(path: string): Promise<void> {
    assertRemovablePath(path)
    const r = await this.exec(`rm -rf -- ${q(path)}`)
    if (r.exitCode !== 0) {
      throw new Error(
        `railway: remove ${path} failed (exit ${r.exitCode}): ${r.stderr.trim()}`,
      )
    }
  }

  /** Start a command through the SDK. `exec` and `spawn` both go through here. */
  private start(
    command: string,
    opts: ProcessOptions | undefined,
    io: {
      stream: boolean
      /** Skip the durable session; cleaned up if the connection drops. */
      ephemeral?: boolean
      onStdout?: (data: string) => void
      onStderr?: (data: string) => void
    },
  ): ExecHandle {
    const env = this.mergedEnv(opts?.env)
    const options: ExecOptions = {
      cwd: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      ...(Object.keys(env).length > 0 ? { env } : {}),
      ...(io.onStdout ? { onStdout: io.onStdout } : {}),
      ...(io.onStderr ? { onStderr: io.onStderr } : {}),
    }
    if (io.stream) {
      // Streaming consumers get every chunk through the callbacks, so the SDK
      // keeps no second copy; stdin stays open for duplex harness protocols.
      options.captureOutput = false
      options.stdin = true
    } else {
      options.maxOutputBytes = MAX_EXEC_OUTPUT_BYTES
      if (io.ephemeral) options.ephemeral = true
    }
    // Abort is handled here (see `exec`/`spawnProcess`), not through the SDK's
    // `signal`, so an aborted command still settles with its real exit code.
    return this.sandbox.exec(command, options)
  }

  /**
   * Signal the remote process group, escalating to `KILL` after a grace
   * period unless the command settled. The SDK settles the command only on
   * the confirmed remote exit, so awaiting the result after this proves the
   * process group is gone.
   */
  private terminate(
    handle: ExecHandle,
    settled: Promise<unknown>,
    signal: ExecSignal = 'TERM',
  ): Promise<void> {
    let done = false
    void settled.then(
      () => (done = true),
      () => (done = true),
    )
    const sent = handle.kill(signal).catch(() => false)
    if (signal !== 'KILL') {
      const timer = setTimeout(() => {
        if (!done) void handle.kill('KILL').catch(() => false)
      }, KILL_GRACE_MS)
      timer.unref?.()
      void settled.finally(() => clearTimeout(timer)).catch(() => undefined)
    }
    return sent.then(() => undefined)
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const signal = opts?.signal
    signal?.throwIfAborted()
    try {
      return await this.runExec(command, opts, true)
    } catch (error) {
      // A tcp-proxy without exec control refuses ephemeral execs before
      // anything runs; the durable path still works there.
      if (!(error instanceof ExecControlUnsupportedError)) throw error
      return this.runExec(command, opts, false)
    }
  }

  private async runExec(
    command: string,
    opts: ProcessOptions | undefined,
    ephemeral: boolean,
  ): Promise<ExecResult> {
    const signal = opts?.signal
    const handle = this.start(command, opts, { stream: false, ephemeral })
    const result: Promise<RailwayExecResult> = handle.result()
    result.catch(() => undefined)

    // Abort terminates the remote process group and waits for its exit, so the
    // caller gets the real (signalled) exit code. If no exit arrives in time
    // the outcome is unknown and the abort reason is thrown instead.
    let onAbort: (() => void) | undefined
    const aborted = signal
      ? new Promise<RailwayExecResult>((resolve, reject) => {
          onAbort = (): void => {
            void this.terminate(handle, result)
            const timer = setTimeout(
              () => reject(signal.reason),
              ABORT_SETTLE_MS,
            )
            timer.unref?.()
            result.then(resolve, reject).finally(() => clearTimeout(timer))
          }
          signal.addEventListener('abort', onAbort, { once: true })
          if (signal.aborted) onAbort()
        })
      : undefined
    aborted?.catch(() => undefined)

    try {
      const r = await (aborted ? Promise.race([result, aborted]) : result)
      return {
        stdout: r.stdout,
        stderr: r.truncated
          ? `${r.stderr}\n[railway] output truncated\n`
          : r.stderr,
        exitCode: normalizeExitCode(r.exitCode),
      }
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort)
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    opts?.signal?.throwIfAborted()
    const started: { kill?: () => void } = {}
    const onOverflow = (): void => started.kill?.()
    const stdoutQ = new AsyncChunkQueue('stdout', onOverflow)
    const stderrQ = new AsyncChunkQueue('stderr', onOverflow)

    const handle = this.start(command, opts, {
      stream: true,
      onStdout: (data) => stdoutQ.push(data),
      onStderr: (data) => stderrQ.push(data),
    })

    const exit = handle
      .result()
      .then((r) => normalizeExitCode(r.exitCode))
      .finally(() => {
        opts?.signal?.removeEventListener('abort', onAbort)
        stdoutQ.end()
        stderrQ.end()
      })
    exit.catch(() => undefined)

    started.kill = (): void => {
      void this.terminate(handle, exit, 'KILL')
    }
    if (stdoutQ.overflowed || stderrQ.overflowed) onOverflow()

    // A kill before the socket opens is queued by the SDK and delivered on
    // connect, so an early abort still reaches the process.
    function onAbort(): void {
      started.kill?.()
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })

    return {
      // The exec bridge exposes no remote pid; a fabricated one would be wrong.
      pid: -1,
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: {
        write: (data) => handle.stdin.write(data),
        end: () => handle.stdin.end(),
      },
      wait: () => exit,
      // Resolves once the remote exit is confirmed, so a caller that kills and
      // then checks the sandbox sees the process gone.
      kill: async (sig) => {
        await this.terminate(handle, exit, toExecSignal(sig))
        await settledWithin(exit, ABORT_SETTLE_MS, command)
      },
    }
  }

  private async connectPort(port: number): Promise<SandboxChannel> {
    if (!this.capabilities.ports) {
      throw new UnsupportedCapabilityError(
        'railway',
        'ports',
        `Pass ports: [${port}] and networkIsolation: 'PRIVATE' to railwaySandbox(); Railway publishes sandbox domains at create time only.`,
      )
    }
    let domain = this.sandbox.domains.find((d) => d.port === port)
    if (!domain && this.declaredPorts.includes(port)) {
      // Domains are assigned at create; re-read once in case this handle's
      // snapshot of the record predates them.
      await this.sandbox.refresh()
      domain = this.sandbox.domains.find((d) => d.port === port)
    }
    if (!domain) {
      throw new Error(
        `railway: port ${port} has no published domain (declared: ${this.declaredPorts.join(', ') || 'none'}). Railway publishes sandbox domains at create time only.`,
      )
    }
    const url = /^https?:\/\//.test(domain.domain)
      ? domain.domain
      : `https://${domain.domain}`
    return { url }
  }

  snapshot = async (label?: string): Promise<SnapshotRef> => {
    const name = snapshotName(this.id)
    await this.sandbox.checkpoint(name)
    return { id: name, ...(label !== undefined ? { label } : {}) }
  }

  fork = async (): Promise<SandboxHandle> => {
    const ports = this.forkConfig.ports ?? this.declaredPorts
    const options: ForkOptions = {
      ...(this.forkConfig.idleTimeoutMinutes !== undefined
        ? { idleTimeoutMinutes: this.forkConfig.idleTimeoutMinutes }
        : {}),
      ...(this.forkConfig.resources !== undefined
        ? { resources: this.forkConfig.resources }
        : {}),
      // A resumed handle has no create config; the sandbox record carries it.
      networkIsolation:
        this.forkConfig.networkIsolation ?? this.sandbox.networkIsolation,
      ...(ports.length > 0 ? { domains: ports.map((port) => ({ port })) } : {}),
      ...(this.forkConfig.env !== undefined &&
      Object.keys(this.forkConfig.env).length > 0
        ? { env: this.forkConfig.env }
        : {}),
    }
    const forked = await this.sandbox.fork(options)
    // Fork clones the disk, not this handle's env overlay; copy it so
    // per-command merging stays identical on the branch.
    return new RailwayHandle({
      sandbox: forked,
      workdir: this.workdir,
      ports,
      forkConfig: this.forkConfig,
      env: { ...this.envVars },
    })
  }

  async destroy(): Promise<void> {
    try {
      await this.sandbox.destroy()
    } catch (error) {
      if (error instanceof SandboxNotFoundError) return
      throw error
    }
  }
}

/** Wait for `settled` up to `ms`; an unconfirmed exit means the outcome is unknown. */
async function settledWithin(
  settled: Promise<unknown>,
  ms: number,
  command: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `railway: no exit confirmed ${ms}ms after killing \`${command}\``,
          ),
        ),
      ms,
    )
    timer.unref?.()
  })
  try {
    await Promise.race([
      settled.then(
        () => undefined,
        () => undefined,
      ),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}
