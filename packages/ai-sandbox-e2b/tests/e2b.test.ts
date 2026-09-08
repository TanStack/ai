import { describe, expect, it } from 'vitest'
import { e2bSandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when an E2B API key is present (these tests create real
// cloud sandboxes).
const apiKey = process.env.E2B_API_KEY

describe.skipIf(!apiKey)('e2b provider (gated on E2B_API_KEY)', () => {
  it('creates a sandbox, runs exec, fs round-trip + destroy', async () => {
    const provider = e2bSandbox({ apiKey, timeoutMs: 5 * 60_000 })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({ id: 'live-test' })

      const echo = await sbx.process.exec('echo hello-e2b; pwd')
      expect(echo.stdout).toContain('hello-e2b')
      expect(echo.stdout).toContain('/home/user/workspace')
      expect(echo.exitCode).toBe(0)

      // Non-zero exit is a result with stderr intact, not an exception.
      const failed = await sbx.process.exec('echo nope >&2; exit 7')
      expect(failed.exitCode).toBe(7)
      expect(failed.stderr).toContain('nope')

      // Per-command env arrives natively, and env.set overlays it.
      await sbx.env.set({ BASE_VAR: 'base' })
      const env = await sbx.process.exec('echo "$BASE_VAR:$EXTRA_VAR"', {
        env: { EXTRA_VAR: 'extra' },
      })
      expect(env.stdout.trim()).toBe('base:extra')

      await sbx.fs.write('/workspace/nested/note.txt', 'inside e2b')
      expect(await sbx.fs.exists('/workspace/nested/note.txt')).toBe(true)
      expect(await sbx.fs.read('/workspace/nested/note.txt')).toBe('inside e2b')
      expect(await sbx.fs.lstat!('/workspace/nested/note.txt')).toMatchObject({
        type: 'file',
        size: 10,
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
      await sbx.fs.remove('/workspace/nested')
      expect(await sbx.fs.exists('/workspace/nested')).toBe(false)

      // Background process: separate streams, real pid, exit code.
      const split = await sbx.process.spawn('echo to-out; echo to-err >&2')
      expect(split.pid).toBeGreaterThan(0)
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

      // Preview channel is an https URL on the sandbox host.
      const channel = await sbx.ports.connect(3000)
      expect(channel.url).toMatch(/^https:\/\/3000-/)
    } finally {
      await sbx?.destroy()
    }
  }, 300_000)

  // MEASURES writableStdin: `cat` only exits if stdin really closes.
  it('feeds a spawned process over stdin and closes it', async () => {
    const provider = e2bSandbox({ apiKey, timeoutMs: 5 * 60_000 })
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
  it('kill() actually terminates the process inside the sandbox', async () => {
    const provider = e2bSandbox({ apiKey, timeoutMs: 5 * 60_000 })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      const proc = await sbx.process.spawn(
        'sleep 5 && touch /home/user/workspace/survived',
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

  // MEASURES the abort path: the SDK's own signal only detaches the client, so
  // the provider must kill the process itself.
  it('aborting exec kills the sandbox-side process', async () => {
    const provider = e2bSandbox({ apiKey, timeoutMs: 5 * 60_000 })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      const controller = new AbortController()
      const pending = sbx.process.exec(
        'sleep 5 && touch /home/user/workspace/survived-abort',
        { signal: controller.signal },
      )
      await new Promise((r) => setTimeout(r, 500))
      controller.abort()
      expect((await pending).exitCode).not.toBe(0)
      await new Promise((r) => setTimeout(r, 6000))
      expect(await sbx.fs.exists('/workspace/survived-abort')).toBe(false)
    } finally {
      await sbx?.destroy()
    }
  }, 300_000)

  it('snapshots a sandbox and restores it into a new one', async () => {
    const provider = e2bSandbox({ apiKey, timeoutMs: 5 * 60_000 })
    let source: SandboxHandle | undefined
    let restored: SandboxHandle | undefined
    try {
      source = await provider.create({})
      await source.fs.write('/workspace/keep.txt', 'survives snapshot')

      const ref = await source.snapshot?.('after-setup')
      expect(ref?.id).toBeTruthy()

      restored = await provider.restoreSnapshot!({ snapshotId: ref!.id })
      expect(restored.id).not.toBe(source.id)
      expect(await restored.fs.read('/workspace/keep.txt')).toBe(
        'survives snapshot',
      )
    } finally {
      await Promise.allSettled([source?.destroy(), restored?.destroy()])
    }
  }, 600_000)

  // MEASURES fork: the copy carries state and then diverges.
  it('fork branches a sandbox from current state', async () => {
    const provider = e2bSandbox({ apiKey, timeoutMs: 5 * 60_000 })
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
      await Promise.allSettled([src?.destroy(), forked?.destroy()])
    }
  }, 600_000)

  it('resume reconnects to a live sandbox and returns null once it is destroyed', async () => {
    const provider = e2bSandbox({ apiKey, timeoutMs: 5 * 60_000 })
    const sbx = await provider.create({})
    try {
      await sbx.fs.write('/workspace/state.txt', 'still here')
      const resumed = await provider.resume({ id: sbx.id })
      expect(resumed?.id).toBe(sbx.id)
      expect(await resumed!.fs.read('/workspace/state.txt')).toBe('still here')
    } finally {
      await sbx.destroy()
    }
    expect(await provider.resume({ id: sbx.id })).toBeNull()
    // Destroying an already-destroyed sandbox is not an error.
    await expect(provider.destroy({ id: sbx.id })).resolves.toBeUndefined()
  }, 300_000)

  // MEASURES networkPolicy: a deny policy must actually block egress.
  it('a deny network policy blocks outbound traffic', async () => {
    const provider = e2bSandbox({ apiKey, timeoutMs: 5 * 60_000 })
    const PROBE =
      'curl -s -m 10 -o /dev/null -w "%{http_code}" https://example.com'
    let denied: SandboxHandle | undefined
    let control: SandboxHandle | undefined
    try {
      const [deniedRes, controlRes] = await Promise.allSettled([
        provider.create({ policy: { capabilities: { network: 'deny' } } }),
        provider.create({}),
      ])
      if (deniedRes.status === 'fulfilled') denied = deniedRes.value
      if (controlRes.status === 'fulfilled') control = controlRes.value
      if (deniedRes.status === 'rejected') throw deniedRes.reason
      if (controlRes.status === 'rejected') throw controlRes.reason

      // POSITIVE CONTROL: without it the test passes whenever the probe fails
      // for an unrelated reason even though egress is wide open.
      const reachable = await control!.process.exec(PROBE)
      expect(reachable.stdout).toContain('200')

      expect((await denied!.process.exec('command -v curl')).exitCode).toBe(0)
      const blocked = await denied!.process.exec(PROBE)
      expect(blocked.exitCode).not.toBe(0)
      expect(blocked.stdout).not.toContain('200')
    } finally {
      await Promise.allSettled([denied?.destroy(), control?.destroy()])
    }
  }, 600_000)

  // MEASURES the traffic token: a port of a sandbox with public traffic
  // disabled answers only when the returned header is attached.
  it('gates preview URLs behind the traffic token when public traffic is off', async () => {
    const provider = e2bSandbox({
      apiKey,
      timeoutMs: 5 * 60_000,
      allowPublicTraffic: false,
    })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      const server = await sbx.process.spawn('python3 -m http.server 8000')
      await new Promise((r) => setTimeout(r, 2000))
      const channel = await sbx.ports.connect(8000)
      expect(channel.token).toBeTruthy()
      expect(channel.headers).toBeDefined()

      const anonymous = await fetch(channel.url)
      expect(anonymous.status).toBe(403)
      const authed = await fetch(channel.url, { headers: channel.headers })
      expect(authed.status).toBe(200)
      await server.kill()
    } finally {
      await sbx?.destroy()
    }
  }, 300_000)
})
