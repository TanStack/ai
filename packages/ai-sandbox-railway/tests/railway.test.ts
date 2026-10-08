import { describe, expect, it } from 'vitest'
import { Sandbox } from 'railway'
import { railwaySandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run with Railway credentials (these tests create real,
// billed sandboxes). The SDK reads the token from the environment itself.
const token = process.env.RAILWAY_API_TOKEN ?? process.env.RAILWAY_TOKEN
const environmentId = process.env.RAILWAY_ENVIRONMENT_ID
const hasCreds = !!token && !!environmentId

const config = {
  ...(environmentId !== undefined ? { environmentId } : {}),
  idleTimeoutMinutes: 10,
}

describe.skipIf(!hasCreds)(
  'railway provider (gated on RAILWAY_API_TOKEN/RAILWAY_TOKEN + RAILWAY_ENVIRONMENT_ID)',
  () => {
    it('creates a sandbox, runs exec, fs round-trip + destroy', async () => {
      const provider = railwaySandbox(config)
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({ env: { CREATE_VAR: 'created' } })

        const echo = await sbx.process.exec('echo hello-railway; pwd')
        expect(echo.stdout).toContain('hello-railway')
        expect(echo.stdout).toContain('/workspace')
        expect(echo.exitCode).toBe(0)

        // Non-zero exit is a result with stderr intact, not an exception.
        const failed = await sbx.process.exec('echo nope >&2; exit 7')
        expect(failed.exitCode).toBe(7)
        expect(failed.stderr).toContain('nope')

        // Create-time env, the overlay, and per-command env all arrive.
        await sbx.env.set({ BASE_VAR: 'base' })
        const env = await sbx.process.exec(
          'echo "$CREATE_VAR:$BASE_VAR:$EXTRA_VAR"',
          { env: { EXTRA_VAR: 'extra' } },
        )
        expect(env.stdout.trim()).toBe('created:base:extra')

        await sbx.fs.write('/workspace/nested/note.txt', 'inside railway')
        expect(await sbx.fs.exists('/workspace/nested/note.txt')).toBe(true)
        expect(await sbx.fs.read('/workspace/nested/note.txt')).toBe(
          'inside railway',
        )
        expect(await sbx.fs.lstat!('/workspace/nested/note.txt')).toMatchObject(
          { type: 'file', size: 14 },
        )
        await sbx.process.exec('ln -s nested/note.txt /workspace/link')
        expect(await sbx.fs.lstat!('/workspace/link')).toMatchObject({
          type: 'symlink',
        })
        expect(await sbx.fs.lstat!('/workspace/absent')).toBeUndefined()

        const bytes = new Uint8Array([0, 1, 2, 250])
        await sbx.fs.write('/workspace/bin', bytes)
        expect(Array.from(await sbx.fs.readBytes('/workspace/bin'))).toEqual([
          0, 1, 2, 250,
        ])

        expect(await sbx.fs.list('/workspace')).toEqual(
          expect.arrayContaining([
            { name: 'nested', path: '/workspace/nested', type: 'dir' },
            { name: 'bin', path: '/workspace/bin', type: 'file' },
          ]),
        )
        await sbx.fs.rename('/workspace/bin', '/workspace/bin2')
        expect(await sbx.fs.exists('/workspace/bin')).toBe(false)
        // Recursive: the SDK's own remove refuses a non-empty directory.
        await sbx.fs.remove('/workspace/nested')
        expect(await sbx.fs.exists('/workspace/nested')).toBe(false)

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

    it('feeds a spawned process over stdin and closes it', async () => {
      const provider = railwaySandbox(config)
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

    // MEASURES killableProcesses: the marker file proves the process died in
    // the sandbox rather than the client detaching from it.
    it('kill() terminates the process inside the sandbox', async () => {
      const provider = railwaySandbox(config)
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        const proc = await sbx.process.spawn(
          'sleep 5 && touch /workspace/survived',
        )
        await new Promise((r) => setTimeout(r, 1000))
        await proc.kill()
        expect(await proc.wait()).not.toBe(0)
        await new Promise((r) => setTimeout(r, 8000))
        expect(await sbx.fs.exists('/workspace/survived')).toBe(false)
      } finally {
        await sbx?.destroy()
      }
    }, 300_000)

    // MEASURES the exec abort path: the command is killed in the sandbox and
    // the caller gets its signalled exit.
    it('aborting exec kills the sandbox-side process', async () => {
      const provider = railwaySandbox(config)
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        const controller = new AbortController()
        const pending = sbx.process.exec(
          'sleep 5 && touch /workspace/survived-abort',
          { signal: controller.signal },
        )
        await new Promise((r) => setTimeout(r, 1000))
        controller.abort()
        expect((await pending).exitCode).not.toBe(0)
        await new Promise((r) => setTimeout(r, 6000))
        expect(await sbx.fs.exists('/workspace/survived-abort')).toBe(false)
      } finally {
        await sbx?.destroy()
      }
    }, 300_000)

    // MEASURES the spawn abort path, including a backgrounded child.
    it('aborting spawn kills the process group', async () => {
      const provider = railwaySandbox(config)
      let sbx: SandboxHandle | undefined
      try {
        sbx = await provider.create({})
        const controller = new AbortController()
        const proc = await sbx.process.spawn(
          '(sleep 5 && touch /workspace/survived-child) & sleep 5 && touch /workspace/survived-parent; wait',
          { signal: controller.signal },
        )
        await new Promise((r) => setTimeout(r, 1000))
        controller.abort()
        expect(await proc.wait()).not.toBe(0)
        await new Promise((r) => setTimeout(r, 6000))
        expect(await sbx.fs.exists('/workspace/survived-child')).toBe(false)
        expect(await sbx.fs.exists('/workspace/survived-parent')).toBe(false)
      } finally {
        await sbx?.destroy()
      }
    }, 300_000)

    it('a checkpoint restores after its source sandbox is destroyed', async () => {
      const provider = railwaySandbox(config)
      let source: SandboxHandle | undefined
      let restored: SandboxHandle | undefined
      let snapshotId: string | undefined
      try {
        source = await provider.create({})
        await source.fs.write('/workspace/keep.txt', 'survives snapshot')
        const ref = await source.snapshot!('after-setup')
        snapshotId = ref.id
        expect(ref.id).toMatch(/^tsai-/)
        expect(ref.label).toBe('after-setup')
        await source.destroy()
        source = undefined

        restored = await provider.restoreSnapshot!({ snapshotId: ref.id })
        expect(await restored.fs.read('/workspace/keep.txt')).toBe(
          'survives snapshot',
        )
      } finally {
        await Promise.allSettled([source?.destroy(), restored?.destroy()])
        // Checkpoints count against a quota; clean up the one this test made.
        if (snapshotId !== undefined) {
          const opts = environmentId !== undefined ? { environmentId } : {}
          const match = (await Sandbox.checkpoints(opts)).find(
            (c) => c.key === snapshotId,
          )
          if (match) await Sandbox.deleteCheckpoint(match.id, opts)
        }
      }
    }, 600_000)

    it('fork carries disk state and the env overlay, then diverges', async () => {
      const provider = railwaySandbox(config)
      let src: SandboxHandle | undefined
      let forked: SandboxHandle | undefined
      try {
        src = await provider.create({})
        await src.env.set({ OVERLAY: 'kept' })
        await src.fs.write('/workspace/before-fork.txt', 'carried over')
        forked = await src.fork!()
        expect(forked.id).not.toBe(src.id)
        expect(await forked.fs.read('/workspace/before-fork.txt')).toBe(
          'carried over',
        )
        expect((await forked.process.exec('echo $OVERLAY')).stdout.trim()).toBe(
          'kept',
        )
        await forked.fs.write('/workspace/only-in-fork.txt', 'x')
        expect(await src.fs.exists('/workspace/only-in-fork.txt')).toBe(false)
      } finally {
        await Promise.allSettled([src?.destroy(), forked?.destroy()])
      }
    }, 600_000)

    it('resume reconnects to a live sandbox and returns null once it is destroyed', async () => {
      const provider = railwaySandbox(config)
      const sbx = await provider.create({})
      try {
        await sbx.fs.write('/workspace/state.txt', 'still here')
        const resumed = await provider.resume({ id: sbx.id })
        expect(resumed?.id).toBe(sbx.id)
        expect(await resumed!.fs.read('/workspace/state.txt')).toBe(
          'still here',
        )
      } finally {
        await sbx.destroy()
      }
      expect(await provider.resume({ id: sbx.id })).toBeNull()
      await expect(provider.destroy({ id: sbx.id })).resolves.toBeUndefined()
    }, 300_000)
  },
)
