/**
 * SandboxHandle backed by the host machine — no isolation. The "sandbox" is a
 * real host directory; fs/exec/git operate directly on it.
 *
 * TRUST BOUNDARY: local-process runs commands and file writes on the HOST with
 * the privileges of the current process. It provides NO isolation, NO network
 * policy, and `exec` runs through a shell. Use it only in trusted/dev contexts
 * (the fast no-Docker dev loop); never expose it to untrusted prompts in a
 * context where host compromise matters. For isolation use the Docker or
 * Cloudflare providers.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, watch as watchFs } from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import {
  DEFAULT_WORKSPACE_ROOT,
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import type { ChildProcess } from 'node:child_process'
import type { Readable } from 'node:stream'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxHandle,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

/**
 * Resolve a POSIX `sh` to run commands through. Commands are built with POSIX
 * single-quote quoting (e.g. `--permission-mode 'bypassPermissions'`), so they
 * must run under a POSIX shell on EVERY platform — on native Windows, `cmd.exe`
 * (what Node's `shell: true` uses) does not strip single quotes and breaks them.
 *
 * - Unix: `sh` resolves via PATH (`/bin/sh`).
 * - Windows: no POSIX shell on the default PATH, so locate git-bash / WSL's
 *   `sh.exe` — from the `TANSTACK_SANDBOX_SH` override, derived from `git` on
 *   PATH (`…\Git\cmd` → `…\Git\usr\bin\sh.exe`), or common install dirs.
 * Cached after first resolution.
 */
let cachedShell: string | undefined
function posixShell(): string {
  if (cachedShell !== undefined) return cachedShell
  if (process.platform !== 'win32') return (cachedShell = 'sh')

  const candidates: Array<string> = []
  if (process.env.TANSTACK_SANDBOX_SH) {
    candidates.push(process.env.TANSTACK_SANDBOX_SH)
  }
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (/\\git\\cmd\\?$/i.test(dir)) {
      candidates.push(path.join(dir, '..', 'usr', 'bin', 'sh.exe'))
      candidates.push(path.join(dir, '..', 'bin', 'sh.exe'))
    }
  }
  candidates.push(
    'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
    'C:\\Program Files\\Git\\bin\\sh.exe',
  )
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return (cachedShell = candidate)
  }
  // Last resort: rely on PATH (a clear ENOENT if no POSIX sh is installed).
  return (cachedShell = 'sh')
}

/**
 * Extra PATH dirs so a Windows git-bash `sh` can find its Unix tools (`sed`,
 * `dirname`, `uname`, `git`, …). Node spawns `sh.exe` with the bare Windows PATH,
 * which omits git-bash's `usr/bin`/`mingw64/bin` — so npm CLI shims that are
 * POSIX shell scripts (e.g. `codex`) fail with "command not found". Empty on
 * non-Windows or when no real git-bash sh was resolved.
 */
let cachedShellPathDirs: Array<string> | undefined
function posixShellPathDirs(): Array<string> {
  if (cachedShellPathDirs !== undefined) return cachedShellPathDirs
  const sh = posixShell()
  if (process.platform !== 'win32' || sh === 'sh') {
    return (cachedShellPathDirs = [])
  }
  const dirs = [path.dirname(sh)] // …\Git\usr\bin — holds sed/dirname/uname/sh
  let dir = path.dirname(sh)
  for (let i = 0; i < 3; i += 1) {
    if (/\\git$/i.test(dir)) {
      for (const sub of ['usr\\bin', 'bin', 'mingw64\\bin']) {
        dirs.push(path.join(dir, sub))
      }
      break
    }
    dir = path.dirname(dir)
  }
  return (cachedShellPathDirs = [...new Set(dirs)].filter((d) => existsSync(d)))
}

/**
 * Prepend {@link posixShellPathDirs} to `env`'s PATH in place, respecting the
 * existing key's casing (Windows uses `Path`) so we never create a duplicate,
 * ignored variable. No-op off Windows / without a resolved git-bash `sh`.
 */
function prependShellPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const extraPaths = posixShellPathDirs()
  if (extraPaths.length > 0) {
    const pathKey =
      Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
    env[pathKey] = [...extraPaths, env[pathKey] ?? '']
      .filter(Boolean)
      .join(path.delimiter)
  }
  return env
}

export const LOCAL_PROCESS_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: true,
  // `killTree` forcibly kills the spawned `sh` wrapper AND its descendants — on
  // POSIX by signalling the whole process GROUP (the wrapper is spawned
  // `detached`, so a negative pid reaches every descendant), on Windows by
  // `taskkill /T` plus a verified sweep of the MSYS descendants `/T` cannot
  // reach. The same `killTree` runs on `signal` abort in both `exec` and
  // `spawn`, so a spawned process is always forcibly terminable by the caller.
  //
  // Signalling the wrapper alone is NOT enough on either platform and this must
  // not be "simplified" back to that: `sh -c '<cmd>'` does not reliably exec its
  // command, so killing the `sh` leaves the command running (see `killTree`).
  killableProcesses: true,
  snapshots: false,
  networkPolicy: false,
  durableFilesystem: true,
  fork: true,
}

/**
 * Decode spawn stdout/stderr as a byte stream, not chunk-by-chunk. A naive
 * per-chunk `Buffer.toString('utf8')` corrupts any multi-byte UTF-8 character
 * that a Node stream happens to split across two `data` events — each half
 * decodes independently into a replacement character. A streaming
 * `TextDecoder` retains a partial trailing sequence across `decode()` calls
 * (`{ stream: true }`) and only emits it once the full character has
 * arrived. We flush (`decoder.decode()` with no args) once the stream ends
 * so a genuinely truncated trailing sequence is still surfaced (as U+FFFD)
 * rather than silently dropped — matching the pattern already used in
 * `ai-sandbox-sprites`'s `client.ts`.
 */
async function* decodeStream(stream: Readable | null): AsyncIterable<string> {
  if (!stream) return
  const decoder = new TextDecoder('utf-8')
  for await (const chunk of stream) {
    yield typeof chunk === 'string'
      ? chunk
      : decoder.decode(chunk as Buffer, { stream: true })
  }
  const tail = decoder.decode()
  if (tail !== '') yield tail
}

/**
 * Sink for non-fatal teardown diagnostics. Structural on purpose: `@tanstack/ai`'s
 * `InternalLogger` satisfies it as-is (its `warn` is gated by the `errors`
 * category, on by default), so a consumer can pass the logger it already has
 * without this package taking a runtime dependency on it.
 */
export interface LocalProcessLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void
}

/** One row of MSYS `ps`: the MSYS-side pid table, keyed to Windows by `winpid`. */
interface MsysProcess {
  pid: number
  ppid: number
  winpid: number
}

/**
 * Parse MSYS/git-bash `ps` output. Columns are
 * `PID PPID PGID WINPID TTY UID STIME COMMAND`; the header and any
 * non-numeric row are skipped, as is any row with a `PPID` of `0` — that is how
 * `ps -W` renders the native Windows processes it appends, and they are not part
 * of any MSYS tree. (We call plain `ps`; the filter keeps a stray `-W` from ever
 * widening the sweep.) Every genuine MSYS row has a `PPID` of at least `1`.
 *
 * Exported for tests — parsing fixed text is the portable half of the
 * orphan-sweep logic.
 */
export function parseMsysProcessTable(stdout: string): Array<MsysProcess> {
  const rows: Array<MsysProcess> = []
  for (const line of stdout.split('\n')) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 4) continue
    const pid = Number(cols[0])
    const ppid = Number(cols[1])
    const winpid = Number(cols[3])
    if (
      !Number.isInteger(pid) ||
      !Number.isInteger(ppid) ||
      !Number.isInteger(winpid) ||
      pid <= 0 ||
      ppid <= 0 ||
      winpid <= 0
    ) {
      continue
    }
    rows.push({ pid, ppid, winpid })
  }
  return rows
}

/**
 * Windows pids of every MSYS descendant of the process whose Windows pid is
 * `rootWinPid`, excluding the root itself. Returns `[]` when the root is not an
 * MSYS process (nothing to sweep beyond what `taskkill /T` already covers).
 *
 * Exported for tests alongside {@link parseMsysProcessTable}.
 */
export function msysDescendantWinPids(
  rows: Array<MsysProcess>,
  rootWinPid: number,
): Array<number> {
  const root = rows.find((r) => r.winpid === rootWinPid)
  if (!root) return []
  const byPpid = new Map<number, Array<MsysProcess>>()
  for (const row of rows) {
    const siblings = byPpid.get(row.ppid)
    if (siblings) siblings.push(row)
    else byPpid.set(row.ppid, [row])
  }
  const winPids: Array<number> = []
  const seen = new Set<number>([root.pid])
  const queue = [root.pid]
  while (queue.length > 0) {
    // Non-null: `queue.length > 0` was just checked, and nothing else shifts it.
    const next = queue.shift() ?? 0
    for (const child of byPpid.get(next) ?? []) {
      if (seen.has(child.pid)) continue // cycle guard
      seen.add(child.pid)
      queue.push(child.pid)
      if (child.winpid !== rootWinPid) winPids.push(child.winpid)
    }
  }
  return winPids
}

/** Snapshot the MSYS process table via the resolved POSIX `sh`. `[]` if unavailable. */
function msysProcessTable(logger?: LocalProcessLogger): Array<MsysProcess> {
  const res = spawnSync(posixShell(), ['-c', 'ps'], {
    encoding: 'utf8',
    env: prependShellPath({ ...process.env }),
  })
  if (res.error !== undefined || res.status !== 0) {
    logger?.warn('local-process: could not snapshot the MSYS process table', {
      error: res.error?.message,
      status: res.status,
    })
    return []
  }
  return parseMsysProcessTable(res.stdout)
}

/** Whether `pid` is still running. `process.kill(pid, 0)` sends no signal. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * What a finished `taskkill` invocation actually means.
 *
 * - `killed` — it exited `0`; the pid it was given is gone.
 * - `already-exited` — the process was gone before we asked. This is SUCCESS:
 *   nothing leaked, and retrying or reporting it would make every normal
 *   teardown look like a failure. taskkill says this three different ways, all
 *   of which must be recognized (see {@link ALREADY_EXITED_STDERR}).
 * - `failed` — any other nonzero status: a real refusal (access denied, a
 *   protected process). Worth reporting.
 *
 * Exported for tests: `spawnSync` reporting no `error` only means taskkill was
 * *launched*, and conflating "I successfully asked" with "it died" is exactly the
 * bug this file used to have.
 */
export type TaskkillOutcome = 'killed' | 'already-exited' | 'failed'

/**
 * taskkill wordings that all mean "it was already gone".
 *
 * Status `128` with `The process "<pid>" not found.` is the overwhelmingly
 * common one (verified against a pid whose process had already exited). The
 * others come out of `/T`, which reports per tree member and can hit a child
 * that exits mid-walk:
 *
 * - `… could not be terminated. Reason: There is no running instance of the
 *   task.` — status `1`, matching NEITHER of the two wordings this regex
 *   originally covered, so it was classified `failed` and logged a warning on
 *   what is a completely normal teardown. That misclassification is the known
 *   suspect for the intermittent single-warning failure of the
 *   "a normal kill neither throws nor reports a failure" case below.
 * - `does not exist` — the older wording.
 *
 * A refusal (`Access is denied.`, `This is critical system process.`) must NOT
 * match: those mean the process is still running and the caller has leaked it.
 */
const ALREADY_EXITED_STDERR =
  /not found|does not exist|no running instance of the task/i

export function classifyTaskkillResult(
  status: number | null,
  stderr: string,
): TaskkillOutcome {
  if (status === 0) return 'killed'
  if (status === 128 || ALREADY_EXITED_STDERR.test(stderr)) {
    return 'already-exited'
  }
  return 'failed'
}

/**
 * `taskkill` one pid. Returns whether the process is gone afterwards.
 *
 * Exported for tests alongside {@link classifyTaskkillResult}: the classifier
 * can be unit-tested on fixed strings, but only driving the real binary proves
 * the warning channel actually fires — and that the raw stderr reaches the log,
 * without which an intermittent misclassification is undiagnosable.
 */
export function taskkillPid(
  pid: number,
  tree: boolean,
  logger?: LocalProcessLogger,
): boolean {
  const args = ['/PID', String(pid), ...(tree ? ['/T'] : []), '/F']
  const res = spawnSync('taskkill', args, { encoding: 'utf8' })
  if (res.error !== undefined) {
    logger?.warn('local-process: taskkill could not be launched', {
      pid,
      error: res.error.message,
    })
    return false
  }
  const outcome = classifyTaskkillResult(res.status, res.stderr ?? '')
  if (outcome === 'failed') {
    logger?.warn('local-process: taskkill failed to kill a process', {
      pid,
      status: res.status,
      stderr: (res.stderr ?? '').trim(),
    })
    return false
  }
  return true
}

/**
 * Kill a spawned child AND all its descendants.
 *
 * We spawn every command through `sh -c <command>`, so `child` is the `sh`
 * wrapper. `child.kill()` signals only that wrapper — its grandchildren (e.g.
 * `node` → a harness binary like `opencode serve`) keep running and hold their
 * ports, orphaning a server that then blocks the next run's port.
 *
 * ON POSIX we signal the process GROUP (`process.kill(-pid, …)`), which is why
 * `spawn` passes `detached: true` (see {@link spawnDetached}) to make the
 * wrapper its own group leader. Signalling the bare wrapper is NOT enough, and
 * the comment that used to sit here — "sh forwards on exec" — was wrong: `sh -c
 * '<cmd>'` does not reliably exec its command. Measured on Linux (node:22,
 * `/bin/sh` → dash): `sh -c 'sleep 987654321'` shows BOTH `sh` and `sleep` in
 * `ps`, and `child.kill('SIGKILL')` leaves `sleep` running. That is the POSIX
 * twin of the Windows `tail.exe` leak below, and it made
 * `killableProcesses: true` false on every platform.
 *
 * ON WINDOWS there are no process groups, so we walk the tree with
 * `taskkill /T` and then sweep what `/T` cannot reach.
 *
 * WHY `taskkill /T` IS NOT ENOUGH (measured, git-bash `sh` on Windows 11). For a
 * multi-statement command — e.g. `journalFollowCommand`'s
 * `mkdir -p …; : >> …; tail -c +1 -f …` — MSYS's fork emulation runs the final
 * `tail` under an intermediate `sh.exe` that then exits. Windows does not
 * reparent, so `tail.exe`'s `ParentProcessId` stays pointing at that dead pid and
 * `taskkill /T` — which walks only LIVE parent links from the pid it is given —
 * never reaches it. Worse, taskkill still exits `0` ("SUCCESS: … PID <sh> has
 * been terminated"), so checking the exit status alone does not catch this: the
 * shipped journal conformance suite leaked 2 `tail.exe` per run, accumulating
 * for the life of the machine.
 *
 * MSYS's own pid table does keep the logical parentage (`ps` reports `tail`'s
 * PPID as our `sh`), so we snapshot it, resolve the descendants' Windows pids,
 * and kill the survivors directly. The snapshot MUST be taken BEFORE the
 * `taskkill`: once our `sh` is gone, its `winpid` is no longer in the table and
 * the attribution is lost.
 *
 * TOTAL BY CONSTRUCTION: every failure is logged, never thrown. Callers are
 * teardown paths (`SpawnHandle.kill`, `signal` abort handlers, `pipeToRunLog`)
 * where a throw would wedge a run at `'running'` with its tailers parked.
 */
function killTree(
  child: ChildProcess,
  signal?: NodeJS.Signals | number,
  logger?: LocalProcessLogger,
): void {
  const pid = child.pid
  if (pid === undefined) return
  if (process.platform !== 'win32') {
    try {
      // Negative pid = "the whole group", reaching the descendants that
      // signalling `pid` alone would orphan.
      process.kill(-pid, signal ?? 'SIGTERM')
    } catch (error) {
      // ESRCH means the group is already gone — the ordinary "it exited on its
      // own" teardown, not a failure, and must stay silent (see the
      // already-exited reasoning on `classifyTaskkillResult`). Anything else and
      // we still try the wrapper alone: worse than a group kill, better than
      // giving up.
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        logger?.warn('local-process: could not signal the process group', {
          pid,
          error: error instanceof Error ? error.message : String(error),
        })
        child.kill(signal)
      }
    }
    return
  }

  // Attribute the tree first — taskkill destroys the evidence (see above).
  const strays = msysDescendantWinPids(msysProcessTable(logger), pid)

  if (!taskkillPid(pid, true, logger)) {
    // taskkill unusable or refused → best-effort signal, as before.
    child.kill(signal)
  }

  // Verify and escalate: anything `/T` could not reach gets killed directly.
  const survivors = strays.filter((strayPid) => isAlive(strayPid))
  for (const strayPid of survivors) taskkillPid(strayPid, true, logger)

  const leaked = survivors.filter((strayPid) => isAlive(strayPid))
  if (leaked.length > 0) {
    logger?.warn('local-process: killTree left descendants running', {
      pid,
      leaked,
    })
  }
}

/**
 * `spawn` options that make {@link killTree}'s POSIX branch able to do its job.
 *
 * `detached: true` puts the `sh` wrapper in its own process group, so
 * `process.kill(-pid, …)` reaches the command and its descendants. Without it
 * the wrapper shares OUR group and the negative pid would signal the test
 * runner / host process itself — so this flag and that kill are a single
 * mechanism and must not be separated.
 *
 * WINDOWS IS DELIBERATELY EXCLUDED: `detached` there means "give the child its
 * own console", which can flash a console window, and the Windows branch of
 * `killTree` uses `taskkill /T` instead and has no use for a group.
 */
const spawnDetached = process.platform !== 'win32'

export interface LocalProcessHandleOptions {
  /** Real host directory backing this sandbox (its workspace root). */
  root: string
  /** Remove the backing dir on destroy. */
  removeOnDestroy: boolean
  /** Create a fork by copying this sandbox's dir to a new root. */
  forkFactory: (sourceRoot: string) => Promise<SandboxHandle>
  /** Env vars to delete from the inherited `process.env` before spawning. */
  scrubEnv?: Array<string>
  /**
   * Sink for non-fatal teardown diagnostics — currently a `killTree` that could
   * not confirm the process tree is gone. Teardown never throws, so without a
   * logger these conditions are silent.
   */
  logger?: LocalProcessLogger
}

export class LocalProcessHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'local-process'
  readonly capabilities = LOCAL_PROCESS_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly root: string
  private readonly options: LocalProcessHandleOptions
  private readonly envVars: Record<string, string> = {}

  constructor(options: LocalProcessHandleOptions) {
    this.root = options.root
    this.id = options.root
    this.options = options

    this.fs = {
      read: async (p) => fsp.readFile(this.resolve(p), 'utf8'),
      readBytes: async (p) =>
        new Uint8Array(await fsp.readFile(this.resolve(p))),
      write: async (p, data) => {
        const target = this.resolve(p)
        await fsp.mkdir(path.dirname(target), { recursive: true })
        await fsp.writeFile(
          target,
          typeof data === 'string' ? data : Buffer.from(data),
        )
      },
      list: async (p) => {
        const entries = await fsp.readdir(this.resolve(p), {
          withFileTypes: true,
        })
        return entries.map((e) => ({
          name: e.name,
          path: `${p.replace(/\/$/, '')}/${e.name}`,
          type: e.isDirectory() ? ('dir' as const) : ('file' as const),
        }))
      },
      mkdir: async (p) => {
        await fsp.mkdir(this.resolve(p), { recursive: true })
      },
      remove: async (p) => {
        await fsp.rm(this.resolve(p), { recursive: true, force: true })
      },
      rename: async (from, to) => {
        await fsp.rename(this.resolve(from), this.resolve(to))
      },
      exists: async (p) => {
        try {
          await fsp.access(this.resolve(p))
          return true
        } catch {
          return false
        }
      },
    }

    // Native recursive file watching is supported on Windows/macOS but not
    // Linux (Node throws ERR_FEATURE_UNAVAILABLE_ON_PLATFORM). Expose the
    // optional `fs.watch` seam only where it works; on Linux it stays
    // undefined so `watchWorkspace` falls back to the portable exec-poll path.
    if (process.platform !== 'linux') {
      this.fs.watch = (p, onEvent) => {
        const dir = this.resolve(p)
        // Emit paths under the requested watch root `p` (not a hardcoded
        // `/workspace`), so callers watching a sub-path get consistent paths.
        const base = p.replace(/\/+$/, '')
        const watcher = watchFs(
          dir,
          { recursive: true },
          (eventType, filename) => {
            if (filename === null) return
            const rel = filename.toString().split(path.sep).join('/')
            onEvent({ type: eventType, path: `${base}/${rel}` })
          },
        )
        return Promise.resolve({
          stop: () => {
            watcher.close()
            return Promise.resolve()
          },
        })
      }
    }

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.git = createExecBackedGit(this.process, this.root)

    this.ports = {
      // The host can always reach the process directly on localhost.
      connect: (port) => Promise.resolve({ url: `http://127.0.0.1:${port}` }),
    }

    this.env = {
      set: (vars) => {
        Object.assign(this.envVars, vars)
        return Promise.resolve()
      },
    }
  }

  /** Map a virtual `/workspace` (or other absolute/relative) path onto the host root. */
  private resolve(p: string): string {
    let rel: string
    if (p === DEFAULT_WORKSPACE_ROOT) rel = ''
    else if (p.startsWith(`${DEFAULT_WORKSPACE_ROOT}/`)) {
      rel = p.slice(DEFAULT_WORKSPACE_ROOT.length + 1)
    } else if (p.startsWith('/')) rel = p.slice(1)
    else rel = p
    const resolved = path.resolve(this.root, rel)
    // Containment: never let an agent's path escape the sandbox dir.
    const rootWithSep = this.root.endsWith(path.sep)
      ? this.root
      : this.root + path.sep
    if (resolved !== this.root && !resolved.startsWith(rootWithSep)) {
      throw new Error(
        `local-process: path "${p}" resolves outside the sandbox root "${this.root}".`,
      )
    }
    return resolved
  }

  private resolveCwd(cwd: string | undefined): string {
    return cwd ? this.resolve(cwd) : this.root
  }

  private mergedEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.envVars, ...extra }
    // Drop scrubbed vars so a host CLI falls back to its own stored auth
    // (e.g. remove ANTHROPIC_API_KEY → Claude Code uses the logged-in
    // subscription instead of billing the API). Delete (not blank) so the var
    // is truly absent, not present-but-empty.
    for (const key of this.options.scrubEnv ?? []) delete env[key]
    // Prepend git-bash's tool dirs (Windows) so the POSIX `sh` can find sed/uname/
    // git/etc. that npm CLI shims depend on.
    return prependShellPath(env)
  }

  private exec(command: string, opts?: ProcessOptions): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve, reject) => {
      // Run via a POSIX `sh` on every platform (see posixShell) so the adapter's
      // single-quote-quoted commands work identically — including native Windows,
      // where `shell: true` would be cmd.exe and mangle the quoting.
      const child = spawn(posixShell(), ['-c', command], {
        cwd: this.resolveCwd(opts?.cwd),
        env: this.mergedEnv(opts?.env),
        detached: spawnDetached,
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
      const onAbort = (): void => {
        killTree(child, undefined, this.options.logger)
      }
      opts?.signal?.addEventListener('abort', onAbort, { once: true })
      child.on('error', reject)
      child.on('close', (code) => {
        opts?.signal?.removeEventListener('abort', onAbort)
        resolve({ stdout, stderr, exitCode: code ?? 0 })
      })
    })
  }

  private spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    // Via POSIX `sh` on every platform (see posixShell / exec above).
    const child = spawn(posixShell(), ['-c', command], {
      cwd: this.resolveCwd(opts?.cwd),
      env: this.mergedEnv(opts?.env),
      detached: spawnDetached,
    })
    if (opts?.signal) {
      opts.signal.addEventListener(
        'abort',
        () => killTree(child, undefined, this.options.logger),
        {
          once: true,
        },
      )
    }
    const handle: SpawnHandle = {
      pid: child.pid ?? -1,
      stdout: decodeStream(child.stdout),
      stderr: decodeStream(child.stderr),
      stdin: {
        write: (data) =>
          new Promise<void>((resolve, reject) => {
            child.stdin.write(data, (err) => (err ? reject(err) : resolve()))
          }),
        end: () =>
          new Promise<void>((resolve) => {
            child.stdin.end(() => resolve())
          }),
      },
      wait: () =>
        new Promise<number>((resolve, reject) => {
          child.on('error', reject)
          child.on('close', (code) => resolve(code ?? 0))
        }),
      kill: (signal) => {
        killTree(child, signal, this.options.logger)
        return Promise.resolve()
      },
    }
    return Promise.resolve(handle)
  }

  // local-process has no snapshot primitive; fork copies the dir instead.
  snapshot = undefined

  fork = (): Promise<SandboxHandle> => {
    if (!this.capabilities.fork) {
      throw new UnsupportedCapabilityError('local-process', 'fork')
    }
    return this.options.forkFactory(this.root)
  }

  async destroy(): Promise<void> {
    if (this.options.removeOnDestroy) {
      await fsp.rm(this.root, { recursive: true, force: true })
    }
  }
}
