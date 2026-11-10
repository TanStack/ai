import { randomUUID } from 'node:crypto'
import { Sandbox } from '@tangle-network/sandbox'
import { describe, expect, it } from 'vitest'
import { tangleSandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when a Tangle API key is present (these tests create
// real cloud sandboxes).
const apiKey = process.env.TANGLE_API_KEY

describe.skipIf(!apiKey)('tangle provider (gated on TANGLE_API_KEY)', () => {
  it('creates a sandbox, runs exec, fs round-trip + destroy', async () => {
    const provider = tangleSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({ id: 'live-test' })

      const echo = await sbx.process.exec('echo hello-tangle; pwd')
      expect(echo.stdout).toContain('hello-tangle')
      expect(echo.stdout).toContain('/home/agent/workspace')
      expect(echo.exitCode).toBe(0)

      // Non-zero exit is a result with stderr intact, not an exception.
      const failed = await sbx.process.exec('echo nope >&2; exit 7')
      expect(failed.exitCode).toBe(7)
      expect(failed.stderr).toContain('nope')
      expect(failed.stdout).not.toContain('nope')

      // A cwd outside the user's home works too; a relative one resolves
      // against the workdir, and a missing one fails the command.
      const tmp = await sbx.process.exec('pwd', { cwd: '/tmp' })
      expect(tmp.stdout.trim()).toBe('/tmp')
      await sbx.fs.mkdir('/workspace/sub')
      const rel = await sbx.process.exec('pwd', { cwd: 'sub' })
      expect(rel.stdout.trim()).toBe('/home/agent/workspace/sub')
      const missing = await sbx.process.exec('echo ran', {
        cwd: '/nonexistent',
      })
      expect(missing.exitCode).not.toBe(0)
      expect(missing.stdout).not.toContain('ran')

      // Per-command env arrives, and env.set overlays it.
      await sbx.env.set({ BASE_VAR: 'base' })
      const env = await sbx.process.exec('echo "$BASE_VAR:$EXTRA_VAR"', {
        env: { EXTRA_VAR: 'extra' },
      })
      expect(env.stdout.trim()).toBe('base:extra')

      await sbx.fs.write('/workspace/nested/note.txt', 'inside tangle')
      expect(await sbx.fs.exists('/workspace/nested/note.txt')).toBe(true)
      expect(await sbx.fs.read('/workspace/nested/note.txt')).toBe(
        'inside tangle',
      )
      expect(await sbx.fs.lstat!('/workspace/nested/note.txt')).toMatchObject({
        type: 'file',
        size: 13,
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
      const split = await sbx.process.spawn(
        'echo to-out; echo to-err >&2; exit 3',
      )
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
      expect(await split.wait()).toBe(3)
      expect(sOut).toContain('to-out')
      expect(sOut).not.toContain('to-err')
      expect(sErr).toContain('to-err')
      await expect(split.stdin.write('x')).rejects.toThrow(/not writable/)
    } finally {
      await sbx?.destroy()
    }
  }, 300_000)

  // MEASURES ports: the preview URL reaches a server in the sandbox.
  it('exposes a port as a public preview URL', async () => {
    const provider = tangleSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      await sbx.fs.write('/workspace/index.html', 'served-from-tangle')
      const server = await sbx.process.spawn('python3 -m http.server 8000')
      const channel = await sbx.ports.connect(8000)
      expect(channel.url).toMatch(/^https:\/\//)
      let body = ''
      for (let i = 0; i < 30 && !body.includes('served-from-tangle'); i++) {
        await new Promise((r) => setTimeout(r, 2000))
        body = await fetch(channel.url)
          .then((r) => r.text())
          .catch(() => '')
      }
      expect(body).toContain('served-from-tangle')
      await server.kill()
    } finally {
      await sbx?.destroy()
    }
  }, 300_000)

  // MEASURES killableProcesses: the marker file proves the process died
  // server-side rather than the client merely detaching from it.
  it('kill() actually terminates the process tree inside the sandbox', async () => {
    const provider = tangleSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      const proc = await sbx.process.spawn(
        '(sleep 5 && touch /home/agent/workspace/survived) & wait',
      )
      expect(proc.pid).toBeGreaterThan(0)
      await new Promise((r) => setTimeout(r, 500))
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

  // MEASURES the abort path: the process must die, not only the request.
  it('aborting exec kills the sandbox-side process', async () => {
    const provider = tangleSandbox({ apiKey })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      const controller = new AbortController()
      const pending = sbx.process.exec(
        'sleep 5 && touch /home/agent/workspace/survived-abort',
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

  // `ensure()` restores only after `resume` found the source gone, so the
  // source is destroyed first.
  it('restores a snapshot into a new sandbox after its source is destroyed', async () => {
    const provider = tangleSandbox({ apiKey })
    let source: SandboxHandle | undefined
    let restored: SandboxHandle | undefined
    try {
      source = await provider.create({})
      await source.fs.write('/workspace/keep.txt', 'survives snapshot')

      const ref = await source.snapshot?.('after-setup')
      expect(ref?.id).toBeTruthy()
      expect(ref?.label).toBe('after-setup')
      await source.destroy()
      expect(await provider.resume({ id: source.id })).toBeNull()

      restored = await provider.restoreSnapshot!({ snapshotId: ref!.id })
      expect(restored.id).not.toBe(source.id)
      expect(await restored.fs.read('/workspace/keep.txt')).toBe(
        'survives snapshot',
      )
    } finally {
      await Promise.allSettled([source?.destroy(), restored?.destroy()])
    }
  }, 600_000)

  // MEASURES fork: the copy carries state and then diverges, and a parent
  // cannot be destroyed while its fork exists.
  it('fork branches a sandbox from current state', async () => {
    const provider = tangleSandbox({ apiKey })
    let src: SandboxHandle | undefined
    let forked: SandboxHandle | undefined
    let parentAlone: unknown
    let destroyed: Array<PromiseSettledResult<void>> = []
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
      parentAlone = await src.destroy().then(
        () => 'destroyed',
        (error: unknown) => error,
      )
    } finally {
      // The fork first, then the parent.
      destroyed = await Promise.allSettled([forked?.destroy()])
      destroyed.push(...(await Promise.allSettled([src?.destroy()])))
    }
    expect(parentAlone).toBeInstanceOf(Error)
    expect((parentAlone as Error).message).toContain('has a live fork')
    expect(((parentAlone as Error).cause as { code?: string }).code).toBe(
      'CHILDREN_EXIST',
    )
    expect(destroyed.filter((r) => r.status === 'rejected')).toEqual([])
    expect(await provider.resume({ id: src!.id })).toBeNull()
    expect(await provider.resume({ id: forked!.id })).toBeNull()
  }, 600_000)

  it('resume reconnects to a live sandbox and returns null once it is destroyed', async () => {
    const provider = tangleSandbox({ apiKey })
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
    const provider = tangleSandbox({ apiKey })
    const PROBE =
      'curl -s -m 10 -o /dev/null -w "%{http_code}" https://example.com'
    let denied: SandboxHandle | undefined
    let control: SandboxHandle | undefined
    let forked: SandboxHandle | undefined
    let destroyed: Array<PromiseSettledResult<void>> = []
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
      expect(blocked.stdout).not.toContain('200')

      // A fork keeps the blocked egress of its parent.
      forked = await denied!.fork!()
      expect((await forked.process.exec(PROBE)).stdout).not.toContain('200')
    } finally {
      // Parent and fork at once: the parent's delete waits out the fork.
      destroyed = await Promise.allSettled([
        denied?.destroy(),
        control?.destroy(),
        forked?.destroy(),
      ])
    }
    expect(destroyed.filter((r) => r.status === 'rejected')).toEqual([])
  }, 600_000)

  // MEASURES the create-abort path: a sandbox the platform accepted after the
  // caller gave up is deleted, not left running. The SDK create takes no
  // signal, so the platform always receives the request.
  it('aborting create leaves no running sandbox behind', async () => {
    const run = `tanstack-ai-abort-${randomUUID()}`
    const provider = tangleSandbox({ apiKey, metadata: { run } })
    const client = new Sandbox({
      apiKey: apiKey!,
      baseUrl: 'https://sandbox.tangle.tools',
    })
    const controller = new AbortController()
    const pending = provider.create({ signal: controller.signal })
    setTimeout(() => controller.abort(), 200)
    let generations: Awaited<ReturnType<typeof client.runGenerations>> = []
    try {
      await expect(pending).rejects.toThrow()
      // Wait until the platform lists the sandbox, then until it is closed.
      for (let i = 0; i < 60; i++) {
        generations = await client.runGenerations(run)
        if (generations.length > 0 && generations.every((g) => g.closedAt)) {
          break
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      expect(generations.length).toBeGreaterThan(0)
      expect(generations.filter((g) => !g.closedAt)).toEqual([])
      // Closed could also mean stopped: the sandbox must be gone.
      for (const g of generations) {
        const sandbox = await client.get(g.sandboxId)
        expect(sandbox === null || sandbox.status === 'deleted').toBe(true)
      }
    } finally {
      // A create that beat the abort leaves an open sandbox to delete.
      if (generations.length === 0) {
        generations = await client.runGenerations(run).catch(() => [])
      }
      for (const g of generations.filter((x) => !x.closedAt)) {
        await client.delete(g.sandboxId).catch(() => undefined)
      }
    }
  }, 300_000)
})
