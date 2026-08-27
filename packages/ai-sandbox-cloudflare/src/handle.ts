import { createExecBackedGit } from '@tanstack/ai-sandbox'
import { fsWriteCommands } from './fs-write'
import type { Sandbox } from '@cloudflare/sandbox'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SpawnHandle,
  SandboxFsStat,
} from '@tanstack/ai-sandbox'

export const CLOUDFLARE_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  // No writable host→process stdin; stdin-fed harnesses use file-redirection.
  writableStdin: false,
  killableProcesses: false,
  snapshots: false,
  networkPolicy: false,
  durableFilesystem: false,
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
  if (mode && size) {
    const parsedMode = Number.parseInt(mode, 16)
    const parsedSize = Number(size)
    const isInvalidLstatNumbers =
      !Number.isSafeInteger(parsedMode) ||
      !Number.isSafeInteger(parsedSize) ||
      parsedSize < 0
    if (isInvalidLstatNumbers)
      throw new Error(`invalid lstat output: ${output}`)
    const type = parsedMode & 0xf000
    if (type === 0x8000)
      return { type: 'file', mode: parsedMode, size: parsedSize }
    if (type === 0x4000) return { type: 'dir', mode: parsedMode }
    if (type === 0xa000) return { type: 'symlink', mode: parsedMode }
    return { type: 'other', mode: parsedMode }
  }
  throw new Error(`invalid lstat output: ${output}`)
}

/** A push-driven async string queue used to adapt CF's onOutput callback. */
class OutputQueue {
  private readonly buffer: Array<string> = []
  private readonly waiters: Array<(r: IteratorResult<string>) => void> = []
  private ended = false

  push(value: string): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value, done: false })
    else this.buffer.push(value)
  }

  end(): void {
    this.ended = true
    let waiter = this.waiters.shift()
    while (waiter) {
      waiter({ value: undefined, done: true })
      waiter = this.waiters.shift()
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    while (!this.ended || this.buffer.length > 0) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift() as string
        continue
      }
      const next = await new Promise<IteratorResult<string>>((resolve) =>
        this.waiters.push(resolve),
      )
      if (next.done) return
      yield next.value
    }
  }
}

export class CloudflareHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'cloudflare'
  readonly workspaceRoot: string
  readonly capabilities = CLOUDFLARE_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: Sandbox
  private readonly workdir: string
  private readonly previewHostname: string | undefined

  constructor(
    id: string,
    sandbox: Sandbox,
    workdir: string,
    previewHostname?: string,
  ) {
    this.id = id
    this.sandbox = sandbox
    this.workdir = workdir
    this.workspaceRoot = workdir
    this.previewHostname = previewHostname

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
        const writeCommands = fsWriteCommands(this.abs(p), data)
        for (const command of writeCommands) {
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
      set: (vars) => this.sandbox.setEnvVars(vars),
    }
  }

  private abs(p: string): string {
    if (this.workdir === '/workspace') return p
    if (p === '/workspace') return this.workdir
    if (p.startsWith('/workspace/')) {
      return `${this.workdir}/${p.slice('/workspace/'.length)}`
    }
    return p
  }

  private async lstat(path: string): Promise<SandboxFsStat | undefined> {
    const r = await this.exec(lstatCommand(path))
    const isMissingPath = r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING
    if (isMissingPath) return undefined
    if (r.exitCode !== 0) {
      throw new Error(`lstat failed: ${r.stderr.trim()}`)
    }
    return parseLstatOutput(r.stdout)
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const result = await this.sandbox.exec(command, {
      ...(opts?.cwd ? { cwd: this.abs(opts.cwd) } : { cwd: this.workdir }),
      ...(opts?.env ? { env: opts.env } : {}),
    })
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    }
  }

  private spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const stdout = new OutputQueue()
    const stderr = new OutputQueue()

    const settled = this.sandbox.exec(command, {
      ...(opts?.cwd ? { cwd: this.abs(opts.cwd) } : { cwd: this.workdir }),
      ...(opts?.env ? { env: opts.env } : {}),
      stream: true,
      onOutput: (stream, data) => {
        if (stream === 'stdout') stdout.push(data)
        else stderr.push(data)
      },
    })
    const exitPromise = settled.then(
      (result) => {
        stdout.end()
        stderr.end()
        return result.exitCode
      },
      (error: unknown) => {
        stdout.end()
        stderr.end()
        throw error
      },
    )

    return Promise.resolve({
      pid: -1,
      stdout,
      stderr,
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'cloudflare: background processes do not expose stdin. Use exec(), or a stdin-capable provider (local-process / docker) for stdin-fed harnesses.',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: () => exitPromise,
      kill: () => Promise.resolve(),
    })
  }

  private async connectPort(port: number): Promise<SandboxChannel> {
    if (this.previewHostname === undefined) {
      throw new Error(
        'cloudflare: ports.connect requires a previewHostname. Pass previewHostname (your Worker request hostname) to cloudflareSandbox(...).',
      )
    }
    const { url } = await this.sandbox.exposePort(port, {
      hostname: this.previewHostname,
    })
    return { url }
  }

  async destroy(): Promise<void> {
    await this.sandbox.destroy()
  }
}
