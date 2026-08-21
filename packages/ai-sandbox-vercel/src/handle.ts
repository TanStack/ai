/**
 * SandboxHandle backed by a Vercel Sandbox microVM (via `@vercel/sandbox`).
 * Real isolation: fs/exec/git operate inside the remote microVM; paths are real
 * sandbox paths (default workdir `/vercel/sandbox`).
 *
 * Vercel's `runCommand` executes a program directly (no implicit shell), so we
 * run shell command strings as `sh -c "<command>"`. fs is implemented over that
 * exec with chunked base64 piping (binary-safe); the runtime image provides
 * `sh`, `base64`, and coreutils.
 */
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import { fsWriteCommands } from './fs-write'
import type { Command, Sandbox } from '@vercel/sandbox'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SpawnHandle,
  SandboxFsStat,
} from '@tanstack/ai-sandbox'

export const VERCEL_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  // Vercel detached commands stream logs out but expose no host→process stdin,
  // so adapters that feed a prompt over stdin must use a file + shell redirect.
  writableStdin: false,
  // FALSE, and it must not be flipped back without a MEASUREMENT against a real
  // sandbox. It read `true` on the claim that aborting the `signal` threaded into
  // `sandbox.runCommand` tears the detached command down. That claim is false, and
  // it is false in the SDK's own source rather than merely unproven: in
  // `@vercel/sandbox`'s `session.runCommand`, the `detached` branch forwards
  // `signal` to `client.runCommand` — the HTTP request that STARTS the command —
  // and to `pipeLogs`, which returns immediately here because this handle passes
  // no `stdout`/`stderr` writables. That start request has already resolved by the
  // time `spawnProcess` returns, so the abort had nothing left to cancel and
  // `kill()` was a total no-op that left the remote process running. Same shape as
  // the docker defect: a client-side detach advertised as a kill.
  //
  // `kill()` now calls the SDK's real `Command.kill` (a server-side kill), so it
  // is no longer a no-op — but what that endpoint signals is undocumented, and
  // `journalFollowCommand` is a THREE-statement shell command
  // (`mkdir …; : >> …; tail -f …`), so no shell can exec-optimize it and the
  // `tail -f` is necessarily a CHILD of the `sh` that `runCommand` started. If the
  // kill is pid-only rather than process-group-wide, every follow read leaks a
  // `tail -f` — which is exactly the local-process defect. Until that is measured
  // (see `tests/journal.conformance.test.ts`, gated on real credentials) this stays
  // false and `journalReadStrategy` picks the slower-but-correct `'poll'`.
  killableProcesses: false,
  snapshots: false,
  networkPolicy: false,
  // The microVM filesystem persists for the sandbox's lifetime.
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

export interface VercelHandleDeps {
  /** The live Vercel sandbox object. */
  sandbox: Sandbox
  /** Working directory inside the sandbox (the `/workspace` virtual root maps here). */
  workdir: string
  /** Ports declared at create time (reachable via `sandbox.domain(port)`). */
  ports: Array<number>
}

export class VercelHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'vercel'
  readonly workspaceRoot: string
  readonly capabilities = VERCEL_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: Sandbox
  private readonly workdir: string
  private readonly exposedPorts: Array<number>
  private readonly envVars: Record<string, string> = {}

  constructor(deps: VercelHandleDeps) {
    this.sandbox = deps.sandbox
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.exposedPorts = deps.ports
    // v2 of `@vercel/sandbox` identifies a sandbox by its `name`; that name is
    // what `Sandbox.get({ name })` reconnects with.
    this.id = deps.sandbox.name

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: async (p) => {
        const r = await this.exec(`base64 ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`read failed: ${r.stderr.trim()}`)
        return Buffer.from(r.stdout, 'base64').toString('utf8')
      },
      readBytes: async (p) => {
        const r = await this.exec(`base64 ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`read failed: ${r.stderr.trim()}`)
        return new Uint8Array(Buffer.from(r.stdout, 'base64'))
      },
      write: async (p, data) => {
        for (const command of fsWriteCommands(this.abs(p), data)) {
          const r = await this.exec(command)
          if (r.exitCode !== 0)
            throw new Error(`write failed: ${r.stderr.trim()}`)
        }
      },
      list: async (p) => {
        const r = await this.exec(`ls -1Ap ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`list failed: ${r.stderr.trim()}`)
        return r.stdout
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((entry) => {
            const isDir = entry.endsWith('/')
            const name = isDir ? entry.slice(0, -1) : entry
            return {
              name,
              path: `${p.replace(/\/$/, '')}/${name}`,
              type: isDir ? ('dir' as const) : ('file' as const),
            }
          })
      },
      lstat: async (p) => this.lstat(this.abs(p)),
      mkdir: async (p) => {
        await this.exec(`mkdir -p ${q(this.abs(p))}`)
      },
      remove: async (p) => {
        await this.exec(`rm -rf ${q(this.abs(p))}`)
      },
      rename: async (from, to) => {
        await this.exec(`mv ${q(this.abs(from))} ${q(this.abs(to))}`)
      },
      exists: async (p) => {
        const r = await this.exec(`test -e ${q(this.abs(p))}`)
        return r.exitCode === 0
      },
    }

    this.git = createExecBackedGit(this.process, this.workdir)

    this.ports = {
      connect: (port) => this.connectPort(port),
    }

    this.env = {
      set: (vars) => {
        Object.assign(this.envVars, vars)
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

  private async lstat(path: string): Promise<SandboxFsStat | undefined> {
    const r = await this.exec(lstatCommand(path))
    if (r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING) return undefined
    if (r.exitCode !== 0) {
      throw new Error(`lstat failed: ${r.stderr.trim()}`)
    }
    return parseLstatOutput(r.stdout)
  }

  private mergedEnv(extra?: Record<string, string>): Record<string, string> {
    return { ...this.envVars, ...extra }
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const finished = await this.sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', command],
      cwd: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      env: this.mergedEnv(opts?.env),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    })
    const [stdout, stderr] = await Promise.all([
      finished.output('stdout'),
      finished.output('stderr'),
    ])
    return { stdout, stderr, exitCode: finished.exitCode }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const controller = new AbortController()
    // Bounds the START request only — see the `killableProcesses` comment. Once
    // `runCommand` has resolved this signal can no longer reach the process.
    const abortStart = (): void => controller.abort()
    opts?.signal?.addEventListener('abort', abortStart, { once: true })

    const cmd: Command = await this.sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', command],
      cwd: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      env: this.mergedEnv(opts?.env),
      detached: true,
      signal: controller.signal,
    })

    // Terminate the REMOTE command and then detach locally. `Command.kill` is the
    // SDK's server-side kill (`POST killCommand`); aborting `controller` alone
    // reaches nothing once the start request has resolved, which is why `kill()`
    // used to leave the process running. Registered only after `runCommand`
    // resolves, because `cmd` is what carries the kill.
    const terminate = async (): Promise<void> => {
      controller.abort()
      try {
        await cmd.kill('SIGKILL')
      } catch {
        // Teardown path: the command may already have exited (so the kill 404s)
        // and the caller has stopped caring about it either way. A throw here
        // would wedge the caller instead of freeing anything.
      }
    }
    if (opts?.signal) {
      if (opts.signal.aborted) void terminate()
      else {
        opts.signal.addEventListener('abort', () => void terminate(), {
          once: true,
        })
      }
    }

    const stdoutQ = new AsyncChunkQueue()
    const stderrQ = new AsyncChunkQueue()

    // Fan the single interleaved log stream out into stdout/stderr iterables.
    const pump = (async (): Promise<void> => {
      try {
        for await (const log of cmd.logs()) {
          if (log.stream === 'stderr') stderrQ.push(log.data)
          else stdoutQ.push(log.data)
        }
      } catch {
        // Stream torn down (kill/abort) — fall through and close the queues.
      } finally {
        stdoutQ.end()
        stderrQ.end()
      }
    })()

    return {
      pid: -1, // Vercel commands do not surface a host-visible pid.
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'vercel: background process stdin is not writable (see capabilities.writableStdin)',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: async () => {
        const finished = await cmd.wait()
        await pump
        return finished.exitCode
      },
      kill: () => terminate(),
    }
  }

  private connectPort(port: number): Promise<SandboxChannel> {
    if (!this.exposedPorts.includes(port)) {
      return Promise.reject(
        new Error(
          `vercel: port ${port} is not exposed. Pass ports: [${port}] to vercelSandbox() so it can be reached via sandbox.domain().`,
        ),
      )
    }
    return Promise.resolve({ url: this.sandbox.domain(port) })
  }

  // Vercel snapshots/fork are not wired through the uniform handle yet.
  snapshot = undefined

  fork = (): Promise<SandboxHandle> => {
    throw new UnsupportedCapabilityError('vercel', 'fork')
  }

  async destroy(): Promise<void> {
    await this.sandbox.stop()
  }
}
