import { describe, expect, it } from 'vitest'
import Dockerode from 'dockerode'
import { defineSandbox, defineWorkspace } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '../src/index'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Auto-gate: only run when a Docker daemon is reachable.
let dockerAvailable = false
try {
  await new Dockerode().ping()
  dockerAvailable = true
} catch {
  // no daemon — these tests are skipped
}

const IMAGE = 'alpine:3'

describe.skipIf(!dockerAvailable)('docker provider (gated on a reachable daemon)', () => {
  it('creates a container, runs exec, fs round-trip, snapshot + destroy', async () => {
    const provider = dockerSandbox({ image: IMAGE })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})

      const echo = await sbx.process.exec('echo hello-docker')
      expect(echo.stdout.trim()).toBe('hello-docker')
      expect(echo.exitCode).toBe(0)

      await sbx.fs.write('/workspace/note.txt', 'inside the container')
      expect(await sbx.fs.exists('/workspace/note.txt')).toBe(true)
      expect(await sbx.fs.read('/workspace/note.txt')).toBe('inside the container')

      const bytes = new Uint8Array([0, 1, 2, 250])
      await sbx.fs.write('/workspace/bin', bytes)
      expect(Array.from(await sbx.fs.readBytes('/workspace/bin'))).toEqual([0, 1, 2, 250])

      const snap = await sbx.snapshot?.('test')
      expect(snap?.id).toMatch(/tanstack-ai-sandbox-snapshot/)
    } finally {
      await sbx?.destroy()
    }
  }, 120_000)

  it('resumes a running container by id and streams a spawned process', async () => {
    const provider = dockerSandbox({ image: IMAGE })
    let sbx: SandboxHandle | undefined
    try {
      sbx = await provider.create({})
      await sbx.fs.write('/workspace/keep.txt', 'persisted')

      const resumed = await provider.resume({ id: sbx.id })
      expect(resumed?.id).toBe(sbx.id)
      expect(await resumed!.fs.read('/workspace/keep.txt')).toBe('persisted')

      const proc = await resumed!.process.spawn('echo streamed-line')
      let out = ''
      for await (const chunk of proc.stdout) out += chunk
      expect(out).toContain('streamed-line')
      expect(await proc.wait()).toBe(0)
    } finally {
      await sbx?.destroy()
    }
  }, 120_000)

  it('ensure() bootstraps a workspace (setup command runs)', async () => {
    const provider = dockerSandbox({ image: IMAGE })
    const def = defineSandbox({
      id: 'docker-ensure',
      provider,
      workspace: defineWorkspace({
        source: { type: 'none' },
        setup: ['echo bootstrapped > /workspace/setup-marker'],
      }),
    })
    const ctx = { threadId: 'docker-t', runId: 'r1' }
    try {
      const sbx = await def.ensure(ctx)
      expect((await sbx.fs.read('/workspace/setup-marker')).trim()).toBe('bootstrapped')
    } finally {
      await def.destroy(ctx)
    }
  }, 120_000)
})
