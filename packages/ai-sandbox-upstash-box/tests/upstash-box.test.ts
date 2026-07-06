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

        // Background process: stream stdout via exec.stream and wait for exit.
        const proc = await sbx.process.spawn('echo streamed-line')
        let out = ''
        for await (const chunk of proc.stdout) out += chunk
        expect(out).toContain('streamed-line')
        expect(await proc.wait()).toBe(0)
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
  },
)
