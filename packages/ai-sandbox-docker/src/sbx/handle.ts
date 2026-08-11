/**
 * SandboxHandle backed by a Docker Sandboxes microVM (`sbx exec`).
 *
 * fs is the same base64-over-exec design as the container handle. Kill uses
 * the same in-VM pid file. Do not only kill the host `sbx exec` process.
 *
 * `writableStdin` and `killableProcesses` stay false until the live test in
 * Task 8 measures them.
 */
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { createExecBackedGit } from '@tanstack/ai-sandbox'
import { runSbx, runSbxStreaming, sbxExecArgs } from './cli'
import { ownedHostRepoDir } from './materialize'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SpawnHandle,
} from '@tanstack/ai-sandbox'
import type { SbxSpawn } from './cli'

export const SBX_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  // Stay false until the live test in Task 8 proves stdin works.
  writableStdin: false,
  // Stay false until the live test in Task 8 proves in-VM kill works.
  killableProcesses: false,
  snapshots: false,
  networkPolicy: true,
  durableFilesystem: true,
  fork: false,
}

export interface SbxLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void
}

/** POSIX single-quote escape for embedding paths in `sh -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

const KILL_FAILED_MARKER = 'tanstack-sandbox-kill-failed'
const KILL_NO_PID_MARKER = 'tanstack-sandbox-kill-no-pid'

function pidRecordingCommand(command: string, pidFile: string): string {
  return `echo $$ > ${q(pidFile)}; exec sh -c ${q(command)}`
}

function killSignalArg(signal?: NodeJS.Signals | number): string {
  if (typeof signal === 'number' && Number.isInteger(signal) && signal > 0) {
    return String(signal)
  }
  if (typeof signal === 'string') {
    const name = signal.replace(/^SIG/, '')
    if (/^[A-Z][A-Z0-9]*$/.test(name)) return name
  }
  return 'TERM'
}

const PID_WAIT_TIMEOUT_MS = 2000
const PID_WAIT_INTERVAL_MS = 50
const KILL_ESCALATION_DELAY_MS = 200

function killRecordedPidCommand(
  pidFile: string,
  signal?: NodeJS.Signals | number,
): string {
  const sig = killSignalArg(signal)
  const f = q(pidFile)
  const attempts = Math.ceil(PID_WAIT_TIMEOUT_MS / PID_WAIT_INTERVAL_MS)
  const sleepStep = (PID_WAIT_INTERVAL_MS / 1000).toFixed(3)
  return [
    `pid=''`,
    `i=0`,
    `while [ "$i" -lt ${attempts} ]; do`,
    `  pid=$(cat ${f} 2>/dev/null)`,
    `  [ -n "$pid" ] && break`,
    `  sleep ${sleepStep}`,
    `  i=$((i+1))`,
    `done`,
    `if [ -n "$pid" ]; then`,
    `  kill -${sig} -"$pid" 2>/dev/null || kill -${sig} "$pid" 2>/dev/null`,
    `  sleep ${(KILL_ESCALATION_DELAY_MS / 1000).toFixed(3)}`,
    `  kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null`,
    `  if kill -0 "$pid" 2>/dev/null; then`,
    `    echo ${KILL_FAILED_MARKER} pid="$pid" >&2`,
    `  fi`,
    `else`,
    `  echo ${KILL_NO_PID_MARKER} file=${f} >&2`,
    `fi`,
    `rm -f ${f}`,
    `:`,
  ].join('\n')
}

interface PidFileState {
  exited: boolean
  killRequested: boolean
  kill?: Promise<void>
}

async function* decodeStream(
  chunks: AsyncIterable<Buffer | string>,
): AsyncIterable<string> {
  const decoder = new TextDecoder('utf-8')
  for await (const chunk of chunks) {
    yield typeof chunk === 'string'
      ? chunk
      : decoder.decode(chunk, { stream: true })
  }
  const tail = decoder.decode()
  if (tail !== '') yield tail
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function hostPortFromPortsJson(stdout: string, port: number): number | null {
  const parsed: unknown = JSON.parse(stdout)
  const rec = asRecord(parsed)
  if (rec) {
    const direct = rec[String(port)]
    if (typeof direct === 'number') return direct
    if (typeof direct === 'string' && /^\d+$/.test(direct)) {
      return Number(direct)
    }
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const entry = asRecord(item)
      if (!entry) continue
      const guest =
        typeof entry.port === 'number'
          ? entry.port
          : typeof entry.Port === 'number'
            ? entry.Port
            : undefined
      const host =
        typeof entry.hostPort === 'number'
          ? entry.hostPort
          : typeof entry.HostPort === 'number'
            ? entry.HostPort
            : undefined
      if (guest === port && host !== undefined) return host
    }
  }
  return null
}

export interface SbxHandleDeps {
  name: string
  workspaceRoot: string
  binary?: string
  spawn?: SbxSpawn
  logger?: SbxLogger
}

export class SbxHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'sbx'
  readonly workspaceRoot: string
  readonly capabilities = SBX_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly name: string
  private readonly binary: string
  private readonly spawnFn: SbxSpawn | undefined
  private readonly logger: SbxLogger | undefined
  private readonly envVars: Record<string, string> = {}

  constructor(deps: SbxHandleDeps) {
    this.name = deps.name
    this.id = deps.name
    this.workspaceRoot = deps.workspaceRoot
    this.binary = deps.binary ?? 'sbx'
    this.spawnFn = deps.spawn
    this.logger = deps.logger

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
        const abs = this.abs(p)
        const b64 = Buffer.from(
          typeof data === 'string' ? Buffer.from(data, 'utf8') : data,
        ).toString('base64')
        const dir = abs.replace(/\/[^/]*$/, '') || '/'
        const r = await this.exec(
          `mkdir -p ${q(dir)} && printf %s ${q(b64)} | base64 -d > ${q(abs)}`,
        )
        if (r.exitCode !== 0)
          throw new Error(`write failed: ${r.stderr.trim()}`)
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
      mkdir: async (p) => {
        const r = await this.exec(`mkdir -p ${q(this.abs(p))}`)
        if (r.exitCode !== 0)
          throw new Error(`mkdir failed: ${r.stderr.trim()}`)
      },
      remove: async (p) => {
        const r = await this.exec(`rm -rf ${q(this.abs(p))}`)
        if (r.exitCode !== 0)
          throw new Error(`remove failed: ${r.stderr.trim()}`)
      },
      rename: async (from, to) => {
        const r = await this.exec(`mv ${q(this.abs(from))} ${q(this.abs(to))}`)
        if (r.exitCode !== 0)
          throw new Error(`rename failed: ${r.stderr.trim()}`)
      },
      exists: async (p) => {
        const r = await this.exec(`test -e ${q(this.abs(p))}`)
        return r.exitCode === 0
      },
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
    if (this.workspaceRoot === '/workspace') return p
    if (p === '/workspace') return this.workspaceRoot
    if (p.startsWith('/workspace/')) {
      return `${this.workspaceRoot}/${p.slice('/workspace/'.length)}`
    }
    return p
  }

  private runOptions(): { binary: string; spawn?: SbxSpawn } {
    return {
      binary: this.binary,
      ...(this.spawnFn ? { spawn: this.spawnFn } : {}),
    }
  }

  private execArgs(command: string, opts?: ProcessOptions): Array<string> {
    const cwd = opts?.cwd ? this.abs(opts.cwd) : this.workspaceRoot
    return sbxExecArgs(this.name, command, {
      cwd,
      env: { ...this.envVars, ...opts?.env },
    })
  }

  private killRecordedPid(
    pidFile: string,
    state: PidFileState,
    signal?: NodeJS.Signals | number,
  ): Promise<void> {
    if (state.exited) return Promise.resolve()
    state.killRequested = true
    state.kill ??= this.runRecordedKill(pidFile, signal)
    return state.kill
  }

  private async runRecordedKill(
    pidFile: string,
    signal?: NodeJS.Signals | number,
  ): Promise<void> {
    let result: ExecResult
    try {
      result = await this.exec(killRecordedPidCommand(pidFile, signal))
    } catch (error) {
      this.logger?.warn('sbx: could not run the in-VM kill', {
        pidFile,
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    if (result.stderr.includes(KILL_FAILED_MARKER)) {
      this.logger?.warn(
        'sbx: in-VM process survived the kill; it may be orphaned',
        { pidFile, stderr: result.stderr.trim() },
      )
    } else if (result.stderr.includes(KILL_NO_PID_MARKER)) {
      this.logger?.warn(
        'sbx: no pid was recorded for this process, so it could not be signalled',
        { pidFile, stderr: result.stderr.trim() },
      )
    }
  }

  private removePidFile(pidFile: string): void {
    void this.exec(`rm -f ${q(pidFile)}`).catch(() => {
      // Sandbox already gone.
    })
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const pidFile = opts?.signal
      ? `/tmp/.tanstack-sandbox-exec-${randomUUID()}.pid`
      : undefined
    const wrapped =
      pidFile === undefined ? command : pidRecordingCommand(command, pidFile)
    const state: PidFileState = { exited: false, killRequested: false }
    const signal = opts?.signal
    const onAbort = (): void => {
      if (pidFile !== undefined) void this.killRecordedPid(pidFile, state)
    }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    try {
      const result = await runSbx(this.execArgs(wrapped, opts), {
        ...this.runOptions(),
        allowNonZero: true,
        ...(signal ? { signal } : {}),
      })
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort)
      if (pidFile !== undefined && !state.killRequested) {
        state.exited = true
        this.removePidFile(pidFile)
      }
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const pidFile = `/tmp/.tanstack-sandbox-spawn-${randomUUID()}.pid`
    const state: PidFileState = { exited: false, killRequested: false }
    const stdoutChunks: Array<Buffer> = []
    const stderrChunks: Array<Buffer> = []
    const stdoutWaiters: Array<() => void> = []
    const stderrWaiters: Array<() => void> = []
    let stdoutDone = false
    let stderrDone = false

    const push = (
      list: Array<Buffer>,
      waiters: Array<() => void>,
      chunk: Buffer,
    ): void => {
      list.push(chunk)
      for (const wake of waiters) wake()
      waiters.length = 0
    }

    const finish = (done: () => void, waiters: Array<() => void>): void => {
      done()
      for (const wake of waiters) wake()
      waiters.length = 0
    }

    const child = runSbxStreaming(
      this.execArgs(pidRecordingCommand(command, pidFile), opts),
      {
        ...this.runOptions(),
        ...(opts?.signal ? { signal: opts.signal } : {}),
        onStdout: (chunk) => push(stdoutChunks, stdoutWaiters, chunk),
        onStderr: (chunk) => push(stderrChunks, stderrWaiters, chunk),
      },
    )

    const waitResult = child.wait().finally(() => {
      finish(() => {
        stdoutDone = true
      }, stdoutWaiters)
      finish(() => {
        stderrDone = true
      }, stderrWaiters)
      if (!state.killRequested && !state.exited) {
        state.exited = true
        this.removePidFile(pidFile)
      }
    })

    async function* readSide(
      list: Array<Buffer>,
      waiters: Array<() => void>,
      isDone: () => boolean,
    ): AsyncIterable<Buffer> {
      let index = 0
      while (true) {
        if (index < list.length) {
          const next = list[index]
          index += 1
          if (next !== undefined) yield next
          continue
        }
        if (isDone()) return
        await new Promise<void>((resolve) => {
          waiters.push(resolve)
        })
      }
    }

    const signal = opts?.signal
    const onAbort = (): void => {
      void this.killRecordedPid(pidFile, state)
      child.kill()
    }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
      void waitResult.finally(() => {
        signal.removeEventListener('abort', onAbort)
      })
    }

    return {
      pid: -1,
      stdout: decodeStream(
        readSide(stdoutChunks, stdoutWaiters, () => stdoutDone),
      ),
      stderr: decodeStream(
        readSide(stderrChunks, stderrWaiters, () => stderrDone),
      ),
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'sbx: background process stdin is not writable (see capabilities.writableStdin)',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: async () => {
        const result = await waitResult
        return result.exitCode
      },
      kill: async (killSignal) => {
        await this.killRecordedPid(pidFile, state, killSignal)
        child.kill()
      },
    }
  }

  private async connectPort(port: number): Promise<SandboxChannel> {
    await runSbx(
      ['ports', this.name, '--publish', String(port)],
      this.runOptions(),
    )
    const listed = await runSbx(
      ['ports', this.name, '--json'],
      this.runOptions(),
    )
    const hostPort = hostPortFromPortsJson(listed.stdout, port)
    if (hostPort === null) {
      throw new Error(
        `sbx: sandbox port ${port} is not published. Pass publishPorts: [${port}] to sbxSandbox() to reach it from the host.`,
      )
    }
    return { url: `http://localhost:${hostPort}` }
  }

  async destroy(): Promise<void> {
    await runSbx(['rm', '--force', this.name], this.runOptions())
    // Same owned dest as materialize / provider.destroy. force:true is a no-op
    // when create used a user workspaceDir.
    await rm(ownedHostRepoDir(this.name), {
      recursive: true,
      force: true,
    })
  }
}
