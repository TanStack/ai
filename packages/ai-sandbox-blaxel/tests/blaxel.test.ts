import { afterAll, describe, expect, it } from 'vitest'
import { blaxelSandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when Blaxel credentials are present (these tests create
// real cloud sandboxes and are billed).
const apiKey = process.env.BL_API_KEY
const workspace = process.env.BL_WORKSPACE
const gated = !apiKey || !workspace

const created: Array<SandboxHandle> = []

function track(handle: SandboxHandle): SandboxHandle {
  created.push(handle)
  return handle
}

afterAll(async () => {
  // Destroy every sandbox this file created, even if an expectation failed.
  await Promise.allSettled(created.map((handle) => handle.destroy()))
})

describe.skipIf(gated)(
  'blaxel provider (gated on BL_API_KEY + BL_WORKSPACE)',
  () => {
    it('creates a sandbox, runs exec, round-trips the filesystem, and destroys it', async () => {
      const provider = blaxelSandbox({ apiKey, workspace })
      const sbx = track(await provider.create({}))

      const echo = await sbx.process.exec('echo hello-blaxel')
      expect(echo.stdout.trim()).toBe('hello-blaxel')
      expect(echo.exitCode).toBe(0)

      // stderr and a non-zero exit are reported separately, not merged.
      const failed = await sbx.process.exec('echo boom >&2; exit 3')
      expect(failed.stderr.trim()).toBe('boom')
      expect(failed.exitCode).toBe(3)

      await sbx.fs.write('/workspace/note.txt', 'inside the sandbox')
      expect(await sbx.fs.exists('/workspace/note.txt')).toBe(true)
      expect(await sbx.fs.read('/workspace/note.txt')).toBe(
        'inside the sandbox',
      )

      // Every byte value survives the binary path, not just printable text.
      const bytes = new Uint8Array([0, 1, 2, 250, 255])
      await sbx.fs.write('/workspace/bin', bytes)
      expect(Array.from(await sbx.fs.readBytes('/workspace/bin'))).toEqual([
        0, 1, 2, 250, 255,
      ])

      // env + cwd are honored.
      const env = await sbx.process.exec('echo "$GREETING from $(pwd)"', {
        env: { GREETING: 'hi' },
        cwd: '/workspace',
      })
      expect(env.stdout.trim()).toBe('hi from /workspace')

      // env.set persists across later commands.
      await sbx.env.set({ PERSISTED: 'yes' })
      const persisted = await sbx.process.exec('echo "$PERSISTED"')
      expect(persisted.stdout.trim()).toBe('yes')

      await sbx.fs.mkdir('/workspace/sub')
      await sbx.fs.write('/workspace/sub/a.txt', 'a')
      const listed = await sbx.fs.list('/workspace/sub')
      expect(listed).toEqual([
        { name: 'a.txt', path: '/workspace/sub/a.txt', type: 'file' },
      ])

      await sbx.fs.rename('/workspace/sub/a.txt', '/workspace/sub/b.txt')
      expect(await sbx.fs.exists('/workspace/sub/a.txt')).toBe(false)
      expect(await sbx.fs.read('/workspace/sub/b.txt')).toBe('a')

      await sbx.fs.remove('/workspace/sub')
      expect(await sbx.fs.exists('/workspace/sub')).toBe(false)
    }, 180_000)

    it('streams a spawned process and reports its exit code', async () => {
      const provider = blaxelSandbox({ apiKey, workspace })
      const sbx = track(await provider.create({}))

      const spawned = await sbx.process.spawn('echo first; echo second; exit 0')
      const exit = await spawned.wait()
      expect(exit).toBe(0)

      // Assert the exact stream, not just that both words appear. A
      // `toContain` pair passes on "firstsecond", which is what a stream that
      // drops its line delimiters actually produces.
      let out = ''
      for await (const chunk of spawned.stdout) out += chunk
      expect(out).toBe('first\nsecond\n')
    }, 180_000)

    it('serves a port through a token-gated preview URL', async () => {
      const provider = blaxelSandbox({ apiKey, workspace })
      const sbx = track(await provider.create({}))

      await sbx.fs.write(
        '/workspace/server.mjs',
        [
          "import { createServer } from 'node:http'",
          "createServer((_req, res) => res.end('ready')).listen(3000)",
          '',
        ].join('\n'),
      )
      const server = await sbx.process.spawn('node /workspace/server.mjs')

      try {
        const channel = await sbx.ports.connect(3000)
        expect(channel.url).toMatch(/^https:\/\//)
        expect(channel.token).toBeTruthy()
        expect(channel.headers?.['X-Blaxel-Preview-Token']).toBe(channel.token)

        // The preview needs a moment to route to the freshly bound port.
        let body = ''
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const response = await fetch(channel.url, {
            headers: channel.headers ?? {},
          }).catch(() => undefined)
          if (response?.ok) {
            body = await response.text()
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        expect(body).toBe('ready')

        // The same URL must reject an unauthenticated request.
        const unauthenticated = await fetch(channel.url)
        expect(unauthenticated.status).toBe(401)
      } finally {
        await server.kill()
      }
    }, 240_000)

    it('resumes a sandbox by id and reports a missing one as null', async () => {
      const provider = blaxelSandbox({ apiKey, workspace })
      const sbx = track(await provider.create({}))
      await sbx.fs.write('/workspace/origin.txt', 'resumed')

      const resumed = await provider.resume({ id: sbx.id })
      expect(resumed?.id).toBe(sbx.id)
      expect(await resumed?.fs.read('/workspace/origin.txt')).toBe('resumed')

      expect(
        await provider.resume({ id: 'tanstack-ai-does-not-exist' }),
      ).toBeNull()
    }, 180_000)

    it('reports a destroyed sandbox as gone rather than as a live handle', async () => {
      // A destroyed Blaxel sandbox does not 404 straight away — the record
      // survives in a terminal state — so resume() has to read the status.
      // Without that check this returns a handle to a dead sandbox.
      const provider = blaxelSandbox({ apiKey, workspace })
      const sbx = track(await provider.create({}))
      await sbx.destroy()
      expect(await provider.resume({ id: sbx.id })).toBeNull()
    }, 180_000)
  },
)
