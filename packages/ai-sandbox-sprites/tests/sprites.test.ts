import { describe, expect, it } from 'vitest'
import { spritesSandbox } from '../src/index'
import type { SpritesHandle } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when a Sprites API key is present (these tests create
// real cloud sandboxes and are billed).
const apiKey = process.env.SPRITES_API_KEY

describe.skipIf(!apiKey)('sprites provider (gated on SPRITES_API_KEY)', () => {
  it('creates a sandbox, runs exec, fs round-trip + destroy', async () => {
    const provider = spritesSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})

      const echo = await sbx.process.exec('echo hello-sprites')
      expect(echo.stdout.trim()).toBe('hello-sprites')
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

      // env + cwd are honored.
      const env = await sbx.process.exec('echo "$GREETING from $(pwd)"', {
        env: { GREETING: 'hi' },
        cwd: '/workspace',
      })
      expect(env.stdout.trim()).toBe('hi from /home/sprite')
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)

  it('streams a spawned background process', async () => {
    const provider = spritesSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      const proc = await sbx.process.spawn(
        'for i in 1 2 3; do echo line$i; done',
      )
      let out = ''
      for await (const chunk of proc.stdout) out += chunk
      expect(out).toContain('line1')
      expect(out).toContain('line3')
      expect(await proc.wait()).toBe(0)
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)

  it('creates a checkpoint and lists it', async () => {
    // NOTE: in-place restore restarts the Sprite (the restore stream stays open
    // across a multi-minute overlay swap), so it's covered by unit tests and the
    // README rather than this gated suite, which stays fast and deterministic.
    const provider = spritesSandbox({ apiKey })
    let sbx: SpritesHandle | undefined
    try {
      sbx = (await provider.create({})) as SpritesHandle
      await sbx.fs.write('/workspace/state.txt', 'original')

      const ref = await sbx.snapshot('baseline')
      expect(ref.id).toMatch(/^tanstack-ai-.*#v\d+$/)

      const checkpoints = await sbx.listCheckpoints()
      const version = ref.id.slice(ref.id.indexOf('#') + 1)
      expect(checkpoints.some((c) => c.id === version)).toBe(true)
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)

  it('exposes the proxied port as a reachable public URL', async () => {
    const provider = spritesSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      // Serve a tiny HTTP response on the proxied port, then reach it publicly.
      await sbx.fs.write(
        '/home/sprite/serve.mjs',
        "import http from 'node:http'; http.createServer((_q, s) => s.end('hello')).listen(8080, '0.0.0.0')",
      )
      const server = await sbx.process.spawn('node /home/sprite/serve.mjs')
      try {
        const channel = await sbx.ports.connect(8080)
        expect(channel.url).toMatch(/^https:\/\/.*\.sprites\.app\/?$/)
        // Give the listener a moment, then fetch through the public proxy.
        await new Promise((r) => setTimeout(r, 2000))
        const res = await fetch(channel.url, {
          ...(channel.headers ? { headers: channel.headers } : {}),
        })
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('hello')
      } finally {
        await server.kill()
      }
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)
})
