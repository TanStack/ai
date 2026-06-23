import { describe, expect, it } from 'vitest'
import { defineSandbox } from '../src/sandbox'
import { defineWorkspace, githubRepo } from '../src/workspace'
import { InMemoryLockStore, InMemorySandboxStore } from '../src/store'
import { FULL_CAPS, makeFakeProvider } from './fakes'
import type { SandboxCapabilities } from '../src/contracts'

const baseCtx = () => ({
  threadId: 'thread-1',
  runId: 'run-1',
  store: new InMemorySandboxStore(),
  locks: new InMemoryLockStore(),
})

const workspace = defineWorkspace({
  source: githubRepo({ repo: 'TanStack/ai' }),
  setup: ['corepack enable', 'pnpm install'],
})

describe('ensureSandbox algorithm', () => {
  it('creates + bootstraps + records on first run', async () => {
    const provider = makeFakeProvider()
    const def = defineSandbox({ id: 'repo', provider, workspace })
    const ctx = baseCtx()

    const handle = await def.ensure(ctx)

    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(0)
    // bootstrap cloned the repo + can run setup (fake handle tracks files)
    const files = (handle as unknown as { files: Map<string, string> }).files
    expect(files.has('/workspace/.git')).toBe(true)
    // recorded in the store under the compound key
    const rec = await ctx.store.get(def.key(ctx))
    expect(rec?.providerSandboxId).toBe(handle.id)
    expect(rec?.threadId).toBe('thread-1')
  })

  it('resumes the same provider sandbox on a second run (reuse: thread)', async () => {
    const provider = makeFakeProvider()
    const def = defineSandbox({ id: 'repo', provider, workspace })
    const ctx = baseCtx()

    const first = await def.ensure(ctx)
    const second = await def.ensure({ ...ctx, runId: 'run-2' })

    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(1)
    expect(second.id).toBe(first.id)
    // latestRunId advanced
    const rec = await ctx.store.get(def.key(ctx))
    expect(rec?.latestRunId).toBe('run-2')
  })

  it('falls back to snapshot restore when resume returns null', async () => {
    const provider = makeFakeProvider({ resumeReturnsNull: true })
    const def = defineSandbox({
      id: 'repo',
      provider,
      workspace,
      lifecycle: { reuse: 'thread', snapshot: 'after-setup' },
    })
    const ctx = baseCtx()

    await def.ensure(ctx) // create + after-setup snapshot recorded
    const restored = await def.ensure({ ...ctx, runId: 'run-2' })

    expect(provider.calls.resume).toBe(1)
    expect(provider.calls.restoreSnapshot).toBe(1)
    expect(restored.id).toContain('restored')
  })

  it('re-creates under the same identity when provider lacks durable fs + snapshots', async () => {
    const ephemeralCaps: SandboxCapabilities = {
      ...FULL_CAPS,
      snapshots: false,
      durableFilesystem: false,
    }
    const provider = makeFakeProvider({
      resumeReturnsNull: true,
      caps: ephemeralCaps,
    })
    const def = defineSandbox({
      id: 'repo',
      provider,
      workspace,
      lifecycle: { reuse: 'thread', snapshot: 'after-setup' },
    })
    const ctx = baseCtx()

    await def.ensure(ctx)
    await def.ensure({ ...ctx, runId: 'run-2' })

    // resume tried + failed, no snapshot path, so a fresh create both times
    expect(provider.calls.create).toBe(2)
    expect(provider.calls.restoreSnapshot).toBe(0)
  })

  it('reuse: none keys each run separately (no resume)', async () => {
    const provider = makeFakeProvider()
    const def = defineSandbox({
      id: 'repo',
      provider,
      workspace,
      lifecycle: { reuse: 'none' },
    })
    const ctx = baseCtx()

    await def.ensure(ctx)
    await def.ensure({ ...ctx, runId: 'run-2' })

    expect(provider.calls.create).toBe(2)
    expect(provider.calls.resume).toBe(0)
  })

  it('destroy removes the record and destroys the provider sandbox', async () => {
    const provider = makeFakeProvider()
    const def = defineSandbox({ id: 'repo', provider, workspace })
    const ctx = baseCtx()

    await def.ensure(ctx)
    await def.destroy(ctx)

    expect(provider.calls.destroy).toBe(1)
    expect(await ctx.store.get(def.key(ctx))).toBeNull()
  })

  it('serializes concurrent ensures for the same key (one create)', async () => {
    const provider = makeFakeProvider()
    const def = defineSandbox({ id: 'repo', provider, workspace })
    const ctx = baseCtx()

    const [a, b] = await Promise.all([
      def.ensure(ctx),
      def.ensure({ ...ctx, runId: 'run-2' }),
    ])

    // The lock forces serialization: the second sees the first's record and resumes.
    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(1)
    expect(a.id).toBe(b.id)
  })

  it('defaults to snapshot after-setup when provider supports snapshots and no lifecycle.snapshot set', async () => {
    // caps.snapshots = true, no explicit lifecycle.snapshot → effectiveSnapshot should be 'after-setup'
    const provider = makeFakeProvider() // FULL_CAPS has snapshots: true
    const def = defineSandbox({ id: 'repo', provider, workspace })
    const ctx = baseCtx()

    await def.ensure(ctx)

    // Verify snapshot was called with 'after-setup' by checking the store record:
    // the fake handle populates latestSnapshotId only when snapshot() is invoked.
    const rec = await ctx.store.get(def.key(ctx))
    expect(rec?.latestSnapshotId).toMatch(/^snap-/)
  })

  it('re-creates instead of resuming when snapshotMaxAge has elapsed', async () => {
    const provider = makeFakeProvider()
    const def = defineSandbox({
      id: 'repo',
      provider,
      workspace,
      lifecycle: { reuse: 'thread', snapshotMaxAge: '1h' },
    })
    const ctx = baseCtx()

    // First ensure: creates the sandbox and records it.
    await def.ensure(ctx)
    expect(provider.calls.create).toBe(1)

    // Backdate the stored record so it appears older than 1 hour.
    const key = def.key(ctx)
    const rec = await ctx.store.get(key)
    if (rec) {
      await ctx.store.upsert({
        ...rec,
        updatedAt: Date.now() - 2 * 60 * 60 * 1000,
      })
    }

    // Second ensure: record exists but is too old → must re-create, not resume.
    await def.ensure({ ...ctx, runId: 'run-2' })
    expect(provider.calls.create).toBe(2)
    expect(provider.calls.resume).toBe(0)
  })
})
