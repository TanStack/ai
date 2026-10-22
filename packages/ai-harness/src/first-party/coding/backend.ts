import * as childProcess from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as nodePath from 'node:path'
import { commandEnv, createOutputTail } from '@tanstack/ai-utils'
import { isRecord } from '../../utils'
import type { PluginEvent } from '../../extensions'
import type { RunContext } from '../../types'
import type { WorkspaceHooks } from '../workspace-hooks'

export type { WorkspaceBinding } from '../../log-records'

/**
 * Where the workspace tools read and write files and run commands. Every
 * path is absolute. {@link hostBackend} is this machine. Another backend, for
 * example a sandbox, lets the same tools work there.
 */
export interface WorkspaceBackend {
  /**
   * The shell that runs the commands: `'sh'` (a POSIX shell) or `'cmd'`
   * (Windows `cmd.exe`). The tools quote arguments for it. It also sets the
   * path style: POSIX paths for `'sh'`, Windows paths for `'cmd'`. Without
   * it, arguments are quoted for `sh`, and paths have the style of this
   * machine. A Linux sandbox sets `'sh'`, so its root `/workspace` stays a
   * POSIX path on a Windows host.
   */
  shell?: 'sh' | 'cmd'
  /** The bytes of a file. Throws when there is no file. */
  readFile: (path: string) => Promise<Uint8Array>
  /**
   * One page of a file, without the whole file in memory: the first 8 KiB
   * (`head`), the size in bytes, and the lines from line `offset` (from 1)
   * as UTF-8 text. It gives at most `limit` lines, and fewer when the lines
   * are long: no more lines after 64 KiB. A final newline ends the last
   * line. It does not start a new one. Throws when there is no file.
   *
   * It stops reading after the page. `total`, the number of lines, is there
   * only when the read got to the end of the file. `undefined` means that
   * the file has more lines after the page.
   *
   * Optional: without it, `read_file` reads the whole file.
   */
  readLines?: (
    path: string,
    options: { offset: number; limit: number },
  ) => Promise<{
    head: Uint8Array
    size: number
    lines: Array<string>
    total?: number
  }>
  /** Create or replace a file. Missing parent folders are created. */
  writeFile: (path: string, data: Uint8Array | string) => Promise<void>
  /**
   * Remove one file. Throws when there is no file, or for a folder. Optional:
   * without it, the `patch` tool cannot delete or move files.
   */
  remove?: (path: string) => Promise<void>
  /** A file or a folder, or `undefined` when nothing is at `path`. */
  stat: (
    path: string,
  ) => Promise<
    { type: 'file' | 'dir'; size: number; mtimeMs: number } | undefined
  >
  /**
   * The real path of `path`, with every link resolved, or `undefined` when
   * nothing is at `path`. Throws for a link to a target that is not there.
   * The tools use it to refuse a link that leads out of the workspace. A
   * backend that cannot resolve a path throws, and the tool call fails.
   */
  realpath: (path: string) => Promise<string | undefined>
  /**
   * The entries of a folder. A symbolic link (or a Windows junction) has
   * the type `'link'`, whatever it points to. The tools do not follow it.
   */
  readdir: (
    path: string,
  ) => Promise<Array<{ name: string; type: 'file' | 'dir' | 'link' }>>
  /**
   * Run a shell command and wait for it to end. `env` is added to the
   * environment. A command that fails resolves with its exit code. On
   * {@link hostBackend}, a command gets only a few variables of this
   * process (see `commandEnv` of `@tanstack/ai-utils`), plus `env`. `onStart` gets the id of
   * the process when it started, like the `jobId` of `spawn`, for
   * {@link killJob}: the host can move a running command to the background.
   * A backend that has no id does not call it.
   */
  exec: (
    command: string,
    options?: {
      cwd?: string
      env?: Record<string, string>
      timeoutMs?: number
      signal?: AbortSignal
      onStart?: (jobId: string) => void
    },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  /**
   * Start a shell command in the background. `output()` is stdout and
   * stderr so far: the newest 1 MiB, with a first line that tells how many
   * older bytes were dropped. `kill()` stops the command and every command
   * it started, also right after the start. `onOutput` gets the new text
   * of stdout and stderr as it comes. A backend that cannot stream the
   * output does not call it. Optional: without `spawn`, background commands
   * give an error.
   */
  spawn?: (
    command: string,
    options?: {
      cwd?: string
      env?: Record<string, string>
      onOutput?: (text: string) => void
    },
  ) => {
    wait: () => Promise<{ exitCode: number }>
    kill: () => void
    output: () => string
    /**
     * Resolves with the id of the process in this backend, for
     * {@link killJob}, once it started. `undefined` when it did not start.
     * The session log keeps it, so a later host can stop the job.
     */
    jobId?: Promise<string | undefined>
  }
  /**
   * Stop the job with the `jobId` that `spawn` gave, also a job of an
   * earlier process or machine, with every command it started. Resolves
   * `true` when the job ran and was stopped, and `false` when no such job
   * runs. Rejects when it cannot check that the process is the job, for
   * example when `ps` is missing: then the job may still run. Optional:
   * without it, a job that a crash left running is not stopped.
   */
  killJob?: (jobId: string) => Promise<boolean>
  /**
   * Where the files are, when they are not on this machine: a sandbox,
   * which another machine can resume. The session log keeps it as the
   * binding of the thread. Without it, the workspace is on this host, and
   * the log is pinned to this host.
   */
  binding?: () => { kind: 'sandbox'; provider: string; sandboxId: string }
  /**
   * The tools are done with this backend. Before they call it, they stop
   * the jobs of the session. `reason` tells why:
   *
   * - `'closed'`: the session closed. Stop the jobs that this backend
   *   started, and destroy what it made for itself, like a sandbox that it
   *   created.
   * - `'moved'`: the session continues on another machine. Keep what that
   *   machine can resume, like a sandbox.
   *
   * Never destroy a sandbox that the backend did not create. Optional: a
   * backend with nothing to release has none.
   */
  close?: (input: { reason: 'closed' | 'moved' }) => Promise<void>
}

/**
 * A workspace that `workspace.bind` of `workspaceTools()` gives: a backend,
 * and its workspace folder `root`, an absolute path. `root` is the boundary
 * of every tool.
 */
export type BoundWorkspace = WorkspaceBackend & { root: string }

/** What each workspace tool gets from `workspaceTools()`. */
export interface ToolEnv {
  backend: WorkspaceBackend
  /** The workspace folder, an absolute path. */
  root: string
  /** The hooks that plugins added. Read them when the tool runs. */
  hooks: () => ReadonlyArray<WorkspaceHooks>
  /**
   * Run `fn` when the work before it on `path` is done, one at a time.
   * `path` comes from `reach`. Before `fn`, it checks again that `path` has
   * no links, so a link made after `reach` cannot move the work. Else it
   * throws, and `fn` does not run.
   */
  lock: <T>(path: string, fn: () => Promise<T>) => Promise<T>
  /**
   * The absolute path of `path`, a file or a folder, with every link in the
   * workspace resolved. Use it for the work, so the work goes to the file
   * that was checked. A path outside the workspace is refused, or needs the
   * user's yes for its folder. The check uses the real path, so a link that
   * leads out counts as outside.
   */
  reach: (
    path: string,
    tool: string,
    kind: 'file' | 'folder',
  ) => Promise<string>
  /** A path for the model: from the workspace, or the full path outside it. */
  shown: (full: string) => string
  /**
   * A test for the files in `folder`, a path from `reach`. It takes a path
   * from `folder` with `/`, and is true when the permission rules protect
   * the file: a `read_file` of it, by its path or its real path, would ask
   * or be denied. `undefined` without `permissions()`.
   */
  protectedIn?: (
    folder: string,
  ) => Promise<((path: string) => boolean) | undefined>
  /**
   * Sends a plugin event, like `ctx.emit` of a plugin. The edit tools send
   * `FileChanged` with it. Without it, they send no events.
   */
  emit?: <T>(event: PluginEvent<T>, value: T) => void
}

/**
 * The path functions for the paths of `backend`: POSIX for a `'sh'`
 * backend, Windows for a `'cmd'` backend. Without `shell`, the functions of
 * this machine.
 */
export function pathsOf(backend: WorkspaceBackend) {
  switch (backend.shell) {
    case 'sh':
      return nodePath.posix
    case 'cmd':
      return nodePath.win32
    case undefined:
      return nodePath
  }
}

/**
 * A workspace folder in `base` for `parts`, like a tenant and a thread id:
 * `base/part/part`. Each part is URL-encoded, so a `/`, a `\`, or a `..` in
 * an id from a client cannot leave `base` or reach the folder of another
 * thread. Throws for an empty part, `.`, or `..`, and when the result is not
 * a folder in `base`. A POSIX `base` (like `/srv/work`) gives a POSIX path,
 * also on Windows.
 *
 * @example
 * ```ts
 * workspaceRoot('/srv/work', 'acme', '../other/t-1')
 * // '/srv/work/acme/..%2Fother%2Ft-1'
 * ```
 */
export function workspaceRoot(base: string, ...parts: Array<string>) {
  const path = base.startsWith('/') ? nodePath.posix : nodePath
  const names = parts.map((part) => {
    const name = encodeURIComponent(part)
    if (name === '' || name === '.' || name === '..') {
      throw new Error(`${JSON.stringify(part)} cannot name a workspace folder.`)
    }
    return name
  })
  const full = path.resolve(base, ...names)
  const inBase = path.relative(path.resolve(base), full)
  const isIn =
    inBase !== '' &&
    inBase !== '..' &&
    !inBase.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(inBase)
  if (!isIn) throw new Error(`${full} is not a folder in ${base}.`)
  return full
}

/** True for the error of a path that is not there. */
const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

/** `readLines` reads this many bytes at a time. */
const READ_CHUNK = 1024 * 1024
/** The first bytes that `readLines` gives, for the file type check. */
const HEAD_BYTES = 8 * 1024
/** `readLines` gives no more lines after this many bytes. */
const MAX_PAGE_BYTES = 64 * 1024
// Drops a byte order mark, like the whole-file read of `read_file`.
const pageDecoder = new TextDecoder()

/** `exec` stops a command that writes more than 10 MiB of output. */
const MAX_EXEC_OUTPUT = 10 * 1024 * 1024

/** `spawn` keeps the newest 1 MiB of the output of a background command. */
const MAX_JOB_OUTPUT = 1024 * 1024

/** Resolves after `ms` milliseconds, or with the first of `events`. */
const firstOf = (ms: number, events: ReadonlyArray<Promise<unknown>>) =>
  Promise.race([
    new Promise<void>((done) => setTimeout(done, ms).unref()),
    ...events,
  ])

/**
 * Run a program of Windows by its full path, and resolve with its stdout.
 * Node looks for a bare name in the current folder first, and that folder
 * can be a cloned repo. A failed program resolves too.
 */
function runWindowsProgram(path: string, args: Array<string>) {
  const system = nodePath.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
  )
  return new Promise<string>((done) => {
    childProcess.execFile(
      nodePath.join(system, path),
      args,
      { windowsHide: true },
      (_error, stdout) => done(String(stdout)),
    )
  })
}

/** Kill `pid` and the processes it started, with `taskkill`. */
const taskkill = (pid: number) =>
  runWindowsProgram('taskkill.exe', ['/pid', String(pid), '/T', '/F'])

/**
 * The processes that `pid` started between `from` and `to` (times in
 * milliseconds). The time range skips the processes of another process
 * that gets the same pid later.
 */
async function windowsChildren(pid: number, from: number, to: number) {
  // One statement on each line.
  const script = [
    `$from = [DateTimeOffset]::FromUnixTimeMilliseconds(${from}).LocalDateTime`,
    `$to = [DateTimeOffset]::FromUnixTimeMilliseconds(${to}).LocalDateTime`,
    `Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}' | Where-Object { $_.CreationDate -ge $from -and $_.CreationDate -le $to } | ForEach-Object { $_.ProcessId }`,
  ].join('\n')
  const stdout = await runWindowsProgram(
    'WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
  )
  return stdout
    .split(/\s+/)
    .filter((line) => /^\d+$/.test(line))
    .map(Number)
}

/** True when a process with `pid` runs now. Signal 0 only checks. */
function isAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * When the process `pid` started, in epoch milliseconds, or `undefined` when
 * no process has that pid. `ps` gives whole seconds.
 */
async function processStart(pid: number) {
  if (process.platform === 'win32') {
    const script = `[DateTimeOffset]::new((Get-Process -Id ${pid}).StartTime).ToUnixTimeMilliseconds()`
    const stdout = await runWindowsProgram(
      'WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
    )
    const ms = Number(stdout.trim())
    return stdout.trim() !== '' && Number.isFinite(ms) ? ms : undefined
  }
  // The C locale gives the date in the format that `Date.parse` reads.
  const stdout = await new Promise<string>((done) => {
    childProcess.execFile(
      'ps',
      ['-o', 'lstart=', '-p', String(pid)],
      { env: { ...commandEnv(undefined, process.platform), LC_ALL: 'C' } },
      (_error, out) => done(String(out)),
    )
  })
  const ms = Date.parse(stdout.trim())
  return Number.isNaN(ms) ? undefined : ms
}

/**
 * A process of a job starts in this many milliseconds after `spawn`, or
 * `ps` rounds its start down to the second.
 */
const START_SLACK_MS = 5_000

/**
 * Kill `child`, a `cmd.exe`, and every command it started. A killed
 * `cmd.exe` alone leaves its commands running. `taskkill /T` finds the
 * commands when it starts, so it can miss a command that the shell starts
 * at the same moment. That command keeps the output pipes open, and the
 * shell never gives `close`. So:
 *
 * 1. `taskkill /T` again while the shell runs.
 * 2. When the shell ended but the pipes stay open, kill the commands that
 *    it started, found by their parent pid.
 * 3. When the pipes are still open after that, close them, so `close` comes.
 */
async function killWindowsShell(shell: ShellProcess, pid: number) {
  // `exit` comes at once after the end of the shell. So before it, the pid
  // is still the shell, and a new `taskkill` cannot hit another process.
  for (let tries = 0; tries < 5 && shell.exitedAt === undefined; tries++) {
    await taskkill(pid)
    await firstOf(500, [shell.exited])
  }
  const isClosed = await firstOf(1000, [shell.closed.then(() => true)])
  const { exitedAt } = shell
  if (isClosed === true || exitedAt === undefined) return
  // Another process with the same pid would run now. Its commands are not ours.
  if (!isAlive(pid)) {
    const started = await windowsChildren(
      pid,
      shell.startedAt - 100,
      exitedAt + 100,
    )
    await Promise.all(started.map(taskkill))
  }
  await firstOf(2000, [shell.closed])
  shell.child.stdout?.destroy()
  shell.child.stderr?.destroy()
}

/** A shell from {@link startShell}, and when it started and ended. */
interface ShellProcess {
  child: childProcess.ChildProcessWithoutNullStreams
  startedAt: number
  /** Set in the `exit` event, so it is there at once. */
  exitedAt?: number
  exited: Promise<void>
  closed: Promise<void>
}

/**
 * Start `command` in the system shell. `kill` stops the shell and every
 * command it started, also when it comes right after the start.
 */
function startShell(
  command: string,
  options: { cwd?: string; env?: Record<string, string> },
) {
  const isWindows = process.platform === 'win32'
  // Off Windows, the command gets its own process group, so `kill` can
  // stop the commands it started too.
  const child = childProcess.spawn(command, {
    cwd: options.cwd,
    env: commandEnv(options.env, process.platform),
    shell: true,
    detached: !isWindows,
  })
  // The listeners are added now, so `kill` does not miss an event that
  // came before it.
  const shell: ShellProcess = {
    child,
    startedAt: Date.now(),
    exited: new Promise((done) =>
      child.once('exit', () => {
        shell.exitedAt = Date.now()
        done()
      }),
    ),
    closed: new Promise((done) => child.once('close', () => done())),
  }
  let isKilled = false
  const kill = () => {
    // The shell did not start. `error` ends the command.
    const { pid } = child
    if (isKilled || pid === undefined) return
    isKilled = true
    if (isWindows) {
      void killWindowsShell(shell, pid)
      return
    }
    const group = -pid
    try {
      process.kill(group, 'SIGTERM')
    } catch {
      // The command already ended.
      return
    }
    // A command that ignores SIGTERM gets SIGKILL after 2 seconds.
    setTimeout(() => {
      try {
        process.kill(group, 'SIGKILL')
      } catch {
        // The command ended.
      }
    }, 2000).unref()
  }
  return { child, kill }
}

/**
 * The workspace on this machine, with `node:fs` and `node:child_process`.
 * Commands run in the system shell. `exec` gives exit code 124, like GNU
 * `timeout`, when the timeout stops a command or the output is over 10 MiB.
 * It gives 1 when the signal stops a command, or the command did not
 * start. A stopped command is stopped with every command it started.
 */
export const hostBackend = {
  shell: process.platform === 'win32' ? 'cmd' : 'sh',
  readFile: (path) => fs.readFile(path),
  readLines: async (path, { offset, limit }) => {
    const handle = await fs.open(path, 'r')
    try {
      const { size } = await handle.stat()
      const chunk = Buffer.allocUnsafe(Math.max(1, Math.min(size, READ_CHUNK)))
      let head: Uint8Array | undefined
      // The line of the next byte. At the end, one more than the newlines.
      let line = 1
      let last = -1
      // The first line after the page. A long page ends early.
      let end = offset + limit
      const page: Array<Buffer> = []
      let pageBytes = 0
      // True when a byte of line `end` was found: the file goes on after
      // the page, and the read stops there.
      let hasMore = false
      // ponytail: reads up to the size at the start. Bytes added later wait
      // for the next read.
      for (let position = 0; position < size && !hasMore;) {
        const { bytesRead } = await handle.read(
          chunk,
          0,
          chunk.length,
          position,
        )
        if (bytesRead === 0) break
        position += bytesRead
        const data = chunk.subarray(0, bytesRead)
        // A copy: the next read writes over `chunk`.
        head ??= Buffer.from(data.subarray(0, HEAD_BYTES))
        last = data[bytesRead - 1] ?? last
        // The page bytes of this read. The page lines are one after another.
        let pageFrom = -1
        let pageTo = -1
        // Count the lines with `indexOf`. Only the page is decoded.
        for (let from = 0; from < bytesRead;) {
          if (line >= end) {
            hasMore = true
            break
          }
          const newline = data.indexOf(10, from)
          const to = newline === -1 ? bytesRead : newline + 1
          if (line >= offset && line < end) {
            if (pageFrom === -1) pageFrom = from
            pageTo = to
            pageBytes += to - from
            if (newline !== -1 && pageBytes > MAX_PAGE_BYTES) end = line + 1
          }
          if (newline === -1) break
          line += 1
          from = to
        }
        if (pageFrom !== -1)
          page.push(Buffer.from(data.subarray(pageFrom, pageTo)))
      }
      const text = pageDecoder.decode(Buffer.concat(page))
      const split = text.split('\n')
      if (text.endsWith('\n')) split.pop()
      // An empty file has one empty line, like `''.split('\n')`.
      const total = hasMore
        ? undefined
        : line - 1 + (size === 0 || last !== 10 ? 1 : 0)
      // No lines for an offset after the end, or a page of no lines, like
      // with a limit of 0.
      const isEmpty = total === undefined ? text === '' : offset > total
      const lines = isEmpty ? [] : split
      return { head: head ?? Buffer.alloc(0), size, lines, total }
    } finally {
      await handle.close()
    }
  },
  writeFile: async (path, data) => {
    // One call when the folder is there. When it is not, make it and write again.
    await fs.writeFile(path, data).catch(async (error: unknown) => {
      if (!isMissing(error)) throw error
      await fs.mkdir(nodePath.dirname(path), { recursive: true })
      await fs.writeFile(path, data)
    })
  },
  // Without `recursive`, `fs.rm` refuses a folder.
  remove: (path) => fs.rm(path),
  stat: async (path) => {
    const info = await fs.stat(path).catch((error: unknown) => {
      if (isMissing(error)) return undefined
      throw error
    })
    if (!info) return undefined
    return {
      type: info.isDirectory() ? 'dir' : 'file',
      size: info.size,
      mtimeMs: info.mtimeMs,
    }
  },
  realpath: async (path) => {
    try {
      return await fs.realpath(path)
    } catch (error) {
      // A link to a missing target is there, so it is not `undefined`.
      const isThere = await fs.lstat(path).then(
        () => true,
        () => false,
      )
      if (isMissing(error) && !isThere) return undefined
      throw error
    }
  },
  readdir: async (path) => {
    const entries = await fs.readdir(path, { withFileTypes: true })
    return entries.map((entry) => ({
      name: entry.name,
      type: entry.isSymbolicLink()
        ? ('link' as const)
        : entry.isDirectory()
          ? ('dir' as const)
          : ('file' as const),
    }))
  },
  exec: (command, options = {}) =>
    new Promise((done) => {
      const { child, kill } = startShell(command, options)
      // The same id as `spawn` gives, so `killJob` stops a moved command.
      if (child.pid !== undefined) {
        options.onStart?.(`${child.pid}:${Date.now()}`)
      }
      const stdout: Array<Buffer> = []
      const stderr: Array<Buffer> = []
      let size = 0
      // The exit code of a command that was stopped. The first reason wins.
      let stoppedWith: number | undefined
      const stop = (exitCode: number) => {
        stoppedWith ??= exitCode
        kill()
      }
      const collect = (chunks: Array<Buffer>) => (chunk: Buffer) => {
        // Over the limit, the command stops. Drop what it still writes.
        if (size > MAX_EXEC_OUTPUT) return
        chunks.push(chunk)
        size += chunk.length
        if (size > MAX_EXEC_OUTPUT) stop(124)
      }
      child.stdout.on('data', collect(stdout))
      child.stderr.on('data', collect(stderr))
      // A timeout of 0 means no timeout.
      const timer = options.timeoutMs
        ? setTimeout(() => stop(124), options.timeoutMs)
        : undefined
      const onAbort = () => stop(1)
      options.signal?.addEventListener('abort', onAbort)
      if (options.signal?.aborted) onAbort()
      let startError = ''
      // Runs on `close`, and on `error` when the command did not start.
      const finish = (code: number | null) => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        done({
          exitCode: stoppedWith ?? code ?? 1,
          stdout: Buffer.concat(stdout).toString(),
          stderr: Buffer.concat(stderr).toString() + startError,
        })
      }
      child.on('close', finish)
      child.on('error', (error) => {
        startError = String(error)
        finish(1)
      })
    }),
  spawn: (command, options = {}) => {
    const { child, kill } = startShell(command, options)
    // Bytes, not text: the text is made at `output()`, so a character split
    // over two chunks stays whole.
    const output = createOutputTail(MAX_JOB_OUTPUT)
    const { onOutput } = options
    /** Keep the chunks of `stream`, and give their text to `onOutput`. */
    const collect = (stream: NodeJS.ReadableStream) => {
      // One decoder for each stream keeps a character that is split over
      // two chunks whole.
      const decoder = new TextDecoder()
      stream.on('data', (chunk: Buffer) => {
        output.push(chunk)
        if (onOutput) onOutput(decoder.decode(chunk, { stream: true }))
      })
    }
    collect(child.stdout)
    collect(child.stderr)
    const exited = new Promise<{ exitCode: number }>((done) => {
      child.on('close', (code) => done({ exitCode: code ?? 1 }))
      child.on('error', (error) => {
        output.push(String(error))
        done({ exitCode: 1 })
      })
    })
    // The pid and the start time: a later process can get the same pid.
    const jobId =
      child.pid === undefined ? undefined : `${child.pid}:${Date.now()}`
    return {
      wait: () => exited,
      kill,
      output: output.text,
      jobId: Promise.resolve(jobId),
    }
  },
  killJob: async (jobId) => {
    const [pid = NaN, startedAt = NaN] = jobId.split(':').map(Number)
    if (!Number.isSafeInteger(pid) || pid <= 0 || !isAlive(pid)) return false
    // Only the process that started with the job. Another process can have
    // its pid now.
    const start = await processStart(pid)
    // Not `false`: the job can be this process, and still run.
    if (start === undefined) {
      throw new Error(
        `Cannot check that process ${pid} is the job: no start time from ps.`,
      )
    }
    if (Math.abs(start - startedAt) > START_SLACK_MS) return false
    if (process.platform === 'win32') {
      await taskkill(pid)
      return true
    }
    // The job leads its own process group, so this stops its commands too.
    try {
      process.kill(-pid, 'SIGKILL')
      return true
    } catch {
      return false
    }
  },
} satisfies WorkspaceBackend

const MAX_OUTPUT = 20_000

/** Cut text after 20,000 characters, and say how many were cut. */
export function clip(text: string) {
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n[${text.length - MAX_OUTPUT} more characters]`
    : text
}

/**
 * True for the run context that the harness gives a tool call. It checks the
 * fields that the tools read. The harness sets the others.
 */
function isRun(value: unknown): value is RunContext {
  return (
    isRecord(value) &&
    typeof value.logId === 'string' &&
    typeof value.threadId === 'string'
  )
}

/**
 * The run of a tool call or a middleware call: `ctx.context.run`, or
 * `undefined` without one.
 */
export function runOf(context: unknown) {
  if (!isRecord(context) || !isRecord(context.context)) return undefined
  const { run } = context.context
  return isRun(run) ? run : undefined
}

/** The string argument `key` of a tool call. Throws when it is not a string. */
export function stringArg(args: unknown, key: string) {
  const value = optionalString(args, key)
  if (value !== undefined) return value
  throw new Error(`Argument "${key}" must be a string.`)
}

/** The string argument `key` of a tool call, or `undefined`. */
export function optionalString(args: unknown, key: string) {
  const value = isRecord(args) ? args[key] : undefined
  return typeof value === 'string' ? value : undefined
}

// Keep a byte order mark, so an edit writes the file back as it was.
const decoder = new TextDecoder('utf-8', { ignoreBOM: true })

/** The text of the file at `path`, as UTF-8. */
export async function readText(backend: WorkspaceBackend, path: string) {
  return decoder.decode(await backend.readFile(path))
}

/**
 * Run the `afterWrite` hooks for `path`, one after another. Resolves to the
 * texts that the hooks return, for the tool result.
 */
export async function afterWrite(env: ToolEnv, path: string) {
  const notes: Array<string> = []
  for (const hook of env.hooks()) {
    const note = await hook.afterWrite?.(path)
    if (note) notes.push(note)
  }
  return notes
}
