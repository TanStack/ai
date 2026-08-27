import { randomUUID } from 'node:crypto'
import { PassThrough, Writable } from 'node:stream'
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import { fsWriteCommands } from './fs-write'
import type Dockerode from 'dockerode'
import type { Readable } from 'node:stream'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SnapshotRef,
  SpawnHandle,
  SandboxFsStat,
} from '@tanstack/ai-sandbox'

export const DOCKER_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: false,
  killableProcesses: true,
  snapshots: true,
  networkPolicy: false,
  durableFilesystem: true, // container fs persists across stop/start (not removal)
  fork: true,
}

export interface DockerLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void
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

const KILL_FAILED_MARKER = 'tanstack-sandbox-kill-failed'

/** Marker printed when the pid file never materialised (see the race note). */
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

/** Grace period between the requested signal and the unconditional `KILL`. */
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
    // Bounded wait for `pidRecordingCommand`'s `echo $$ > file` to land.
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
    // Verify, do not assume: ask the kernel whether the pid is still there.
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

async function* decodeStream(stream: Readable): AsyncIterable<string> {
  const decoder = new TextDecoder('utf-8')
  for await (const chunk of stream) {
    yield typeof chunk === 'string'
      ? chunk
      : decoder.decode(chunk as Buffer, { stream: true })
  }
  const tail = decoder.decode()
  if (tail !== '') yield tail
}

export interface DockerHandleDeps {
  docker: Dockerode
  container: Dockerode.Container
  workdir: string
  /** Factory used by fork: commit + create a new container from the image. */
  forkFactory: (sourceContainerId: string) => Promise<SandboxHandle>
  /** Remove the container on destroy (vs. just stop). */
  removeOnDestroy: boolean
  logger?: DockerLogger
}

export class DockerHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'docker'
  readonly workspaceRoot: string
  readonly capabilities = DOCKER_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly docker: Dockerode
  private readonly container: Dockerode.Container
  private readonly workdir: string
  private readonly deps: DockerHandleDeps
  private readonly logger: DockerLogger | undefined
  private readonly envVars: Record<string, string> = {}

  constructor(deps: DockerHandleDeps) {
    this.docker = deps.docker
    this.container = deps.container
    this.workdir = deps.workdir
    this.logger = deps.logger
    this.workspaceRoot = deps.workdir
    this.deps = deps
    this.id = deps.container.id

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
      set: (vars) => {
        Object.assign(this.envVars, vars)
        return Promise.resolve()
      },
    }
  }

  /** Map the conventional `/workspace` virtual root to the container workdir. */
  private abs(p: string): string {
    if (this.workdir === '/workspace') return p
    if (p === '/workspace') return this.workdir
    if (p.startsWith('/workspace/'))
      return `${this.workdir}/${p.slice('/workspace/'.length)}`
    return p
  }

  private async lstat(path: string): Promise<SandboxFsStat | undefined> {
    const r = await this.exec(lstatCommand(path))
    const pathNotFound = r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING
    if (pathNotFound) return undefined
    if (r.exitCode !== 0) {
      throw new Error(`lstat failed: ${r.stderr.trim()}`)
    }
    return parseLstatOutput(r.stdout)
  }

  private envArray(extra?: Record<string, string>): Array<string> {
    return Object.entries({
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOME: '/root',
      ...this.envVars,
      ...extra,
    }).map(([k, v]) => `${k}=${v}`)
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
      this.logger?.warn('docker: could not run the in-container kill', {
        pidFile,
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    if (result.stderr.includes(KILL_FAILED_MARKER)) {
      this.logger?.warn(
        'docker: in-container process survived the kill; it may be orphaned',
        { pidFile, stderr: result.stderr.trim() },
      )
    } else if (result.stderr.includes(KILL_NO_PID_MARKER)) {
      // The pid file never appeared within `PID_WAIT_TIMEOUT_MS`, so NO signal
      // was sent. Nothing here can fix that; saying so is the whole point.
      this.logger?.warn(
        'docker: no pid was recorded for this process, so it could not be signalled',
        { pidFile, stderr: result.stderr.trim() },
      )
    }
  }

  private removePidFile(pidFile: string): void {
    void this.exec(`rm -f ${q(pidFile)}`).catch(() => {
      // Container already stopped/removed — its whole `/tmp` went with it.
    })
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    // Only pay for the pid-recording wrapper when the caller can actually abort
    // — `exec` also backs every fs operation, which never needs a kill path.
    const pidFile = opts?.signal
      ? `/tmp/.tanstack-sandbox-exec-${randomUUID()}.pid`
      : undefined
    const exec = await this.container.exec({
      Cmd: [
        'sh',
        '-c',
        pidFile ? pidRecordingCommand(command, pidFile) : command,
      ],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      Env: this.envArray(opts?.env),
    })
    const stream = await exec.start({ hijack: true, stdin: false })

    const stdoutChunks: Array<Buffer> = []
    const stderrChunks: Array<Buffer> = []
    const outW = new Writable({
      write(chunk, _enc, cb) {
        stdoutChunks.push(chunk as Buffer)
        cb()
      },
    })
    const errW = new Writable({
      write(chunk, _enc, cb) {
        stderrChunks.push(chunk as Buffer)
        cb()
      },
    })
    this.docker.modem.demuxStream(stream, outW, errW)

    const state: PidFileState = { exited: false, killRequested: false }
    const signal = opts?.signal
    const onAbort = (): void => {
      if (pidFile !== undefined) void this.killRecordedPid(pidFile, state)
      stream.destroy()
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    try {
      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve)
        // A destroyed stream (abort) emits only `close`, never `end`, so without
        // this an aborted exec would never settle at all.
        stream.on('close', resolve)
        stream.on('error', reject)
      })
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort)
      if (pidFile !== undefined && !state.killRequested) {
        state.exited = true
        this.removePidFile(pidFile)
      }
    }

    const info = await exec.inspect()
    return {
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
      exitCode: info.ExitCode ?? 0,
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const pidFile = `/tmp/.tanstack-sandbox-spawn-${randomUUID()}.pid`
    const exec = await this.container.exec({
      Cmd: ['sh', '-c', pidRecordingCommand(command, pidFile)],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      Env: this.envArray(opts?.env),
    })
    const stream = await exec.start({ hijack: true, stdin: true })
    const outPT = new PassThrough()
    const errPT = new PassThrough()
    this.docker.modem.demuxStream(stream, outPT, errPT)
    const endOutputs = (): void => {
      outPT.end()
      errPT.end()
    }
    stream.on('end', endOutputs)
    stream.on('close', endOutputs)
    stream.on('error', endOutputs)
    const state: PidFileState = { exited: false, killRequested: false }
    const ownerExited = (): void => {
      const isAlreadySettled = state.killRequested || state.exited
      if (isAlreadySettled) return
      state.exited = true
      this.removePidFile(pidFile)
    }
    stream.on('end', ownerExited)
    stream.on('close', ownerExited)
    stream.on('error', ownerExited)
    const signal = opts?.signal
    // Detached once the stream settles — see the twin comment in `exec` for why
    // a listener outliving its process is a source of phantom orphan warnings.
    const onAbort = (): void => {
      // Synchronous listener — cannot await. See the twin comment in `exec`.
      void this.killRecordedPid(pidFile, state)
      stream.destroy()
    }
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
      const detach = (): void => signal.removeEventListener('abort', onAbort)
      stream.on('end', detach)
      stream.on('close', detach)
      stream.on('error', detach)
    }

    return {
      pid: -1, // docker exec does not surface a host-visible pid
      stdout: decodeStream(outPT),
      stderr: decodeStream(errPT),
      stdin: {
        write: (data) =>
          new Promise<void>((resolve, reject) => {
            stream.write(data, (err) => (err ? reject(err) : resolve()))
          }),
        end: () => {
          stream.end()
          return Promise.resolve()
        },
      },
      wait: async () => {
        await new Promise<void>((resolve) => {
          if (outPT.readableEnded) {
            resolve()
            return
          }
          stream.once('end', resolve)
          stream.once('close', resolve)
          stream.once('error', resolve)
        })
        const info = await exec.inspect()
        return info.ExitCode ?? 0
      },
      kill: async (killSignal) => {
        await this.killRecordedPid(pidFile, state, killSignal)
        stream.destroy()
      },
    }
  }

  private async connectPort(port: number): Promise<SandboxChannel> {
    const info = await this.container.inspect()
    const mapping = info.NetworkSettings.Ports[`${port}/tcp`]
    const hostPort = mapping?.[0]?.HostPort
    if (!hostPort) {
      throw new Error(
        `docker: container port ${port} is not published. Pass publishPorts: [${port}] to dockerSandbox() to reach it from the host.`,
      )
    }
    return { url: `http://localhost:${hostPort}` }
  }

  async snapshot(label?: string): Promise<SnapshotRef> {
    const tag = `tanstack-ai-sandbox-snapshot:${this.id.slice(0, 12)}-${label ?? 'snap'}`
    const [repo, tagName] = tag.split(':')
    await this.container.commit({ repo, tag: tagName })
    return { id: tag, label }
  }

  fork = async (): Promise<SandboxHandle> => {
    if (!this.capabilities.fork) {
      throw new UnsupportedCapabilityError('docker', 'fork')
    }
    return this.deps.forkFactory(this.id)
  }

  async destroy(): Promise<void> {
    try {
      await this.container.stop({ t: 5 })
    } catch {
      // already stopped
    }
    if (this.deps.removeOnDestroy) {
      await this.container.remove({ force: true, v: true })
    }
  }
}
