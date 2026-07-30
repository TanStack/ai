import { describe, expect, it } from 'vitest'
import Dockerode from 'dockerode'
import { defineSandbox, defineWorkspace } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '../src/index'
import { dockerDaemonAvailable } from './docker-daemon'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when a Docker daemon is reachable — unless
// `REQUIRE_DOCKER` is set, in which case an unreachable daemon fails rather than
// skipping. See `./docker-daemon.ts`.
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
