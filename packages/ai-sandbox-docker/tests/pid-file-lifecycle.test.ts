/**
 * The pid-file lifecycle paths a real daemon cannot be made to take on demand.
 *
 * `handle.ts` writes a pid file per spawn and per signal-bearing exec — the only
 * handle it gets on a container-side process, since `docker` exposes no "signal
 * this exec" API — and must remove it on EVERY exit, not just the clean one. Two
 * of those exits are unreachable from `docker.test.ts`: a hijacked exec stream
 * that emits `error` (the promise rejects, so any cleanup written as a statement
 * after the `await` is skipped) and one that reaches `close` without a clean EOF
 * (the daemon connection broke, the container stopped under us — `end` never
 * fires). You cannot ask a healthy daemon for either, and provoking them by
 * killing the container takes `/tmp` — and therefore the evidence — with it.
 *
 * So the daemon is faked at exactly ONE seam: `container.exec`. Everything else
 * is the real thing — a real `Dockerode` whose real `modem.demuxStream` does the
 * real frame parsing, a real `Dockerode.Container`, a real `Dockerode.Exec` — so
 * the code under test is exercised through its actual collaborators and the fake
 * only supplies the stream whose failure mode is the point. No daemon is needed
 * and no test here touches one.
 */
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import Dockerode from 'dockerode'
import { DockerHandle } from '../src/handle'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

/** One `container.exec()` the handle asked for. */
interface RecordedExec {
  /** The `sh -c` argument — the command, or its pid-recording wrapper. */
  command: string
  /** The duplex the handle demuxes and watches, ours to fail on cue. */
  stream: PassThrough
}

/**
 * What the daemon reports for a finished exec. Only `ExitCode` is read by the
 * handle; the rest is the shape `ExecInspectInfo` requires, spelled out rather
 * than asserted past with a cast.
 */
const EXITED_ZERO: Dockerode.ExecInspectInfo = {
  CanRemove: false,
  DetachKeys: '',
  ID: 'fake-exec',
  Running: false,
  ExitCode: 0,
  ProcessConfig: {
    privileged: false,
    user: '',
    tty: false,
    entrypoint: 'sh',
    arguments: ['-c'],
  },
  OpenStdin: false,
  OpenStderr: true,
  OpenStdout: true,
  ContainerID: 'fake-container',
  Pid: 0,
}

interface FakeDaemon {
  handle: SandboxHandle
  execs: Array<RecordedExec>
  /** The most recent exec whose command matches, or `undefined`. */
  find: (pattern: RegExp) => RecordedExec | undefined
}

function fakeDaemon(): FakeDaemon {
  // Real modem, real demuxStream, real Container/Exec instances: only the
  // transport is replaced.
  const docker = new Dockerode()
  const container = docker.getContainer('fake-container')
  const execs: Array<RecordedExec> = []

  container.exec = (options: Dockerode.ExecCreateOptions) => {
    const stream = new PassThrough()
    // `Cmd` is always `['sh', '-c', <command>]` here; index 2 is the command.
    const command = options.Cmd?.[2] ?? ''
    execs.push({ command, stream })
    // The handle's OWN bookkeeping execs (the kill shell, `rm -f`) must complete
    // like a real daemon's would, or awaiting `kill()` would hang forever. Only
    // the pid-recording wrappers — the processes whose failure mode is the
    // subject — are left for the test to end on cue.
    if (!command.startsWith('echo $$')) setImmediate(() => stream.end())
    const exec = new Dockerode.Exec(docker.modem, 'fake-exec')
    exec.start = () => Promise.resolve(stream)
    exec.inspect = () => Promise.resolve(EXITED_ZERO)
    return Promise.resolve(exec)
  }

  return {
    handle: new DockerHandle({
      docker,
      container,
      workdir: '/workspace',
      forkFactory: () => Promise.reject(new Error('not used')),
      removeOnDestroy: false,
    }),
    execs,
    find: (pattern) => execs.filter((e) => pattern.test(e.command)).at(-1),
  }
}

/** Wait for `predicate`, which fire-and-forget cleanups need a turn to satisfy. */
async function eventually(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !predicate(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

/** The pid file the wrapper in `command` writes, if it is a wrapper at all. */
function pidFileOf(command: string): string {
  const match = /echo \$\$ > '([^']+)'/.exec(command)
  if (match?.[1] === undefined) {
    throw new Error(`not a pid-recording wrapper: ${command}`)
  }
  return match[1]
}

describe('pid-file lifecycle on the exits a daemon will not produce on demand', () => {
  it('removes the pid file of a signal-bearing exec whose stream ERRORS', async () => {
    const daemon = fakeDaemon()
    // A signal is what makes `exec` pay for the pid-recording wrapper at all —
    // an fs-backing exec has no kill path and must not write one.
    const controller = new AbortController()
    const running = daemon.handle.process.exec('echo hi', {
      signal: controller.signal,
    })
    // Let the handle finish attaching its stream listeners. Destroying before
    // the `error` listener exists would make the error uncatchable rather than
    // exercising the path under test.
    await eventually(() => daemon.find(/echo \$\$/) !== undefined)
    await new Promise((resolve) => setTimeout(resolve, 20))

    const wrapped = daemon.find(/echo \$\$/)
    expect(wrapped).toBeDefined()
    const pidFile = pidFileOf(wrapped!.command)
    // The failure mode: the hijacked stream errors instead of reaching EOF, so
    // `stream.on('error', reject)` rejects the settle promise. Cleanup written
    // as a statement after that `await` never runs, and the file survives for
    // the container's whole life.
    wrapped!.stream.destroy(new Error('daemon connection reset'))

    await expect(running).rejects.toThrow('daemon connection reset')

    await eventually(() => daemon.find(/^rm -f/) !== undefined)
    expect(daemon.find(/^rm -f/)?.command).toBe(`rm -f '${pidFile}'`)
  })

  it('removes the pid file of a spawn that ends WITHOUT a clean EOF', async () => {
    const daemon = fakeDaemon()
    const proc = await daemon.handle.process.spawn('sleep 30')

    const wrapped = daemon.find(/echo \$\$/)
    expect(wrapped).toBeDefined()
    const pidFile = pidFileOf(wrapped!.command)
    // `close` with no `end` before it — the shape of a broken connection or a
    // container stopping under us. Nobody killed anything, so the pid file is
    // the wrapper's own to clean up, and hanging that cleanup off `end` alone
    // leaked it here.
    wrapped!.stream.destroy()

    // The handle still lets its consumer finish rather than hanging.
    expect(await proc.wait()).toBe(0)

    await eventually(() => daemon.find(/^rm -f/) !== undefined)
    expect(daemon.find(/^rm -f/)?.command).toBe(`rm -f '${pidFile}'`)
  })

  it('leaves the pid file to the kill shell when a kill WAS requested', async () => {
    const daemon = fakeDaemon()
    const proc = await daemon.handle.process.spawn('sleep 30')
    const pidFile = pidFileOf(daemon.find(/echo \$\$/)!.command)

    // `kill()` destroys the stream itself, so `close` fires with a kill in
    // flight. Removing the file from here would race that shell's `cat` — the
    // reason the exit handlers are guarded rather than unconditional.
    await proc.kill()

    const killShell = daemon.find(/tanstack-sandbox-kill-no-pid/)
    expect(killShell?.command).toContain(pidFile)
    // The kill shell's own `rm -f ${f}` is the only removal; no separate one.
    expect(daemon.find(/^rm -f/)).toBeUndefined()
  })
})
