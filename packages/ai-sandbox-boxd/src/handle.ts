/**
 * SandboxHandle backed by a boxd KVM microVM (https://boxd.sh). Real
 * isolation: fs/exec/git operate inside the remote machine; paths are real
 * machine paths (default workdir `/home/boxd/workspace`).
 *
 * File data ops (read/write) use the machine's file API; everything else on
 * `fs` desugars to `exec`. Blocking commands run through the SDK's one-shot
 * `exec` (separate stdout and stderr, real exit code). Background processes run
 * through a streaming exec wrapped in `setsid` so the process the handle spawns
 * leads its own process group, which is what lets `kill()` reach the whole
 * tree. See {@link spawnCommand}.
 *
 * Snapshots are boxd snapshots (memory + disk, org-wide, restorable into a new
 * machine), and `fork()` is a live boxd fork (memory and running processes
 * included).
 */
import { randomUUID } from 'node:crypto'
import { createExecBackedGit } from '@tanstack/ai-sandbox'
import type {
  CreatedProxy,
  CreatedSnapshot,
  ExecParams,
  ExecResult as BoxdExecResult,
  Machine,
  MachineCreateParams,
  MachineForkParams,
  Proxy as BoxdProxy,
  Snapshot,
  StreamExecParams,
  UploadSource,
  WaitUntilReadyParams,
} from '@boxd-sh/sdk'
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

export const BOXD_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  // A streaming exec keeps its process alive for as long as the stream is open,
  // and (measured) closing the stream does NOT end the process, so a spawned
  // process outlives the call that started it. `kill()` is the only way down.
  backgroundProcesses: true,
  // A streaming exec's stdin is writable (`write`/`end`). Measured: a spawned
  // `sh` runs lines written to it, and a spawned `cat` exits on `end()`.
  writableStdin: true,
  // MEASURED against production boxd. `kill()` runs a shell inside the machine
  // that signals the process GROUP the spawn wrapper leads (`setsid`, see
  // `spawnCommand`), escalates to `KILL`, and verifies with `kill -0`. Closing
  // the stream on its own is not a kill: the process survived it, so that is
  // never what `kill()` relies on. `tests/journal.conformance.test.ts` runs the
  // follow cases against a real machine whenever `BOXD_API_KEY` is present.
  killableProcesses: true,
  // boxd snapshots capture memory + disk and restore into a NEW machine, so
  // `restoreSnapshot` reconstructs a sandbox after the original is gone.
  snapshots: true,
  networkPolicy: false,
  // The 100 GB disk persists across stop/start, suspend/resume and hibernate.
  durableFilesystem: true,
  // `machines.fork` clones disk, memory and running processes in ~100-600 ms.
  fork: true,
}

export const DEFAULT_WORKDIR = '/home/boxd/workspace'

/** Anything with a `warn(message, meta?)`; the `InternalLogger` adapters get works. */
export interface BoxdLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void
}

/** A live streaming exec: the subset of the SDK's `ExecStream` the handle uses. */
export interface BoxdExecStream {
  readonly stdout: AsyncIterable<Uint8Array>
  readonly stderr: AsyncIterable<Uint8Array>
  write: (data: string | Uint8Array) => void
  end: () => void
  wait: () => Promise<number>
  close: () => void
}

/** The subset of the SDK client the provider and handle call. `new Boxd()` satisfies it. */
export interface BoxdClientLike {
  machines: {
    create: (params: MachineCreateParams) => Promise<Machine>
    get: (id: string) => Promise<Machine>
    delete: (id: string) => Promise<void>
    start: (id: string) => Promise<void>
    wake: (id: string) => Promise<void>
    resume: (id: string) => Promise<{ resumeUs: number }>
    fork: (id: string, params?: MachineForkParams) => Promise<Machine>
    exec: (id: string, params: ExecParams) => Promise<BoxdExecResult>
    streamExec: (id: string, params: StreamExecParams) => BoxdExecStream
    waitUntilReady: (
      id: string,
      params?: WaitUntilReadyParams,
    ) => Promise<Machine>
    files: {
      upload: (
        id: string,
        path: string,
        source: UploadSource,
      ) => Promise<number>
      download: (id: string, path: string) => Promise<Uint8Array>
    }
    proxies: {
      create: (
        machine: string,
        name: string,
        port: number,
      ) => Promise<CreatedProxy>
      list: (machine: string) => Promise<Array<BoxdProxy>>
      setPort: (
        machine: string,
        port: number | 'auto',
        params?: { name?: string },
      ) => Promise<void>
    }
  }
  snapshots: {
    create: (machine: string, name: string) => Promise<CreatedSnapshot>
    get: (name: string, params?: { org?: string }) => Promise<Snapshot>
  }
}

export interface BoxdHandleDeps {
  client: BoxdClientLike
  /** The machine as the SDK returned it; `id` is the durable resume/destroy id. */
  machine: Pick<Machine, 'id' | 'name'> & {
    access: Pick<Machine['access'], 'url'>
  }
  /** Org the machine lives in. Snapshots are looked up there. */
  org?: string
  /** Working directory inside the machine; the `/workspace` virtual root maps here. */
  workdir: string
  logger?: BoxdLogger
  /** Env vars to carry over (a fork inherits its parent's). */
  env?: Record<string, string>
}

/**
 * How long `snapshot()` waits for a capture to become restorable. Measured:
 * ~25 s for an 8 GiB machine. `create({ fromSnapshot })` refuses a capture
 * that is still `pending`, so returning earlier would hand the framework a
 * `SnapshotRef` it cannot use yet.
 */
const SNAPSHOT_READY_TIMEOUT_MS = 10 * 60 * 1000
const SNAPSHOT_POLL_MS = 1000

/**
 * Wrap `command` so the process the streaming exec starts leads its own
 * session and process group, and records its pid before running the command.
 *
 * Measured on production boxd: without `setsid` the exec'd shell sits in the
 * exec agent's process group, `kill -- -<pid>` fails, and a `sleep` child
 * survived the bare-pid kill: the exact leak `killableProcesses` exists to
 * rule out. With `setsid` the recorded pid IS the group leader, so one group
 * signal reaches the shell and every child (a `tail -f` started by a
 * multi-statement command, `cmd & …` grandchildren).
 *
 * `-w` makes `setsid` wait and forward the exit status in the one case where
 * it has to fork (the caller was already a group leader). The wrapper removes
 * its own pid file on a normal exit; the kill shell removes it on the kill
 * path (see {@link killRecordedPidCommand}).
 */
function spawnCommand(command: string, cwd: string, pidFile: string): string {
  const inner =
    `echo $$ > ${q(pidFile)}; bash -c ${q(command)}; rc=$?; ` +
    `rm -f ${q(pidFile)}; exit $rc`
  return `cd ${q(cwd)} && exec setsid -w bash -c ${q(inner)}`
}

/** Marker the kill shell prints on stderr when the process survived the kill. */
const KILL_FAILED_MARKER = 'tanstack-sandbox-kill-failed'
/** Marker printed when the pid file never materialised. */
const KILL_NO_PID_MARKER = 'tanstack-sandbox-kill-no-pid'

/**
 * A prompt `kill()` can race the wrapper's `echo $$ > file` (journal-reader
 * kills its follower the instant its abort fires), so the kill shell waits,
 * bounded, for the file.
 */
const PID_WAIT_TIMEOUT_MS = 2000
const PID_WAIT_INTERVAL_MS = 50
/** Grace period between the requested signal and the unconditional `KILL`. */
const KILL_ESCALATION_DELAY_MS = 200

/**
 * A `kill -<sig>` argument for a Node signal name or number. Anything
 * unrecognized degrades to `TERM` rather than interpolating caller-influenced
 * text into a shell command.
 */
function killSignalArg(signal?: NodeJS.Signals | number): string {
  if (typeof signal === 'number' && Number.isInteger(signal) && signal > 0) {
    return String(signal)
  }
  if (typeof signal === 'string') {
    const name = signal.replace(/^SIG/, '')
    if (/^[A-Z][A-Z0-9]*$/.test(name)) return name
  }
  return 'TERM'
}

/**
 * Shell that signals the process group recorded in `pidFile`, escalates to
 * `KILL`, verifies with `kill -0`, and removes the file. It never fails (it
 * runs from teardown paths) but it REPORTS: a survivor prints
 * {@link KILL_FAILED_MARKER}, a missing pid file prints
 * {@link KILL_NO_PID_MARKER}, and {@link BoxdHandle.killRecordedPid} turns
 * either into a logger warning. Same shape as `@tanstack/ai-sandbox-docker`.
 */
function killRecordedPidCommand(
  pidFile: string,
  signal?: NodeJS.Signals | number,
): string {
  const sig = killSignalArg(signal)
  const f = q(pidFile)
  const attempts = Math.ceil(PID_WAIT_TIMEOUT_MS / PID_WAIT_INTERVAL_MS)
  const sleepStep = (PID_WAIT_INTERVAL_MS / 1000).toFixed(3)
  return [
    `pid=''`,
    `i=0`,
    `while [ "$i" -lt ${attempts} ]; do`,
    `  pid=$(cat ${f} 2>/dev/null)`,
    `  [ -n "$pid" ] && break`,
    `  sleep ${sleepStep}`,
    `  i=$((i+1))`,
    `done`,
    `if [ -n "$pid" ]; then`,
    `  kill -${sig} -- -"$pid" 2>/dev/null || kill -${sig} "$pid" 2>/dev/null`,
    `  sleep ${(KILL_ESCALATION_DELAY_MS / 1000).toFixed(3)}`,
    `  kill -KILL -- -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null`,
    `  if kill -0 "$pid" 2>/dev/null; then`,
    `    echo ${KILL_FAILED_MARKER} pid="$pid" >&2`,
    `  fi`,
    `else`,
    `  echo ${KILL_NO_PID_MARKER} file=${f} >&2`,
    `fi`,
    `rm -f ${f}`,
    `:`,
  ].join('\n')
}

/**
 * Decode a byte stream as UTF-8 text without splitting multi-byte characters
 * across chunks: a streaming `TextDecoder` holds a partial trailing sequence
 * until the rest arrives, then flushes once the stream ends.
 */
async function* decodeStream(
  source: AsyncIterable<Uint8Array>,
): AsyncIterable<string> {
  const decoder = new TextDecoder('utf-8')
  for await (const chunk of source) {
    const text = decoder.decode(chunk, { stream: true })
    if (text !== '') yield text
  }
  const tail = decoder.decode()
  if (tail !== '') yield tail
}

/** A snapshot name label: lowercase `[a-z0-9-]`, the shape machine names use. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class BoxdHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'boxd'
  readonly workspaceRoot: string
  readonly capabilities = BOXD_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly client: BoxdClientLike
  private readonly machineName: string
  private readonly url: string
  private readonly org: string | undefined
  private readonly workdir: string
  private readonly logger: BoxdLogger | undefined
  private readonly envVars: Record<string, string>

  constructor(private readonly deps: BoxdHandleDeps) {
    this.client = deps.client
    this.id = deps.machine.id
    this.machineName = deps.machine.name
    this.url = deps.machine.access.url
    this.org = deps.org
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.logger = deps.logger
    this.envVars = { ...deps.env }

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: async (p) =>
        new TextDecoder().decode(
          await this.client.machines.files.download(this.id, this.abs(p)),
        ),
      readBytes: (p) =>
        this.client.machines.files.download(this.id, this.abs(p)),
      // `upload` creates missing parent directories (measured), so no mkdir.
      write: async (p, data) => {
        await this.client.machines.files.upload(this.id, this.abs(p), data)
      },
      list: async (p) => {
        const r = await this.exec(`ls -1Ap ${q(this.abs(p))}`)
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
      lstat: async (p) => this.lstat(this.abs(p)),
      mkdir: async (p) => {
        const r = await this.exec(`mkdir -p ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`mkdir failed: ${errText(r)}`)
      },
      remove: async (p) => {
        const r = await this.exec(`rm -rf ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`remove failed: ${errText(r)}`)
      },
      rename: async (from, to) => {
        const r = await this.exec(`mv ${q(this.abs(from))} ${q(this.abs(to))}`)
        if (r.exitCode !== 0) throw new Error(`rename failed: ${errText(r)}`)
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

  /** Map the conventional `/workspace` virtual root to the machine workdir. */
  private abs(p: string): string {
    if (this.workdir === '/workspace') return p
    if (p === '/workspace') return this.workdir
    if (p.startsWith('/workspace/'))
      return `${this.workdir}/${p.slice('/workspace/'.length)}`
    return p
  }

  private async lstat(path: string): Promise<SandboxFsStat | undefined> {
    const r = await this.exec(lstatCommand(path))
    if (r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING) return undefined
    if (r.exitCode !== 0) throw new Error(`lstat failed: ${errText(r)}`)
    return parseLstatOutput(r.stdout)
  }

  private mergedEnv(extra?: Record<string, string>): Record<string, string> {
    return { ...this.envVars, ...extra }
  }

  private cwd(opts?: ProcessOptions): string {
    return opts?.cwd ? this.abs(opts.cwd) : this.workdir
  }

  /**
   * One-shot exec. The SDK call has no abort hook, so `signal` is honoured
   * before the call only; a command already running finishes on its own.
   * There is no client-side deadline: a 65 s command completed (measured), and
   * the server only drops a non-PTY exec after 30 min without output.
   */
  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    opts?.signal?.throwIfAborted()
    const r = await this.client.machines.exec(this.id, {
      command: ['bash', '-c', `cd ${q(this.cwd(opts))} && ${command}`],
      env: this.mergedEnv(opts?.env),
    })
    return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode }
  }

  private spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    opts?.signal?.throwIfAborted()
    const pidFile = `/tmp/.tanstack-sandbox-spawn-${randomUUID()}.pid`
    const stream = this.client.machines.streamExec(this.id, {
      command: ['bash', '-c', spawnCommand(command, this.cwd(opts), pidFile)],
      env: this.mergedEnv(opts?.env),
    })

    // ONE KILL PER WRAPPER, and a no-op once the wrapper has exited on its own
    // (it removed its pid file, so the kill shell would only wait for a file
    // nothing will write and then warn about a phantom orphan).
    const state: { exited: boolean; kill?: Promise<void> } = { exited: false }
    const kill = (signal?: NodeJS.Signals | number): Promise<void> => {
      if (state.exited) return Promise.resolve()
      state.kill ??= this.killRecordedPid(pidFile, signal).finally(() =>
        stream.close(),
      )
      return state.kill
    }

    const onAbort = (): void => {
      void kill()
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })
    const exit = stream.wait().finally(() => {
      opts?.signal?.removeEventListener('abort', onAbort)
      if (state.kill === undefined) state.exited = true
    })
    exit.catch(() => undefined)

    return Promise.resolve({
      // The wrapper's pid lives in the machine; the host never sees a pid.
      pid: -1,
      stdout: decodeStream(stream.stdout),
      stderr: decodeStream(stream.stderr),
      stdin: {
        write: (data) => {
          stream.write(data)
          return Promise.resolve()
        },
        end: () => {
          stream.end()
          return Promise.resolve()
        },
      },
      wait: () => exit,
      kill,
    })
  }

  /**
   * Signal the in-machine process group that recorded its pid to `pidFile`,
   * and REPORT anything that says it may still be alive. Never throws: this
   * runs from teardown paths, where a rejection would wedge the caller instead
   * of freeing anything. But a refused kill reaches the logger, so an
   * unkillable process is visible rather than silently assumed dead.
   */
  private async killRecordedPid(
    pidFile: string,
    signal?: NodeJS.Signals | number,
  ): Promise<void> {
    let result: ExecResult
    try {
      result = await this.exec(killRecordedPidCommand(pidFile, signal), {
        cwd: '/',
      })
    } catch (error) {
      this.logger?.warn('boxd: could not run the in-machine kill', {
        pidFile,
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    if (result.stderr.includes(KILL_FAILED_MARKER)) {
      this.logger?.warn(
        'boxd: in-machine process survived the kill; it may be orphaned',
        { pidFile, stderr: result.stderr.trim() },
      )
    } else if (result.stderr.includes(KILL_NO_PID_MARKER)) {
      this.logger?.warn(
        'boxd: no pid was recorded for this process, so it could not be signalled',
        { pidFile, stderr: result.stderr.trim() },
      )
    }
  }

  /**
   * Every machine has one public HTTPS route, `https://<name>.boxd.sh`, whose
   * target port is auto-detected by default. `connect(port)` pins that route
   * to `port` and returns the URL. The URL is public: anyone who has it can
   * reach the port.
   */
  private async connectPort(port: number): Promise<SandboxChannel> {
    await this.client.machines.proxies.setPort(this.id, port)
    return { url: this.url }
  }

  /**
   * Capture the machine (memory + disk) as a boxd snapshot named
   * `<machine>-<label>`, and wait until it is restorable. Re-saving under the
   * same label adds a version; a restore always boots the latest one. The
   * returned `id` is the snapshot NAME, which is what `create({ fromSnapshot })`
   * and `snapshots.get` take.
   */
  snapshot = async (label?: string): Promise<SnapshotRef> => {
    const name = `${this.machineName}-${slug(label ?? 'snapshot') || 'snapshot'}`
    await this.client.snapshots.create(this.id, name)
    const deadline = Date.now() + SNAPSHOT_READY_TIMEOUT_MS
    for (;;) {
      const snap = await this.client.snapshots.get(name, this.orgParams())
      if (snap.status === 'ready') break
      if (snap.status === 'failed') {
        throw new Error(`boxd: snapshot "${name}" failed to capture`)
      }
      if (Date.now() > deadline) {
        throw new Error(
          `boxd: snapshot "${name}" still pending after ${SNAPSHOT_READY_TIMEOUT_MS} ms`,
        )
      }
      await sleep(SNAPSHOT_POLL_MS)
    }
    return { id: name, ...(label !== undefined ? { label } : {}) }
  }

  /** Live fork: disk, memory and running processes, into a new machine. */
  fork = async (): Promise<SandboxHandle> => {
    const machine = await this.client.machines.fork(this.id, {
      name: `${this.machineName}-fork-${randomUUID().replace(/-/g, '').slice(0, 8)}`,
    })
    const ready = await this.client.machines.waitUntilReady(machine.id)
    return new BoxdHandle({ ...this.deps, machine: ready, env: this.envVars })
  }

  private orgParams(): { org?: string } {
    return this.org === undefined ? {} : { org: this.org }
  }

  async destroy(): Promise<void> {
    await this.client.machines.delete(this.id)
  }
}

/** POSIX single-quote escape for embedding text in `bash -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function errText(r: { stdout: string; stderr: string }): string {
  return r.stderr.trim() || r.stdout.trim() || '(no output)'
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
