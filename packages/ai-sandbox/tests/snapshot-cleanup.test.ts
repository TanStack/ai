/**
 * Native snapshot cleanup. A snapshot is referenced only by its instance
 * record's `latestSnapshotId`, so core deletes it (best effort, through the
 * optional `provider.deleteSnapshot`) when that id is replaced or the record is
 * dropped with its sandbox. A failed after-setup snapshot must not leak the
 * sandbox it was taken of.
 */
import { describe, expect, it } from 'vitest'
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

interface CleanupProvider extends FakeProvider {
  /** Every `deleteSnapshot` call, in order. */
  readonly deleted: Array<string>
  /** Every snapshot id a handle returned, in order. */
  readonly taken: Array<string>
  /** Handles `create` returned, so a test can check one was torn down. */
  readonly handles: Array<SandboxHandle & { destroyed: boolean }>
  /** When set, every later `snapshot()` rejects with it. */
  snapshotError: Error | undefined
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
    snapshotError?: Error
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
      if (provider.snapshotError) return Promise.reject(provider.snapshotError)
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
    snapshotError: options.snapshotError,
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

describe('after-setup snapshot failure', () => {
  it('continues the run and records the sandbox without a snapshot', async () => {
    const provider = cleanupProvider({
      snapshotError: new Error('Too many sandbox checkpoints in environment'),
    })
    const { def, ctx, logs } = setup(provider)

    const handle = await def.ensure(ctx)

    // Not leaked: the sandbox is alive AND reachable through its record.
    expect(provider.handles[0]?.destroyed).toBe(false)
    expect(provider.calls.destroy).toBe(0)
    const rec = await ctx.store.get(def.key(ctx))
    expect(rec?.providerSandboxId).toBe(handle.id)
    expect(rec?.latestSnapshotId).toBeUndefined()
    expect(logs).toContainEqual({
      level: 'warn',
      msg: expect.stringContaining('after-setup snapshot failed'),
    })

    // A later destroy can still find and tear it down.
    await def.destroy(ctx)
    expect(provider.calls.destroy).toBe(1)
    expect(provider.deleted).toEqual([])
  })

  it('tears down the sandbox and its snapshot when the record cannot be written', async () => {
    const provider = cleanupProvider()
    const { def, ctx } = setup(provider)
    ctx.store.upsert = () => Promise.reject(new Error('store down'))

    await expect(def.ensure(ctx)).rejects.toThrow('store down')

    expect(provider.handles[0]?.destroyed).toBe(true)
    expect(provider.deleted).toEqual(provider.taken)
    expect(provider.taken).toHaveLength(1)
  })
})

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
    // The second sandbox's snapshot fails: the record ends with no snapshot.
    provider.snapshotError = new Error('quota')

    await def.ensure({ ...ctx, runId: 'run-2' })

    expect(provider.deleted).toEqual(['snap-1'])
    expect(
      (await ctx.store.get(def.key(ctx)))?.latestSnapshotId,
    ).toBeUndefined()
  })

  it('does not delete a snapshot whose id the new snapshot reuses', async () => {
    // Providers such as boxd name snapshots deterministically, so the "new"
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
})
