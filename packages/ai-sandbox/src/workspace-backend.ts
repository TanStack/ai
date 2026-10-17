import { posix } from 'node:path'
import { shellQuote } from './journal'
import type { WorkspaceBackend } from '@tanstack/ai-harness/plugins/coding'
import type { ExecResult, SandboxHandle } from './contracts'

/** A background job keeps the newest 1 MiB of its output. */
const MAX_JOB_OUTPUT = 1024 * 1024
/** `realpath` follows at most this many links, like Linux. */
const MAX_LINKS = 40

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** True for a byte in the middle of a UTF-8 character (`10xxxxxx`). */
const isContinuation = (byte: number) => (byte & 0xc0) === 0x80

/**
 * The newest output of a command, at most `maxBytes` bytes. When more comes,
 * the oldest bytes are dropped. `text()` gives the output as UTF-8 text, and
 * starts with a line that tells how many bytes were dropped.
 *
 * A copy of `createOutputTail` in `@tanstack/ai-harness`
 * (`src/first-party/coding/ring-buffer.ts`). That package does not export
 * it. Change both.
 */
function createOutputTail(maxBytes: number) {
  // The chunks from `start` on are the output. The ones before are dropped.
  const chunks: Array<Uint8Array> = []
  let start = 0
  let size = 0
  let dropped = 0

  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    // A copy of the end only, so a big chunk is not kept whole.
    const kept = bytes.byteLength > maxBytes ? bytes.slice(-maxBytes) : bytes
    dropped += bytes.byteLength - kept.byteLength
    chunks.push(kept)
    size += kept.byteLength
    while (size > maxBytes) {
      const first = chunks[start]
      if (first === undefined) break
      const over = size - maxBytes
      const cut = Math.min(over, first.byteLength)
      if (cut === first.byteLength) start += 1
      else chunks[start] = first.subarray(cut)
      size -= cut
      dropped += cut
    }
    // Remove the dropped chunks from the array now and then, not each time.
    if (start > 1024 && start * 2 > chunks.length) {
      chunks.splice(0, start)
      start = 0
    }
  }

  const text = () => {
    let bytes = Buffer.concat(chunks.slice(start))
    if (dropped === 0) return decoder.decode(bytes)
    // The cut can be in a character. Start at the next whole one.
    let from = 0
    while (from < 3 && from < bytes.length && isContinuation(bytes[from] ?? 0))
      from += 1
    bytes = bytes.subarray(from)
    return `[${dropped + from} earlier bytes were dropped.]\n${decoder.decode(bytes)}`
  }

  return { push, text }
}

/**
 * A `WorkspaceBackend` over a live sandbox. With it, `workspaceTools()`
 * reads and writes files and runs commands in the sandbox, not on this
 * machine.
 *
 * Who stops the sandbox:
 *
 * - By default, you. `close()` of the backend stops the jobs that it
 *   started, and leaves the sandbox running.
 * - With `owned: true`, the backend. `close({ reason: 'closed' })` also
 *   destroys the sandbox. Use it for a sandbox that you create in
 *   `workspace.bind`, one for each thread.
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
 * - `spawn` keeps the newest 1 MiB of the output of a job.
 * - `close({ reason: 'moved' })` keeps the jobs and the sandbox, so the
 *   next machine can resume them.
 *
 * @param handle - The sandbox, from `provider.create()` or `provider.resume()`.
 * @param options - `owned: true` when the backend owns the sandbox. Then
 *   `close` destroys it. Default: `false`.
 *
 * @example
 * ```ts
 * const provider = localProcessSandbox()
 * workspaceTools({
 *   workspace: {
 *     bind: async () => ({
 *       ...sandboxWorkspaceBackend(await provider.create({}), { owned: true }),
 *       root: '/workspace',
 *     }),
 *   },
 * })
 * ```
 */
export function sandboxWorkspaceBackend(
  handle: SandboxHandle,
  { owned = false }: { owned?: boolean } = {},
) {
  const { fs } = handle
  // The jobs that this backend started and that still run.
  const running = new Set<{ kill: () => void }>()
  let destroyed: Promise<void> | undefined

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
    const output = createOutputTail(MAX_JOB_OUTPUT)
    const collect = async (stream: AsyncIterable<string>) => {
      for await (const chunk of stream) output.push(chunk)
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
        output.push(String(error))
        return { exitCode: 1 }
      })
    const job = {
      wait: () => exited,
      // Before the process starts, this kills it when it starts.
      kill: () => {
        started.then((each) => each.kill()).catch(() => undefined)
      },
      output: output.text,
    }
    running.add(job)
    void exited.then(() => running.delete(job))
    return job
  }

  const close: NonNullable<WorkspaceBackend['close']> = async ({ reason }) => {
    // The next machine resumes the sandbox and its jobs.
    if (reason === 'moved') return
    for (const job of running) job.kill()
    if (!owned) return
    destroyed ??= handle.destroy()
    await destroyed
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
    close,
  } satisfies WorkspaceBackend
}
