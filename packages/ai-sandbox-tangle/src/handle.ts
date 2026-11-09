/**
 * SandboxHandle backed by a Tangle sandbox (via `@tangle-network/sandbox`).
 * Real isolation: fs/exec/git operate inside the remote sandbox; paths are real
 * sandbox paths (default workdir `/home/agent/workspace`).
 *
 * Every command, blocking or not, goes through the runtime's process API
 * (`process.spawn`): it has no run limit (the one-shot exec API stops at 10
 * minutes), stdout and stderr arrive on separate streams, and `kill()` signals
 * the process tree inside the sandbox. File reads and writes use the native
 * file API; the rest of `fs` desugars to commands.
 */
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createExecBackedGit } from '@tanstack/ai-sandbox'
import type {
  ProcessSignal,
  Process as TangleProcess,
  SandboxInstance,
} from '@tangle-network/sandbox'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxFsStat,
  SandboxHandle,
  SnapshotRef,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

export const TANGLE_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  // The process API takes no stdin stream, so a harness gets its prompt from
  // a file instead.
  writableStdin: false,
  // MEASURED against production Tangle. `kill()` asks the runtime to signal
  // the process TREE: a spawned `sleep 5 && touch <marker>` and a
  // `( … ) & wait` background ticker both stopped, and a `tail -f` follower
  // left no process behind. `tests/journal.conformance.test.ts` re-measures the
  // follow cases whenever `TANGLE_API_KEY` is present.
  killableProcesses: true,
  // A snapshot restores into a NEW sandbox through `create({ fromSnapshot })`.
  snapshots: true,
  // `policy.capabilities.network: 'deny'` maps to egress mode `blocked`.
  networkPolicy: true,
  // The workspace persists across stop and resume.
  durableFilesystem: true,
  // `fork()` branches the running sandbox into a new one.
  fork: true,
}

/** Default working directory, inside the sandbox user's home. */
export const DEFAULT_WORKDIR = '/home/agent/workspace'

const PROCESS_SIGNALS: ReadonlyArray<ProcessSignal> = [
  'SIGTERM',
  'SIGKILL',
  'SIGINT',
  'SIGHUP',
  'SIGQUIT',
  'SIGUSR1',
  'SIGUSR2',
]
const SIGNAL_NUMBERS: Record<number, ProcessSignal> = {
  1: 'SIGHUP',
  2: 'SIGINT',
  3: 'SIGQUIT',
  9: 'SIGKILL',
  15: 'SIGTERM',
}

/** The runtime accepts a fixed set of signals; anything else is a `SIGKILL`. */
function processSignal(signal?: NodeJS.Signals | number): ProcessSignal {
  if (typeof signal === 'number') return SIGNAL_NUMBERS[signal] ?? 'SIGKILL'
  return PROCESS_SIGNALS.find((s) => s === signal) ?? 'SIGKILL'
}

/** POSIX single-quote escape for embedding text in `sh -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function errText(r: { stdout: string; stderr: string }): string {
  return r.stderr.trim() || r.stdout.trim() || '(no output)'
}

async function collect(source: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const chunk of source) out += chunk
  return out
}

/** A snapshot needs its source sandbox id to restore, so the ref carries both. */
export function snapshotRefId(sandboxId: string, snapshotId: string): string {
  return `${sandboxId}:${snapshotId}`
}

export function parseSnapshotRefId(id: string): {
  sandboxId: string
  snapshotId: string
} {
  const at = id.lastIndexOf(':')
  if (at <= 0 || at === id.length - 1) {
    throw new Error(
      `tangle: snapshot id "${id}" is not "<sandboxId>:<snapshotId>"`,
    )
  }
  return { sandboxId: id.slice(0, at), snapshotId: id.slice(at + 1) }
}

/** A snapshot tag: lowercase `[a-z0-9-]`. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface TangleHandleDeps {
  /** The live sandbox, as the SDK returned it. */
  sandbox: SandboxInstance
  /** Working directory inside the sandbox (the `/workspace` virtual root maps here). */
  workdir: string
  /** Env vars every command gets (a fork inherits its parent's). */
  env?: Record<string, string>
}

export class TangleHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'tangle'
  readonly workspaceRoot: string
  readonly capabilities = TANGLE_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: SandboxInstance
  private readonly workdir: string
  private readonly envVars: Record<string, string>

  constructor(deps: TangleHandleDeps) {
    this.sandbox = deps.sandbox
    this.id = deps.sandbox.id
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.envVars = { ...deps.env }

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    // The native file calls take no abort signal, so each call checks it
    // first. They reach the sandbox user's home and `/tmp`.
    this.fs = {
      read: async (p, o) => {
        o?.signal?.throwIfAborted()
        return this.sandbox.read(this.abs(p))
      },
      readBytes: async (p, o) => {
        o?.signal?.throwIfAborted()
        return this.download(this.abs(p))
      },
      // The write creates missing parent directories (measured).
      write: async (p, data, o) => {
        o?.signal?.throwIfAborted()
        if (typeof data === 'string') {
          await this.sandbox.write(this.abs(p), data)
        } else {
          await this.sandbox.write(
            this.abs(p),
            Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
              'base64',
            ),
            { encoding: 'base64' },
          )
        }
      },
      list: async (p, o) => {
        o?.signal?.throwIfAborted()
        const r = await this.exec(`ls -1Ap -- ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`list failed: ${errText(r)}`)
        const base = p.replace(/\/$/, '')
        return r.stdout
          .split('\n')
          .filter((line) => line !== '')
          .map((entry) => {
            const isDir = entry.endsWith('/')
            const name = isDir ? entry.slice(0, -1) : entry
            return {
              name,
              path: `${base}/${name}`,
              type: isDir ? ('dir' as const) : ('file' as const),
            }
          })
      },
      lstat: async (p, o) => {
        o?.signal?.throwIfAborted()
        return this.lstat(this.abs(p))
      },
      mkdir: async (p, o) => {
        o?.signal?.throwIfAborted()
        const r = await this.exec(`mkdir -p -- ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`mkdir failed: ${errText(r)}`)
      },
      remove: async (p, o) => {
        o?.signal?.throwIfAborted()
        const r = await this.exec(`rm -rf -- ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`remove failed: ${errText(r)}`)
      },
      rename: async (from, to, o) => {
        o?.signal?.throwIfAborted()
        const r = await this.exec(
          `mv -- ${q(this.abs(from))} ${q(this.abs(to))}`,
        )
        if (r.exitCode !== 0) throw new Error(`rename failed: ${errText(r)}`)
      },
      exists: async (p, o) => {
        o?.signal?.throwIfAborted()
        const r = await this.exec(`test -e ${q(this.abs(p))}`)
        return r.exitCode === 0
      },
    }

    this.git = createExecBackedGit(this.process, this.workdir)

    this.ports = {
      connect: (port, options) => this.connectPort(port, options?.signal),
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

  /** The file API returns bytes only to a local file, so read through one. */
  private async download(path: string): Promise<Uint8Array> {
    const dir = await mkdtemp(join(tmpdir(), 'tanstack-ai-tangle-'))
    try {
      const local = join(dir, 'file')
      await this.sandbox.fs.download(path, local)
      return new Uint8Array(await readFile(local))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  private async lstat(path: string): Promise<SandboxFsStat | undefined> {
    const r = await this.exec(lstatCommand(path))
    if (r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING) return undefined
    if (r.exitCode !== 0) throw new Error(`lstat failed: ${errText(r)}`)
    return parseLstatOutput(r.stdout)
  }

  /**
   * Start `command` in `cwd`. The runtime only accepts a `cwd` inside the
   * user's home, so the command changes directory itself. `timeoutMs: 0` turns
   * the runtime's run limit off; the sandbox lifetime still bounds it.
   */
  private start(
    command: string,
    opts: ProcessOptions | undefined,
  ): Promise<TangleProcess> {
    opts?.signal?.throwIfAborted()
    const cwd = opts?.cwd ? this.abs(opts.cwd) : this.workdir
    const env = { ...this.envVars, ...opts?.env }
    return this.sandbox.process.spawn(`cd ${q(cwd)} && ${command}`, {
      ...(Object.keys(env).length > 0 ? { env } : {}),
      timeoutMs: 0,
    })
  }

  /** Signal the whole process tree. A process that already exited is not an error. */
  private kill(
    proc: TangleProcess,
    signal?: NodeJS.Signals | number,
  ): Promise<void> {
    return proc
      .kill(processSignal(signal), { tree: true })
      .catch(() => undefined)
  }

  /**
   * Run to completion. A non-zero exit is a result, not an error. An abort
   * kills the process inside the sandbox; the result then carries the
   * runtime's exit code for a signalled process (`-1`).
   */
  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const proc = await this.start(command, opts)
    const onAbort = (): void => {
      void this.kill(proc)
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })
    // An abort that landed during the start round trip has no listener yet.
    if (opts?.signal?.aborted === true) onAbort()
    try {
      const [stdout, stderr] = await Promise.all([
        collect(proc.stdout()),
        collect(proc.stderr()),
      ])
      return { stdout, stderr, exitCode: await proc.wait() }
    } catch (error) {
      // A dropped stream says nothing about the process: stop it rather than
      // leave it running until the sandbox expires.
      await this.kill(proc)
      throw error
    } finally {
      opts?.signal?.removeEventListener('abort', onAbort)
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const proc = await this.start(command, opts)
    const onAbort = (): void => {
      void this.kill(proc)
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })
    const exit = proc
      .wait()
      .catch(async (error: unknown) => {
        await this.kill(proc)
        throw error
      })
      .finally(() => {
        opts?.signal?.removeEventListener('abort', onAbort)
      })
    exit.catch(() => undefined)
    if (opts?.signal?.aborted === true) {
      onAbort()
      opts.signal.throwIfAborted()
    }
    return {
      pid: proc.pid,
      stdout: proc.stdout(),
      stderr: proc.stderr(),
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'tangle: background process stdin is not writable (see capabilities.writableStdin)',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: () => exit,
      kill: (signal) => this.kill(proc, signal),
    }
  }

  /**
   * Create (or reuse) the sandbox's preview link for `port`. The URL is
   * public: anyone who has it can reach the port.
   */
  private async connectPort(
    port: number,
    signal?: AbortSignal,
  ): Promise<SandboxChannel> {
    signal?.throwIfAborted()
    const link = await this.sandbox.previewLinks.create(port)
    return { url: link.url }
  }

  /** Capture the workspace. The returned id restores into a new sandbox. */
  snapshot = async (
    label?: string,
    options?: { signal?: AbortSignal },
  ): Promise<SnapshotRef> => {
    options?.signal?.throwIfAborted()
    const tag = label !== undefined ? slug(label) : ''
    const snap = await this.sandbox.snapshot(tag !== '' ? { tags: [tag] } : {})
    return {
      id: snapshotRefId(this.id, snap.snapshotId),
      ...(label !== undefined ? { label } : {}),
    }
  }

  /** Branch the running sandbox into a new one with the same files. */
  fork = async (options?: { signal?: AbortSignal }): Promise<SandboxHandle> => {
    options?.signal?.throwIfAborted()
    const forked = await this.sandbox.fork(1, {
      idempotencyKey: `tanstack-ai-fork-${randomUUID()}`,
    })
    const child = forked.children[0]
    if (child === undefined) throw new Error('tangle: fork returned no sandbox')
    return new TangleHandle({
      sandbox: child,
      workdir: this.workdir,
      env: this.envVars,
    })
  }

  async destroy(): Promise<void> {
    await this.sandbox.delete()
  }
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
