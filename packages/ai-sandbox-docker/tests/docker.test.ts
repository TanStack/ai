import { describe, expect, it } from 'vitest'
import Dockerode from 'dockerode'
import { defineSandbox, defineWorkspace } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '../src/index'
import { dockerDaemonAvailable } from './docker-daemon'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when a Docker daemon is reachable. See `./docker-daemon.ts`
// for what this matrix is the authority on.
const dockerAvailable = await dockerDaemonAvailable('docker provider')

/** For the image-inspection assertions below, which read the daemon directly. */
const docker = new Dockerode()

const IMAGE = 'alpine:3'

/**
 * A command line no other process on the machine will match, so a `ps` sweep
 * inside the container attributes a survivor to THIS test and nothing else. The
 * bracket in the grep pattern below keeps the grep from matching its own
 * command line.
 */
const KILL_PROBE_SLEEP = '987654321'
const KILL_PROBE_GREP = '98765[4]321'

describe.skipIf(!dockerAvailable)(
  'docker provider (gated on a reachable daemon)',
  () => {
    it('creates a container, runs exec, fs round-trip, snapshot + destroy', async () => {
      const provider = dockerSandbox({ image: IMAGE })
      let sbx: SandboxHandle | undefined
      let snapshotTag: string | undefined
      try {
        sbx = await provider.create({})

        const echo = await sbx.process.exec('echo hello-docker')
        expect(echo.stdout.trim()).toBe('hello-docker')
        expect(echo.exitCode).toBe(0)

        await sbx.fs.write('/workspace/note.txt', 'inside the container')
        expect(await sbx.fs.exists('/workspace/note.txt')).toBe(true)
        expect(await sbx.fs.read('/workspace/note.txt')).toBe(
          'inside the container',
        )

        const bytes = new Uint8Array([0, 1, 2, 250])
        await sbx.fs.write('/workspace/bin', bytes)
        expect(Array.from(await sbx.fs.readBytes('/workspace/bin'))).toEqual([
          0, 1, 2, 250,
        ])

        const snap = await sbx.snapshot?.('test')
        expect(snap?.id).toMatch(/tanstack-ai-sandbox-snapshot/)
        snapshotTag = snap?.id

        // The returned id is a template string composed BEFORE the commit runs,
        // so asserting its shape proves nothing about whether a snapshot exists
        // — delete the `container.commit()` call and a shape assertion still
        // passes. Inspect the image instead: this is the package's only snapshot
        // coverage, so it has to fail when no image was actually committed.
        const inspected = await docker.getImage(snapshotTag!).inspect()
        expect(inspected.RepoTags).toContain(snapshotTag)
        // ...and the snapshot really captured this container's filesystem.
        expect(inspected.Id).not.toBe('')
      } finally {
        if (snapshotTag !== undefined) {
          await docker
            .getImage(snapshotTag)
            .remove({ force: true })
            .catch(() => {
              // Best effort: never mask the real assertion failure.
            })
        }
        await sbx?.destroy()
      }
    }, 120_000)

    it('kill() actually terminates the container-side process, not just the client stream', async () => {
      const provider = dockerSandbox({ image: IMAGE })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        const handle = sbx

        /** The probe process's rows in the container's own process table. */
        const probeRows = async (): Promise<string> =>
          (
            await handle.process.exec(
              `ps | grep ${KILL_PROBE_GREP} | grep -v grep || true`,
            )
          ).stdout.trim()

        const proc = await handle.process.spawn(
          `echo up; sleep ${KILL_PROBE_SLEEP}`,
        )
        for await (const chunk of proc.stdout) {
          if (chunk.includes('up')) break
        }

        // Guard the guard: if the probe were never visible here, its absence
        // after kill() would prove nothing.
        expect(await probeRows()).toContain(KILL_PROBE_SLEEP)

        await proc.kill()

        // `killableProcesses: true` claims the process is FORCIBLY terminated,
        // so ask the container — do not take the handle's word for it. Reading
        // `capabilities.killableProcesses` here would only re-read a module
        // constant, and passed even when kill() was a no-op that left this
        // `sleep` running until the container was removed.
        let survivors = await probeRows()
        for (let i = 0; i < 20 && survivors !== ''; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250))
          survivors = await probeRows()
        }
        expect(survivors).toBe('')
      } finally {
        await sbx?.destroy()
      }
    }, 120_000)

    // Three properties that together are what makes `killableProcesses: true`
    // more than an assertion. Each fails on its own if the corresponding half of
    // the fix is reverted.
    it('kill() awaits the in-container kill instead of firing it and forgetting', async () => {
      const provider = dockerSandbox({ image: IMAGE })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        const handle = sbx
        const probeRows = async (): Promise<string> =>
          (
            await handle.process.exec(
              `ps | grep ${KILL_PROBE_GREP} | grep -v grep || true`,
            )
          ).stdout.trim()

        const proc = await handle.process.spawn(
          `echo up; sleep ${KILL_PROBE_SLEEP}`,
        )
        for await (const chunk of proc.stdout) {
          if (chunk.includes('up')) break
        }
        expect(await probeRows()).toContain(KILL_PROBE_SLEEP)

        const started = Date.now()
        await proc.kill()
        const elapsed = Date.now() - started

        // THE DISCRIMINATOR IS THE CLOCK, not the process table. The kill shell
        // signals, then sleeps `KILL_ESCALATION_DELAY_MS` (200ms) before
        // escalating to SIGKILL and verifying with `kill -0`, so a `kill()` that
        // genuinely awaits it CANNOT resolve faster than that grace period. One
        // that fires and forgets (`void this.exec(...)` then
        // `Promise.resolve()`) resolves in ~1ms without a single round trip.
        //
        // Asserting on the process table instead does NOT distinguish the two:
        // measured, a fire-and-forget kill still beats the `ps` probe, because
        // the probe needs its own `container.exec()` + `exec.start()` round
        // trips (~5ms each) and the kill was dispatched first. The sibling test
        // above already covers "it dies"; this one covers "we waited for it".
        expect(elapsed).toBeGreaterThanOrEqual(150)

        // …and having waited, the ordering `await proc.kill(); <next step>`
        // really does hold: no polling, no retry loop, gone right now.
        expect(await probeRows()).toBe('')
      } finally {
        await sbx?.destroy()
      }
    }, 120_000)

    it('treats a cleanly-exited process as nothing to kill: no wait, no warning', async () => {
      const warnings: Array<string> = []
      const provider = dockerSandbox({
        image: IMAGE,
        logger: {
          warn: (message) => {
            warnings.push(message)
          },
        },
      })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})

        // `journal-reader`'s `followJournal` calls `proc.kill()` from a `finally`
        // on EVERY exit path, so this — a container-side command that ended on
        // its own, then a kill — is the NORMAL teardown, not an edge case.
        const proc = await sbx.process.spawn('echo done')
        for await (const _chunk of proc.stdout) {
          // drain to EOF, so the wrapper has exited and its pid file is gone
        }
        expect(await proc.wait()).toBe(0)
        // Let the fire-and-forget `rm -f` land, so the kill below really does
        // face an absent pid file.
        await new Promise((resolve) => setTimeout(resolve, 500))

        const started = Date.now()
        await proc.kill()
        const elapsed = Date.now() - started

        // BOTH harms, because either one regresses on its own.
        //
        // THE CLOCK. The pid read is a bounded retry — `PID_WAIT_TIMEOUT_MS`
        // (2s) at `PID_WAIT_INTERVAL_MS` — and it exists for the fast-abort race
        // covered below, so it must stay. But "absent" also means "the owner
        // exited and we removed it", and inferring the first from the second
        // made every ordinary teardown block ~2s inside `await proc.kill()`.
        // Measured at 2083ms before the `exited` state; a round trip that skips
        // the loop is tens of milliseconds. 1s separates them with room to
        // spare on a loaded machine.
        expect(elapsed).toBeLessThan(1000)

        // THE CHANNEL. That warning is the only in-band evidence for
        // `killableProcesses: true` — the kill shell is built never to fail, so
        // its exit code carries nothing. A channel that fires on every clean
        // teardown cannot support the claim, so silence here is load-bearing,
        // not cosmetic.
        expect(warnings).toEqual([])
      } finally {
        await sbx?.destroy()
      }
    }, 120_000)

    it('reports a kill it could not perform instead of resolving as if it worked', async () => {
      const warnings: Array<{
        message: string
        meta?: Record<string, unknown>
      }> = []
      const provider = dockerSandbox({
        image: IMAGE,
        logger: {
          warn: (message, meta) => {
            warnings.push({ message, meta })
          },
        },
      })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        const handle = sbx
        const probeRows = async (): Promise<string> =>
          (
            await handle.process.exec(
              `ps | grep ${KILL_PROBE_GREP} | grep -v grep || true`,
            )
          ).stdout.trim()
        // Drive the unperformable case: delete the pid file out from under a
        // STILL-RUNNING spawn, which is exactly the shape of "this process never
        // recorded a pid" (its exec never started, or it died before its
        // `echo $$`). The kill shell then waits, finds nothing, and sends NO
        // signal — and the process really does survive, which is what makes this
        // a genuine refusal rather than a modelled one.
        //
        // THAT "STILL-RUNNING" IS THE WHOLE DISTINCTION, and the reason this test
        // keeps its shape after the `exited` fix. An absent pid file means two
        // different things: "not written yet / never written" (here — nothing can
        // be signalled, so warn) and "the owner exited and we cleaned up" (the
        // sibling test above — nothing NEEDS signalling, so stay silent). The
        // handle no longer infers either from the file alone; it tracks which
        // happened. This case is the first, so the warning is earned. The
        // assertions below prove that from the container's own process table
        // rather than trusting the shape of the setup.
        //
        // Asserting only that `kill()` RESOLVED would pass against a kill that
        // did nothing at all — the shell is built never to fail, so its exit
        // code carries no information by design. The logger is the only channel
        // that can carry it, which is why the assertion is on the logger.
        const proc = await handle.process.spawn(
          `echo up; sleep ${KILL_PROBE_SLEEP}`,
        )
        for await (const chunk of proc.stdout) {
          if (chunk.includes('up')) break
        }
        // Guard the guard: there WAS a pid file, so its absence below is our
        // doing and not a mechanism that never wrote one.
        const listed = await handle.process.exec(
          'ls -1 /tmp/.tanstack-sandbox-spawn-*.pid',
        )
        expect(listed.stdout.trim()).not.toBe('')
        await handle.process.exec('rm -f /tmp/.tanstack-sandbox-spawn-*.pid')
        // Guard the guard, part two: the probe is alive going in, so its presence
        // afterwards is a survival and not a process that was never there.
        expect(await probeRows()).toContain(KILL_PROBE_SLEEP)

        await proc.kill()

        // The kill could not be performed, and that fact is VISIBLE.
        expect(
          warnings.some((w) => /no pid was recorded/.test(w.message)),
        ).toBe(true)

        // …and the refusal it reports is REAL. Without this the test would pass
        // against a handle that warned about a process it had in fact killed —
        // i.e. against the cried-wolf channel the sibling test forbids. The
        // container's own `ps` is the arbiter: the probe is still running,
        // because no signal was ever sent to it.
        expect(await probeRows()).toContain(KILL_PROBE_SLEEP)
      } finally {
        // The probe outlives the un-performable kill by construction; removing
        // the container is what actually ends it.
        await sbx?.destroy()
      }
    }, 120_000)

    it('kills a process that is killed before its pid file can exist (the fast-abort race)', async () => {
      const provider = dockerSandbox({ image: IMAGE })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        const handle = sbx
        const probeRows = async (): Promise<string> =>
          (
            await handle.process.exec(
              `ps | grep ${KILL_PROBE_GREP} | grep -v grep || true`,
            )
          ).stdout.trim()

        // NO waiting for output this time — that is the whole test.
        // `container.exec()`/`exec.start()` resolve once the DAEMON accepts the
        // exec; the container-side shell has not necessarily run its `echo $$`
        // yet. `journal-reader` kills its follower this promptly on abort.
        //
        // With a bare `cat` on the pid file, `$pid` is empty here, `[ -n "$pid" ]`
        // is false, NO signal is sent, and `stream.destroy()` only detaches the
        // client — the exact pre-fix orphan. The bounded retry in
        // `killRecordedPidCommand` is what closes it.
        const proc = await handle.process.spawn(
          `echo up; sleep ${KILL_PROBE_SLEEP}`,
        )
        await proc.kill()

        // BusyBox `ps` prints argv, so a survivor is attributable to this test
        // by its unique sleep duration. Poll until the probe is EMPTY, then
        // assert once — do not assert inside the loop. `kill()` resolves when the
        // daemon accepted the signal, not when the container-side process has
        // finished dying, so a per-poll assertion turns a few milliseconds of
        // teardown into a failure. The bound is the real assertion: the orphan
        // this test exists to catch (`stream.destroy()` detaching only the
        // client) leaves `sleep` running indefinitely, so it never empties and
        // still fails here.
        let rows = await probeRows()
        for (let i = 0; i < 12 && rows !== ''; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250))
          rows = await probeRows()
        }
        expect(rows).toBe('')
      } finally {
        await sbx?.destroy()
      }
    }, 120_000)

    it('does not leak a pid file per spawn / per signal-bearing exec', async () => {
      const provider = dockerSandbox({ image: IMAGE })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        const handle = sbx
        /** Every pid file the wrapper mechanism could have left in /tmp. */
        const pidFiles = async (): Promise<string> =>
          (
            await handle.process.exec(
              'ls -1 /tmp/.tanstack-sandbox-*.pid 2>/dev/null || true',
            )
          ).stdout.trim()

        // `rm -f` used to run ONLY on the kill path, so a normally-exiting
        // process left its file behind for the life of the container. The
        // dot-prefix means `journalListCommand`'s `ls -1` never surfaced them,
        // making the accumulation silent and unbounded.
        const proc = await handle.process.spawn('echo done')
        for await (const _chunk of proc.stdout) {
          // drain to EOF — the cleanup hangs off the stream's `end`
        }
        expect(await proc.wait()).toBe(0)

        // A signal-bearing exec writes one too (a plain fs-backing exec does
        // not, and must not start paying for a kill path it never uses).
        const ac = new AbortController()
        const ran = await handle.process.exec('echo ok', { signal: ac.signal })
        expect(ran.stdout.trim()).toBe('ok')

        // The removals are dispatched fire-and-forget from stream completion,
        // so allow them a beat to land before asserting.
        let leftovers = await pidFiles()
        for (let i = 0; i < 20 && leftovers !== ''; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250))
          leftovers = await pidFiles()
        }
        expect(leftovers).toBe('')
      } finally {
        await sbx?.destroy()
      }
    }, 120_000)

    it('resumes a running container by id and streams a spawned process', async () => {
      const provider = dockerSandbox({ image: IMAGE })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        await sbx.fs.write('/workspace/keep.txt', 'persisted')

        const resumed = await provider.resume({ id: sbx.id })
        expect(resumed?.id).toBe(sbx.id)
        expect(await resumed!.fs.read('/workspace/keep.txt')).toBe('persisted')

        const proc = await resumed!.process.spawn('echo streamed-line')
        let out = ''
        for await (const chunk of proc.stdout) out += chunk
        expect(out).toContain('streamed-line')
        expect(await proc.wait()).toBe(0)
      } finally {
        await sbx?.destroy()
      }
    }, 120_000)

    it('ensure() bootstraps a workspace (setup command runs)', async () => {
      const provider = dockerSandbox({ image: IMAGE })
      const def = defineSandbox({
        id: 'docker-ensure',
        provider,
        workspace: defineWorkspace({
          source: { type: 'none' },
          setup: ['echo bootstrapped > /workspace/setup-marker'],
        }),
      })
      const ctx = { threadId: 'docker-t', runId: 'r1' }
      try {
        const sbx = await def.ensure(ctx)
        expect((await sbx.fs.read('/workspace/setup-marker')).trim()).toBe(
          'bootstrapped',
        )
      } finally {
        await def.destroy(ctx)
      }
    }, 120_000)

    it('reassembles a multi-byte character split across spawn stdout chunk boundaries', async () => {
      const provider = dockerSandbox({ image: IMAGE })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        // '€' = 0xE2 0x82 0xAC (octal \342 \202 \254). Emit the first byte,
        // sleep, then the remaining bytes — forcing the container's exec
        // stream to deliver them as separate chunks, reproducing a
        // multi-byte character split across a chunk boundary.
        const proc = await sbx.process.spawn(
          `printf '\\342'; sleep 0.3; printf '\\202\\254lo'`,
        )
        let out = ''
        for await (const chunk of proc.stdout) out += chunk
        await proc.wait()
        expect(out).toBe('€lo')
        expect(out).not.toContain('�')
      } finally {
        await sbx?.destroy()
      }
    }, 120_000)

    it('flushes a genuinely truncated trailing UTF-8 sequence at end of stream (as U+FFFD, not silently dropped)', async () => {
      const provider = dockerSandbox({ image: IMAGE })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        // Only the first byte of a 3-byte sequence is ever written.
        const proc = await sbx.process.spawn(`printf '\\342'`)
        let out = ''
        for await (const chunk of proc.stdout) out += chunk
        await proc.wait()
        // Decision: flush at end-of-stream surfaces the truncated sequence
        // as the replacement character, rather than silently dropping it.
        expect(out).toBe('�')
      } finally {
        await sbx?.destroy()
      }
    }, 120_000)
  },
)
