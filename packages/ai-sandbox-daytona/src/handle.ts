/**
 * SandboxHandle backed by a Daytona cloud sandbox (via `@daytona/sdk`). Real
 * isolation: fs/exec/git operate inside the remote sandbox; paths are real
 * sandbox paths (default workdir `/home/daytona/workspace`).
 *
 * fs and git use the native Daytona SDK. Workspace secrets are mounted as
 * Daytona organization Secrets at create (opaque `dtn_secret_*` placeholders
 * in the sandbox env). Blocking exec sends leftover per-call env through
 * `executeCommand`'s env argument so those values never enter the stored
 * command string. Spawn sources a workdir env file for the same reason.
 *
 * NOTE: Daytona's `executeCommand` returns a single combined `result` string
 * (stdout+stderr interleaved) plus an `exitCode`; there is no separate stderr
 * channel for blocking exec, so {@link ExecResult.stderr} is always empty for
 * this provider. Background processes (spawn) DO surface stdout/stderr
 * separately via Daytona sessions.
 */
import { randomUUID } from 'node:crypto'
import { UnsupportedCapabilityError } from '@tanstack/ai-sandbox'
import type { Sandbox } from '@daytona/sdk'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxGit,
  SandboxHandle,
  SnapshotRef,
  SpawnHandle,
  SandboxFsStat,
} from '@tanstack/ai-sandbox'

export const DAYTONA_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: true,
  // FALSE, and it must not be flipped back without a MEASUREMENT against a real
  // Daytona sandbox. It read `true` on an asserted comment: that `kill()` "deletes
  // the Daytona session via `deleteSession`, which terminates the session's running
  // command". Nothing here establishes that, and three things argue against it:
  //
  //  1. What `kill()` actually does is `controller.abort()` — a CLIENT-side stop of
  //     the poll loop. That is the same shape as the docker defect, where
  //     `stream.destroy()` detached the client while the container-side process
  //     kept running (measured: `sleep` survived `kill()`).
  //  2. `kill()` does not await any termination. The `deleteSession` call lives in
  //     the pump's `finally`, reached only after the status poll notices the abort
  //     (up to one 400ms sleep plus an in-flight status round trip later). It is
  //     also `.catch(() => {})`-swallowed, so a failed delete is indistinguishable
  //     from a successful one.
  //  3. `deleteSession`'s own SDK doc describes it as "Clean up a completed
  //     session"; terminating a RUNNING async command is not a documented effect.
  //
  // Even if the session teardown does signal, the session command is a shell
  // (`cd <cwd> && <command>`) and `journalFollowCommand` is a three-statement
  // command, so the `tail -f` is necessarily a forked CHILD — the local-process
  // defect, where killing the `sh` left the command alive. `journalReadStrategy`
  // therefore takes the slower-but-correct `'poll'` path. A wrong `true` leaks a
  // `tail -f` per run; see `tests/journal.conformance.test.ts`, which measures this
  // as soon as `DAYTONA_API_KEY` is present.
  killableProcesses: false,
  snapshots: true,
  networkPolicy: true,
  // The sandbox filesystem persists for the sandbox's lifetime (across exec
  // calls and stop/resume) until it is deleted.
  durableFilesystem: true,
  fork: false,
}

/** POSIX single-quote escape for embedding paths in `sh -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A push-driven async iterable. The streamer pushes decoded chunks and calls
 * `end()` once; consumers `for await` over it and terminate cleanly.
 */
class AsyncChunkQueue implements AsyncIterable<string> {
  private readonly chunks: Array<string> = []
  private readonly waiters: Array<(r: IteratorResult<string>) => void> = []
  private ended = false

  push(chunk: string): void {
    if (chunk === '') return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: chunk, done: false })
    else this.chunks.push(chunk)
  }

  end(): void {
    this.ended = true
    let waiter = this.waiters.shift()
    while (waiter) {
      waiter({ value: undefined, done: true })
      waiter = this.waiters.shift()
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: () => {
        const chunk = this.chunks.shift()
        if (chunk !== undefined) {
          return Promise.resolve({ value: chunk, done: false })
        }
        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise((resolve) => this.waiters.push(resolve))
      },
    }
  }
}

export interface DaytonaHandleDeps {
  /** The live Daytona sandbox object. */
  sandbox: Sandbox
  /** Working directory inside the sandbox (the `/workspace` virtual root maps here). */
  workdir: string
  /**
   * When false, `env.set` does not overlay values onto exec/spawn. Use this
   * after workspace secrets are mounted as Daytona organization Secrets so
   * later `env.set` (bootstrap, resume) cannot put plaintext into command
   * env, the spawn env file, or the process environment.
   */
  applyEnvSet?: boolean
}

export class DaytonaHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'daytona'
  readonly workspaceRoot: string
  readonly capabilities = DAYTONA_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: Sandbox
  private readonly workdir: string
  private readonly applyEnvSet: boolean
  private readonly envVars: Record<string, string> = {}

  constructor(deps: DaytonaHandleDeps) {
    this.sandbox = deps.sandbox
    this.workdir = deps.workdir
    this.applyEnvSet = deps.applyEnvSet ?? true
    this.workspaceRoot = deps.workdir
    this.id = deps.sandbox.id

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: async (p) => {
        const buf = await this.sandbox.fs.downloadFile(this.abs(p))
        return buf.toString('utf8')
      },
      readBytes: async (p) => {
        const buf = await this.sandbox.fs.downloadFile(this.abs(p))
        return new Uint8Array(buf)
      },
      write: async (p, data) => {
        const abs = this.abs(p)
        const parent = abs.replace(/\/[^/]*$/, '') || '/'
        await this.sandbox.fs.createFolder(parent, '755')
        const buf =
          typeof data === 'string'
            ? Buffer.from(data, 'utf8')
            : Buffer.from(data)
        await this.sandbox.fs.uploadFile(buf, abs)
      },
      list: async (p) => {
        const entries = await this.sandbox.fs.listFiles(this.abs(p))
        return entries.map((entry) => ({
          name: entry.name,
          path: `${p.replace(/\/$/, '')}/${entry.name}`,
          type: entry.isDir ? ('dir' as const) : ('file' as const),
        }))
      },
      lstat: async (p) => this.lstat(this.abs(p)),
      mkdir: async (p) => {
        await this.sandbox.fs.createFolder(this.abs(p), '755')
      },
      remove: async (p) => {
        await this.sandbox.fs.deleteFile(this.abs(p), true)
      },
      rename: async (from, to) => {
        await this.sandbox.fs.moveFiles(this.abs(from), this.abs(to))
      },
      exists: async (p) => {
        try {
          await this.sandbox.fs.getFileDetails(this.abs(p))
          return true
        } catch {
          return false
        }
      },
    }

    this.git = this.createNativeGit()

    this.ports = {
      connect: (port) => this.connectPort(port),
    }

    this.env = {
      set: (vars) => {
        if (this.applyEnvSet) Object.assign(this.envVars, vars)
        return Promise.resolve()
      },
    }
  }

  /** Map the conventional `/workspace` virtual root to the sandbox workdir. */
  private abs(p: string): string {
    if (this.workdir === '/workspace') return p
    if (p === '/workspace') return this.workdir
    if (p.startsWith('/workspace/'))
      return `${this.workdir}/${p.slice('/workspace/'.length)}`
    return p
  }

  private mergedEnv(extra?: Record<string, string>): Record<string, string> {
    return { ...this.envVars, ...extra }
  }

  private async lstat(path: string): Promise<SandboxFsStat | undefined> {
    const r = await this.exec(lstatCommand(path))
    if (r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING) return undefined
    if (r.exitCode !== 0) {
      const output = `${r.stdout}\n${r.stderr}`
      throw new Error(`lstat failed: ${output.trim()}`)
    }
    return parseLstatOutput(r.stdout)
  }

  /**
   * Session execute has no env field. Write values to a workdir file,
   * then source that file so the stored command never contains secrets.
   */
  private async persistSpawnEnvFile(
    env: Record<string, string>,
  ): Promise<string | undefined> {
    if (!this.sandbox.fs) return undefined
    const path = `${this.workdir}/.tanstack-ai-env`
    const body = Object.entries(env)
      .map(([key, value]) => `${key}=${q(value)}`)
      .join('\n')
    await this.sandbox.fs.createFolder(this.workdir, '755')
    await this.sandbox.fs.uploadFile(Buffer.from(`${body}\n`, 'utf8'), path)
    return path
  }

  private createNativeGit(): SandboxGit {
    const repoPath = (dir?: string): string => this.abs(dir ?? this.workdir)
    return {
      clone: async ({ url, dir, ref, auth }) => {
        const path = this.abs(dir ?? this.workdir)
        const parent = path.replace(/\/[^/]*$/, '') || '/'
        if (this.sandbox.fs) {
          await this.sandbox.fs.createFolder(parent, '755')
        }
        await this.sandbox.git.clone(
          url,
          path,
          ref,
          undefined,
          auth?.username,
          auth?.token,
        )
      },
      status: async (dir) => {
        const status = await this.sandbox.git.status(repoPath(dir))
        return JSON.stringify(status)
      },
      add: async (paths, dir) => {
        await this.sandbox.git.add(repoPath(dir), paths)
      },
      commit: async (message, dir) => {
        await this.sandbox.git.commit(
          repoPath(dir),
          message,
          'tanstack-ai',
          'sandbox@tanstack.ai',
        )
      },
      push: async (dir) => {
        await this.sandbox.git.push(repoPath(dir))
      },
      pull: async (dir) => {
        await this.sandbox.git.pull(repoPath(dir))
      },
      branch: async (dir) => {
        const status = await this.sandbox.git.status(repoPath(dir))
        return status.currentBranch
      },
    }
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const cwd = opts?.cwd ? this.abs(opts.cwd) : this.workdir
    const env = this.mergedEnv(opts?.env)
    const response = await this.sandbox.process.executeCommand(
      command,
      cwd,
      Object.keys(env).length > 0 ? env : undefined,
    )
    return {
      // Daytona returns a single combined output string; there is no separate
      // stderr channel for blocking exec.
      stdout: response.result,
      stderr: '',
      exitCode: response.exitCode,
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const sessionId = `tanstack-ai-spawn-${randomUUID()}`
    await this.sandbox.process.createSession(sessionId)

    const cwd = opts?.cwd ? this.abs(opts.cwd) : this.workdir
    const env = this.mergedEnv(opts?.env)
    const envFile =
      Object.keys(env).length > 0
        ? await this.persistSpawnEnvFile(env)
        : undefined
    const wrapped = envFile
      ? `set -a; . ${q(envFile)}; set +a; cd ${q(cwd)} && ${command}`
      : `cd ${q(cwd)} && ${command}`
    const started = await this.sandbox.process.executeSessionCommand(
      sessionId,
      { command: wrapped, runAsync: true },
    )
    const cmdId = started.cmdId
    if (!cmdId) {
      await this.sandbox.process.deleteSession(sessionId).catch(() => {})
      throw new Error('daytona: session command did not return a cmdId')
    }

    const stdoutQ = new AsyncChunkQueue()
    const stderrQ = new AsyncChunkQueue()
    let exitCode = 0

    // `kill()` and the caller's signal both feed this controller; its
    // `signal.aborted` flag stops the wait. The remote command is not killed.
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    opts?.signal?.addEventListener('abort', onAbort, { once: true })

    // Stream logs over the WebSocket form. Still poll command status so
    // `kill()` can stop the client wait without waiting for the stream.
    // Keep the promise so we can drain trailing chunks and so a dropped
    // socket cannot become an unhandled rejection.
    const logStream = this.sandbox.process
      .getSessionCommandLogs(
        sessionId,
        cmdId,
        (chunk) => stdoutQ.push(chunk),
        (chunk) => stderrQ.push(chunk),
      )
      .catch(() => undefined)

    const pump = (async (): Promise<void> => {
      try {
        while (!controller.signal.aborted) {
          const cmd = await this.sandbox.process.getSessionCommand(
            sessionId,
            cmdId,
          )
          if (cmd.exitCode !== undefined) {
            exitCode = cmd.exitCode
            break
          }
          await sleep(400)
        }
      } finally {
        opts?.signal?.removeEventListener('abort', onAbort)
        // Let the log stream finish so trailing output is not dropped.
        await Promise.race([logStream, sleep(1000)])
        stdoutQ.end()
        stderrQ.end()
        await this.sandbox.process.deleteSession(sessionId).catch(() => {})
      }
    })()

    return {
      pid: -1, // Daytona session commands do not surface a host-visible pid.
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: {
        write: (data) =>
          this.sandbox.process.sendSessionCommandInput(sessionId, cmdId, data),
        end: () => Promise.resolve(),
      },
      wait: async () => {
        await pump
        return exitCode
      },
      kill: () => {
        controller.abort()
        return Promise.resolve()
      },
    }
  }

  private async connectPort(port: number): Promise<SandboxChannel> {
    const link = await this.sandbox.getPreviewLink(port)
    if (!link.token) {
      return { url: link.url }
    }

    // Standard preview URLs need `x-daytona-preview-token` on every request —
    // browsers cannot send that when the user clicks a link. Mint a signed URL
    // (token embedded in the hostname) so preview links open without custom headers.
    // Signed and standard tokens are not interchangeable; do not attach the
    // standard token as headers when returning a signed URL.
    const signed = await this.sandbox.getSignedPreviewUrl(port, 3600)
    return { url: signed.url, token: signed.token }
  }

  async snapshot(label?: string): Promise<SnapshotRef> {
    // Daytona container snapshots are cold: the sandbox must be stopped.
    // Hyphen-only names match Daytona's snapshot identifier rules.
    const name = `tanstack-ai-sandbox-snapshot-${this.id.slice(0, 12)}-${label ?? 'snap'}`
    await this.sandbox.stop()
    try {
      await this.sandbox._experimental_createSnapshot(name)
    } catch (error) {
      try {
        await this.sandbox.start()
      } catch {
        // Keep the snapshot error. A failed start must not hide it.
      }
      throw error
    }
    // `ensure()` still needs a live handle after a successful snapshot.
    await this.sandbox.start()
    return { id: name, ...(label !== undefined ? { label } : {}) }
  }

  fork = (): Promise<SandboxHandle> => {
    throw new UnsupportedCapabilityError('daytona', 'fork')
  }

  async destroy(): Promise<void> {
    await this.sandbox.delete()
  }
}
