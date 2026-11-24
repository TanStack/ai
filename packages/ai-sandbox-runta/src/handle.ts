/**
 * SandboxHandle backed by a Runta runtime (a microVM). Real isolation:
 * fs/exec/git operate inside the remote runtime; paths are real runtime paths
 * (default workdir `/workspace`).
 *
 * File reads and writes use the runtime's file endpoints (larger files stream
 * over exec). Runta has no list/stat/mkdir/delete endpoints, so those desugar to
 * `exec`. Commands run over the exec WebSocket, which streams stdout and stderr
 * separately and takes stdin writes while the process runs.
 *
 * Snapshots are Runta checkpoints. A checkpoint outlives its runtime and
 * restores into a NEW runtime, so the provider implements `restoreSnapshot`.
 */
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import { shellQuote as q } from './client'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxFsStat,
  SandboxHandle,
  SnapshotRef,
  SpawnHandle,
} from '@tanstack/ai-sandbox'
import type { RuntaClient } from './client'

export const RUNTA_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: true,
  // Measured against a live runtime: `kill()` sends TERM, then closes the exec
  // socket, and closing the socket ends a process that ignores TERM. The
  // journal conformance kill case passes against production
  // (`tests/journal.conformance.test.ts`, which runs when `RUNTA_TOKEN` is set).
  killableProcesses: true,
  snapshots: true,
  // Only the coarse gate: `policy.capabilities.network: 'deny'` blocks egress.
  networkPolicy: true,
  // The runtime disk persists across pause, suspend and shutdown.
  durableFilesystem: true,
  // ponytail: no fork. `snapshot()` + `restoreSnapshot()` gives the same result
  // in two calls; add fork when a caller needs it in one.
  fork: false,
}

export interface RuntaHandleDeps {
  client: RuntaClient
  /** Runtime display name. The durable id used to reconnect and destroy. */
  name: string
  /** Runtime UUID. API calls and public URLs use it. */
  runtimeId: string
  /** Working directory inside the runtime. The `/workspace` virtual root maps here. */
  workdir: string
}

export class RuntaHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'runta'
  readonly workspaceRoot: string
  readonly capabilities = RUNTA_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly client: RuntaClient
  private readonly runtimeId: string
  private readonly workdir: string
  private readonly envVars: Record<string, string> = {}

  constructor(deps: RuntaHandleDeps) {
    this.client = deps.client
    this.id = deps.name
    this.runtimeId = deps.runtimeId
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    const run = async (
      what: string,
      command: string,
      signal?: AbortSignal,
    ): Promise<ExecResult> => {
      const r = await this.exec(command, signal ? { signal } : undefined)
      if (r.exitCode !== 0) {
        throw new Error(`${what} failed: ${r.stderr.trim() || '(no output)'}`)
      }
      return r
    }

    this.fs = {
      read: async (p, o) =>
        new TextDecoder().decode(
          await this.client.readFile(this.runtimeId, this.abs(p), o?.signal),
        ),
      readBytes: (p, o) =>
        this.client.readFile(this.runtimeId, this.abs(p), o?.signal),
      write: (p, data, o) =>
        this.client.writeFile(this.runtimeId, this.abs(p), data, o?.signal),
      list: async (p, o) => {
        // One record per entry: `d` or `f`, the name, then NUL. A name can
        // hold a newline, so lines of `ls` output would split it in two.
        const r = await run(
          'list',
          `cd -- ${q(this.abs(p))} && shopt -s nullglob dotglob && for f in *; do if [ -d "$f" ] && [ ! -L "$f" ]; then printf 'd%s\\0' "$f"; else printf 'f%s\\0' "$f"; fi; done`,
          o?.signal,
        )
        const base = p.replace(/\/$/, '')
        return r.stdout
          .split('\0')
          .filter((record) => record !== '')
          .map((record) => {
            const name = record.slice(1)
            return {
              name,
              path: `${base}/${name}`,
              type: record.startsWith('d')
                ? ('dir' as const)
                : ('file' as const),
            }
          })
      },
      lstat: async (p, o) => {
        const r = await this.exec(
          lstatCommand(this.abs(p)),
          o?.signal ? { signal: o.signal } : undefined,
        )
        if (r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING) {
          return undefined
        }
        if (r.exitCode !== 0) {
          throw new Error(`lstat failed: ${r.stderr.trim() || '(no output)'}`)
        }
        return parseLstatOutput(r.stdout)
      },
      mkdir: async (p, o) => {
        await run('mkdir', `mkdir -p -- ${q(this.abs(p))}`, o?.signal)
      },
      remove: async (p, o) => {
        await run('remove', `rm -rf -- ${q(this.abs(p))}`, o?.signal)
      },
      rename: async (from, to, o) => {
        // `mv` puts the source INSIDE a destination that is a directory, and
        // reports success. Refuse, so a rename lands at `to` or fails.
        // ponytail: this also refuses a directory that replaces an empty one,
        // which rename(2) allows. Use `mv -T` if a caller needs that.
        const target = q(this.abs(to))
        await run(
          'rename',
          `if [ -d ${target} ] && [ ! -L ${target} ]; then echo 'destination is a directory' >&2; exit 1; fi; mv -- ${q(this.abs(from))} ${target}`,
          o?.signal,
        )
      },
      exists: async (p, o) => {
        const r = await this.exec(
          `test -e ${q(this.abs(p))}`,
          o?.signal ? { signal: o.signal } : undefined,
        )
        return r.exitCode === 0
      },
    }

    // The shared git helper does not read exit codes, so a failed clone would
    // resolve. `process.exec` itself keeps returning the code to its callers.
    this.git = createExecBackedGit(
      {
        ...this.process,
        exec: async (command, opts) => {
          const r = await this.exec(command, opts)
          if (r.exitCode !== 0) {
            throw new Error(
              `git command failed with exit code ${r.exitCode}: ${r.stderr.trim() || '(no output)'}`,
            )
          }
          return r
        },
      },
      this.workdir,
    )

    this.ports = {
      // A published Runta URL carries no auth: anyone with the URL can reach it.
      connect: async (port, o) => ({
        url: await this.client.publishPort(
          this.runtimeId,
          port,
          o?.signal ? { signal: o.signal } : {},
        ),
      }),
    }

    this.env = {
      // Kept on the handle and sent with each command. Runta's runtime-level
      // variables are readable through the API, so secrets must not go there.
      set: (vars) => {
        Object.assign(this.envVars, vars)
        return Promise.resolve()
      },
    }
  }

  /** Map the conventional `/workspace` virtual root to the runtime workdir. */
  private abs(p: string): string {
    if (this.workdir === '/workspace') return p
    if (p === '/workspace') return this.workdir
    if (p.startsWith('/workspace/')) {
      return `${this.workdir}/${p.slice('/workspace/'.length)}`
    }
    return p
  }

  private spawnOptions(command: string, opts?: ProcessOptions) {
    return {
      argv: ['bash', '-c', command],
      cwd: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      env: { ...this.envVars, ...opts?.env },
      ...(opts?.signal ? { signal: opts.signal } : {}),
    }
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const r = await this.client.exec(this.runtimeId, {
      ...this.spawnOptions(command, opts),
      maxOutputBytes: Number.MAX_SAFE_INTEGER,
    })
    return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode }
  }

  private spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const stream = this.client.spawn(
      this.runtimeId,
      this.spawnOptions(command, opts),
    )
    return Promise.resolve({
      pid: -1, // The exec socket does not surface a pid.
      stdout: decode(stream.stdout),
      stderr: decode(stream.stderr),
      stdin: stream.stdin,
      wait: () => stream.wait(),
      // Runta accepts only INT and TERM, so the requested signal is not used:
      // kill is always TERM, then a socket close.
      kill: () => stream.kill(),
    })
  }

  /** Create a checkpoint (disk, memory and running processes). */
  async snapshot(
    label?: string,
    options?: { signal?: AbortSignal },
  ): Promise<SnapshotRef> {
    const checkpoint = await this.client.createCheckpoint(
      this.runtimeId,
      options?.signal ? { signal: options.signal } : {},
    )
    return { id: checkpoint.id, ...(label !== undefined ? { label } : {}) }
  }

  fork = (): Promise<SandboxHandle> => {
    throw new UnsupportedCapabilityError('runta', 'fork')
  }

  async destroy(): Promise<void> {
    await this.client.deleteRuntime(this.runtimeId)
  }
}

async function* decode(
  source: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  for await (const chunk of source) {
    const text = decoder.decode(chunk, { stream: true })
    if (text !== '') yield text
  }
  const tail = decoder.decode()
  if (tail !== '') yield tail
}

// The lstat command and parser below are the same in every exec-backed
// provider package (see `ai-sandbox-sprites/src/handle.ts`).
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
