import * as childProcess from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as nodePath from 'node:path'
import { isRecord } from '../../utils'
import type { WorkspaceHooks } from '../workspace-hooks'

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
   * The tools use it to refuse a link that leads out of the workspace.
   * Optional: without it, the tools do not check links.
   */
  realpath?: (path: string) => Promise<string | undefined>
  /**
   * The entries of a folder. A symbolic link (or a Windows junction) has
   * the type `'link'`, whatever it points to. The tools do not follow it.
   */
  readdir: (
    path: string,
  ) => Promise<Array<{ name: string; type: 'file' | 'dir' | 'link' }>>
  /**
   * Run a shell command and wait for it to end. `env` is added to the
   * environment. A command that fails resolves with its exit code.
   */
  exec: (
    command: string,
    options?: {
      cwd?: string
      env?: Record<string, string>
      timeoutMs?: number
      signal?: AbortSignal
    },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  /**
   * Start a shell command in the background. `output()` is stdout and
   * stderr so far. Optional: without it, background commands give an error.
   */
  spawn?: (
    command: string,
    options?: { cwd?: string; env?: Record<string, string> },
  ) => {
    wait: () => Promise<{ exitCode: number }>
    kill: () => void
    output: () => string
  }
}

/** What each workspace tool gets from `workspaceTools()`. */
export interface ToolEnv {
  backend: WorkspaceBackend
  /** The workspace folder, an absolute path. */
  root: string
  /** The hooks that plugins added. Read them when the tool runs. */
  hooks: () => ReadonlyArray<WorkspaceHooks>
  /** Run `fn` when the work before it on `path` is done, one at a time. */
  lock: <T>(path: string, fn: () => Promise<T>) => Promise<T>
  /**
   * The absolute path of `path`, a file or a folder. A path outside the
   * workspace is refused, or needs the user's yes for its folder. The check
   * uses the real path, so a link that leads out counts as outside.
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
 * The environment of a command: the environment of this process, plus
 * `env`. Without `env` off Windows: `undefined`, so the command gets the
 * environment of this process. On Windows it sets
 * `NoDefaultCurrentDirectoryInExePath`. Then `cmd.exe` takes a program
 * name like `rg` from the PATH only, and not from the current folder, where
 * a cloned repo can put an `rg.cmd`.
 */
export function commandEnv(
  env: Record<string, string> | undefined,
  platform: NodeJS.Platform,
) {
  if (platform !== 'win32') return env && { ...process.env, ...env }
  return { ...process.env, ...env, NoDefaultCurrentDirectoryInExePath: '1' }
}

/** True for the error of a path that is not there. */
const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

/** `exec` stops a command that writes more than 10 MiB of output. */
const MAX_EXEC_OUTPUT = 10 * 1024 * 1024

/**
 * Start `command` in the system shell. `kill` stops the shell and every
 * command it started: on Windows, a killed `cmd.exe` leaves its commands
 * running.
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
  const kill = () => {
    if (child.pid === undefined) return
    if (isWindows) {
      // The full path: Node looks for a bare name in the current folder
      // first, and that folder can be a cloned repo.
      const system = nodePath.join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
      )
      childProcess.execFile(
        nodePath.join(system, 'taskkill.exe'),
        ['/pid', String(child.pid), '/T', '/F'],
        () => undefined,
      )
      return
    }
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // The command already ended.
    }
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
  writeFile: async (path, data) => {
    await fs.mkdir(nodePath.dirname(path), { recursive: true })
    await fs.writeFile(path, data)
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
    // ponytail: keeps all output in memory. Cap it if long jobs need that.
    let output = ''
    const collect = (chunk: Buffer) => {
      output += chunk.toString()
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const exited = new Promise<{ exitCode: number }>((done) => {
      child.on('close', (code) => done({ exitCode: code ?? 1 }))
      child.on('error', (error) => {
        output += String(error)
        done({ exitCode: 1 })
      })
    })
    return { wait: () => exited, kill, output: () => output }
  },
} satisfies WorkspaceBackend

const MAX_OUTPUT = 20_000

/** Cut text after 20,000 characters, and say how many were cut. */
export function clip(text: string) {
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n[${text.length - MAX_OUTPUT} more characters]`
    : text
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

/** Run the `afterWrite` hooks for `path`, one after another. */
export async function afterWrite(env: ToolEnv, path: string) {
  const hooks = env.hooks()
  for (const hook of hooks) await hook.afterWrite?.(path)
}
