/**
 * Native snapshot cleanup. A snapshot is referenced only by its instance
 * record's `latestSnapshotId`, so core deletes it (best effort, through the
 * optional `provider.deleteSnapshot`) when that id is replaced or the record is
 * dropped with its sandbox.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { provideSandboxRuntime } from '@tanstack/ai/adapter-internals'
import { defineSandbox } from '../src/sandbox'
import { withSandbox } from '../src/middleware'
import { reclaimSandbox } from '../src/reclaim'
import { InMemorySandboxInstanceStore } from '../src/instance-store'
import { captureLogger, makeFakeProvider, makeMiddlewareCtx } from './fakes'
import type { SandboxHandle } from '../src/contracts'
import type { SandboxLifecycle } from '../src/sandbox'
import type { FakeProvider } from './fakes'

afterEach(() => {
  vi.useRealTimers()
})

interface CleanupProvider extends FakeProvider {
  /** Every `deleteSnapshot` call, in order. */
  readonly deleted: Array<string>
  /** Every snapshot id a handle returned, in order. */
  readonly taken: Array<string>
  /** Handles `create` returned, so a test can check one was torn down. */
  readonly handles: Array<SandboxHandle & { destroyed: boolean }>
}

/**
 * The fake provider, with a `deleteSnapshot` that records its calls and
 * handles whose snapshot ids are unique across sandboxes. The stock fake
 * numbers snapshots per handle, so two sandboxes under one key would mint the
 * same id and look like a deterministic-name provider.
 */
function cleanupProvider(
  options: {
    deleteError?: Error
    withDelete?: boolean
  } = {},
): CleanupProvider {
  const base = makeFakeProvider()
  const deleted: Array<string> = []
  const taken: Array<string> = []
  const handles: Array<SandboxHandle & { destroyed: boolean }> = []
  let counter = 0
  const patch = <T extends SandboxHandle>(handle: T): T => {
    handle.snapshot = (label) => {
      const id = `snap-${++counter}`
      taken.push(id)
      return Promise.resolve({ id, label })
    }
    return handle
  }
  const create = base.create.bind(base)
  const resume = base.resume.bind(base)
  const provider: CleanupProvider = Object.assign(base, {
    deleted,
    taken,
    handles,
    create: async (input: Parameters<FakeProvider['create']>[0]) => {
      const handle = patch(
        (await create(input)) as SandboxHandle & { destroyed: boolean },
      )
      handles.push(handle)
      return handle
    },
    resume: async (input: Parameters<FakeProvider['resume']>[0]) => {
      const handle = await resume(input)
      return handle ? patch(handle) : null
    },
  })
  if (options.withDelete !== false)
    provider.deleteSnapshot = ({ snapshotId }) => {
      deleted.push(snapshotId)
      return options.deleteError
        ? Promise.reject(options.deleteError)
        : Promise.resolve()
    }
  return provider
}

function setup(
  provider: CleanupProvider,
  lifecycle: SandboxLifecycle = { reuse: 'thread' },
) {
  const def = defineSandbox({ id: 'repo', provider, lifecycle })
  const { logger, calls } = captureLogger()
  const ctx = {
    threadId: 'thread-1',
    runId: 'run-1',
    store: new InMemorySandboxInstanceStore(),
    locks: new InMemoryLockStore(),
    logger,
  }
  return { def, ctx, logs: calls }
}

/** Age the record past any `snapshotMaxAge` so the next ensure re-creates. */
async function expire(
  store: InMemorySandboxInstanceStore,
  key: string,
): Promise<void> {
  const rec = await store.get(key)
  if (rec) await store.upsert({ ...rec, updatedAt: 0 })
}

describe('snapshot cleanup on replace', () => {
  it('deletes the old snapshot when a re-create records a new one', async () => {
    const provider = cleanupProvider()
    const { def, ctx } = setup(provider, {
      reuse: 'thread',
      snapshotMaxAge: '1h',
    })

    await def.ensure(ctx)
    await expire(ctx.store, def.key(ctx))
    await def.ensure({ ...ctx, runId: 'run-2' })

    expect(provider.taken).toEqual(['snap-1', 'snap-2'])
    expect(provider.deleted).toEqual(['snap-1'])
    expect((await ctx.store.get(def.key(ctx)))?.latestSnapshotId).toBe('snap-2')
  })

  it('deletes the old snapshot when the re-create takes none', async () => {
    const provider = cleanupProvider()
    const { def, ctx } = setup(provider, {
      reuse: 'thread',
      snapshotMaxAge: '1h',
    })
    await def.ensure(ctx)
    await expire(ctx.store, def.key(ctx))
    // Same key, but the re-create takes no snapshot.
    const noSnapshot = defineSandbox({
      id: 'repo',
      provider,
      lifecycle: { reuse: 'thread', snapshot: 'none', snapshotMaxAge: '1h' },
    })

    await noSnapshot.ensure({ ...ctx, runId: 'run-2' })

    expect(provider.deleted).toEqual(['snap-1'])
    expect(
      (await ctx.store.get(def.key(ctx)))?.latestSnapshotId,
    ).toBeUndefined()
  })

  it('does not delete a snapshot whose id the new snapshot reuses', async () => {
    // Some providers name snapshots deterministically, so the "new"
    // id can equal the old one. Deleting it would delete the new snapshot.
    const provider = cleanupProvider()
    const { def, ctx } = setup(provider, {
      reuse: 'thread',
      snapshotMaxAge: '1h',
    })
    const create = provider.create
    provider.create = async (input) => {
      const handle = await create(input)
      handle.snapshot = (label) => Promise.resolve({ id: 'fixed', label })
      return handle
    }

    await def.ensure(ctx)
    await expire(ctx.store, def.key(ctx))
    await def.ensure({ ...ctx, runId: 'run-2' })

    expect(provider.calls.create).toBe(2)
    expect(provider.deleted).toEqual([])
  })

  it('does not fail ensure when the stale delete fails', async () => {
    const provider = cleanupProvider({ deleteError: new Error('api down') })
    const { def, ctx, logs } = setup(provider, {
      reuse: 'thread',
      snapshotMaxAge: '1h',
    })

    await def.ensure(ctx)
    await expire(ctx.store, def.key(ctx))
    await expect(def.ensure({ ...ctx, runId: 'run-2' })).resolves.toBeDefined()

    expect(provider.deleted).toEqual(['snap-1'])
    expect((await ctx.store.get(def.key(ctx)))?.latestSnapshotId).toBe('snap-2')
    expect(logs).toContainEqual({
      level: 'warn',
      msg: expect.stringContaining('snapshot delete failed'),
    })
  })

  it('deletes the previous after-run snapshot when a run records a new one', async () => {
    const provider = cleanupProvider()
    const def = defineSandbox({
      id: 'repo',
      provider,
      lifecycle: { reuse: 'thread', snapshot: 'after-run' },
      fileEvents: false,
    })
    const instances = new InMemorySandboxInstanceStore()
    const locks = new InMemoryLockStore()

    const run = async (runId: string) => {
      const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId })
      provideSandboxRuntime(ctx, {
        logger: captureLogger().logger,
        emit: () => undefined,
        emitFileDiff: () => undefined,
      })
      const mw = withSandbox(def, { instances, locks })
      await mw.setup!(ctx)
      await mw.onFinish!(ctx, {
        finishReason: 'stop',
        duration: 0,
        content: '',
      })
      return ctx
    }

    const ctx = await run('run-1')
    expect(provider.deleted).toEqual([])
    await run('run-2')

    expect(provider.taken).toEqual(['snap-1', 'snap-2'])
    expect(provider.deleted).toEqual(['snap-1'])
    expect(
      (await instances.get(def.key({ threadId: ctx.threadId, runId: 'x' })))
        ?.latestSnapshotId,
    ).toBe('snap-2')
  })

  it('does not let an overlapping ensure write back a deleted snapshot id', async () => {
    const provider = cleanupProvider()
    const def = defineSandbox({
      id: 'repo',
      provider,
      lifecycle: { reuse: 'thread', snapshot: 'after-run' },
      fileEvents: false,
    })
    const instances = new InMemorySandboxInstanceStore()
    const locks = new InMemoryLockStore()
    const mw = withSandbox(def, { instances, locks })
    const start = async (runId: string) => {
      const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId })
      provideSandboxRuntime(ctx, {
        logger: captureLogger().logger,
        emit: () => undefined,
        emitFileDiff: () => undefined,
      })
      await mw.setup!(ctx)
      return ctx
    }
    const finish = (ctx: Awaited<ReturnType<typeof start>>) =>
      mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' })

    await finish(await start('run-1'))
    const key = def.key({ threadId: 'thread-1', runId: 'x' })
    const run2 = await start('run-2')

    // Stand in for an ensure() that read the record (snap-1) under the lock
    // and writes it back while run-2 finishes.
    let finished: unknown
    await locks.withLock(`sandbox:${key}`, async () => {
      const stale = await instances.get(key)
      finished = finish(run2)
      await new Promise((resolve) => setTimeout(resolve, 10))
      await instances.upsert({ ...stale!, updatedAt: Date.now() })
    })
    await finished

    expect(provider.deleted).toEqual(['snap-1'])
    expect((await instances.get(key))?.latestSnapshotId).toBe('snap-2')
  })

  it('does not take the ensure lock for a provider without deleteSnapshot', async () => {
    const provider = cleanupProvider({ withDelete: false })
    const def = defineSandbox({
      id: 'repo',
      provider,
      lifecycle: { reuse: 'thread', snapshot: 'after-run' },
      fileEvents: false,
    })
    const instances = new InMemorySandboxInstanceStore()
    const locks = new InMemoryLockStore()
    const mw = withSandbox(def, { instances, locks })
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    provideSandboxRuntime(ctx, {
      logger: captureLogger().logger,
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })
    await mw.setup!(ctx)
    const key = def.key({ threadId: 'thread-1', runId: 'x' })

    // With the lock held elsewhere, onFinish still completes: unchanged
    // behavior for providers that never delete snapshots.
    await locks.withLock(`sandbox:${key}`, async () => {
      await mw.onFinish!(ctx, {
        finishReason: 'stop',
        duration: 0,
        content: '',
      })
    })

    expect((await instances.get(key))?.latestSnapshotId).toBe('snap-1')
  })
})

describe('snapshot cleanup on destroy', () => {
  it('deletes the recorded snapshot after destroying the sandbox', async () => {
    const provider = cleanupProvider()
    const { def, ctx } = setup(provider)

    await def.ensure(ctx)
    await def.destroy(ctx)

    expect(provider.calls.destroy).toBe(1)
    expect(provider.deleted).toEqual(['snap-1'])
    expect(await ctx.store.get(def.key(ctx))).toBeNull()
  })

  it('waits for the ensure lock when the provider deletes snapshots', async () => {
    const provider = cleanupProvider()
    const { def, ctx } = setup(provider)
    await def.ensure(ctx)

    // Stand in for an overlapping ensure() holding the key lock.
    let release: () => void = () => undefined
    const held = ctx.locks.withLock(
      `sandbox:${def.key(ctx)}`,
      () => new Promise<void>((resolve) => (release = resolve)),
    )
    const destroyed = def.destroy(ctx)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(provider.calls.destroy).toBe(0)

    release()
    await held
    await destroyed
    expect(provider.calls.destroy).toBe(1)
    expect(provider.deleted).toEqual(['snap-1'])
  })

  it('does not take the ensure lock for a provider without deleteSnapshot', async () => {
    const provider = cleanupProvider({ withDelete: false })
    const { def, ctx } = setup(provider)
    await def.ensure(ctx)

    await ctx.locks.withLock(`sandbox:${def.key(ctx)}`, () => def.destroy(ctx))

    expect(provider.calls.destroy).toBe(1)
    expect(await ctx.store.get(def.key(ctx))).toBeNull()
  })

  it('swallows a failed delete and still removes the record', async () => {
    const provider = cleanupProvider({ deleteError: new Error('api down') })
    const { def, ctx, logs } = setup(provider)

    await def.ensure(ctx)
    await expect(def.destroy(ctx)).resolves.toBeUndefined()

    expect(provider.deleted).toEqual(['snap-1'])
    expect(await ctx.store.get(def.key(ctx))).toBeNull()
    expect(logs).toContainEqual({
      level: 'warn',
      msg: expect.stringContaining('snapshot delete failed'),
    })
  })

  it('gives up on a delete that ignores its signal', async () => {
    vi.useFakeTimers()
    const provider = cleanupProvider()
    const { def, ctx, logs } = setup(provider)
    await def.ensure(ctx)
    provider.deleteSnapshot = () => new Promise<void>(() => undefined)

    const destroyed = def.destroy(ctx)
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(destroyed).resolves.toBeUndefined()
    expect(await ctx.store.get(def.key(ctx))).toBeNull()
    expect(logs).toContainEqual({
      level: 'warn',
      msg: expect.stringContaining('snapshot delete failed'),
    })
  })

  it('keeps the snapshot when the provider destroy fails', async () => {
    // The record survives a failed destroy for a retry, and it still points at
    // the snapshot, so the snapshot must survive too.
    const provider = cleanupProvider()
    const { def, ctx } = setup(provider)
    await def.ensure(ctx)
    provider.destroy = () => Promise.reject(new Error('destroy failed'))

    await expect(def.destroy(ctx)).rejects.toThrow('destroy failed')

    expect(provider.deleted).toEqual([])
    expect((await ctx.store.get(def.key(ctx)))?.latestSnapshotId).toBe('snap-1')
  })

  it('is a no-op for a provider without deleteSnapshot', async () => {
    const provider = cleanupProvider({ withDelete: false })
    const { def, ctx } = setup(provider)

    await def.ensure(ctx)
    await expect(def.destroy(ctx)).resolves.toBeUndefined()

    expect(provider.calls.destroy).toBe(1)
    expect(await ctx.store.get(def.key(ctx))).toBeNull()
  })

  it('reclaimSandbox deletes the snapshot of a reaped run, best effort', async () => {
    const provider = cleanupProvider({ deleteError: new Error('api down') })
    const instances = new InMemorySandboxInstanceStore()
    await instances.upsert({
      key: 'k1',
      provider: 'fake',
      providerSandboxId: 'sbx-1',
      latestSnapshotId: 'snap-old',
      threadId: 't1',
      updatedAt: 1,
    })

    const outcome = await reclaimSandbox(
      {
        runId: 'r1',
        threadId: 't1',
        status: 'completed',
        startedAt: 1,
        finishedAt: 2,
        sandboxKey: 'k1',
      },
      { provider, instances },
    )

    expect(outcome).toBe('destroyed')
    expect(provider.deleted).toEqual(['snap-old'])
    expect(await instances.get('k1')).toBeNull()
  })

  it('reclaimSandbox waits for the ensure lock it is given', async () => {
    const provider = cleanupProvider()
    const instances = new InMemorySandboxInstanceStore()
    const locks = new InMemoryLockStore()
    await instances.upsert({
      key: 'k1',
      provider: 'fake',
      providerSandboxId: 'sbx-1',
      latestSnapshotId: 'snap-old',
      threadId: 't1',
      updatedAt: 1,
    })

    let release: () => void = () => undefined
    const held = locks.withLock(
      'sandbox:k1',
      () => new Promise<void>((resolve) => (release = resolve)),
    )
    const reclaimed = reclaimSandbox(
      {
        runId: 'r1',
        threadId: 't1',
        status: 'completed',
        startedAt: 1,
        finishedAt: 2,
        sandboxKey: 'k1',
      },
      { provider, instances, locks },
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(provider.calls.destroy).toBe(0)

    release()
    await held
    expect(await reclaimed).toBe('destroyed')
    expect(provider.deleted).toEqual(['snap-old'])
  })
})
