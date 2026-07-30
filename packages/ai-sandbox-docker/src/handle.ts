/**
 * SandboxHandle backed by a Docker container (via dockerode). Real isolation:
 * fs/exec/git operate inside the container; paths are real container paths
 * (default workdir `/workspace`).
 *
 * fs is implemented over `exec` with base64 piping (binary-safe, no tar
 * dependency); the container image must provide `sh`, `base64`, and coreutils
 * (true for node:* / debian-based images).
 */
import { randomUUID } from 'node:crypto'
import { PassThrough, Writable } from 'node:stream'
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
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
} from '@tanstack/ai-sandbox'

export const DOCKER_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  // Docker's exec runs over a single hijacked duplex stream; signalling stdin
  // EOF (`stream.end()`) also tears down stdout, so a process fed its prompt
  // over stdin loses its streamed output. Declare stdin non-writable so adapters
  // use the file-redirect path (`cmd < promptfile`) instead — reliable here.
  writableStdin: false,
  // `spawnProcess.kill()` and `signal` abort signal the container-side process
  // INSIDE the container, by the pid it recorded for itself on startup (see
  // `pidRecordingCommand`), and only then destroy the hijacked exec stream —
  // so a spawned process is genuinely, forcibly terminable.
  //
  // Destroying the stream is NOT sufficient on its own and must never be the
  // whole story here: it detaches the client from the exec session while Docker
  // leaves the exec's process running (measured — a `sleep` spawned through
  // this handle survived `kill()` and was still in the container's `ps` until
  // the container itself was removed). That is precisely the orphan leak this
  // capability promises callers is impossible, and `journal-reader` reads it to
  // choose its `'follow'` (killable) vs `'poll'` strategy.
  killableProcesses: true,
  snapshots: true,
  networkPolicy: false,
  durableFilesystem: true, // container fs persists across stop/start (not removal)
  fork: true,
}

/** POSIX single-quote escape for embedding paths in `sh -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Wrap `command` so the container-side process records its own pid to
 * `pidFile` before becoming the command.
 *
 * This is what makes killing possible at all. `stream.destroy()` on the
 * hijacked exec stream only detaches the CLIENT; the exec's process keeps
 * running inside the container, and `docker` exposes no "signal this exec" API
 * (`container.kill` signals PID 1, killing the whole sandbox). The pid the
 * process reports for itself is the only handle we get on it.
 *
 * `exec` matters: without it the recorded pid would be a wrapper shell, and
 * killing that shell would leave the real command behind — the exact leak shape
 * this is here to prevent.
 */
function pidRecordingCommand(command: string, pidFile: string): string {
  return `echo $$ > ${q(pidFile)}; exec sh -c ${q(command)}`
}

/**
 * A `kill -<sig>` argument for a Node signal name or number. Anything
 * unrecognized degrades to `TERM` rather than interpolating attacker-influenced
 * text into a shell command.
 */
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

/**
 * Shell that signals the pid recorded in `pidFile`, then removes the file.
 *
 * The process GROUP is signalled first (`kill -SIG -<pid>`): a docker-exec
 * process is its own group leader, so the negative form also reaches background
 * grandchildren (`cmd & …`) that signalling the bare pid would orphan. If it is
 * not a group leader the negative form fails harmlessly and the bare pid is
 * signalled instead. Either way we escalate to `KILL`, because a process
 * ignoring `TERM` is still a leak.
 *
 * Every step is `|| true`-shaped (`2>/dev/null`, trailing `:`) so teardown can
 * never fail: callers are `kill()` and abort handlers, where a throw would wedge
 * the caller instead of freeing anything.
 */
function killRecordedPidCommand(
  pidFile: string,
  signal?: NodeJS.Signals | number,
): string {
  const sig = killSignalArg(signal)
  return [
    `pid=$(cat ${q(pidFile)} 2>/dev/null)`,
    `if [ -n "$pid" ]; then`,
    `  kill -${sig} -"$pid" 2>/dev/null || kill -${sig} "$pid" 2>/dev/null`,
    `  sleep 0.2`,
    `  kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null`,
    `fi`,
    `rm -f ${q(pidFile)}`,
    `:`,
  ].join('\n')
}

/**
 * Decode spawn stdout/stderr as a byte stream, not chunk-by-chunk. A naive
 * per-chunk `Buffer.toString('utf8')` corrupts any multi-byte UTF-8 character
 * that a Node stream happens to split across two `data` events — each half
 * decodes independently into a replacement character. A streaming
 * `TextDecoder` retains a partial trailing sequence across `decode()` calls
 * (`{ stream: true }`) and only emits it once the full character has
 * arrived. We flush (`decoder.decode()` with no args) once the stream ends
 * so a genuinely truncated trailing sequence is still surfaced (as U+FFFD)
 * rather than silently dropped — matching the pattern already used in
 * `ai-sandbox-sprites`'s `client.ts`.
 */
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
  private readonly envVars: Record<string, string> = {}

  constructor(deps: DockerHandleDeps) {
    this.docker = deps.docker
    this.container = deps.container
    this.workdir = deps.workdir
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

  private envArray(extra?: Record<string, string>): Array<string> {
    return Object.entries({ ...this.envVars, ...extra }).map(
      ([k, v]) => `${k}=${v}`,
    )
  }

  /**
   * Signal the container-side process that recorded its pid to `pidFile`.
   * Fire-and-forget by design: this runs from teardown paths (`kill()`, abort
   * handlers) that must not throw, and the caller has already stopped caring
   * about the process.
   */
  private killRecordedPid(
    pidFile: string,
    signal?: NodeJS.Signals | number,
  ): void {
    void this.exec(killRecordedPidCommand(pidFile, signal)).catch(() => {
      // Nothing actionable: the container may already be stopping, which is
      // itself a terminal kill of everything inside it.
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

    if (opts?.signal) {
      opts.signal.addEventListener(
        'abort',
        () => {
          // Kill inside the container FIRST — detaching the stream on its own
          // leaves the command running (see `pidRecordingCommand`).
          if (pidFile) this.killRecordedPid(pidFile)
          stream.destroy()
        },
        { once: true },
      )
    }

    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve)
      // A destroyed stream (abort) emits only `close`, never `end`, so without
      // this an aborted exec would never settle at all.
      stream.on('close', resolve)
      stream.on('error', reject)
    })

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
    /*
     * Close the demuxed output streams when the hijacked exec stream finishes,
     * so consumers iterating `stdout`/`stderr` (for await ... of) terminate.
     * A normal EOF emits `end`, but a destroyed stream (e.g. from kill()) emits
     * only `close` and never `end` — so we must also end the PassThroughs on
     * `close`/`error`, or the consumer hangs forever waiting for the iterator to
     * complete. `end()` is idempotent, so handling multiple events is safe.
     */
    const endOutputs = (): void => {
      outPT.end()
      errPT.end()
    }
    stream.on('end', endOutputs)
    stream.on('close', endOutputs)
    stream.on('error', endOutputs)
    if (opts?.signal) {
      opts.signal.addEventListener(
        'abort',
        () => {
          this.killRecordedPid(pidFile)
          stream.destroy()
        },
        { once: true },
      )
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
          // Resolve on whichever of these fires first. A clean exit emits
          // `end`; a destroyed/killed stream emits only `close` (never `end`),
          // so wait on both or this hangs after kill().
          stream.once('end', resolve)
          stream.once('close', resolve)
          stream.once('error', resolve)
        })
        const info = await exec.inspect()
        return info.ExitCode ?? 0
      },
      kill: (signal) => {
        // Signal the container-side process, THEN detach. Detaching alone would
        // leave it running (see `pidRecordingCommand`) — a silent orphan leak.
        this.killRecordedPid(pidFile, signal)
        stream.destroy()
        return Promise.resolve()
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
