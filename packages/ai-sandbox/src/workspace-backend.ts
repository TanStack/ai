import { posix } from 'node:path'
import { shellQuote } from './journal'
import type { WorkspaceBackend } from '@tanstack/ai-harness/plugins/coding'
import type { ExecResult, SandboxHandle } from './contracts'

/** The most output a background job keeps, in characters. */
const MAX_OUTPUT = 10 * 1024 * 1024
/** `realpath` follows at most this many links, like Linux. */
const MAX_LINKS = 40

/**
 * A `WorkspaceBackend` over a live sandbox. With it, `workspaceTools()`
 * reads and writes files and runs commands in the sandbox, not on this
 * machine. You start the sandbox before, and you stop it after.
 *
 * - Paths are POSIX paths in the sandbox, like `/workspace/src/a.ts`.
 * - `exec` gives exit code 124 when `timeoutMs` stops a command, and 1 when
 *   `signal` stops it. A sandbox with `capabilities.killableProcesses` off
 *   cannot stop the command, so it continues in the sandbox.
 * - `spawn` is there only when the sandbox has
 *   `capabilities.backgroundProcesses`.
 * - `stat` gives `mtimeMs: 0`. The sandbox file system does not give the
 *   time of the last change.
 * - `realpath` resolves links in the sandbox: `lstat` finds each link, and
 *   `readlink` in the sandbox reads its target. A sandbox without `lstat`
 *   cannot find links, so `realpath` throws, and the tools refuse each path.
 *
 * @param handle - The sandbox, from `provider.create()` or `provider.resume()`.
 *
 * @example
 * ```ts
 * const handle = await localProcessSandbox().create({})
 * workspaceTools({
 *   root: '/workspace',
 *   backend: sandboxWorkspaceBackend(handle),
 * })
 * ```
 */
export function sandboxWorkspaceBackend(handle: SandboxHandle) {
  const { fs } = handle

  // The read of the sandbox follows links, so this follows links too. A
  // path that `readBytes` cannot read is a folder.
  // ponytail: reads the whole file for its size. Only links, and a sandbox
  // without `lstat`, come here.
  const follow: WorkspaceBackend['stat'] = async (path) => {
    if (!(await fs.exists(path))) return undefined
    const bytes = await fs.readBytes(path).catch(() => undefined)
    if (!bytes) return { type: 'dir', size: 0, mtimeMs: 0 }
    return { type: 'file', size: bytes.byteLength, mtimeMs: 0 }
  }

  const stat: WorkspaceBackend['stat'] = async (path) => {
    if (!fs.lstat) return follow(path)
    const info = await fs.lstat(path)
    if (!info) return undefined
    switch (info.type) {
      case 'file':
        return { type: 'file', size: info.size, mtimeMs: 0 }
      case 'dir':
        return { type: 'dir', size: 0, mtimeMs: 0 }
      // Like `fs.stat` on the host, a fifo or a socket is an empty file.
      case 'other':
        return { type: 'file', size: 0, mtimeMs: 0 }
      case 'symlink':
        return follow(path)
    }
  }

  /** The target of the link `path`, as `readlink` in the sandbox gives it. */
  const readlink = async (path: string) => {
    // A relative name in its folder: the sandbox maps the folder, not the
    // arguments, to its own files.
    const name = shellQuote(posix.basename(path))
    const { exitCode, stdout, stderr } = await handle.process.exec(
      `readlink -- ${name}`,
      { cwd: posix.dirname(path) },
    )
    if (exitCode !== 0) {
      throw new Error(`Cannot read the link ${path}: ${stderr.trim()}`)
    }
    return stdout.replace(/\n$/, '')
  }

  /**
   * `path` with every link resolved, part by part, or `undefined` when
   * nothing is at `path`. Throws for a link to a missing target, and when
   * there are more than 40 links, like a loop.
   */
  const realpath: WorkspaceBackend['realpath'] = async (path) => {
    const { lstat } = fs
    if (!lstat) {
      throw new Error(
        `This sandbox has no lstat, so links in ${path} cannot be checked.`,
      )
    }
    let parts = posix.resolve('/', path).split('/').filter(Boolean)
    // The first parts that came from a link target. A missing one means a
    // link to a missing target. A missing part of `path` itself means
    // nothing is at `path`.
    let fromLink = 0
    let real = '/'
    let links = 0
    while (parts.length > 0) {
      const [name = '', ...rest] = parts
      parts = rest
      const isFromLink = fromLink > 0
      fromLink = Math.max(0, fromLink - 1)
      if (name === '.') continue
      if (name === '..') {
        real = posix.dirname(real)
        continue
      }
      const next = posix.join(real, name)
      const info = await lstat(next)
      if (!info) {
        if (!isFromLink) return undefined
        throw new Error(`ENOENT: ${path} is a link to ${next}, not there.`)
      }
      if (info.type !== 'symlink') {
        real = next
        continue
      }
      links += 1
      if (links > MAX_LINKS)
        throw new Error(`ELOOP: too many links in ${path}.`)
      const target = await readlink(next)
      // An absolute target starts again at `/`. A relative one is in `real`.
      if (target.startsWith('/')) real = '/'
      const targetParts = target.split('/').filter(Boolean)
      parts = [...targetParts, ...parts]
      // The parts after it can come from an earlier link too.
      fromLink += targetParts.length
    }
    return real
  }

  const spawn: WorkspaceBackend['spawn'] = (command, options) => {
    // ponytail: keeps the last 10 MiB of a long job, like `hostBackend`.
    let output = ''
    const collect = async (stream: AsyncIterable<string>) => {
      for await (const chunk of stream) {
        output += chunk
        if (output.length > 2 * MAX_OUTPUT) output = output.slice(-MAX_OUTPUT)
      }
    }
    const started = handle.process.spawn(command, options)
    // Wait for the end of the output too, so `output()` is complete.
    const exited = started
      .then(async (job) => {
        const [exitCode] = await Promise.all([
          job.wait(),
          collect(job.stdout),
          collect(job.stderr),
        ])
        return { exitCode }
      })
      .catch((error: unknown) => {
        output += String(error)
        return { exitCode: 1 }
      })
    return {
      wait: () => exited,
      // Before the process starts, this kills it when it starts.
      kill: () => {
        started.then((job) => job.kill()).catch(() => undefined)
      },
      output: () => output,
    }
  }

  return {
    shell: 'sh',
    readFile: (path) => fs.readBytes(path),
    writeFile: (path, data) => fs.write(path, data),
    // The sandbox `remove` also removes folders, and it does not fail for a
    // missing path. This backend removes one file only.
    remove: async (path) => {
      const isFile = (await stat(path))?.type === 'file'
      if (!isFile) throw new Error(`Cannot remove ${path}: no such file.`)
      await fs.remove(path)
    },
    stat,
    realpath,
    readdir: async (path) => {
      const entries = await fs.list(path)
      const { lstat } = fs
      // ponytail: one `lstat` for each entry, so a big folder is slow in a
      // remote sandbox. Without `lstat`, a link has the type of its target.
      return Promise.all(
        entries.map(async (entry) => {
          const isLink =
            lstat !== undefined && (await lstat(entry.path))?.type === 'symlink'
          const type = isLink ? ('link' as const) : entry.type
          return { name: entry.name, type }
        }),
      )
    },
    exec: (command, options = {}) => {
      const { cwd, env, timeoutMs, signal } = options
      const controller = new AbortController()
      // Stop with an exit code. The first reason wins. The result does not
      // wait for the sandbox, because some sandboxes cannot stop a command.
      let stop = (_exitCode: number) => {}
      const stopped = new Promise<ExecResult>((resolve) => {
        stop = (exitCode) => {
          resolve({ exitCode, stdout: '', stderr: '' })
          controller.abort()
        }
      })
      // A timeout of 0 means no timeout.
      const timer = timeoutMs
        ? setTimeout(() => stop(124), timeoutMs)
        : undefined
      const onAbort = () => stop(1)
      signal?.addEventListener('abort', onAbort)
      if (signal?.aborted) onAbort()
      // A command that does not start gives exit code 1, like `hostBackend`.
      const run = handle.process
        .exec(command, { cwd, env, signal: controller.signal })
        .catch(
          (error: unknown): ExecResult => ({
            exitCode: 1,
            stdout: '',
            stderr: String(error),
          }),
        )
      return Promise.race([stopped, run]).finally(() => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      })
    },
    ...(handle.capabilities.backgroundProcesses ? { spawn } : {}),
  } satisfies WorkspaceBackend
}
