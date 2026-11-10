/**
 * SandboxHandle backed by a Tangle sandbox (via `@tangle-network/sandbox`).
 * Real isolation: fs/exec/git operate inside the remote sandbox; paths are real
 * sandbox paths (default workdir `/home/agent/workspace`).
 *
 * Every command, blocking or not, goes through the runtime's process API
 * (`process.spawn`): it has no run limit (the one-shot exec API stops at 10
 * minutes), stdout and stderr arrive separately, and `kill()` signals the
 * process tree inside the sandbox. File reads and writes use the native file
 * API; the rest of `fs` desugars to commands.
 */
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createExecBackedGit } from '@tanstack/ai-sandbox'
import type {
  ProcessSignal,
  Process as TangleProcess,
  SandboxInstance,
} from '@tangle-network/sandbox'
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

export const TANGLE_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  // The process API takes no stdin stream, so a harness gets its prompt from
  // a file instead.
  writableStdin: false,
  // MEASURED against production Tangle. `kill()` asks the runtime to signal
  // the process TREE: a spawned `sleep 5 && touch <marker>` and a
  // `( … ) & wait` background ticker both stopped, and a `tail -f` follower
  // left no process behind. `tests/journal.conformance.test.ts` re-measures the
  // follow cases whenever `TANGLE_API_KEY` is present.
  killableProcesses: true,
  // A snapshot restores into a NEW sandbox through `create({ fromSnapshot })`.
  snapshots: true,
  // `policy.capabilities.network: 'deny'` maps to egress mode `blocked`.
  networkPolicy: true,
  // The workspace persists across stop and resume.
  durableFilesystem: true,
  // `fork()` branches the running sandbox into a new one.
  fork: true,
}

/** Default working directory, inside the sandbox user's home. */
export const DEFAULT_WORKDIR = '/home/agent/workspace'

const PROCESS_SIGNALS: ReadonlyArray<ProcessSignal> = [
  'SIGTERM',
  'SIGKILL',
  'SIGINT',
  'SIGHUP',
  'SIGQUIT',
  'SIGUSR1',
  'SIGUSR2',
]
const SIGNAL_NUMBERS: Record<number, ProcessSignal> = {
  1: 'SIGHUP',
  2: 'SIGINT',
  3: 'SIGQUIT',
  9: 'SIGKILL',
  10: 'SIGUSR1',
  12: 'SIGUSR2',
  15: 'SIGTERM',
}

/** The runtime accepts a fixed set of signals; anything else is a `SIGKILL`. */
function processSignal(signal?: NodeJS.Signals | number): ProcessSignal {
  if (typeof signal === 'number') return SIGNAL_NUMBERS[signal] ?? 'SIGKILL'
  return PROCESS_SIGNALS.find((s) => s === signal) ?? 'SIGKILL'
}

/** POSIX single-quote escape for embedding text in `sh -c`. */
export function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** The most useful text of a failed command for an error message. */
function errText(r: { stdout: string; stderr: string }): string {
  return r.stderr.trim() || r.stdout.trim() || '(no output)'
}

/** Drops in a row, each within a minute, before a read gives up. */
const MAX_QUICK_DROPS = 3

/**
 * Run `attempt` again when it fails. A status poll or log stream through the
 * edge can drop during a long silent command (measured: a status poll timed
 * out at 3.5 minutes and the log stream ended at 4.2 minutes while the
 * process ran on). An attempt that made progress, or ran for a minute, resets
 * the count, so only a dead API ends the read.
 */
async function retrying<T>(
  attempt: (progress: () => void) => Promise<T>,
): Promise<T> {
  for (let drops = 0; ;) {
    const started = Date.now()
    let progressed = false
    try {
      return await attempt(() => {
        progressed = true
      })
    } catch (error) {
      if (error instanceof OutputLostError) throw error
      drops = progressed || Date.now() - started > 60_000 ? 1 : drops + 1
      if (drops >= MAX_QUICK_DROPS) throw error
    }
  }
}

/** The sandbox dropped output before it was read. */
class OutputLostError extends Error {
  constructor(missedBytes: number | undefined) {
    super(
      `tangle: the sandbox dropped ${missedBytes ?? 'some'} bytes of process output before they were read`,
    )
  }
}

/**
 * Read a process's output from one log stream, split into stdout and stderr.
 * Positions count UTF-8 bytes across both streams in log order. They match the
 * server's `missedBytes` only for UTF-8 output; other bytes arrive decoded. A stream read
 * again replays from the oldest output the sandbox kept, after a `gap` for
 * what it evicted, so output before the delivered position is skipped. A gap
 * that reaches past that position lost output, and that is an error.
 */
function readOutput(
  proc: TangleProcess,
  onChunk: (stream: 'stdout' | 'stderr', data: string) => void,
): Promise<void> {
  let delivered = 0
  return retrying(async (progress) => {
    let at = 0
    for await (const entry of proc.logs()) {
      if (entry.type === 'gap') {
        if (entry.missedBytes === undefined) {
          throw new OutputLostError(undefined)
        }
        at += entry.missedBytes
        if (at > delivered) throw new OutputLostError(at - delivered)
        continue
      }
      const bytes = Buffer.from(entry.data)
      const end = at + bytes.length
      if (end > delivered) {
        const fresh =
          at >= delivered
            ? entry.data
            : bytes.subarray(delivered - at).toString()
        delivered = end
        progress()
        onChunk(entry.type, fresh)
      }
      at = end
    }
  })
}

/** Byte cap per spawned stream; past it the stream is cut and the process killed. */
const MAX_STREAM_BYTES = 8 * 1024 * 1024

/**
 * A push-fed async iterable with a byte cap, so one log stream can feed
 * stdout and stderr without holding unread output without limit.
 */
class ChunkQueue implements AsyncIterable<string> {
  private readonly chunks: Array<string> = []
  private readonly waiters: Array<{
    resolve: (r: IteratorResult<string>) => void
    reject: (error: unknown) => void
  }> = []
  private closed = false
  private error: unknown
  private bytes = 0

  constructor(
    private readonly label: string,
    private readonly onOverflow: () => void,
  ) {}

  /** Queue a chunk; past the byte cap, emit the marker, close, and overflow. */
  push(chunk: string): void {
    if (this.closed) return
    this.bytes += Buffer.byteLength(chunk)
    if (this.bytes > MAX_STREAM_BYTES) {
      this.emit(
        `\n[tangle] ${this.label} exceeded ${MAX_STREAM_BYTES} bytes; output truncated\n`,
      )
      this.close()
      this.onOverflow()
      return
    }
    this.emit(chunk)
  }

  /** Hand a chunk to a waiting reader, or keep it for the next one. */
  private emit(chunk: string): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter.resolve({ value: chunk, done: false })
    else this.chunks.push(chunk)
  }

  /** End the stream once: readers finish, or reject with `error`. */
  close(error?: unknown): void {
    if (this.closed) return
    this.closed = true
    this.error = error
    for (const waiter of this.waiters.splice(0)) {
      if (error === undefined) waiter.resolve({ value: undefined, done: true })
      else waiter.reject(error)
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: () => {
        const chunk = this.chunks.shift()
        if (chunk !== undefined) {
          return Promise.resolve({ value: chunk, done: false })
        }
        if (this.closed) {
          return this.error === undefined
            ? Promise.resolve({ value: undefined, done: true })
            : Promise.reject(this.error)
        }
        return new Promise((resolve, reject) =>
          this.waiters.push({ resolve, reject }),
        )
      },
    }
  }
}

/** Delete attempts, a second apart, while a fork parent's children go away. */
const DELETE_ATTEMPTS = 10

/**
 * Delete a sandbox. The API refuses to delete a fork parent while a fork of it
 * exists (measured: `CHILDREN_EXIST` when parent and fork are destroyed at
 * once, and the parent is left stopped), so that delete is tried again.
 */
export async function deleteSandbox(
  sandbox: SandboxInstance,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await sandbox.delete(signal ? { signal } : {})
      return
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code
      if (code !== 'CHILDREN_EXIST' || attempt >= DELETE_ATTEMPTS) throw error
      await new Promise((r) => setTimeout(r, 1000))
      signal?.throwIfAborted()
    }
  }
}

/** A snapshot needs its source sandbox id to restore, so the ref carries both. */
export function snapshotRefId(sandboxId: string, snapshotId: string): string {
  return `${sandboxId}:${snapshotId}`
}

/** Split a snapshot ref id back into its source sandbox id and snapshot id. */
export function parseSnapshotRefId(id: string): {
  sandboxId: string
  snapshotId: string
} {
  const at = id.lastIndexOf(':')
  if (at <= 0 || at === id.length - 1) {
    throw new Error(
      `tangle: snapshot id "${id}" is not "<sandboxId>:<snapshotId>"`,
    )
  }
  return { sandboxId: id.slice(0, at), snapshotId: id.slice(at + 1) }
}

/** A snapshot tag: lowercase `[a-z0-9-]`. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface TangleHandleDeps {
  /** The live sandbox, as the SDK returned it. */
  sandbox: SandboxInstance
  /** Working directory inside the sandbox (the `/workspace` virtual root maps here). */
  workdir: string
  /** Env vars every command gets (a fork inherits its parent's). */
  env?: Record<string, string>
}

export class TangleHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'tangle'
  readonly workspaceRoot: string
  readonly capabilities = TANGLE_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: SandboxInstance
  private readonly workdir: string
  private readonly envVars: Record<string, string>

  constructor(deps: TangleHandleDeps) {
    this.sandbox = deps.sandbox
    this.id = deps.sandbox.id
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.envVars = { ...deps.env }

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    // The native file calls take no abort signal, so each call checks it
    // first. They reach the sandbox user's home and `/tmp`.
    this.fs = {
      read: async (p, o) => {
        o?.signal?.throwIfAborted()
        return this.sandbox.read(this.abs(p))
      },
      readBytes: async (p, o) => {
        o?.signal?.throwIfAborted()
        return this.download(this.abs(p))
      },
      // The write creates missing parent directories (measured).
      write: async (p, data, o) => {
        o?.signal?.throwIfAborted()
        if (typeof data === 'string') {
          await this.sandbox.write(this.abs(p), data)
        } else {
          await this.sandbox.write(
            this.abs(p),
            Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
              'base64',
            ),
            { encoding: 'base64' },
          )
        }
      },
      list: async (p, o) => {
        o?.signal?.throwIfAborted()
        const r = await this.fsExec(`ls -1Ap -- ${q(this.abs(p))}`, o?.signal)
        if (r.exitCode !== 0) throw new Error(`list failed: ${errText(r)}`)
        const base = p.replace(/\/$/, '')
        return r.stdout
          .split('\n')
          .filter((line) => line !== '')
          .map((entry) => {
            const isDir = entry.endsWith('/')
            const name = isDir ? entry.slice(0, -1) : entry
            return {
              name,
              path: `${base}/${name}`,
              type: isDir ? ('dir' as const) : ('file' as const),
            }
          })
      },
      lstat: async (p, o) => {
        o?.signal?.throwIfAborted()
        return this.lstat(this.abs(p), o?.signal)
      },
      mkdir: async (p, o) => {
        o?.signal?.throwIfAborted()
        const r = await this.fsExec(`mkdir -p -- ${q(this.abs(p))}`, o?.signal)
        if (r.exitCode !== 0) throw new Error(`mkdir failed: ${errText(r)}`)
      },
      remove: async (p, o) => {
        o?.signal?.throwIfAborted()
        const r = await this.fsExec(`rm -rf -- ${q(this.abs(p))}`, o?.signal)
        if (r.exitCode !== 0) throw new Error(`remove failed: ${errText(r)}`)
      },
      rename: async (from, to, o) => {
        o?.signal?.throwIfAborted()
        const r = await this.fsExec(
          `mv -- ${q(this.abs(from))} ${q(this.abs(to))}`,
          o?.signal,
        )
        if (r.exitCode !== 0) throw new Error(`rename failed: ${errText(r)}`)
      },
      exists: async (p, o) => {
        o?.signal?.throwIfAborted()
        const r = await this.fsExec(`test -e ${q(this.abs(p))}`, o?.signal)
        return r.exitCode === 0
      },
    }

    this.git = createExecBackedGit(this.process, this.workdir)

    this.ports = {
      connect: (port, options) => this.connectPort(port, options?.signal),
    }

    this.env = {
      set: (vars) => {
        Object.assign(this.envVars, vars)
        return Promise.resolve()
      },
    }
  }

  /** A command for an `fs` call: an abort rejects, as the contract asks. */
  private async fsExec(
    command: string,
    signal: AbortSignal | undefined,
  ): Promise<ExecResult> {
    const r = await this.exec(command, signal ? { signal } : {})
    signal?.throwIfAborted()
    return r
  }

  /** Map the conventional `/workspace` virtual root to the sandbox workdir. */
  private abs(p: string): string {
    if (this.workdir === '/workspace') return p
    if (p === '/workspace') return this.workdir
    if (p.startsWith('/workspace/'))
      return `${this.workdir}/${p.slice('/workspace/'.length)}`
    return p
  }

  /** The file API returns bytes only to a local file, so read through one. */
  private async download(path: string): Promise<Uint8Array> {
    const dir = await mkdtemp(join(tmpdir(), 'tanstack-ai-tangle-'))
    try {
      const local = join(dir, 'file')
      await this.sandbox.fs.download(path, local)
      return new Uint8Array(await readFile(local))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  /** `lstat` through a command; a missing path is `undefined`. */
  private async lstat(
    path: string,
    signal?: AbortSignal,
  ): Promise<SandboxFsStat | undefined> {
    const r = await this.fsExec(lstatCommand(path), signal)
    if (r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING) return undefined
    if (r.exitCode !== 0) throw new Error(`lstat failed: ${errText(r)}`)
    return parseLstatOutput(r.stdout)
  }

  /**
   * Start `command` in `cwd` (relative to the workdir). The runtime only
   * accepts a `cwd` inside the user's home, so the shell changes directory
   * itself, and a missing `cwd` fails the command. `timeoutMs: 0` turns the
   * runtime's run limit off; the sandbox lifetime still bounds it.
   */
  private start(
    command: string,
    opts: ProcessOptions | undefined,
  ): Promise<TangleProcess> {
    opts?.signal?.throwIfAborted()
    const cwd = opts?.cwd ? this.abs(opts.cwd) : this.workdir
    const dir = cwd.startsWith('/') ? cwd : `${this.workdir}/${cwd}`
    const env = { ...this.envVars, ...opts?.env }
    return this.sandbox.process.spawn(
      `cd -- ${q(dir)} && exec sh -c ${q(command)}`,
      {
        ...(Object.keys(env).length > 0 ? { env } : {}),
        timeoutMs: 0,
      },
    )
  }

  /** Signal the whole process tree. The SDK treats an exited process as done. */
  private kill(
    proc: TangleProcess,
    signal?: NodeJS.Signals | number,
  ): Promise<void> {
    return proc.kill(processSignal(signal), { tree: true })
  }

  /** Stop a process on a failure path, where a kill error must not hide the cause. */
  private stop(proc: TangleProcess): Promise<void> {
    return this.kill(proc).catch(() => undefined)
  }

  /**
   * Run to completion. A non-zero exit is a result, not an error. An abort
   * kills the process inside the sandbox; the result then carries the
   * runtime's exit code for a signalled process (`-1`).
   */
  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const proc = await this.start(command, opts)
    const onAbort = (): void => {
      void this.stop(proc)
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })
    // An abort that landed during the start round trip has no listener yet.
    if (opts?.signal?.aborted === true) onAbort()
    try {
      const out = { stdout: '', stderr: '' }
      await readOutput(proc, (stream, data) => {
        out[stream] += data
      })
      return { ...out, exitCode: await retrying(() => proc.wait()) }
    } catch (error) {
      // Lost output or a dead API: stop the process rather than leave it
      // running until the sandbox expires.
      await this.stop(proc)
      throw error
    } finally {
      opts?.signal?.removeEventListener('abort', onAbort)
    }
  }

  /**
   * Start a background process. One log stream feeds the capped `stdout` and
   * `stderr` queues; lost output or a dead API kills the process.
   */
  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const proc = await this.start(command, opts)
    const onAbort = (): void => {
      void this.stop(proc)
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })
    const onOverflow = (): void => {
      void this.stop(proc)
    }
    const stdout = new ChunkQueue('stdout', onOverflow)
    const stderr = new ChunkQueue('stderr', onOverflow)
    void readOutput(proc, (stream, data) => {
      ;(stream === 'stdout' ? stdout : stderr).push(data)
    }).then(
      () => {
        stdout.close()
        stderr.close()
      },
      async (error: unknown) => {
        stdout.close(error)
        stderr.close(error)
        await this.stop(proc)
      },
    )
    const exit = retrying(() => proc.wait())
      .catch(async (error: unknown) => {
        await this.stop(proc)
        throw error
      })
      .finally(() => {
        opts?.signal?.removeEventListener('abort', onAbort)
      })
    exit.catch(() => undefined)
    if (opts?.signal?.aborted === true) {
      onAbort()
      opts.signal.throwIfAborted()
    }
    return {
      pid: proc.pid,
      stdout,
      stderr,
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'tangle: background process stdin is not writable (see capabilities.writableStdin)',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: () => exit,
      kill: (signal) => this.kill(proc, signal),
    }
  }

  /**
   * Create (or reuse) the sandbox's preview link for `port`. The URL is
   * public: anyone who has it can reach the port.
   */
  private async connectPort(
    port: number,
    signal?: AbortSignal,
  ): Promise<SandboxChannel> {
    signal?.throwIfAborted()
    const link = await this.sandbox.previewLinks.create(port)
    return { url: link.url }
  }

  /** Capture the workspace. The returned id restores into a new sandbox. */
  snapshot = async (
    label?: string,
    options?: { signal?: AbortSignal },
  ): Promise<SnapshotRef> => {
    options?.signal?.throwIfAborted()
    const tag = label !== undefined ? slug(label) : ''
    const snap = await this.sandbox.snapshot(tag !== '' ? { tags: [tag] } : {})
    return {
      id: snapshotRefId(this.id, snap.snapshotId),
      ...(label !== undefined ? { label } : {}),
    }
  }

  /** Branch the running sandbox into a new one with the same files. */
  fork = async (options?: { signal?: AbortSignal }): Promise<SandboxHandle> => {
    options?.signal?.throwIfAborted()
    const forked = await this.sandbox.fork(1, {
      idempotencyKey: `tanstack-ai-fork-${randomUUID()}`,
    })
    const child = forked.children[0]
    if (child === undefined) throw new Error('tangle: fork returned no sandbox')
    return new TangleHandle({
      sandbox: child,
      workdir: this.workdir,
      env: this.envVars,
    })
  }

  /** Delete the sandbox, waiting out a fork that is being destroyed at the same time. */
  async destroy(): Promise<void> {
    await deleteSandbox(this.sandbox)
  }
}

const LSTAT_MISSING = '__TANSTACK_LSTAT_MISSING__'

/** Verify a missing path by listing parent entries. `test -e` also fails for inaccessible parents. */
function lstatCommand(path: string): string {
  return `tanstack_lstat_path=${q(path)}; tanstack_lstat_output=$(stat -c '%f:%s' -- "$tanstack_lstat_path" 2>&1); tanstack_lstat_status=$?; if [ "$tanstack_lstat_status" -eq 0 ]; then printf '%s\n' "$tanstack_lstat_output"; else tanstack_lstat_missing() { tanstack_missing_path=$1; case "$tanstack_missing_path" in /|.) return 1 ;; */*) tanstack_parent=${'$'}{tanstack_missing_path%/*}; tanstack_name=${'$'}{tanstack_missing_path##*/}; [ -n "$tanstack_parent" ] || tanstack_parent=/ ;; *) tanstack_parent=.; tanstack_name=$tanstack_missing_path ;; esac; tanstack_parent_mode=$(stat -L -c '%f' -- "$tanstack_parent" 2>/dev/null); tanstack_parent_status=$?; if [ "$tanstack_parent_status" -ne 0 ]; then tanstack_lstat_missing "$tanstack_parent"; else case "$tanstack_parent_mode" in 4[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) case "$tanstack_parent" in /*) tanstack_find_parent=$tanstack_parent ;; *) tanstack_find_parent=./$tanstack_parent ;; esac; tanstack_match=$(find -H "$tanstack_find_parent" -mindepth 1 -maxdepth 1 -exec sh -c 'tanstack_target=$1; shift; for tanstack_candidate do [ "${'$'}{tanstack_candidate##*/}" = "$tanstack_target" ] && { printf 1; exit 0; }; done; exit 0' sh "$tanstack_name" '{}' + 2>/dev/null); tanstack_find_status=$?; [ "$tanstack_find_status" -eq 0 ] && [ -z "$tanstack_match" ] ;; *) return 1 ;; esac; fi; }; if tanstack_lstat_missing "$tanstack_lstat_path"; then printf '%s' '${LSTAT_MISSING}'; else printf '%s\n' "$tanstack_lstat_output" >&2; exit "$tanstack_lstat_status"; fi; fi`
}

/** Parse `stat -c '%f:%s'` output into a typed stat. */
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
