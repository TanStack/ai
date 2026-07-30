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
  //
  // WHY `true` IS EARNED HERE, when the same audit flipped Vercel and Daytona
  // to `false`. Those two could not distinguish a refused kill from a successful
  // one, so their `true` was a claim no observation could contradict. This one
  // is falsifiable in three independent ways, and each is exercised by a test:
  //   1. `kill()` AWAITS the in-container kill, so its resolution means the
  //      container was asked and answered — not that a request was queued.
  //   2. `killRecordedPidCommand` VERIFIES with `kill -0` after escalating to
  //      `SIGKILL` and prints a marker on stderr when the process is still
  //      there; `killRecordedPid` turns that into a `logger.warn`. A kill this
  //      handle could not perform is therefore reported, not assumed.
  //   3. `docker.test.ts` asks the container's own `ps` whether the probe is
  //      gone — evidence from the kernel, not from this constant.
  // If the pid was never recorded (the process died before its `echo $$`, or the
  // exec never started) that too is reported, via `KILL_NO_PID_MARKER`. The
  // residual gap is honest and narrow: a kill can still be refused, and then
  // this flag is optimistic — but the refusal is visible in the log rather than
  // silent, which is exactly the property the other two providers lacked.
  killableProcesses: true,
  snapshots: true,
  networkPolicy: false,
  durableFilesystem: true, // container fs persists across stop/start (not removal)
  fork: true,
}

/**
 * Sink for non-fatal teardown diagnostics — currently a kill the container
 * refused or could not confirm. Structurally identical to
 * `ai-sandbox-local-process`'s `LocalProcessLogger` and satisfied as-is by
 * `@tanstack/ai`'s `InternalLogger`, so a consumer can pass the logger it
 * already has without this package depending on it.
 */
export interface DockerLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void
}

/** POSIX single-quote escape for embedding paths in `sh -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Marker the kill shell prints on stderr when it could not signal the process.
 *
 * The kill shell must never FAIL (see {@link killRecordedPidCommand}), so its
 * exit code carries no information — a refusal has to be reported in-band or it
 * is invisible. This is the token {@link DockerHandle.killRecordedPid} greps for
 * in order to warn.
 */
const KILL_FAILED_MARKER = 'tanstack-sandbox-kill-failed'

/** Marker printed when the pid file never materialised (see the race note). */
const KILL_NO_PID_MARKER = 'tanstack-sandbox-kill-no-pid'

/**
 * Wrap `command` so the container-side process records its own pid to
 * `pidFile` before becoming the command, and removes that file when it exits.
 *
 * This is what makes killing possible at all. `stream.destroy()` on the
 * hijacked exec stream only detaches the CLIENT; the exec's process keeps
 * running inside the container, and `docker` exposes no "signal this exec" API
 * (`container.kill` signals PID 1, killing the whole sandbox). The pid the
 * process reports for itself is the only handle we get on it.
 *
 * `exec` matters: without it the recorded pid would be a wrapper shell, and
 * killing that shell would leave the real command behind — the exact leak shape
 * this is here to prevent. It is also why the file cannot be cleaned up from
 * inside: `exec` replaces this shell, so no `trap` of ours can ever run. The
 * wrapper's owner removes the file from the host instead, on whichever of its
 * two exits happens — see {@link DockerHandle.removePidFile}.
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
 * How long the kill shell will wait for the pid file to appear, and how often it
 * re-checks. `container.exec()`/`exec.start()` resolve as soon as the DAEMON has
 * accepted the exec — the container-side shell has not necessarily run its first
 * statement yet, so `pidRecordingCommand`'s `echo $$ > file` may not have
 * happened when a prompt `kill()` arrives.
 *
 * That window is not hypothetical: `journal-reader` kills its follower the
 * instant its abort fires, which can be within a millisecond of the spawn. With
 * a bare `cat`, `$pid` came back empty, `[ -n "$pid" ]` was false, NOTHING was
 * signalled, and `stream.destroy()` merely detached the client — restoring
 * exactly the silent-orphan leak this whole mechanism exists to remove, for the
 * fast-abort case only (which is the common one).
 *
 * 2s at 50ms is ~40 attempts: generous next to the milliseconds a shell needs to
 * run one `echo`, and bounded so a genuinely-never-written file (the exec failed
 * to start at all) still reports rather than hanging teardown.
 */
const PID_WAIT_TIMEOUT_MS = 2000
const PID_WAIT_INTERVAL_MS = 50

/** Grace period between the requested signal and the unconditional `KILL`. */
const KILL_ESCALATION_DELAY_MS = 200

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
 * IT WAITS FOR THE PID FILE. See {@link PID_WAIT_TIMEOUT_MS} — a prompt kill
 * races the container-side `echo $$`, and losing that race used to mean sending
 * no signal at all.
 *
 * IT STILL CANNOT FAIL, BUT IT DOES REPORT. Every step stays `|| true`-shaped
 * (`2>/dev/null`, trailing `:`) because callers are `kill()` and abort handlers,
 * where a throw would wedge the caller instead of freeing anything — so the exit
 * code is uninformative BY DESIGN and must not be the only evidence. That was
 * the previous version's real defect: a refused kill (no `kill` builtin,
 * permissions, a pid that was never recorded) was indistinguishable from
 * success, which is precisely the unfalsifiability that flipped Vercel and
 * Daytona to `killableProcesses: false`. So the shell now:
 *
 * - prints {@link KILL_NO_PID_MARKER} when the pid file never appeared;
 * - VERIFIES with `kill -0` after the escalation and prints
 *   {@link KILL_FAILED_MARKER} if the process is still there.
 *
 * `kill -0` is what makes the success claim falsifiable: it answers "is it gone"
 * from the container's own kernel rather than from the exit status of a command
 * that was built never to fail. {@link DockerHandle.killRecordedPid} turns either
 * marker into a logger warning.
 */
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
  /**
   * Sink for non-fatal teardown diagnostics — a kill the container refused or
   * could not confirm. Teardown never throws, so without a logger those are
   * silent and `killableProcesses: true` becomes unfalsifiable.
   */
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
   * Signal the container-side process that recorded its pid to `pidFile`, and
   * REPORT anything that says the process may still be alive.
   *
   * AWAITABLE, and callers on the `kill()` path must await it. It used to be
   * fire-and-forget (`void this.exec(...)`), which meant `await proc.kill()`
   * resolved before the container had been asked to do anything — so the
   * documented ordering of `await proc.kill(); await handle.destroy()` did not
   * hold, and a caller could not know whether the kill had even been attempted.
   *
   * NEVER THROWS. The container may already be stopping — itself a terminal kill
   * of everything inside it — and this runs from teardown paths where a
   * rejection would wedge the caller instead of freeing anything. But "does not
   * throw" is not "cannot be observed to fail": a refusal reported by the shell
   * (see {@link killRecordedPidCommand}) or a rejected exec both reach the
   * logger, so an unkillable process is visible rather than silently assumed
   * dead.
   */
  private async killRecordedPid(
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

  /**
   * Remove a pid file whose owner has exited on its own.
   *
   * `killRecordedPidCommand` already removes it on the kill path, which covered
   * only killed processes: every signal-bearing `exec` and every `spawn` wrote
   * one, and a normally-exiting command left it in `/tmp` for the life of the
   * container. Being dot-prefixed, `journalListCommand`'s `ls -1` never showed
   * them, so the accumulation was silent.
   *
   * Fire-and-forget on purpose — it runs from stream-completion handlers, races
   * a container that may already be gone, and a leftover file in a doomed
   * container's `/tmp` is not worth failing or delaying anything for.
   */
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

    let aborted = false
    if (opts?.signal) {
      opts.signal.addEventListener(
        'abort',
        () => {
          aborted = true
          // Kill inside the container FIRST — detaching the stream on its own
          // leaves the command running (see `pidRecordingCommand`). This one
          // handler cannot await (an `AbortSignal` listener is synchronous), so
          // the kill is dispatched and its own reporting is left to
          // `killRecordedPid`'s logger. `SpawnHandle.kill` — the path a caller
          // sequences teardown on — DOES await.
          if (pidFile) void this.killRecordedPid(pidFile)
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

    // The wrapper exited on its own, so nothing will ever read its pid file
    // again. On the abort path `killRecordedPidCommand` removes it instead —
    // removing it here too would race that kill's `cat`.
    if (pidFile !== undefined && !aborted) this.removePidFile(pidFile)

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
    // `kill()`/abort own the pid file (their shell removes it, after reading it);
    // this covers the process that simply exits, whose file nothing would ever
    // clean up. `end` fires only on a clean EOF, never on a destroyed stream.
    let killRequested = false
    stream.on('end', () => {
      if (!killRequested) this.removePidFile(pidFile)
    })
    if (opts?.signal) {
      opts.signal.addEventListener(
        'abort',
        () => {
          // Synchronous listener — cannot await. See the twin comment in `exec`.
          killRequested = true
          void this.killRecordedPid(pidFile)
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
      /**
       * Kill the container-side process, THEN detach. Detaching alone would
       * leave it running (see `pidRecordingCommand`) — a silent orphan leak.
       *
       * AWAITS the in-container kill, so when this resolves the container has
       * been asked and has answered. It previously returned an
       * already-resolved promise while the kill was still in flight, which gave
       * `await proc.kill(); await handle.destroy()` no ordering at all.
       *
       * ESCALATES TO `SIGKILL` unconditionally, {@link KILL_ESCALATION_DELAY_MS}
       * after `signal`. This is a teardown primitive, not a graceful-shutdown
       * one: a process that ignores `TERM` is a leak, and the container-side pid
       * is the only handle we have on it. A `signal` argument therefore selects
       * WHICH signal the process gets a brief chance to handle — NOT whether it
       * may take its time. A handler needing longer than that must be given its
       * time before calling this (send the signal yourself and await the
       * process's own exit via {@link SpawnHandle.wait}).
       *
       * Never rejects — see `killRecordedPid`. A kill the container refused is
       * reported through the handle's `logger`, not thrown.
       */
      kill: async (signal) => {
        killRequested = true
        await this.killRecordedPid(pidFile, signal)
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
