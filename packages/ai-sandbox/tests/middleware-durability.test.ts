/**
 * `withSandbox`'s detach-vs-destroy gating, in BOTH directions.
 *
 * The behavior under test is the one observable change of the durability work:
 * a client disconnect on a run whose `withSandbox` was given both `runs` and
 * `durability` no longer destroys the sandbox — it records `detachedSince` and
 * `sandboxKey` and returns. Every other configuration keeps today's
 * always-destroy behavior, which is what makes this change invisible to every
 * app that has not opted in.
 *
 * Every test drives the REAL middleware object returned by `withSandbox` (its
 * `setup` and `onAbort` are called directly), never a re-implementation of the
 * hook bodies, so the assertions pin production code rather than a sketch of it.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  DetachableRunCapability,
  InMemoryRunStore,
  RunDetachedCapability,
  memoryStream,
} from '@tanstack/ai'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import {
  providePendingTurn,
  provideRunDisconnect,
  provideSandboxRuntime,
} from '@tanstack/ai/adapter-internals'
import { defineSandbox } from '../src/sandbox'
import { withSandbox } from '../src/middleware'
import { SandboxDurabilityCapability } from '../src/durability'
import { InMemorySandboxInstanceStore } from '../src/instance-store'
import {
  FULL_CAPS,
  captureLogger,
  makeFakeHandle,
  makeMiddlewareCtx,
} from './fakes'
import type { LockStore } from '@tanstack/ai/locks'
import type { AbortInfo, ChatMiddlewareContext } from '@tanstack/ai'
import type { SandboxHandle, SandboxProvider } from '../src/contracts'
import type { SandboxDurabilityOptions } from '../src/durability'

interface Harness {
  /** `provider.destroy` call count — what `definition.destroy` bottoms out in. */
  destroys: () => number
  /** `hooks.onDestroy` call count. */
  onDestroys: () => number
  /** `watcher.stop()` call count, for the drain-ordering guard. */
  watcherStops: () => number
  runs: InMemoryRunStore
  ctx: ChatMiddlewareContext
  logged: Array<{ level: string; msg: string }>
  abort: (info?: Partial<AbortInfo>) => Promise<void>
  /**
   * Fire the disconnect core would deliver when the delivery socket closes, by
   * invoking whatever `setup` subscribed through `RunDisconnectCapability`. Drives
   * the real subscription rather than calling a hook directly, so a `setup` that
   * forgot to subscribe fails these tests.
   */
  disconnect: () => Promise<void>
}

/**
 * A handle whose `fs.watch` is present (so `watchWorkspace` takes the native
 * path instead of starting a poll timer) and whose subscription records its
 * `stop()` calls, so a test can prove the watcher was drained.
 */
function makeWatchableHandle(): {
  handle: SandboxHandle
  stops: () => number
} {
  const handle = makeFakeHandle('sbx', 'fake', FULL_CAPS)
  let stops = 0
  handle.fs.watch = () =>
    Promise.resolve({
      stop: () => {
        stops += 1
        return Promise.resolve()
      },
    })
  return { handle, stops: () => stops }
}

interface HarnessOptions {
  /**
   * Wire this `RunStore` into `withSandbox`. OMITTED means the option is not
   * passed at all — which is the shape of every app that exists today, and the
   * half-configured case when `durability` is passed without it.
   */
  runs?: InMemoryRunStore
  runId?: string
  threadId?: string
  locks?: LockStore
}

/**
 * Build a `withSandbox` around a fake provider, run the real `setup`, and expose
 * an `abort()` that invokes the real `onAbort`.
 *
 * Each harness gets its OWN `InMemorySandboxInstanceStore`: `defineSandbox`'s
 * `ensure`/`destroy` otherwise fall back to a module-level process-lifetime
 * store, and one test's record would then be visible to the next.
 */
async function harness(
  durability?: SandboxDurabilityOptions,
  opts: HarnessOptions = {},
): Promise<Harness> {
  const runId = opts.runId ?? 'r1'
  const { handle, stops } = makeWatchableHandle()

  let destroys = 0
  let onDestroys = 0
  const provider: SandboxProvider = {
    name: 'fake',
    capabilities: () => FULL_CAPS,
    create: () => Promise.resolve(handle),
    resume: () => Promise.resolve(handle),
    destroy: () => {
      destroys += 1
      return Promise.resolve()
    },
  }

  const sandbox = defineSandbox({
    id: 's',
    provider,
    // Snapshots off: `after-setup` is the capability-derived default for a
    // snapshot-capable provider and is irrelevant to abort gating.
    lifecycle: { snapshot: 'none' },
    hooks: {
      onDestroy: () => {
        onDestroys += 1
      },
    },
  })

  const ctx = makeMiddlewareCtx({ threadId: opts.threadId ?? 't1', runId })
  const { logger, calls } = captureLogger()
  provideSandboxRuntime(ctx, {
    logger,
    emit: () => undefined,
    emitFileDiff: () => undefined,
  })
  const disconnectListeners: Array<() => void | Promise<void>> = []
  provideRunDisconnect(ctx, {
    subscribe: (listener) => disconnectListeners.push(listener),
  })

  const mw = withSandbox(sandbox, {
    instances: new InMemorySandboxInstanceStore(),
    ...(opts.locks !== undefined ? { locks: opts.locks } : {}),
    ...(opts.runs !== undefined ? { runs: opts.runs } : {}),
    ...(durability !== undefined ? { durability } : {}),
  })
  await mw.setup!(ctx)

  return {
    destroys: () => destroys,
    onDestroys: () => onDestroys,
    watcherStops: stops,
    runs: opts.runs ?? new InMemoryRunStore(),
    ctx,
    logged: calls,
    abort: (info?: Partial<AbortInfo>) =>
      Promise.resolve(mw.onAbort!(ctx, { reason: 'x', duration: 0, ...info })),
    disconnect: async () => {
      for (const listener of disconnectListeners) await listener()
    },
  }
}

const adapterFor = (runId: string) =>
  memoryStream(new Request(`https://x/run?runId=${runId}`))

async function seededRuns(runId = 'r1'): Promise<InMemoryRunStore> {
  const runs = new InMemoryRunStore()
  await runs.createOrResume({ runId, threadId: 't1', startedAt: 1 })
  return runs
}

describe('withSandbox — detach vs destroy', () => {
  it("destroys on abort when NO durability is wired (today's behavior)", async () => {
    const h = await harness()
    await h.abort()
    expect(h.destroys()).toBe(1)
    expect(h.onDestroys()).toBe(1)
  })

  it('destroys on abort when only `runs` is wired, with no event log', async () => {
    // Half-configured is not durable: a record with no log cannot be replayed,
    // so keeping the sandbox alive would be pure waste.
    const runs = await seededRuns()
    const h = await harness(undefined, { runs })
    await h.abort()
    expect(h.destroys()).toBe(1)
    expect((await runs.get('r1'))?.detachedSince).toBeUndefined()
  })

  it('destroys on abort when only `durability` is wired, with no run store', async () => {
    // The mirror image: a log with no record cannot be found, claimed or reaped.
    const h = await harness({ adapter: adapterFor('r1') })
    expect(h.ctx.getOptional(SandboxDurabilityCapability)).toBeUndefined()
    await h.abort()
    expect(h.destroys()).toBe(1)
  })

  it('DETACHES on a plain disconnect when both are wired', async () => {
    const runs = await seededRuns()
    const h = await harness({ adapter: adapterFor('r1') }, { runs })

    await h.abort({ cancelRequested: false })

    expect(h.destroys()).toBe(0)
    expect(h.onDestroys()).toBe(0)
    const record = await runs.get('r1')
    // Assert what the detach WRITES, not merely that destroy was skipped: an
    // `onAbort` that returned early and recorded nothing would pass a
    // destroy-only assertion while silently losing the run.
    expect(record?.status).toBe('running')
    expect(record?.finishedAt).toBeUndefined()
    expect(typeof record?.detachedSince).toBe('number')
    expect(typeof record?.sandboxKey).toBe('string')
    expect(record?.sandboxKey?.length).toBeGreaterThan(0)
  })

  it('DESTROYS when the abort carries cancelRequested from the reason', async () => {
    const runs = await seededRuns()
    const h = await harness({ adapter: adapterFor('r1') }, { runs })

    await h.abort({ cancelRequested: true })

    expect(h.destroys()).toBe(1)
    expect(h.onDestroys()).toBe(1)
    expect((await runs.get('r1'))?.detachedSince).toBeUndefined()
  })

  it('DESTROYS when cancelRequested was recorded on the RECORD by another host', async () => {
    // The out-of-band channel. `info.cancelRequested` is false here because the
    // cancel never reached this process.
    const runs = await seededRuns()
    await runs.update('r1', { cancelRequested: true })
    const h = await harness({ adapter: adapterFor('r1') }, { runs })

    await h.abort({ cancelRequested: false })

    expect(h.destroys()).toBe(1)
    expect((await runs.get('r1'))?.detachedSince).toBeUndefined()
  })

  it('DESTROYS when detachOnDisconnect is false, keeping the old cost profile', async () => {
    const runs = await seededRuns()
    const h = await harness(
      { adapter: adapterFor('r1'), detachOnDisconnect: false },
      { runs },
    )
    await h.abort()
    expect(h.destroys()).toBe(1)
    expect((await runs.get('r1'))?.detachedSince).toBeUndefined()
  })

  it('still drains the watcher before either outcome', async () => {
    // Regression guard: the drain must not be skipped on the new detach path, or
    // a pending file diff is dropped. Returning early before `drainWatcher`
    // leaves the watcher subscription's `stop()` uncalled, which this catches on
    // the detach path AND on the destroy path.
    const runs = await seededRuns()
    const detaching = await harness({ adapter: adapterFor('r1') }, { runs })
    await detaching.abort()
    expect(detaching.destroys()).toBe(0)
    expect(detaching.watcherStops()).toBe(1)

    const destroying = await harness()
    await destroying.abort()
    expect(destroying.destroys()).toBe(1)
    expect(destroying.watcherStops()).toBe(1)
  })

  it('detaching a run whose record has VANISHED does not throw', async () => {
    // `update` on an unknown runId is a documented no-op. The abort path must not
    // turn a vanished record into a thrown teardown.
    //
    // The record has to be removed explicitly now: `setup` pre-creates one for
    // every durable run, so "never existed" is no longer reachable through the
    // middleware — which is the point of the pre-create. What remains worth pinning
    // is the store losing it afterwards (a wipe, a TTL, a different replica).
    const runs = new InMemoryRunStore()
    const h = await harness(
      { adapter: adapterFor('gone') },
      { runs, runId: 'gone' },
    )
    vi.spyOn(runs, 'get').mockResolvedValue(null)
    vi.spyOn(runs, 'update').mockResolvedValue(undefined)

    await expect(h.abort()).resolves.toBeUndefined()
    expect(h.destroys()).toBe(0)
  })

  it('falls through to DESTROY when the detach record write fails', async () => {
    // The record write was the ONLY unguarded await on the abort path. A
    // rejecting `update` made `onAbort` reject, and then: `provideRunDetached`
    // never ran, so core terminalized the log with a synthetic `RUN_ERROR` and
    // recorded a healthy detached run as failed — exactly what this branch
    // exists to prevent; `detachedSince`/`sandboxKey` were never written, so
    // `listReclaimable` could never surface the run and `reapDetachedRuns` could
    // never reclaim it; and `definition.destroy` was not reached either. The
    // sandbox ran forever with no recovery path.
    //
    // A destroyed sandbox beats an unreachable one, which is the same reasoning
    // `drainWatcher` already applies to its own guarded `stop()`: a rejection
    // there would leak the sandbox "on exactly the abort path that must ALWAYS
    // tear down".
    const runs = await seededRuns()
    const h = await harness({ adapter: adapterFor('r1') }, { runs })
    // Spied AFTER setup, so only the abort-path write fails.
    vi.spyOn(runs, 'update').mockRejectedValue(new Error('run store down'))

    await expect(h.abort({ cancelRequested: false })).resolves.toBeUndefined()

    expect(h.destroys()).toBe(1)
    expect(h.onDestroys()).toBe(1)
    // The detach VERDICT must not be published for a detach that did not happen:
    // core would leave the log open for a takeover that can never be found.
    expect(h.ctx.getOptional(RunDetachedCapability)).toBeUndefined()
    expect(
      h.logged.some(
        (c) => c.level === 'warn' && c.msg.includes('detach record write'),
      ),
    ).toBe(true)
  })

  it('publishes the durability capability only when the run is durable', async () => {
    const runs = await seededRuns()
    const withBoth = await harness({ adapter: adapterFor('r1') }, { runs })
    expect(withBoth.ctx.getOptional(SandboxDurabilityCapability)).toMatchObject(
      {
        journalDir: '/tmp/tanstack-runs',
        attach: false,
        detachOnDisconnect: true,
      },
    )
    expect(withBoth.ctx.getOptional(DetachableRunCapability)).toBe(true)

    const withNeither = await harness()
    expect(
      withNeither.ctx.getOptional(SandboxDurabilityCapability),
    ).toBeUndefined()
    expect(withNeither.ctx.getOptional(DetachableRunCapability)).toBeUndefined()
  })

  it('warns when durability is wired over an in-memory lock', async () => {
    const runs = await seededRuns()
    const h = await harness(
      { adapter: adapterFor('r1') },
      { runs, locks: new InMemoryLockStore() },
    )
    expect(
      h.logged.some(
        (c) => c.level === 'warn' && c.msg.includes('InMemoryLockStore'),
      ),
    ).toBe(true)
  })

  it('warns when durability is wired with NO lock at all', async () => {
    // An unwired lock resolves to `defineSandbox`'s process-lifetime
    // `InMemoryLockStore` fallback, so it has exactly the deficiency being
    // warned about — skipping the warning here would silence the most common
    // misconfiguration.
    const runs = await seededRuns()
    const h = await harness({ adapter: adapterFor('r1') }, { runs })
    expect(
      h.logged.some(
        (c) => c.level === 'warn' && c.msg.includes('InMemoryLockStore'),
      ),
    ).toBe(true)
  })

  it('does NOT warn about the lock when durability is not wired', async () => {
    const h = await harness()
    expect(h.logged.some((c) => c.msg.includes('InMemoryLockStore'))).toBe(
      false,
    )
  })
})

describe('withSandbox detach — the persistence-side effect', () => {
  /**
   * The end-to-end assertion the persistence half has been missing.
   *
   * `@tanstack/ai-persistence`'s `onAbort` writes NOTHING on a plain disconnect
   * when `DetachableRunCapability` reads back `true` and no cancel was recorded
   * — until now that branch was only ever driven by a test stand-in for the
   * capability, because nothing in the tree called `provideDetachableRun`.
   * `withSandbox` is that caller, so this test drives the real middleware and
   * asserts BOTH halves of the contract on one run record: the exact inputs
   * persistence keys off, and the record state a detached run must be left in.
   *
   * Residual, deliberate: this asserts the contract rather than invoking
   * `withPersistence` itself, because `@tanstack/ai-sandbox` does not depend on
   * `@tanstack/ai-persistence` and adding a devDependency to run one test would
   * invert the two packages' independence (the very reason
   * `DetachableRunCapability` lives in core).
   */
  it('leaves a detached run in the state persistence must not overwrite', async () => {
    const runs = await seededRuns()
    const h = await harness({ adapter: adapterFor('r1') }, { runs })

    await h.abort({ cancelRequested: false })

    // 1) The input `withPersistence.onAbort` branches on, published by the real
    //    `withSandbox.setup` on the real capability bus.
    expect(h.ctx.getOptional(DetachableRunCapability)).toBe(true)
    // 2) No cancel in either band, so persistence's `cancelled` is false and it
    //    takes the write-nothing branch.
    expect((await runs.get('r1'))?.cancelRequested).toBeUndefined()

    // 3) The record persistence therefore leaves untouched: still running, no
    //    terminal timestamp, and carrying everything the reaper and a later
    //    attach need.
    const record = await runs.get('r1')
    expect(record?.status).toBe('running')
    expect(record?.finishedAt).toBeUndefined()
    expect(record?.error).toBeUndefined()
    expect(typeof record?.detachedSince).toBe('number')
    expect(record?.sandboxKey).toBeTruthy()
    expect(h.destroys()).toBe(0)
  })

  /**
   * A DISCONNECT — the socket closing while the run is still going — must detach
   * the run WITHOUT tearing anything down.
   *
   * This is the behavior that makes a durable sandboxed run worth having, and it
   * did not exist. The only route a disconnect had into this middleware was the
   * application mirroring `request.signal` into `chat()`'s `abortController`, which
   * ABORTS THE RUN: `chat()` returns at its `isCancelled()` check right after this
   * `setup`, so the harness adapter's `chatStream` is never called and the agent in
   * the sandbox `setup` just spent minutes creating is NEVER LAUNCHED. The user
   * switched away during "starting the sandbox", came back, and found an empty log
   * for a run that had done nothing — unrecoverable even by takeover, because an
   * agent that never started wrote no journal to replay.
   *
   * So the run now hears about the disconnect through core's internal
   * `RunDisconnectCapability` and does BOOKKEEPING ONLY. The two negative
   * assertions are the load-bearing ones: a watcher stopped or a sandbox destroyed
   * here would break the very run this is supposed to keep alive.
   */
  it('DETACHES on a disconnect without stopping the watcher or destroying', async () => {
    const runs = await seededRuns()
    const h = await harness({ adapter: adapterFor('r1') }, { runs })

    await h.disconnect()

    // Recorded, so a later attach and the reaper can both find the run.
    const record = await runs.get('r1')
    expect(record?.status).toBe('running')
    expect(record?.finishedAt).toBeUndefined()
    expect(typeof record?.detachedSince).toBe('number')
    expect(record?.sandboxKey).toBeTruthy()
    // And the verdict core reads to keep the delivery log open.
    expect(h.ctx.getOptional(RunDetachedCapability)).toBe(true)

    // NOTHING was torn down: the run is still executing.
    expect(h.destroys()).toBe(0)
    expect(h.onDestroys()).toBe(0)
    expect(h.watcherStops()).toBe(0)
  })

  it('makes the run findable DURING ensure, not only once it streams', async () => {
    // A sandboxed run emits nothing for its first minutes (create a sandbox, clone
    // a repo). Chat persistence creates the run record from `onConfig`, i.e. after
    // every `setup`, so for that whole window `findActiveRun` answered "nothing
    // running" for a run that was demonstrably starting — a status sidebar read off
    // it showed `idle` for 6.5 minutes, and a client returning to the thread had
    // nothing to tell it a run was in flight, so it rendered an empty pane.
    const runs = new InMemoryRunStore() // no record yet, as in a real run
    let activeDuringEnsure: string | undefined
    const handle = makeFakeHandle('during-ensure-sbx', 'fake', FULL_CAPS)

    const provider: SandboxProvider = {
      name: 'fake',
      capabilities: () => FULL_CAPS,
      // Observed from INSIDE ensure — the window that used to be invisible.
      create: async () => {
        activeDuringEnsure = (await runs.findActiveRun('t1'))?.runId
        return handle
      },
      resume: () => Promise.resolve(handle),
      destroy: () => Promise.resolve(),
    }

    const sandbox = defineSandbox({
      id: 's',
      provider,
      lifecycle: { snapshot: 'none' },
    })
    const ctx = makeMiddlewareCtx({ threadId: 't1', runId: 'r1' })
    const { logger } = captureLogger()
    provideSandboxRuntime(ctx, {
      logger,
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })

    await withSandbox(sandbox, {
      instances: new InMemorySandboxInstanceStore(),
      locks: new InMemoryLockStore(),
      runs,
      durability: { adapter: adapterFor('r1') },
    }).setup!(ctx)

    expect(activeDuringEnsure).toBe('r1')
    expect((await runs.get('r1'))?.status).toBe('running')
  })

  it("stores the user's turn BEFORE ensure, and only when durable", async () => {
    // Chat persistence stores the turn from `onStart`, which runs after every
    // middleware `setup`. So without this the thread holds nothing for the whole
    // sandbox build: a reload during the build asked the server for the
    // conversation and got `{"messages":[]}`, and a second device saw an empty
    // thread even though the user had just sent a message.
    const runs = await seededRuns()
    const snapshots: Array<string> = []
    const handle = makeFakeHandle('turn', 'fake', FULL_CAPS)

    const build = async (durable: boolean) => {
      snapshots.length = 0
      const provider: SandboxProvider = {
        name: 'fake',
        capabilities: () => FULL_CAPS,
        // Observed from INSIDE ensure: the turn must already be stored.
        create: async () => {
          snapshots.push('ensure')
          return handle
        },
        resume: () => Promise.resolve(handle),
        destroy: () => Promise.resolve(),
      }
      const ctx = makeMiddlewareCtx({ threadId: 't1', runId: 'r1' })
      const { logger } = captureLogger()
      provideSandboxRuntime(ctx, {
        logger,
        emit: () => undefined,
        emitFileDiff: () => undefined,
      })
      providePendingTurn(ctx, {
        snapshot: async () => {
          snapshots.push('snapshot')
          await Promise.resolve()
        },
      })
      await withSandbox(
        defineSandbox({ id: 's', provider, lifecycle: { snapshot: 'none' } }),
        {
          instances: new InMemorySandboxInstanceStore(),
          locks: new InMemoryLockStore(),
          ...(durable
            ? { runs, durability: { adapter: adapterFor('r1') } }
            : {}),
        },
      ).setup!(ctx)
      return [...snapshots]
    }

    // Durable: stored, and stored BEFORE the sandbox is created.
    expect(await build(true)).toEqual(['snapshot', 'ensure'])
    // Not durable: nothing changes — the seam is offered but never called.
    expect(await build(false)).toEqual(['ensure'])
  })

  it('a failing pending-turn snapshot does not stop the run', async () => {
    // Best-effort: `onStart` stores the turn again once setup completes, so a store
    // blip must not cost the run.
    const runs = await seededRuns()
    const handle = makeFakeHandle('turn-fail', 'fake', FULL_CAPS)
    const ctx = makeMiddlewareCtx({ threadId: 't1', runId: 'r1' })
    const { logger, calls } = captureLogger()
    provideSandboxRuntime(ctx, {
      logger,
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })
    providePendingTurn(ctx, {
      snapshot: () => Promise.reject(new Error('store down')),
    })

    await expect(
      withSandbox(
        defineSandbox({
          id: 's',
          provider: {
            name: 'fake',
            capabilities: () => FULL_CAPS,
            create: () => Promise.resolve(handle),
            resume: () => Promise.resolve(handle),
            destroy: () => Promise.resolve(),
          },
          lifecycle: { snapshot: 'none' },
        }),
        {
          instances: new InMemorySandboxInstanceStore(),
          locks: new InMemoryLockStore(),
          runs,
          durability: { adapter: adapterFor('r1') },
        },
      ).setup!(ctx),
    ).resolves.toBeUndefined()

    expect(
      calls.some((c) => c.level === 'warn' && c.msg.includes('pending-turn')),
    ).toBe(true)
  })

  it('a NON-DURABLE run is untouched by the disconnect seam', async () => {
    // The blast radius of the durability work, stated as a test. Nothing about a
    // run without `runs` + `durability` may change: no detach verdict, no record,
    // and a disconnect notification (which core only ever delivers on the durable
    // transport path anyway) must do nothing even if one arrives.
    const runs = new InMemoryRunStore()
    const h = await harness(undefined, { runs })

    await h.disconnect()

    expect(await runs.get('r1')).toBeNull()
    expect(h.ctx.getOptional(RunDetachedCapability)).toBeUndefined()
    expect(h.destroys()).toBe(0)
    expect(h.watcherStops()).toBe(0)

    // And its abort still destroys, exactly as before.
    await h.abort()
    expect(h.destroys()).toBe(1)
  })

  it('a non-durable abort landing DURING ensure still destroys nothing', async () => {
    // The blast-radius question for the earlier run-state registration: `setup` now
    // registers state BEFORE `ensure`, so an abort arriving mid-`ensure` reaches
    // `onAbort`'s body where it previously returned at `if (!state) return`.
    //
    // The OUTCOME is nevertheless unchanged, which is what this pins. `onAbort`
    // calls `definition.destroy(ensureCtx)`, and that resolves the sandbox through
    // the instance store — which has no record until `ensure` finishes — so it is a
    // no-op and `provider.destroy` is never reached. `drainWatcher` is likewise a
    // no-op with no watcher started yet.
    //
    // So a non-durable run is observably identical to before, and the half-built
    // sandbox is still abandoned in this window: registering state earlier is what
    // lets the DURABLE path record a detach there, and it does not silently change
    // teardown for anyone else. (Reclaiming a sandbox abandoned mid-`ensure` needs
    // the instance record to exist before creation, which is a separate concern.)
    const handle = makeFakeHandle('mid-ensure', 'fake', FULL_CAPS)
    let destroys = 0
    const provider: SandboxProvider = {
      name: 'fake',
      capabilities: () => FULL_CAPS,
      create: async () => {
        // Dispatched from inside `ensure`: deterministically in the old dead zone.
        await mw.onAbort!(ctx, { reason: 'client went away', duration: 0 })
        return handle
      },
      resume: () => Promise.resolve(handle),
      destroy: () => {
        destroys += 1
        return Promise.resolve()
      },
    }
    const sandbox = defineSandbox({
      id: 's',
      provider,
      lifecycle: { snapshot: 'none' },
    })
    const ctx = makeMiddlewareCtx({ threadId: 't1', runId: 'r1' })
    const { logger } = captureLogger()
    provideSandboxRuntime(ctx, {
      logger,
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })
    // No `runs`, no `durability` — the ordinary sandboxed chat endpoint.
    const mw = withSandbox(sandbox, {
      instances: new InMemorySandboxInstanceStore(),
    })

    await mw.setup!(ctx)

    expect(destroys).toBe(0)
  })

  it('does not pre-create a record when the run is not durable', async () => {
    // The record is persistence's to own for a non-durable run; `withSandbox` has
    // no business inventing one when nothing will ever detach or reclaim it.
    const runs = new InMemoryRunStore()
    await harness(undefined, { runs })
    expect(await runs.get('r1')).toBeNull()
  })

  it('stamps the detach on a store that was never seeded', async () => {
    // The ORDINARY case, not an edge one: chat persistence has not created the
    // record yet at this point in the run (it does so from `onConfig`, after every
    // `setup`). `setup`'s pre-create is what makes the stamp land at all —
    // `RunStore.update` is a documented no-op for an unknown runId, so without it
    // the detach vanished silently and `listReclaimable` could never surface the run.
    const runs = new InMemoryRunStore() // deliberately NOT seeded
    const h = await harness({ adapter: adapterFor('r1') }, { runs })

    await h.disconnect()

    const record = await runs.get('r1')
    expect(record?.status).toBe('running')
    expect(typeof record?.detachedSince).toBe('number')
    expect(record?.sandboxKey).toBeTruthy()
    expect(h.ctx.getOptional(RunDetachedCapability)).toBe(true)
    expect(h.destroys()).toBe(0)
  })

  it('does not detach on a disconnect when the run is not durable', async () => {
    // No `runs` + `durability`, so there is nothing to detach INTO. The run still
    // must not be torn down by a mere disconnect — its terminal hooks own that.
    const h = await harness()
    await h.disconnect()
    expect(h.destroys()).toBe(0)
    expect(h.ctx.getOptional(RunDetachedCapability)).toBeUndefined()
  })

  it('does not detach on a disconnect when a cancel is already recorded', async () => {
    // Intent is never inferred FROM a disconnect, but an intent already recorded is
    // authoritative. Stamping `detachedSince` on a deliberately-stopped run would
    // hand it to the reaper as reclaimable work.
    const runs = await seededRuns()
    await runs.update('r1', { cancelRequested: true })
    const h = await harness({ adapter: adapterFor('r1') }, { runs })

    await h.disconnect()

    expect((await runs.get('r1'))?.detachedSince).toBeUndefined()
    expect(h.ctx.getOptional(RunDetachedCapability)).toBeUndefined()
  })

  it('does not detach on a disconnect when detachOnDisconnect is false', async () => {
    const runs = await seededRuns()
    const h = await harness(
      { adapter: adapterFor('r1'), detachOnDisconnect: false },
      { runs },
    )
    await h.disconnect()
    expect((await runs.get('r1'))?.detachedSince).toBeUndefined()
    expect(h.destroys()).toBe(0)
  })

  it('withholds the verdict when the disconnect record write fails', async () => {
    // Publishing the verdict after a failed write would leave core holding the log
    // open for a takeover that can never be found, since nothing in the store
    // points at the run. Unlike the abort path there is no destroy fallback — the
    // run is still alive and using the sandbox — so the failure is logged and the
    // run simply stays attached-looking.
    const runs = await seededRuns()
    const h = await harness({ adapter: adapterFor('r1') }, { runs })
    vi.spyOn(runs, 'update').mockRejectedValue(new Error('run store down'))

    await h.disconnect()

    expect(h.ctx.getOptional(RunDetachedCapability)).toBeUndefined()
    expect(h.destroys()).toBe(0)
    expect(
      h.logged.some(
        (c) => c.level === 'warn' && c.msg.includes('detach record write'),
      ),
    ).toBe(true)
  })

  it('detaches a disconnect that lands DURING ensure, the widest window there is', async () => {
    // `ensure` is the longest await in the run — create a sandbox, clone a repo,
    // minutes — and it is where the common disconnect lands: a user starts a run
    // and switches away while the UI still says "starting the sandbox". Registering
    // the run state (and subscribing) only after `ensure` returned left exactly
    // that window uncovered, so the disconnect was a silent no-op.
    const runs = await seededRuns('during-ensure')
    const handle = makeFakeHandle('during-ensure-sbx', 'fake', FULL_CAPS)
    let destroys = 0
    let fireDisconnect: (() => void) | undefined

    const provider: SandboxProvider = {
      name: 'fake',
      capabilities: () => FULL_CAPS,
      // The disconnect is dispatched from inside `create`, i.e. part-way through
      // `definition.ensure` — deterministically inside the window rather than by
      // racing a timer.
      create: async () => {
        fireDisconnect?.()
        // Let the subscriber's async bookkeeping run before `ensure` resolves.
        await Promise.resolve()
        return handle
      },
      resume: () => Promise.resolve(handle),
      destroy: () => {
        destroys += 1
        return Promise.resolve()
      },
    }

    const sandbox = defineSandbox({
      id: 's',
      provider,
      lifecycle: { snapshot: 'none' },
    })

    const ctx = makeMiddlewareCtx({ threadId: 't1', runId: 'during-ensure' })
    const { logger } = captureLogger()
    provideSandboxRuntime(ctx, {
      logger,
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })
    const listeners: Array<() => void | Promise<void>> = []
    provideRunDisconnect(ctx, {
      subscribe: (listener) => listeners.push(listener),
    })
    fireDisconnect = () => {
      for (const listener of listeners) void listener()
    }

    const mw = withSandbox(sandbox, {
      instances: new InMemorySandboxInstanceStore(),
      locks: new InMemoryLockStore(),
      runs,
      durability: { adapter: adapterFor('during-ensure') },
    })

    await mw.setup!(ctx)
    // Settle the subscriber's writes.
    await new Promise((resolve) => setTimeout(resolve, 0))

    const record = await runs.get('during-ensure')
    expect(typeof record?.detachedSince).toBe('number')
    expect(record?.sandboxKey).toBeTruthy()
    expect(ctx.getOptional(RunDetachedCapability)).toBe(true)
    expect(destroys).toBe(0)
  })

  // An abort that lands while `setup` is STILL RUNNING — the most common
  // disconnect there is, because a user starts a run and switches tab while the
  // UI still says "starting the sandbox". `setup` obtains the handle early but
  // used to register its run state only at the very END, after the git baseline
  // capture, workspace projection, and watcher start. `onAbort` opens with
  // `if (!state) return`, so anything landing in that window was a silent no-op
  // and lost ALL THREE teardown behaviors at once: no `detachedSince` (so
  // `listReclaimable` can never surface the run and the reaper can never reclaim
  // it), no `destroy` (so the sandbox leaks), and no detach verdict (so core takes
  // its `!detached` branch and CLOSES the delivery log, after which no attach can
  // ever tail the run — presenting as "durability does nothing" while the agent
  // is still working).
  it('detaches when the abort lands mid-setup, right after the handle exists', async () => {
    const runs = await seededRuns('mid-setup')
    const handle = makeFakeHandle('mid-setup-sbx', 'fake', FULL_CAPS)
    let destroys = 0

    const provider: SandboxProvider = {
      name: 'fake',
      capabilities: () => FULL_CAPS,
      create: () => Promise.resolve(handle),
      resume: () => Promise.resolve(handle),
      destroy: () => {
        destroys += 1
        return Promise.resolve()
      },
    }

    const sandbox = defineSandbox({
      id: 's',
      provider,
      lifecycle: { snapshot: 'none' },
      // The abort is dispatched from a hook that runs DURING setup, after the
      // handle exists but well before setup returns — deterministically inside
      // the old uncovered window rather than by racing a timer.
      hooks: {
        onReady: async () => {
          await mw.onAbort!(ctx, { reason: 'client went away', duration: 0 })
        },
      },
    })

    const ctx = makeMiddlewareCtx({ threadId: 't1', runId: 'mid-setup' })
    const { logger } = captureLogger()
    provideSandboxRuntime(ctx, {
      logger,
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })

    const mw = withSandbox(sandbox, {
      instances: new InMemorySandboxInstanceStore(),
      locks: new InMemoryLockStore(),
      runs,
      durability: { adapter: adapterFor('mid-setup') },
    })

    await mw.setup!(ctx)

    // Detached, not destroyed, and reclaimable.
    const record = await runs.get('mid-setup')
    expect(record?.status).toBe('running')
    expect(typeof record?.detachedSince).toBe('number')
    expect(record?.sandboxKey).toBeTruthy()
    expect(destroys).toBe(0)
    // And the verdict core reads to decide whether to close the delivery log.
    expect(ctx.getOptional(RunDetachedCapability)).toBe(true)
  })
})
