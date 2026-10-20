import { posix } from 'node:path'
import { createOutputTail } from '@tanstack/ai-utils'
import { shellQuote } from './journal'
import type { WorkspaceBackend } from '@tanstack/ai-harness/plugins/coding'
import type { ExecResult, SandboxFs, SandboxHandle } from './contracts'

/** A background job keeps the newest 1 MiB of its output. */
const MAX_JOB_OUTPUT = 1024 * 1024
/** `realpath` follows at most this many links, like Linux. */
const MAX_LINKS = 40
/** The first bytes that `readLines` gives, for the file type check. */
const HEAD_BYTES = 8 * 1024
/** `readLines` gives no more lines after this many bytes. */
const MAX_PAGE_BYTES = 64 * 1024
/** The line in the output of `readLines` between the head and the lines. */
const LINES_MARK = '@lines'

/**
 * The page in the output of the `readLines` command, for a page from line
 * `first`. The output is the size, the first bytes as hex from `od`, a line
 * {@link LINES_MARK}, the lines of the page, and a last line: `more`, or
 * `total` and the number of lines.
 */
function parsePage(stdout: string, first: number) {
  const rows = stdout.split('\n')
  // The output ends with a newline, so the last row is empty.
  if (rows.at(-1) === '') rows.pop()
  const mark = rows.indexOf(LINES_MARK)
  const status = rows.at(-1) ?? ''
  const isPage =
    mark > 0 && mark < rows.length - 1 && /^(more|total \d+)$/.test(status)
  if (!isPage) {
    throw new Error('readLines: the output of the sandbox is not a page.')
  }
  const size = Number((rows[0] ?? '').trim())
  const hex = rows.slice(1, mark).join(' ').split(/\s+/).filter(Boolean)
  const head = Uint8Array.from(hex, (byte) => Number.parseInt(byte, 16))
  const lines = rows.slice(mark + 1, -1)
  if (status === 'more') return { head, size, lines, total: undefined }
  // An empty file has one empty line, like `''.split('\n')`.
  if (size === 0)
    return { head, size, lines: first === 1 ? [''] : [], total: 1 }
  return { head, size, lines, total: Number(status.slice('total '.length)) }
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
 *   time of the last change. With `lstat`, `stat` never reads the file.
 * - `readLines` reads one page of a file in the sandbox with `wc`, `od`,
 *   and `awk`, so only the page comes out of the sandbox.
 * - `realpath` resolves links in the sandbox: `lstat` finds each link, and
 *   `readlink` in the sandbox reads its target. A sandbox without `lstat`
 *   cannot find links, so `realpath` throws, and the tools refuse each path.
 *
 * - `spawn` keeps the newest 1 MiB of the output of a job, and gives each
 *   chunk to `onOutput` as it comes.
 * - `close({ reason: 'moved' })` keeps the jobs and the sandbox, so the
 *   next machine can resume them.
 * - `binding()` gives the provider and the id of the sandbox. The session
 *   log keeps them, so `reattach` of `workspace` can resume the sandbox on
 *   another machine.
 * - The id of a job is its pid in the sandbox and its start time from
 *   `ps`. `killJob` stops it, also from a backend over the same sandbox on
 *   another machine, and only when the process with that pid started at
 *   that time. A sandbox without a `ps -o lstart` cannot check it, so
 *   `killJob` rejects for a job that runs.
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

  // Without `lstat`, the read of the sandbox follows links, so this
  // follows links too. A path that `readBytes` cannot read is a folder.
  // ponytail: reads the whole file for its size. Only a sandbox without
  // `lstat` comes here.
  const follow: WorkspaceBackend['stat'] = async (path) => {
    if (!(await fs.exists(path))) return undefined
    const bytes = await fs.readBytes(path).catch(() => undefined)
    if (!bytes) return { type: 'dir', size: 0, mtimeMs: 0 }
    return { type: 'file', size: bytes.byteLength, mtimeMs: 0 }
  }

  const stat: WorkspaceBackend['stat'] = async (path) => {
    const { lstat } = fs
    if (!lstat) return follow(path)
    const info = await lstat(path)
    if (!info) return undefined
    switch (info.type) {
      case 'file':
        return { type: 'file', size: info.size, mtimeMs: 0 }
      case 'dir':
        return { type: 'dir', size: 0, mtimeMs: 0 }
      // Like `fs.stat` on the host, a fifo or a socket is an empty file.
      case 'other':
        return { type: 'file', size: 0, mtimeMs: 0 }
      case 'symlink': {
        // The target, by its real path, so the file is not read. A link to
        // a missing target is nothing, like `fs.stat` on the host.
        const resolved = await resolveLinks(lstat, path)
        if (resolved.missing) return undefined
        return stat(resolved.real)
      }
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
   * `path` with every link resolved, part by part. `missing` is `'path'`
   * when nothing is at `path`, and `'target'` for a link to a missing
   * target. Throws when there are more than 40 links, like a loop.
   */
  const resolveLinks = async (
    lstat: NonNullable<SandboxFs['lstat']>,
    path: string,
  ) => {
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
        const missing = isFromLink ? ('target' as const) : ('path' as const)
        return { real: undefined, missing }
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
    return { real, missing: undefined }
  }

  /**
   * `path` with every link resolved, or `undefined` when nothing is at
   * `path`. Throws for a link to a missing target, and when there are more
   * than 40 links, like a loop.
   */
  const realpath: WorkspaceBackend['realpath'] = async (path) => {
    const { lstat } = fs
    if (!lstat) {
      throw new Error(
        `This sandbox has no lstat, so links in ${path} cannot be checked.`,
      )
    }
    const resolved = await resolveLinks(lstat, path)
    switch (resolved.missing) {
      case undefined:
        return resolved.real
      case 'path':
        return undefined
      case 'target':
        throw new Error(
          `ENOENT: ${path} is a link to a target that is not there.`,
        )
    }
  }

  /**
   * One page of the file `path`, read in the sandbox. One command gives the
   * size (`wc`), the first 8 KiB as hex (`od`), and the lines of the page
   * (`awk`). So only the page comes out of the sandbox, not the whole file.
   * `awk` stops at the first line after the page, so `total` is there only
   * when the page gets to the end of the file.
   */
  const readLines: NonNullable<WorkspaceBackend['readLines']> = async (
    path,
    { offset, limit },
  ) => {
    const first = Math.max(1, Math.floor(offset))
    const end = first + Math.max(0, Math.floor(limit))
    // A relative name in its folder, like `readlink`. `./` keeps a name
    // that starts with `-` from being read as an option.
    const name = shellQuote(`./${posix.basename(path)}`)
    // `awk` prints the page, then one last line: `more` when the file goes
    // on after the page, else `total` and the number of lines.
    const awk = `NR >= e { more = 1; exit } NR >= o { print; n += length($0) + 1; if (n > max) e = NR + 1 } END { if (more) print "more"; else print "total " NR }`
    const command = [
      `wc -c < ${name}`,
      `od -An -v -tx1 -N ${HEAD_BYTES} ${name}`,
      `echo ${LINES_MARK}`,
      `awk -v o=${first} -v e=${end} -v max=${MAX_PAGE_BYTES} ${shellQuote(awk)} ${name}`,
    ].join(' && ')
    const { exitCode, stdout, stderr } = await handle.process.exec(command, {
      cwd: posix.dirname(path),
    })
    if (exitCode !== 0) {
      throw new Error(`Cannot read ${path}: ${stderr.trim()}`)
    }
    return parsePage(stdout, first)
  }

  const spawn: WorkspaceBackend['spawn'] = (command, options) => {
    const output = createOutputTail(MAX_JOB_OUTPUT)
    const onOutput = options?.onOutput
    const collect = async (stream: AsyncIterable<string>) => {
      for await (const chunk of stream) {
        output.push(chunk)
        onOutput?.(chunk)
      }
    }
    // `onOutput` is for this backend. The sandbox gets the folder and the env.
    const started = handle.process.spawn(command, {
      cwd: options?.cwd,
      env: options?.env,
    })
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
      // The pid and the start time: a later process can get the same pid.
      jobId: started.then(
        async (each) => {
          const start = await processStart(String(each.pid))
          return start === undefined ? String(each.pid) : `${each.pid}:${start}`
        },
        () => undefined,
      ),
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

  /**
   * When the process `pid` in the sandbox started, as `ps` gives it, or
   * `undefined` when `ps` gives nothing: no such process, or no `ps` that
   * can tell (busybox).
   */
  const processStart = async (pid: string) => {
    const result = await handle.process
      .exec(`LC_ALL=C ps -o lstart= -p ${pid}`)
      .catch(() => undefined)
    const start = result?.exitCode === 0 ? result.stdout.trim() : ''
    return start === '' ? undefined : start
  }

  // The id is `pid:start`. Only the process that started with the job is
  // stopped: after a restart (also of the host of a local-process
  // sandbox), another process can have its pid.
  const killJob: NonNullable<WorkspaceBackend['killJob']> = async (jobId) => {
    const match = /^(\d+)(?::(.+))?$/.exec(jobId)
    const pid = match?.[1]
    if (pid === undefined) return false
    const start = await processStart(pid)
    if (start === undefined) {
      // No start time: no such process, or no `ps` to check it with.
      const alive = await handle.process.exec(`kill -0 ${pid}`)
      if (alive.exitCode !== 0) return false
    }
    if (start === undefined || match?.[2] === undefined) {
      throw new Error(
        `Cannot check that process ${pid} in the sandbox is the job: no start time from ps.`,
      )
    }
    if (start !== match[2]) return false
    // The process group first, so the commands of the job stop too.
    const { exitCode } = await handle.process.exec(
      `kill -9 -- -${pid} 2>/dev/null || kill -9 ${pid}`,
    )
    return exitCode === 0
  }

  return {
    shell: 'sh',
    binding: () => ({
      kind: 'sandbox',
      provider: handle.provider,
      sandboxId: handle.id,
    }),
    killJob,
    readFile: (path) => fs.readBytes(path),
    writeFile: (path, data) => fs.write(path, data),
    // The sandbox `remove` also removes folders, and it does not fail for a
    // missing path. This backend removes one file only.
    remove: async (path) => {
      const isFile = (await stat(path))?.type === 'file'
      if (!isFile) throw new Error(`Cannot remove ${path}: no such file.`)
      await fs.remove(path)
    },
    readLines,
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
