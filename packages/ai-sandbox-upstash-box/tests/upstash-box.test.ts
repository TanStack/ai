import { describe, expect, it } from 'vitest'
import { upstashBoxSandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when an Upstash Box API key is present (these tests create
// real cloud boxes and are billed).
const apiKey = process.env.UPSTASH_BOX_API_KEY

describe.skipIf(!apiKey)(
  'upstash-box provider (gated on UPSTASH_BOX_API_KEY)',
  () => {
    it('creates a box, runs exec, fs round-trip + destroy', async () => {
      const provider = upstashBoxSandbox({ apiKey })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})

        const echo = await sbx.process.exec('echo hello-box')
        expect(echo.stdout.trim()).toBe('hello-box')
        expect(echo.exitCode).toBe(0)

        await sbx.fs.write('/workspace/note.txt', 'inside the box')
        expect(await sbx.fs.exists('/workspace/note.txt')).toBe(true)
        expect(await sbx.fs.read('/workspace/note.txt')).toBe('inside the box')

        const bytes = new Uint8Array([0, 1, 2, 250])
        await sbx.fs.write('/workspace/bin', bytes)
        expect(Array.from(await sbx.fs.readBytes('/workspace/bin'))).toEqual([
          0, 1, 2, 250,
        ])

        // Background process: stream stdout via exec.session and wait for exit.
        const proc = await sbx.process.spawn('echo streamed-line')
        // exec.session reports the real in-box pid.
        expect(proc.pid).toBeGreaterThan(0)
        let out = ''
        for await (const chunk of proc.stdout) out += chunk
        expect(out).toContain('streamed-line')
        expect(await proc.wait()).toBe(0)

        // stderr arrives on its own stream, not merged into stdout.
        const split = await sbx.process.spawn('echo to-out; echo to-err >&2')
        let sOut = ''
        let sErr = ''
        await Promise.all([
          (async () => {
            for await (const c of split.stdout) sOut += c
          })(),
          (async () => {
            for await (const c of split.stderr) sErr += c
          })(),
        ])
        expect(await split.wait()).toBe(0)
        expect(sOut).toContain('to-out')
        expect(sOut).not.toContain('to-err')
        expect(sErr).toContain('to-err')
      } finally {
        await sbx?.destroy()
      }
    }, 300_000)

    it('snapshots a box and restores it into a new box', async () => {
      const provider = upstashBoxSandbox({ apiKey })
      let source: SandboxHandle | undefined
      let restored: SandboxHandle | undefined
      try {
        source = await provider.create({})
        await source.fs.write('/workspace/keep.txt', 'survives snapshot')

        const ref = await source.snapshot?.('test-snapshot')
        expect(ref?.id).toBeTruthy()

        restored = await provider.restoreSnapshot!({ snapshotId: ref!.id })
        expect(await restored.fs.read('/workspace/keep.txt')).toBe(
          'survives snapshot',
        )
      } finally {
        await source?.destroy()
        await restored?.destroy()
      }
    }, 300_000)

    // MEASURES writableStdin: `cat` only exits if stdin really closes.
    it('feeds a spawned process over stdin and closes it', async () => {
      const provider = upstashBoxSandbox({ apiKey })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        const proc = await sbx.process.spawn('cat')
        await proc.stdin.write('fed-over-stdin\n')
        await proc.stdin.end()
        let out = ''
        for await (const chunk of proc.stdout) out += chunk
        expect(out).toContain('fed-over-stdin')
        expect(await proc.wait()).toBe(0)
      } finally {
        await sbx?.destroy()
      }
    }, 300_000)

    // MEASURES killableProcesses: the marker file proves the process died
    // server-side rather than the client merely detaching from it.
    it('kill() actually terminates the process inside the box', async () => {
      const provider = upstashBoxSandbox({ apiKey })
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        const proc = await sbx.process.spawn(
          'sleep 5 && touch /workspace/home/survived',
        )
        expect(proc.pid).toBeGreaterThan(0)
        await proc.kill()
        // A signalled process reports a non-zero (signal) exit, never 0.
        expect(await proc.wait()).not.toBe(0)
        // Outlive the original sleep, then confirm it never completed.
        await new Promise((r) => setTimeout(r, 8000))
        expect(await sbx.fs.exists('/workspace/survived')).toBe(false)
      } finally {
        await sbx?.destroy()
      }
    }, 300_000)

    // `Box.get` resolves for a deleted box, so resume must probe liveness.
    it('resume returns null for a destroyed box', async () => {
      const provider = upstashBoxSandbox({ apiKey })
      const sbx = await provider.create({})
      await sbx.destroy()
      expect(await provider.resume({ id: sbx.id })).toBeNull()
    }, 300_000)

    // MEASURES fork: snapshot + fromSnapshot must carry state and then diverge.
    it('fork branches a box from current state', async () => {
      const provider = upstashBoxSandbox({ apiKey })
      let src: SandboxHandle | undefined
      let forked: SandboxHandle | undefined
      try {
        src = await provider.create({})
        await src.fs.write('/workspace/before-fork.txt', 'carried over')
        forked = await src.fork!()
        expect(forked.id).not.toBe(src.id)
        expect(await forked.fs.read('/workspace/before-fork.txt')).toBe(
          'carried over',
        )
        await forked.fs.write('/workspace/only-in-fork.txt', 'x')
        expect(await src.fs.exists('/workspace/only-in-fork.txt')).toBe(false)
      } finally {
        // Sequential awaits would strand the fork if the first destroy rejects,
        // and destroy() now rethrows anything that is not a 404.
        await Promise.allSettled([src?.destroy(), forked?.destroy()])
      }
    }, 900_000)

    // MEASURES networkPolicy: a deny policy must actually block egress.
    it('a deny network policy blocks outbound traffic', async () => {
      const provider = upstashBoxSandbox({ apiKey })
      const PROBE =
        'curl -s -m 10 -o /dev/null -w "%{http_code}" https://example.com'
      let denied: SandboxHandle | undefined
      let control: SandboxHandle | undefined
      try {
        // allSettled, not all: a rejecting create would otherwise reject before
        // either handle is assigned, and `finally` could not destroy the box the
        // sibling call had already made.
        const [deniedRes, controlRes] = await Promise.allSettled([
          provider.create({ policy: { capabilities: { network: 'deny' } } }),
          provider.create({}),
        ])
        if (deniedRes.status === 'fulfilled') denied = deniedRes.value
        if (controlRes.status === 'fulfilled') control = controlRes.value
        if (deniedRes.status === 'rejected') throw deniedRes.reason
        if (controlRes.status === 'rejected') throw controlRes.reason

        // POSITIVE CONTROL, without it the test passes whenever the probe fails
        // for an unrelated reason (DNS, routing, TLS, example.com being down)
        // even though egress is wide open.
        const reachable = await controlRes.value.process.exec(PROBE)
        expect(reachable.stdout).toContain('200')

        // curl must exist, or the negative case proves nothing: a missing binary
        // also produces "no 200".
        expect(
          (await deniedRes.value.process.exec('command -v curl')).exitCode,
        ).toBe(0)
        // Assert the connection actually failed rather than merely "not 200",
        // which an empty stdout would satisfy for any unrelated reason.
        const blocked = await deniedRes.value.process.exec(PROBE)
        expect(blocked.exitCode).not.toBe(0)
        expect(blocked.stdout).not.toContain('200')
      } finally {
        await Promise.allSettled([denied?.destroy(), control?.destroy()])
      }
    }, 900_000)
  },
)
