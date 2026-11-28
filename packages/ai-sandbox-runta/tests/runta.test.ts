import { describe, expect, it } from 'vitest'
import { runtaSandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when a Runta API key is present (these tests create real
// runtimes and are billed).
const apiKey = process.env.RUNTA_TOKEN
// The provider reads this itself. A client that a test makes must use it too,
// or it would send the token to the default API.
const endpoint = process.env.RUNTA_ENDPOINT

describe.skipIf(!apiKey)('runta provider (gated on RUNTA_TOKEN)', () => {
  it('creates a sandbox, runs exec, fs round-trip + destroy', async () => {
    const provider = runtaSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})

      const echo = await sbx.process.exec('echo hello-runta')
      expect(echo.stdout.trim()).toBe('hello-runta')
      expect(echo.exitCode).toBe(0)

      await sbx.fs.write('/workspace/dir/note.txt', 'inside the sandbox')
      expect(await sbx.fs.exists('/workspace/dir/note.txt')).toBe(true)
      expect(await sbx.fs.read('/workspace/dir/note.txt')).toBe(
        'inside the sandbox',
      )
      expect(await sbx.fs.list('/workspace')).toEqual([
        { name: 'dir', path: '/workspace/dir', type: 'dir' },
      ])
      expect(await sbx.fs.lstat?.('/workspace/dir/note.txt')).toMatchObject({
        type: 'file',
        size: 18,
      })
      expect(await sbx.fs.lstat?.('/workspace/missing')).toBeUndefined()

      // A file above the 1 MiB file-endpoint limit streams over exec.
      const big = new Uint8Array(3 * 1024 * 1024).fill(7)
      await sbx.fs.write('/workspace/big.bin', big)
      expect((await sbx.fs.readBytes('/workspace/big.bin')).byteLength).toBe(
        big.byteLength,
      )

      // env + cwd are honored.
      const env = await sbx.process.exec('echo "$GREETING from $(pwd)"', {
        env: { GREETING: 'hi' },
        cwd: '/workspace/dir',
      })
      expect(env.stdout.trim()).toBe('hi from /workspace/dir')
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)

  // Runta addresses a runtime by UUID only, so resume and destroy by the
  // handle id (the runtime name) must find the runtime first.
  it('resumes a paused sandbox by id, then destroys it by id', async () => {
    const provider = runtaSandbox({ apiKey })
    const created = await provider.create({})
    try {
      await created.fs.write('/workspace/kept.txt', 'still here')
      await created.process.exec('true')
      const { RuntaClient } = await import('../src/client')
      const client = new RuntaClient({
        apiKey: apiKey ?? '',
        ...(endpoint ? { endpoint } : {}),
      })
      await client.lifecycle(created.id, 'pause')

      const resumed = await provider.resume({ id: created.id })
      expect(resumed?.id).toBe(created.id)
      expect(await resumed?.fs.read('/workspace/kept.txt')).toBe('still here')
      expect(await provider.resume({ id: 'tanstack-ai-no-such-id' })).toBeNull()
    } finally {
      await provider.destroy({ id: created.id })
    }
    expect(await provider.resume({ id: created.id })).toBeNull()
  }, 180_000)

  it('streams a spawned process and takes stdin', async () => {
    const provider = runtaSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      const proc = await sbx.process.spawn('read name; echo "hello $name"')
      await proc.stdin.write('stdin\n')
      let out = ''
      for await (const chunk of proc.stdout) out += chunk
      expect(out).toBe('hello stdin\n')
      expect(await proc.wait()).toBe(0)
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)

  it('restores a snapshot into a new runtime after the source is gone', async () => {
    const provider = runtaSandbox({ apiKey })
    let restored: SandboxHandle | undefined
    let snapshotId: string | undefined
    const sbx = await provider.create({})
    try {
      await sbx.fs.write('/workspace/state.txt', 'original')
      const ref = await sbx.snapshot?.('baseline')
      snapshotId = ref?.id
      await sbx.destroy()

      restored = await provider.restoreSnapshot?.({ snapshotId: ref?.id ?? '' })
      expect(restored?.id).not.toBe(sbx.id)
      expect(await restored?.fs.read('/workspace/state.txt')).toBe('original')
    } finally {
      // Each cleanup runs even when an earlier one fails, so a failed destroy
      // does not leave the restored runtime or the checkpoint behind.
      try {
        await sbx.destroy()
      } finally {
        try {
          await restored?.destroy()
        } finally {
          if (snapshotId) await provider.deleteSnapshot?.({ snapshotId })
        }
      }
    }
  }, 300_000)

  it('exposes a port as a reachable public URL', async () => {
    const provider = runtaSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      await sbx.fs.write('/workspace/index.html', 'hello')
      const server = await sbx.process.spawn('python3 -m http.server 8080')
      try {
        const channel = await sbx.ports.connect(8080)
        expect(channel.url).toMatch(/^https:\/\/8080-.*\.runta\.dev$/)
        let res: Response | undefined
        for (let attempt = 0; attempt < 20 && !res?.ok; attempt += 1) {
          await new Promise((r) => setTimeout(r, 2000))
          res = await fetch(channel.url).catch(() => undefined)
        }
        expect(res?.status).toBe(200)
        expect(await res?.text()).toContain('hello')
      } finally {
        await server.kill()
      }
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)

  it('blocks egress when the policy denies network', async () => {
    const provider = runtaSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({
        policy: { capabilities: { network: 'deny' } },
      })
      const probe = await sbx.process.exec(
        'python3 -c "import urllib.request; urllib.request.urlopen(\'https://example.com\', timeout=10)"',
      )
      expect(probe.exitCode).not.toBe(0)
    } finally {
      await sbx?.destroy()
    }
  }, 180_000)
})
