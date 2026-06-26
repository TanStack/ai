import { describe, expect, it } from 'vitest'
import { vercelSandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when Vercel credentials are present (these tests create
// real microVM sandboxes and are billed).
const hasCreds =
  !!(process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN) &&
  !!process.env.VERCEL_TEAM_ID &&
  !!process.env.VERCEL_PROJECT_ID

describe.skipIf(!hasCreds)('vercel provider (gated on VERCEL_TOKEN)', () => {
  it('creates a sandbox, runs exec, fs round-trip + destroy', async () => {
    const provider = vercelSandbox({})
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})

      const echo = await sbx.process.exec('echo hello-vercel')
      expect(echo.stdout.trim()).toBe('hello-vercel')
      expect(echo.exitCode).toBe(0)

      await sbx.fs.write('/workspace/note.txt', 'inside the microVM')
      expect(await sbx.fs.exists('/workspace/note.txt')).toBe(true)
      expect(await sbx.fs.read('/workspace/note.txt')).toBe(
        'inside the microVM',
      )

      const bytes = new Uint8Array([0, 1, 2, 250])
      await sbx.fs.write('/workspace/bin', bytes)
      expect(Array.from(await sbx.fs.readBytes('/workspace/bin'))).toEqual([
        0, 1, 2, 250,
      ])
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)

  it('streams a spawned background process', async () => {
    const provider = vercelSandbox({})
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      const proc = await sbx.process.spawn('echo streamed-line')
      let out = ''
      for await (const chunk of proc.stdout) out += chunk
      expect(out).toContain('streamed-line')
      expect(await proc.wait()).toBe(0)
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)
})
