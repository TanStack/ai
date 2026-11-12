/**
 * SandboxHandle backed by a Render sandbox (via `@renderinc/sdk`). Real
 * isolation: fs/exec/git operate inside a remote Render microVM; the
 * `/workspace` virtual root is a real directory created at boot.
 *
 * File reads and writes use the SDK's native `download`/`upload`; every other
 * fs call is one shell command. Render's `exec` takes no cwd, env, stdin or
 * kill, and dropping its stream leaves the remote process running (measured),
 * so every command runs through a wrapper that records its process group in a
 * file, and `kill()` signals that group from a second `exec`. Env reaches the
 * wrapper as a file uploaded to `/dev`, never in the command string, because
 * Render stores command text on the sandbox's exec timeline.
 */
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import { ClientError } from '@renderinc/sdk'
import type { SandboxSnapshotKind, SandboxesClient } from '@renderinc/sdk'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxFsStat,
  SandboxHandle,
  SnapshotRef,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

/** Default workspace root inside the sandbox; created at boot. */
export const DEFAULT_WORKDIR = '/workspace'

/** Prefix of every snapshot name this provider creates. */
export const SNAPSHOT_PREFIX = 'tsai-'
const SNAPSHOT_NAME_MAX = 64

/** Byte cap per stream, for spawned processes and captured exec output. */
const MAX_STREAM_BYTES = 8 * 1024 * 1024

/**
 * How long a kill waits for the remote exit after `TERM` and the in-sandbox
 * `KILL` escalation (2 s) before giving up on confirming it.
 */
const KILL_SETTLE_MS = 12_000

/** Where each command's process-group id is recorded while it runs. */
const PGID_DIR = '/tmp/tsai'

/**
 * Where env files go. `/dev` is the sandbox's only memory-backed mount
 * (devtmpfs, measured): filesystem snapshots leave it out and it survives an
 * idle suspend, so secrets never reach the disk.
 */
export const ENV_DIR = '/dev/tsai'

/** Overlays earlier versions kept on disk, removed whenever we can. */
const LEGACY_ENV = `${PGID_DIR}/env ${PGID_DIR}/env-*`

interface EnvState {
  queue: Promise<void>
  /** Exact shared bytes to restore if a snapshot's write-back failed. */
  restore?: Uint8Array
}

// Handles for the same sandbox share one queue. Runtime snapshots from separate
// orchestrator processes still need the caller's sandbox lifecycle lock.
const envStates = new Map<string, EnvState>()

/**
 * Capability descriptor for a Render sandbox.
 *
 * - `killableProcesses`: every command records its process group and `kill()`
 *   signals the group from a second exec (the requested signal, `TERM` by
 *   default, then `KILL` after 2 s). MEASURED
 *   against a real sandbox: a backgrounded child stopped writing after the
 *   group kill. `tests/journal.conformance.test.ts` re-measures it.
 * - `writableStdin` / `ports` / `fork`: Render has no exec stdin, no inbound
 *   ports and no native fork.
 * - `networkPolicy`: `deny-all` is enforced by Render (measured: DNS fails).
 * - `durableFilesystem`: an idle sandbox suspends with its disk and resumes on
 *   the next exec or file call.
 */
export const RENDER_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: false,
  backgroundProcesses: true,
  writableStdin: false,
  killableProcesses: true,
  snapshots: true,
  networkPolicy: true,
  durableFilesystem: true,
  fork: false,
}

/** POSIX single-quote escape for embedding values in `bash -c`. */
export function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Bash read-only variables: exporting one fails, and the command never runs. */
const READONLY_ENV = new Set([
  'BASHOPTS',
  'BASH_VERSINFO',
  'EUID',
  'PPID',
  'SHELLOPTS',
  'UID',
])

/**
 * `env` as a file of `export` lines for the wrapper to source. Names are
 * checked and values quoted, so a value cannot break out into shell code.
 */
export function envFileContent(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([name, value]) => {
      if (!ENV_NAME.test(name) || READONLY_ENV.has(name)) {
        throw new Error(`render: invalid env var name ${JSON.stringify(name)}`)
      }
      return `export ${name}=${q(value)}\n`
    })
    .join('')
}

/** Stop a group without killing the supervisor that must reap it. */
function stopGroup(group: string): string {
  return `kill -TERM -- -${group} 2>/dev/null; for i in $(seq 20); do kill -0 -- -${group} 2>/dev/null || break; sleep 0.1; done; kill -KILL -- -${group} 2>/dev/null`
}

/**
 * Job control gives the command its own group. The supervisor stops surviving
 * descendants before reporting exit. Publish the group atomically before
 * checking cancellation, so a kill either prevents startup or finds its group.
 */
export function wrapCommand(
  command: string,
  pgidFile: string,
  cwd: string,
  envFiles: Array<string>,
  callEnvFile: string,
): string {
  const sourceStep = envFiles.map((file) => `. ${q(file)} && `).join('')
  const inner = `echo $$ > ${pgidFile}.tmp && mv -f ${pgidFile}.tmp ${pgidFile} || exit $?; [ ! -e ${pgidFile}.killed ] || exit 143; ${sourceStep}rm -f ${callEnvFile} && cd ${q(cwd)} && exec bash -c ${q(command)}`
  const supervisor = `mkdir -p ${PGID_DIR} || exit $?; set -m; bash -c ${q(inner)} & tsai_group=$!; set +m; wait "$tsai_group" 2>/dev/null; tsai_status=$?; ${stopGroup('"$tsai_group"')}; rm -f ${pgidFile} ${pgidFile}.tmp ${callEnvFile} ${pgidFile}.killed; exit $tsai_status`
  return `bash -c ${q(supervisor)}`
}

type GroupSignal = 'TERM' | 'KILL' | 'INT' | 'HUP' | 'QUIT'

const GROUP_SIGNALS: ReadonlyMap<string | number, GroupSignal> = new Map<
  string | number,
  GroupSignal
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
 * Map a `kill()` signal onto a name for the shell's `kill`. As in the Railway
 * provider, any other signal is a request to stop, so it becomes `KILL`.
 */
export function groupSignal(signal?: NodeJS.Signals | number): GroupSignal {
  if (signal === undefined) return 'TERM'
  return GROUP_SIGNALS.get(signal) ?? 'KILL'
}

/**
 * Signal the process group recorded in `pgidFile` with `signal`, then send
 * `KILL` if the group is still alive after 2 s. It first leaves a `.killed`
 * marker, so a wrapper that starts later exits without running, then waits up
 * to 2 s for the file so a kill that races the start still lands. Cleans up
 * the files a killed wrapper leaves behind.
 */
export function killCommand(
  pgidFile: string,
  callEnvFile: string,
  signal: GroupSignal = 'TERM',
): string {
  const cleanup = `rm -f ${pgidFile} ${callEnvFile} ${pgidFile}.killed`
  const grace =
    signal === 'KILL'
      ? ''
      : `for i in $(seq 20); do sleep 0.1; kill -0 -- -$g 2>/dev/null || { ${cleanup}; exit 0; }; done; kill -KILL -- -$g 2>/dev/null; `
  const kill = `mkdir -p ${PGID_DIR} && touch ${pgidFile}.killed; for i in $(seq 20); do [ -f ${pgidFile} ] && break; sleep 0.1; done; g=$(cat ${pgidFile} 2>/dev/null) || exit 0; kill -${signal} -- -$g 2>/dev/null || { ${cleanup}; exit 0; }; ${grace}${cleanup}; true`
  return `bash -c ${q(kill)}`
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
  if (path.includes('\0')) throw new Error('render: path contains a NUL byte')
  const normalized = path.replace(/\/+/g, '/').replace(/(.)\/$/, '$1')
  if (normalized === '' || normalized === '/' || !normalized.startsWith('/')) {
    throw new Error(`render: refusing to remove ${JSON.stringify(path)}`)
  }
  if (normalized.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(
      `render: refusing to remove a path with relative segments: ${JSON.stringify(path)}`,
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

  constructor(
    private readonly label: string,
    private readonly onOverflow: () => void,
  ) {}

  push(chunk: string): void {
    if (chunk === '' || this.ended) return
    this.bytes += Buffer.byteLength(chunk)
    if (this.bytes > MAX_STREAM_BYTES) {
      this.emit(
        `\n[render] ${this.label} exceeded ${MAX_STREAM_BYTES} bytes; output truncated\n`,
      )
      this.end()
      this.onOverflow()
      return
    }
    this.emit(chunk)
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

/** A started command: its exit code, and a kill that settles on the exit. */
interface RunningCommand {
  exit: Promise<number>
  kill: (signal?: GroupSignal) => Promise<void>
}

export interface RenderHandleDeps {
  /** The SDK's sandboxes client. */
  client: SandboxesClient
  /** Sandbox id (`sbx-…`). */
  id: string
  /** Directory the `/workspace` virtual root maps to. */
  workdir: string
  /** What `snapshot()` captures. */
  snapshotKind: SandboxSnapshotKind
  /** Where env files go; defaults to {@link ENV_DIR}. Tests point it elsewhere. */
  envDir?: string
}

export class RenderHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'render'
  readonly workspaceRoot: string
  readonly capabilities = RENDER_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly client: SandboxesClient
  private readonly workdir: string
  private readonly snapshotKind: SandboxSnapshotKind
  private readonly envDir: string
  /** The env overlay, one path per sandbox: a later handle (after resume) overwrites an earlier one's secrets. */
  private readonly envFile: string
  private readonly envVars: Record<string, string> = {}
  /** Bumped by each `env.set`; 0 means this handle has no overlay. */
  private envVersion = 0
  /** Last version this handle uploaded; another handle may have rotated it. */
  private envWritten = 0

  constructor(deps: RenderHandleDeps) {
    this.client = deps.client
    this.id = deps.id
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.snapshotKind = deps.snapshotKind
    this.envDir = deps.envDir ?? ENV_DIR
    this.envFile = `${this.envDir}/env`

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: async (p, o) =>
        Buffer.from(await this.download(p, o?.signal)).toString('utf8'),
      readBytes: (p, o) => this.download(p, o?.signal),
      // Render creates missing parents (measured).
      write: (p, data, o) =>
        this.client.upload(
          this.id,
          this.abs(p),
          // Copy into a fresh buffer: a caller's view may sit on a SharedArrayBuffer.
          typeof data === 'string' ? data : Buffer.from(data),
          undefined,
          o?.signal ? { signal: o.signal } : undefined,
        ),
      list: async (p, o) => {
        // `-p` marks directories with a trailing `/`; symlinks are not followed.
        const r = await this.check(
          `ls -1Ap -- ${q(this.abs(p))}`,
          `list ${p}`,
          o?.signal,
        )
        const base = p.replace(/\/$/, '')
        return r.stdout
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => {
            const name = line.replace(/\/$/, '')
            return {
              name,
              path: `${base}/${name}`,
              type: line.endsWith('/') ? ('dir' as const) : ('file' as const),
            }
          })
      },
      lstat: (p, o) => this.lstat(this.abs(p), o?.signal),
      mkdir: async (p, o) => {
        await this.check(
          `mkdir -p -- ${q(this.abs(p))}`,
          `mkdir ${p}`,
          o?.signal,
        )
      },
      remove: async (p, o) => {
        const path = this.abs(p)
        assertRemovablePath(path)
        await this.check(`rm -rf -- ${q(path)}`, `remove ${p}`, o?.signal)
      },
      rename: async (from, to, o) => {
        await this.check(
          `mv -f -- ${q(this.abs(from))} ${q(this.abs(to))}`,
          `rename ${from}`,
          o?.signal,
        )
      },
      exists: async (p, o) => {
        const path = q(this.abs(p))
        const r = await this.sh(`test -e ${path} || test -L ${path}`, o?.signal)
        return r.exitCode === 0
      },
    }

    this.git = createExecBackedGit(this.process, this.workspaceRoot)

    this.ports = {
      connect: () =>
        Promise.reject(
          new UnsupportedCapabilityError(
            'render',
            'ports',
            'Render sandboxes do not expose inbound ports.',
          ),
        ),
    }

    this.env = {
      // Render has no VM-wide mutable env, so the overlay is handle-local and
      // uploaded to `/dev` as a root-only file (uploads land 0600, measured)
      // that every later exec/spawn sources. TanStack re-applies workspace
      // secrets through this on resume and restore.
      set: async (vars) => {
        // Check names first, so a rejected call leaves the overlay unchanged.
        envFileContent(vars)
        Object.assign(this.envVars, vars)
        this.envVersion++
        await this.queueEnv(async (state) => {
          await this.writeEnv(state)
          // Remove overlays left by earlier versions before returning fresh credentials.
          await this.raw(`rm -f -- ${LEGACY_ENV}`)
        })
      },
    }
  }

  /**
   * Map the `/workspace` virtual root onto the workdir and resolve relative
   * paths against it (Render resolves them against `/root`).
   */
  private abs(p: string): string {
    if (!p.startsWith('/')) return `${this.workdir}/${p}`
    if (this.workdir === '/workspace') return p
    if (p === '/workspace') return this.workdir
    if (p.startsWith('/workspace/'))
      return `${this.workdir}/${p.slice('/workspace/'.length)}`
    return p
  }

  private async download(
    p: string,
    signal: AbortSignal | undefined,
  ): Promise<Uint8Array> {
    const file = await this.client.download(
      this.id,
      this.abs(p),
      undefined,
      signal,
    )
    // A directory downloads as a tar archive; reading one is an error.
    if (file.contentType === 'application/x-tar') {
      throw new Error(`render: ${p} is a directory`)
    }
    return new Uint8Array(file.data)
  }

  /**
   * Run an fs helper from `/`. Helpers take absolute paths, and the workdir
   * may not exist yet (creating it is the first helper `create` runs).
   */
  private async sh(
    command: string,
    signal: AbortSignal | undefined,
  ): Promise<ExecResult> {
    const r = await this.exec(command, {
      cwd: '/',
      ...(signal ? { signal } : {}),
    })
    // An aborted exec resolves with the killed exit code; fs calls must reject,
    // or `exists` reads a cancel as "missing".
    signal?.throwIfAborted()
    return r
  }

  /** Run an fs helper and throw on a non-zero exit. */
  private async check(
    command: string,
    what: string,
    signal: AbortSignal | undefined,
  ): Promise<ExecResult> {
    const r = await this.sh(command, signal)
    if (r.exitCode !== 0) {
      throw new Error(
        `render: ${what} failed (exit ${r.exitCode}): ${r.stderr.trim()}`,
      )
    }
    return r
  }

  private async lstat(
    path: string,
    signal: AbortSignal | undefined,
  ): Promise<SandboxFsStat | undefined> {
    const r = await this.sh(lstatCommand(path), signal)
    if (r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING) return undefined
    if (r.exitCode !== 0) {
      const output = `${r.stdout}\n${r.stderr}`
      throw new Error(`lstat failed: ${output.trim()}`)
    }
    return parseLstatOutput(r.stdout)
  }

  /** Serialize overlay writes, capture and starts across handles of this sandbox. */
  private queueEnv<T>(op: (state: EnvState) => Promise<T>): Promise<T> {
    const state = envStates.get(this.id) ?? { queue: Promise.resolve() }
    envStates.set(this.id, state)
    const next = state.queue.then(() => op(state))
    const settled = next.then(noop, noop)
    state.queue = settled
    void settled.then(() => {
      if (
        state.queue === settled &&
        state.restore === undefined &&
        envStates.get(this.id) === state
      ) {
        envStates.delete(this.id)
      }
    })
    return next
  }

  /** Write new values or retry the exact shared overlay hidden by a snapshot. */
  private async writeEnv(state: EnvState): Promise<void> {
    const version = this.envVersion
    if (version > 0 && this.envWritten !== version) {
      await this.client.upload(
        this.id,
        this.envFile,
        envFileContent(this.envVars),
      )
      this.envWritten = version
      state.restore = undefined
    } else if (state.restore !== undefined) {
      await this.client.upload(
        this.id,
        this.envFile,
        Buffer.from(state.restore),
      )
      state.restore = undefined
    }
  }

  /** Control commands bypass the overlay queue; a failed cleanup must surface. */
  private async raw(command: string): Promise<void> {
    const events = await this.client.exec(this.id, command)
    for await (const event of events) {
      if (event.type === 'exit') {
        if (event.exit_code !== 0)
          throw new Error(
            `render: control command failed (exit ${event.exit_code})`,
          )
        return
      }
    }
    throw new Error('render: control command ended without an exit event')
  }

  /**
   * Start `command` under the process-group wrapper. Abort is handled by the
   * callers through `kill`, not the SDK signal: dropping the stream would only
   * detach this host and leave the command running.
   */
  private run(
    command: string,
    opts: ProcessOptions | undefined,
    onOutput: (stream: 'stdout' | 'stderr', data: string) => void,
  ): RunningCommand {
    const commandId = randomUUID()
    const pgidFile = `${PGID_DIR}/${commandId}`
    // Per-call env goes in its own file, sourced after the overlay so it wins.
    const callEnvFile = `${this.envDir}/${commandId}.env`
    const callEnv =
      opts?.env && Object.keys(opts.env).length > 0
        ? envFileContent(opts.env)
        : undefined
    const stream = new AbortController()
    let settled = false
    let killed = false

    const kill = async (signal?: GroupSignal): Promise<void> => {
      if (settled) return
      killed = true
      await this.raw(killCommand(pgidFile, callEnvFile, signal)).catch(
        () => undefined,
      )
      await settleWithin(exit, KILL_SETTLE_MS)
      if (!settled) {
        stream.abort()
        throw new Error(
          `render: no exit confirmed ${KILL_SETTLE_MS}ms after killing \`${command}\``,
        )
      }
    }

    const exit = (async (): Promise<number> => {
      // Starting is queued: it waits out overlay writes and snapshots, and
      // rewrites the overlay if a snapshot left it missing.
      const events = await this.queueEnv(async (state) => {
        await this.writeEnv(state)
        const envFiles = this.envVersion > 0 ? [this.envFile] : []
        if (callEnv !== undefined) {
          await this.client.upload(this.id, callEnvFile, callEnv)
          envFiles.push(callEnvFile)
        }
        // Killed before the start: never start it, and remove what the kill
        // could not see yet.
        if (killed) {
          await this.raw(`rm -f ${callEnvFile} ${pgidFile}.killed`).catch(noop)
          return undefined
        }
        const wrapped = wrapCommand(
          command,
          pgidFile,
          opts?.cwd ? this.abs(opts.cwd) : this.workdir,
          envFiles,
          callEnvFile,
        )
        return this.client.exec(this.id, wrapped, undefined, stream.signal)
      })
      if (events === undefined) return 128 + 15
      for await (const event of events) {
        if (event.type === 'output') onOutput(event.stream, event.data)
        else return event.exit_code
      }
      throw new Error('render: exec stream ended without an exit event')
    })()
      .catch(async (error: unknown) => {
        // The stream failed, so the process state is unknown: kill the group
        // rather than leave it running until the sandbox times out.
        if (!stream.signal.aborted) {
          await this.raw(killCommand(pgidFile, callEnvFile)).catch(
            () => undefined,
          )
        }
        throw error
      })
      .finally(() => {
        settled = true
      })
    exit.catch(() => undefined)

    return { exit, kill }
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const signal = opts?.signal
    signal?.throwIfAborted()
    const out = { stdout: '', stderr: '' }
    // The cap is in UTF-8 bytes, so multi-byte output cannot exceed it.
    const bytes = { stdout: 0, stderr: 0 }
    // Once a stream hits the cap, drop the rest of it, not just one chunk.
    const cut = { stdout: false, stderr: false }
    const running = this.run(command, opts, (stream, data) => {
      const size = Buffer.byteLength(data)
      if (cut[stream] || bytes[stream] + size > MAX_STREAM_BYTES) {
        cut[stream] = true
        return
      }
      bytes[stream] += size
      out[stream] += data
    })
    // An aborted exec kills the group and resolves with its real (signalled)
    // exit code, as Railway does.
    const onAbort = (): void => {
      void running.kill().catch(() => undefined)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const exitCode = await running.exit
      return {
        stdout: out.stdout,
        stderr:
          cut.stdout || cut.stderr
            ? `${out.stderr}\n[render] output truncated\n`
            : out.stderr,
        exitCode,
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      throw error
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    opts?.signal?.throwIfAborted()
    const kill = (): void => {
      void running.kill().catch(() => undefined)
    }
    const stdoutQ = new AsyncChunkQueue('stdout', kill)
    const stderrQ = new AsyncChunkQueue('stderr', kill)
    const running = this.run(command, opts, (stream, data) =>
      (stream === 'stdout' ? stdoutQ : stderrQ).push(data),
    )
    opts?.signal?.addEventListener('abort', kill, { once: true })
    const exit = running.exit.finally(() => {
      opts?.signal?.removeEventListener('abort', kill)
      stdoutQ.end()
      stderrQ.end()
    })
    exit.catch(() => undefined)

    const noStdin = (): Promise<never> =>
      Promise.reject(
        new UnsupportedCapabilityError(
          'render',
          'writableStdin',
          'Render exec has no stdin; deliver input through a file.',
        ),
      )

    return {
      // The process group id lives in the sandbox; a fabricated pid would be wrong.
      pid: -1,
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: { write: noStdin, end: noStdin },
      wait: () => exit,
      // The requested signal goes to the whole group, then KILL after 2 s.
      kill: (signal) => running.kill(groupSignal(signal)),
    }
  }

  snapshot = (label?: string): Promise<SnapshotRef> =>
    this.queueEnv(async (state) => {
      await this.writeEnv(state)
      if (this.snapshotKind === 'filesystem') {
        // The overlay is in `/dev`, which a filesystem snapshot leaves out, so
        // it stays in place. This also wakes a suspended sandbox before capture.
        await this.raw(`rm -f -- ${LEGACY_ENV}`)
        return this.capture(label)
      }
      // A runtime snapshot keeps memory, `/dev` included, so the overlay comes
      // out for the capture. Read the shared file, even for a fresh handle:
      // restoring this handle's cached vars could resurrect a secret another
      // handle already rotated.
      try {
        state.restore = await this.download(this.envFile, undefined)
      } catch (error) {
        if (!(error instanceof ClientError && error.statusCode === 404))
          throw error
      }
      try {
        await this.raw(`rm -f -- ${this.envFile} ${LEGACY_ENV}`)
        return await this.capture(label)
      } finally {
        // Keep a successful snapshot ref if write-back fails. The next queued
        // operation retries these exact bytes, including from a fresh handle.
        await this.writeEnv(state).catch(noop)
      }
    })

  private async capture(label: string | undefined): Promise<SnapshotRef> {
    const snap = await this.client.snapshots.create({
      sandboxId: this.id,
      kind: this.snapshotKind,
      name: `${SNAPSHOT_PREFIX}${label ?? 'snap'}`.slice(0, SNAPSHOT_NAME_MAX),
      wait: true,
    })
    return { id: snap.id, ...(label !== undefined ? { label } : {}) }
  }

  async destroy(): Promise<void> {
    try {
      await this.client.terminate(this.id)
      envStates.delete(this.id)
    } catch (error) {
      if (error instanceof ClientError && error.statusCode === 404) return
      throw error
    }
  }
}

/** Wait for `settled` up to `ms`, ignoring its outcome. */
async function settleWithin(
  settled: Promise<unknown>,
  ms: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
  try {
    await Promise.race([settled.then(noop, noop), timeout])
  } finally {
    clearTimeout(timer)
  }
}

function noop(): void {}
