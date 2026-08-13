import { describe, expect, it } from 'vitest'
import { daytonaSandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when a Daytona API key is present (these tests create
// real cloud sandboxes and are billed).
const apiKey = process.env.DAYTONA_API_KEY

describe.skipIf(!apiKey)('daytona provider (gated on DAYTONA_API_KEY)', () => {
  it('creates a sandbox, runs exec, fs round-trip + destroy', async () => {
    const provider = daytonaSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})

      const echo = await sbx.process.exec('echo hello-daytona')
      expect(echo.stdout.trim()).toBe('hello-daytona')
      expect(echo.exitCode).toBe(0)

      await sbx.fs.write('/workspace/note.txt', 'inside the sandbox')
      expect(await sbx.fs.exists('/workspace/note.txt')).toBe(true)
      expect(await sbx.fs.read('/workspace/note.txt')).toBe(
        'inside the sandbox',
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
    const provider = daytonaSandbox({ apiKey })
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
