import * as childProcess from 'node:child_process'
import * as fs from 'node:fs/promises'
import { dirname } from 'node:path'
import { isRecord } from '../../utils'
import type { WorkspaceHooks } from '../workspace-hooks'

/**
 * Where the workspace tools read and write files and run commands. Every
 * path is absolute. {@link hostBackend} is this machine. Another backend, for
 * example a sandbox, lets the same tools work there.
 */
export interface WorkspaceBackend {
  /** The bytes of a file. Throws when there is no file. */
  readFile: (path: string) => Promise<Uint8Array>
  /** Create or replace a file. Missing parent folders are created. */
  writeFile: (path: string, data: Uint8Array | string) => Promise<void>
  /** A file or a folder, or `undefined` when nothing is at `path`. */
  stat: (
    path: string,
  ) => Promise<
    { type: 'file' | 'dir'; size: number; mtimeMs: number } | undefined
  >
  /** The entries of a folder. */
  readdir: (
    path: string,
  ) => Promise<Array<{ name: string; type: 'file' | 'dir' }>>
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
   * workspace is refused, or needs the user's yes for its folder.
   */
  reach: (
    path: string,
    tool: string,
    kind: 'file' | 'folder',
  ) => Promise<string>
  /** A path for the model: from the workspace, or the full path outside it. */
  shown: (full: string) => string
}

/** `env` added to the environment of this process. */
const withEnv = (env: Record<string, string> | undefined) =>
  env && { ...process.env, ...env }

/**
 * The workspace on this machine, with `node:fs` and `node:child_process`.
 * Commands run in the system shell.
 */
export const hostBackend = {
  readFile: (path) => fs.readFile(path),
  writeFile: async (path, data) => {
    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, data)
  },
  stat: async (path) => {
    const info = await fs.stat(path).catch((error: unknown) => {
      const isMissing =
        error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (isMissing) return undefined
      throw error
    })
    if (!info) return undefined
    return {
      type: info.isDirectory() ? 'dir' : 'file',
      size: info.size,
      mtimeMs: info.mtimeMs,
    }
  },
  readdir: async (path) => {
    const entries = await fs.readdir(path, { withFileTypes: true })
    return entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? ('dir' as const) : ('file' as const),
    }))
  },
  exec: (command, options = {}) =>
    new Promise((done) => {
      childProcess.exec(
        command,
        {
          cwd: options.cwd,
          env: withEnv(options.env),
          timeout: options.timeoutMs,
          signal: options.signal,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) =>
          done({ exitCode: error?.code ?? 0, stdout, stderr }),
      )
    }),
  spawn: (command, options = {}) => {
    const isWindows = process.platform === 'win32'
    // Off Windows, the command gets its own process group, so `kill` can
    // stop the commands it started too.
    const child = childProcess.spawn(command, {
      cwd: options.cwd,
      env: withEnv(options.env),
      shell: true,
      detached: !isWindows,
    })
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
    const kill = () => {
      if (child.pid === undefined) return
      // Stop the shell and every command it started.
      if (isWindows) {
        childProcess.execFile(
          'taskkill',
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
