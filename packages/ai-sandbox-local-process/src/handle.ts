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

let cachedShell: string | undefined
function posixShell(): string {
  if (cachedShell !== undefined) return cachedShell
  if (process.platform !== 'win32') return (cachedShell = 'sh')

  const candidates: Array<string> = []
  if (process.env.TANSTACK_SANDBOX_SH) {
    candidates.push(process.env.TANSTACK_SANDBOX_SH)
  }
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter)
  for (const dir of pathDirs) {
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

let cachedShellPathDirs: Array<string> | undefined
function posixShellPathDirs(): Array<string> {
  if (cachedShellPathDirs !== undefined) return cachedShellPathDirs
  const sh = posixShell()
  const skipGitPathDirs = process.platform !== 'win32' || sh === 'sh'
  if (skipGitPathDirs) {
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
  killableProcesses: true,
  snapshots: false,
  networkPolicy: false,
  durableFilesystem: true,
  fork: true,
}

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

export interface LocalProcessLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void
}

/** Sleep helper for the bounded teardown backoffs below. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const BUSY_ERROR_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'])

/** Bounded backoff for {@link removeDirWithRetry}: 10 attempts, ~2.75s total. */
const REMOVE_MAX_ATTEMPTS = 10
const REMOVE_RETRY_DELAY_MS = 50

/** How long {@link LocalProcessHandle.destroy} waits for a killed child to exit. */
const CHILD_EXIT_TIMEOUT_MS = 5_000

export async function removeDirWithRetry(
  dir: string,
  logger?: LocalProcessLogger,
): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= REMOVE_MAX_ATTEMPTS; attempt += 1) {
    try {
      await fsp.rm(dir, { recursive: true, force: true })
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === undefined) throw error
      if (!BUSY_ERROR_CODES.has(code)) throw error
      lastError = error
      if (attempt < REMOVE_MAX_ATTEMPTS) {
        await delay(REMOVE_RETRY_DELAY_MS * attempt)
      }
    }
  }
  logger?.warn('local-process: could not remove the sandbox dir; still busy', {
    dir,
    attempts: REMOVE_MAX_ATTEMPTS,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  })
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  const alreadyExited = child.exitCode !== null || child.signalCode !== null
  if (alreadyExited) {
    return Promise.resolve(true)
  }
  return new Promise<boolean>((resolve) => {
    const onExit = (): void => resolve(true)
    child.once('exit', onExit)
    setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs).unref()
  })
}

/** One row of MSYS `ps`: the MSYS-side pid table, keyed to Windows by `winpid`. */
interface MsysProcess {
  pid: number
  ppid: number
  winpid: number
}

export function parseMsysProcessTable(stdout: string): Array<MsysProcess> {
  const rows: Array<MsysProcess> = []
  const lines = stdout.split('\n')
  for (const line of lines) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 4) continue
    const pid = Number(cols[0])
    const ppid = Number(cols[1])
    const winpid = Number(cols[3])
    const invalidRow =
      !Number.isInteger(pid) ||
      !Number.isInteger(ppid) ||
      !Number.isInteger(winpid) ||
      pid <= 0 ||
      ppid <= 0 ||
      winpid <= 0
    if (invalidRow) {
      continue
    }
    rows.push({ pid, ppid, winpid })
  }
  return rows
}

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

export type TaskkillOutcome = 'killed' | 'already-exited' | 'failed'

const ALREADY_EXITED_STDERR =
  /not found|does not exist|no running instance of the task/i

export function classifyTaskkillResult(
  status: number | null,
  stderr: string,
): TaskkillOutcome {
  if (status === 0) return 'killed'
  const alreadyExited = status === 128 || ALREADY_EXITED_STDERR.test(stderr)
  if (alreadyExited) {
    return 'already-exited'
  }
  return 'failed'
}

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

function killTree(
  child: ChildProcess,
  signal?: NodeJS.Signals | number,
  logger?: LocalProcessLogger,
  rows?: Array<MsysProcess>,
): void {
  const pid = child.pid
  if (pid === undefined) return
  if (process.platform !== 'win32') {
    try {
      // Negative pid = "the whole group", reaching the descendants that
      // signalling `pid` alone would orphan.
      process.kill(-pid, signal ?? 'SIGTERM')
    } catch (error) {
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
  const strays = msysDescendantWinPids(rows ?? msysProcessTable(logger), pid)

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
  private readonly liveChildren = new Set<ChildProcess>()

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
      lstat: async (p) => {
        let stat: Awaited<ReturnType<typeof fsp.lstat>>
        try {
          stat = await fsp.lstat(this.resolve(p))
        } catch (error) {
          if (
            error !== null &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'ENOENT'
          )
            return undefined
          throw error
        }
        const type = stat.isFile()
          ? 'file'
          : stat.isDirectory()
            ? 'dir'
            : stat.isSymbolicLink()
              ? 'symlink'
              : 'other'
        return type === 'file'
          ? { type, mode: stat.mode, size: stat.size }
          : { type, mode: stat.mode }
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
    const escapesRoot =
      resolved !== this.root && !resolved.startsWith(rootWithSep)
    if (escapesRoot) {
      throw new Error(
        `local-process: path "${p}" resolves outside the sandbox root "${this.root}".`,
      )
    }
    return resolved
  }

  private resolveCwd(cwd: string | undefined): string {
    return cwd ? this.resolve(cwd) : this.root
  }

  private track(child: ChildProcess): void {
    this.liveChildren.add(child)
    child.once('close', () => this.liveChildren.delete(child))
  }

  private async terminateChildren(): Promise<void> {
    const children = [...this.liveChildren]
    this.liveChildren.clear()
    const live = children.filter(
      (child) => child.exitCode === null && child.signalCode === null,
    )
    if (live.length === 0) return
    const rows =
      process.platform === 'win32'
        ? msysProcessTable(this.options.logger)
        : undefined
    for (const child of live) {
      killTree(child, undefined, this.options.logger, rows)
    }
    const exited = await Promise.all(
      live.map((child) => waitForExit(child, CHILD_EXIT_TIMEOUT_MS)),
    )

    const survivors = live.filter((_, i) => exited[i] === false)
    const needsSigkill = survivors.length > 0 && process.platform !== 'win32'
    if (needsSigkill) {
      for (const child of survivors) {
        killTree(child, 'SIGKILL', this.options.logger)
      }
      const killedAfterEscalation = await Promise.all(
        survivors.map((child) => waitForExit(child, CHILD_EXIT_TIMEOUT_MS)),
      )
      const leaked = survivors
        .filter((_, i) => killedAfterEscalation[i] === false)
        .map((child) => child.pid)
      if (leaked.length > 0) {
        this.options.logger?.warn(
          'local-process: children survived SIGKILL; teardown continues',
          { root: this.root, pids: leaked },
        )
      }
      return
    }

    const stragglers = survivors.map((child) => child.pid)
    if (stragglers.length > 0) {
      this.options.logger?.warn(
        'local-process: children still running after kill; teardown continues',
        { root: this.root, pids: stragglers },
      )
    }
  }

  private mergedEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.envVars, ...extra }
    for (const key of this.options.scrubEnv ?? []) delete env[key]
    // Prepend git-bash's tool dirs (Windows) so the POSIX `sh` can find sed/uname/
    // git/etc. that npm CLI shims depend on.
    return prependShellPath(env)
  }

  private exec(command: string, opts?: ProcessOptions): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve, reject) => {
      const child = spawn(posixShell(), ['-c', command], {
        cwd: this.resolveCwd(opts?.cwd),
        env: this.mergedEnv(opts?.env),
        detached: spawnDetached,
      })
      this.track(child)
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
    this.track(child)
    if (opts?.signal) {
      opts.signal.addEventListener(
        'abort',
        () => killTree(child, undefined, this.options.logger),
        {
          once: true,
        },
      )
    }
    const closed = new Promise<number>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolve(code ?? 0))
    })
    // The child can close while stdout is still being drained. Keep the
    // rejection handled until the caller asks for the result via wait().
    closed.catch(() => {})
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
      wait: () => closed,
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
    await this.terminateChildren()
    if (!this.options.removeOnDestroy) return
    await removeDirWithRetry(this.root, this.options.logger)
  }
}
