/**
 * SandboxHandle backed by a Docker container (via dockerode). Real isolation:
 * fs/exec/git operate inside the container; paths are real container paths
 * (default workdir `/workspace`).
 *
 * fs is implemented over `exec` with base64 piping (binary-safe, no tar
 * dependency); the container image must provide `sh`, `base64`, and coreutils
 * (true for node:* / debian-based images).
 */
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
  writableStdin: true,
  snapshots: true,
  networkPolicy: false,
  durableFilesystem: true, // container fs persists across stop/start (not removal)
  fork: true,
}

/** POSIX single-quote escape for embedding paths in `sh -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

async function* decodeStream(stream: Readable): AsyncIterable<string> {
  for await (const chunk of stream) {
    yield typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8')
  }
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

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const exec = await this.container.exec({
      Cmd: ['sh', '-c', command],
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
      opts.signal.addEventListener('abort', () => stream.destroy(), {
        once: true,
      })
    }

    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve)
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
    const exec = await this.container.exec({
      Cmd: ['sh', '-c', command],
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
      opts.signal.addEventListener('abort', () => stream.destroy(), {
        once: true,
      })
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
      kill: () => {
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
