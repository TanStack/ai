import { Buffer } from 'node:buffer'
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import { Box, BoxError } from '@upstash/box'
import type { BoxConfig, ExecSessionHandle } from '@upstash/box'
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

export const UPSTASH_BOX_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: true,
  killableProcesses: true,
  snapshots: true,
  networkPolicy: true,
  durableFilesystem: true,
  fork: true,
}

export const WORKSPACE_ROOT = '/workspace/home'

export function isNotFoundError(error: unknown): boolean {
  return error instanceof BoxError && error.statusCode === 404
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertEnvName(key: string): void {
  if (!ENV_NAME.test(key)) {
    throw new Error(
      `upstash-box: invalid environment variable name ${JSON.stringify(key)}`,
    )
  }
}

const BOX_SIGNALS = new Set(['TERM', 'KILL', 'INT', 'HUP'])

const SIGNAL_NUMBERS: Record<number, string> = {
  1: 'HUP',
  2: 'INT',
  9: 'KILL',
  15: 'TERM',
}

function toBoxSignal(signal?: NodeJS.Signals | number): string {
  if (signal === undefined) return 'TERM'
  const name =
    typeof signal === 'number'
      ? SIGNAL_NUMBERS[signal]
      : signal.replace(/^SIG/, '')
  return name !== undefined && BOX_SIGNALS.has(name) ? name : 'TERM'
}

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

const LSTAT_MISSING = '__TANSTACK_LSTAT_MISSING__'

function lstatCommand(path: string): string {
  return `tanstack_lstat_path=${q(path)}; tanstack_lstat_output=$(stat -c '%f:%s' -- "$tanstack_lstat_path" 2>&1); tanstack_lstat_status=$?; if [ "$tanstack_lstat_status" -eq 0 ]; then printf '%s\n' "$tanstack_lstat_output"; else tanstack_lstat_missing() { tanstack_missing_path=$1; case "$tanstack_missing_path" in /|.) return 1 ;; */*) tanstack_parent=${'$'}{tanstack_missing_path%/*}; tanstack_name=${'$'}{tanstack_missing_path##*/}; [ -n "$tanstack_parent" ] || tanstack_parent=/ ;; *) tanstack_parent=.; tanstack_name=$tanstack_missing_path ;; esac; tanstack_parent_mode=$(stat -L -c '%f' -- "$tanstack_parent" 2>/dev/null); tanstack_parent_status=$?; if [ "$tanstack_parent_status" -ne 0 ]; then tanstack_lstat_missing "$tanstack_parent"; else case "$tanstack_parent_mode" in 4[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) case "$tanstack_parent" in /*) tanstack_find_parent=$tanstack_parent ;; *) tanstack_find_parent=./$tanstack_parent ;; esac; tanstack_match=$(find -H "$tanstack_find_parent" -mindepth 1 -maxdepth 1 -exec sh -c 'tanstack_target=$1; shift; for tanstack_candidate do [ "${'$'}{tanstack_candidate##*/}" = "$tanstack_target" ] && { printf 1; exit 0; }; done; exit 0' sh "$tanstack_name" '{}' + 2>/dev/null); tanstack_find_status=$?; [ "$tanstack_find_status" -eq 0 ] && [ -z "$tanstack_match" ] ;; *) return 1 ;; esac; fi; }; if tanstack_lstat_missing "$tanstack_lstat_path"; then printf '%s' '${LSTAT_MISSING}'; else printf '%s\n' "$tanstack_lstat_output" >&2; exit "$tanstack_lstat_status"; fi; fi`
}

function parseLstatOutput(output: string): SandboxFsStat {
  const fields = /^(?<mode>[0-9a-fA-F]{4}):(?<size>\d+)\n?$/.exec(output)
  const mode = fields?.groups?.mode
  const size = fields?.groups?.size
  if (!mode) throw new Error(`invalid lstat output: ${output}`)
  if (!size) throw new Error(`invalid lstat output: ${output}`)
  const parsedMode = Number.parseInt(mode, 16)
  const parsedSize = Number(size)
  const isInvalidLstat =
    !Number.isSafeInteger(parsedMode) ||
    !Number.isSafeInteger(parsedSize) ||
    parsedSize < 0
  if (isInvalidLstat) throw new Error(`invalid lstat output: ${output}`)
  const type = parsedMode & 0xf000
  if (type === 0x8000)
    return { type: 'file', mode: parsedMode, size: parsedSize }
  if (type === 0x4000) return { type: 'dir', mode: parsedMode }
  if (type === 0xa000) return { type: 'symlink', mode: parsedMode }
  return { type: 'other', mode: parsedMode }
}

const MAX_STREAM_BYTES = 8 * 1024 * 1024

class AsyncChunkQueue implements AsyncIterable<string> {
  private readonly chunks: Array<string> = []
  private readonly waiters: Array<(r: IteratorResult<string>) => void> = []
  private ended = false
  private bytes = 0
  private truncated = false

  constructor(
    private readonly label: string,
    private readonly onOverflow?: () => void,
  ) {}

  push(chunk: string): void {
    const shouldIgnoreChunk = chunk === '' || this.ended
    if (shouldIgnoreChunk) return
    this.bytes += Buffer.byteLength(chunk)
    if (this.bytes > MAX_STREAM_BYTES) {
      this.truncated = true
      this.emit(
        `\n[upstash-box] ${this.label} exceeded ${MAX_STREAM_BYTES} bytes; output truncated\n`,
      )
      this.end()
      this.onOverflow?.()
      return
    }
    this.emit(chunk)
  }

  get overflowed(): boolean {
    return this.truncated
  }

  private emit(chunk: string): void {
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

export interface PublicUrlAuth {
  bearerToken?: boolean
  basicAuth?: boolean
}

export interface UpstashBoxHandleDeps {
  box: Box
  publicUrlAuth?: PublicUrlAuth
  boxConfig?: BoxConfig
}

export class UpstashBoxHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'upstash-box'
  readonly workspaceRoot = WORKSPACE_ROOT
  readonly capabilities = UPSTASH_BOX_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly box: Box
  private readonly publicUrlAuth?: PublicUrlAuth
  private readonly boxConfig?: BoxConfig
  private readonly envVars: Record<string, string> = {}

  constructor(deps: UpstashBoxHandleDeps) {
    this.box = deps.box
    this.publicUrlAuth = deps.publicUrlAuth
    this.boxConfig = deps.boxConfig
    this.id = deps.box.id

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: (p) => this.box.files.read(this.abs(p)),
      readBytes: async (p) => {
        const b64 = await this.box.files.read(this.abs(p), {
          encoding: 'base64',
        })
        return new Uint8Array(Buffer.from(b64, 'base64'))
      },
      write: async (p, data) => {
        const abs = this.abs(p)
        const dir = abs.replace(/\/[^/]*$/, '') || '/'
        await this.box.files.mkdir(dir, { parents: true })
        if (typeof data === 'string') {
          await this.box.files.write({ path: abs, content: data })
        } else {
          await this.box.files.write({
            path: abs,
            content: Buffer.from(data).toString('base64'),
            encoding: 'base64',
          })
        }
      },
      list: async (p) => {
        const entries = await this.box.files.list(this.abs(p))
        const base = p.replace(/\/$/, '')
        return entries.map((e) => ({
          name: e.name,
          path: `${base}/${e.name}`,
          type: e.is_dir ? ('dir' as const) : ('file' as const),
        }))
      },
      mkdir: (p) => this.box.files.mkdir(this.abs(p), { parents: true }),
      remove: (p) => this.box.files.remove(this.abs(p), { recursive: true }),
      rename: (from, to) => this.box.files.rename(this.abs(from), this.abs(to)),
      exists: async (p) => {
        try {
          await this.box.files.stat(this.abs(p))
          return true
        } catch (error) {
          if (isNotFoundError(error)) return false
          throw error
        }
      },
      lstat: async (p) => this.lstat(this.abs(p)),
    }

    this.git = createExecBackedGit(this.process, this.workspaceRoot)

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

  private abs(p: string): string {
    const isInsideWorkspaceRoot =
      p === this.workspaceRoot || p.startsWith(`${this.workspaceRoot}/`)
    if (isInsideWorkspaceRoot) {
      return p
    }
    if (p === '/workspace') return this.workspaceRoot
    if (p.startsWith('/workspace/')) {
      return `${this.workspaceRoot}/${p.slice('/workspace/'.length)}`
    }
    return p
  }

  private async lstat(path: string): Promise<SandboxFsStat | undefined> {
    const r = await this.exec(lstatCommand(path))
    const isLstatAbsent =
      r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING
    if (isLstatAbsent) return undefined
    if (r.exitCode !== 0) {
      const output = `${r.stdout}\n${r.stderr}`
      throw new Error(`lstat failed: ${output.trim()}`)
    }
    return parseLstatOutput(r.stdout)
  }

  private envList(extra?: Record<string, string>): Array<string> {
    return Object.entries({ ...this.envVars, ...extra }).map(([k, v]) => {
      assertEnvName(k)
      return `${k}=${v}`
    })
  }

  private withEnv(command: string, extra?: Record<string, string>): string {
    const merged = { ...this.envVars, ...extra }
    const exports = Object.entries(merged)
      .map(([k, v]) => {
        assertEnvName(k)
        return `export ${k}=${q(v)}; `
      })
      .join('')
    return `${exports}${command}`
  }

  private wrap(command: string, opts?: ProcessOptions): string {
    const cwd = this.abs(opts?.cwd ?? this.workspaceRoot)
    return this.withEnv(`cd ${q(cwd)} && ${command}`, opts?.env)
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    opts?.signal?.throwIfAborted()
    const run = await this.box.exec.command(this.wrap(command, opts))
    return {
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.exitCode ?? 1,
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    opts?.signal?.throwIfAborted()

    const started: { session?: ExecSessionHandle } = {}
    const onOverflow = (): void => {
      started.session?.kill('TERM')
    }
    const stdoutQ = new AsyncChunkQueue('stdout', () => onOverflow())
    const stderrQ = new AsyncChunkQueue('stderr', () => onOverflow())
    const outDecoder = new TextDecoder()
    const errDecoder = new TextDecoder()

    const session: ExecSessionHandle = await this.box.exec.session({
      cmd: command,
      cwd: this.abs(opts?.cwd ?? this.workspaceRoot),
      env: this.envList(opts?.env),
      onStdout: (data) =>
        stdoutQ.push(outDecoder.decode(data, { stream: true })),
      onStderr: (data) =>
        stderrQ.push(errDecoder.decode(data, { stream: true })),
    })

    started.session = session
    const didOutputOverflow = stdoutQ.overflowed || stderrQ.overflowed
    if (didOutputOverflow) session.kill('TERM')

    const onAbort = (): void => session.kill('TERM')
    opts?.signal?.addEventListener('abort', onAbort, { once: true })

    const exit = session.wait().finally(() => {
      opts?.signal?.removeEventListener('abort', onAbort)
      stdoutQ.push(outDecoder.decode())
      stderrQ.push(errDecoder.decode())
      stdoutQ.end()
      stderrQ.end()
    })
    exit.catch(() => undefined)

    if (opts?.signal?.aborted === true) {
      onAbort()
      opts.signal.throwIfAborted()
    }

    return {
      pid: session.pid,
      stdout: stdoutQ,
      stderr: stderrQ,
      stdin: {
        write: (data) => {
          session.write(data)
          return Promise.resolve()
        },
        end: () => {
          session.endStdin()
          return Promise.resolve()
        },
      },
      wait: () => exit,
      kill: (signal) => {
        session.kill(toBoxSignal(signal))
        return Promise.resolve()
      },
    }
  }

  private async connectPort(port: number): Promise<SandboxChannel> {
    const link = await this.box.getPublicURL(port, this.publicUrlAuth)
    if (link.token) {
      return {
        url: link.url,
        token: link.token,
        headers: { Authorization: `Bearer ${link.token}` },
      }
    }
    if (link.username && link.password) {
      const basic = Buffer.from(`${link.username}:${link.password}`).toString(
        'base64',
      )
      return { url: link.url, headers: { Authorization: `Basic ${basic}` } }
    }
    return { url: link.url }
  }

  snapshot = async (label?: string): Promise<SnapshotRef> => {
    const name = label ?? `tanstack-ai-${Date.now()}`
    const snap = await this.box.snapshot({ name })
    return { id: snap.id, label: snap.name }
  }

  fork = async (): Promise<SandboxHandle> => {
    if (this.boxConfig === undefined) {
      throw new UnsupportedCapabilityError('upstash-box', 'fork')
    }
    const snap = await this.box.snapshot({
      name: `tanstack-fork-${Date.now()}`,
    })
    const { name: _name, ...config } = this.boxConfig
    try {
      const box = await Box.fromSnapshot(snap.id, config)
      return new UpstashBoxHandle({
        box,
        boxConfig: this.boxConfig,
        ...(this.publicUrlAuth ? { publicUrlAuth: this.publicUrlAuth } : {}),
      })
    } finally {
      await this.box.deleteSnapshot(snap.id).catch(() => undefined)
    }
  }

  async destroy(): Promise<void> {
    await this.box.delete()
  }
}
