import type { WorkspaceBackend } from '@tanstack/ai-harness/plugins/coding'
import type { ExecResult, SandboxHandle } from './contracts'

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
 * - There is no `realpath`, so the tools do not check where links go.
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

  const spawn: WorkspaceBackend['spawn'] = (command, options) => {
    // ponytail: keeps all output in memory, like `hostBackend`.
    let output = ''
    const collect = async (stream: AsyncIterable<string>) => {
      for await (const chunk of stream) output += chunk
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
      const run = handle.process.exec(command, {
        cwd,
        env,
        signal: controller.signal,
      })
      return Promise.race([stopped, run]).finally(() => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      })
    },
    ...(handle.capabilities.backgroundProcesses ? { spawn } : {}),
  } satisfies WorkspaceBackend
}
