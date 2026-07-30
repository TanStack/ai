/**
 * `withSandbox(definition, options?)` — the middleware that PROVIDES the
 * {@link SandboxCapability} a harness adapter requires.
 *
 * - `setup`: resume-or-create the sandbox (via the definition's ensure
 *   algorithm), provide the handle, using the durability seams from
 *   {@link SandboxMiddlewareOptions} (or, failing that, a bus-provided
 *   SandboxInstanceStoreCapability / LocksCapability, then an in-memory
 *   fallback). If `fileEvents` is not false, starts a
 *   watcher that dispatches to sandbox-scoped hooks and forwards to the runtime
 *   sink.
 * - `onFinish`/`onAbort`/`onError`: stop the watcher, snapshot (`after-run`)
 *   and/or destroy per lifecycle.
 *
 * NOTE: streamed sandbox lifecycle events (sandbox.created, workspace.setup.*)
 * are emitted by the harness adapter's chatStream (which can yield CUSTOM
 * chunks), not from here — middleware setup runs before streaming begins.
 */
import {
  defineChatMiddleware,
  provideDetachableRun,
  provideRunDetached,
  wasCancelRequested,
} from '@tanstack/ai'
import { InMemoryLockStore, LocksCapability } from '@tanstack/ai/locks'
import { getSandboxRuntime } from '@tanstack/ai/adapter-internals'
import {
  SandboxCapability,
  provideSandbox,
  provideSandboxPolicy,
} from './capabilities'
import {
  provideSandboxDurability,
  resolveSandboxDurability,
} from './durability'
import { SandboxInstanceStoreCapability } from './instance-store'
import { computeWorkspaceHash } from './key'
import { buildFileHookEvent, resolveFileEvents } from './file-diff'
import { ProjectionCapability, provideWorkspaceProjection } from './projection'
import { resolveSecret } from './secrets'
import { watchWorkspace } from './watch'
import { DEFAULT_WORKSPACE_ROOT } from './bootstrap'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { LockStore } from '@tanstack/ai/locks'
import type {
  AbortInfo,
  ChatMiddlewareContext,
  DefinedChatMiddleware,
  RunStore,
  SandboxFileEvent,
  SandboxFileHookEvent,
} from '@tanstack/ai'
import type {
  SandboxDurabilityOptions,
  SandboxRunDurability,
} from './durability'
import type { SandboxInstanceStore } from './instance-store'
import type { SandboxHandle } from './contracts'
import type {
  SandboxDefinition,
  SandboxEnsureContext,
  SandboxHooks,
} from './sandbox'
import type { SandboxWatchHandle } from './watch'

/** Per-request state we need to carry from `setup` to the terminal hooks. */
interface SandboxRunState {
  handle: SandboxHandle
  ensureCtx: SandboxEnsureContext
  watcher?: SandboxWatchHandle
  /** In-flight `enriched.diff()` promises queued by the `fileEvents.diff`
   * watcher callback, awaited before teardown so a pending diff isn't
   * dropped when the run finishes/aborts/errors mid-computation. */
  pendingDiffs: Array<Promise<void>>
  /** Logger captured at setup, so terminal hooks can log watcher teardown. */
  logger?: InternalLogger
  /**
   * Durability resolved once at setup (absent when the run is not durable), so
   * `onAbort` cannot reach a different verdict than the one `setup` published
   * on the capability bus.
   */
  durability?: SandboxRunDurability
}

const runState = new WeakMap<object, SandboxRunState>()

/**
 * Stop the watcher and drain any in-flight `diff()` promises before teardown,
 * so the final file's diff isn't dropped when a run finishes/aborts/errors
 * mid-computation. The `pendingDiffs` await is the load-bearing line — without
 * it a deferred diff resolves after the run is gone and its chunk is lost.
 */
async function drainWatcher(
  state: SandboxRunState,
  phase: 'finish' | 'abort' | 'error',
): Promise<void> {
  // Guard `stop()`: a rejecting watcher teardown must NOT propagate out of
  // here, or the caller skips the `definition.destroy(...)` that follows —
  // leaking the sandbox on exactly the abort path that must ALWAYS tear down.
  try {
    await state.watcher?.stop()
  } catch (error) {
    state.logger?.warn('sandbox watcher stop failed', { phase, error })
  }
  await Promise.allSettled(state.pendingDiffs)
  if (state.watcher) state.logger?.sandbox('sandbox watcher stopped', { phase })
}

/** Defensively pull tenant scoping out of the runtime context, if present. */
function tenantFrom(
  context: unknown,
): { userId?: string; orgId?: string } | undefined {
  if (context === null || typeof context !== 'object') return undefined
  const c = context as Record<string, unknown>
  const userId = typeof c.userId === 'string' ? c.userId : undefined
  const orgId = typeof c.orgId === 'string' ? c.orgId : undefined
  if (userId === undefined && orgId === undefined) return undefined
  return { userId, orgId }
}

/**
 * Durability seams for a sandboxed run. Both are optional; each independently
 * falls back to a process-lifetime in-memory default, which is correct for a
 * single process but NOT across replicas.
 */
export interface SandboxMiddlewareOptions<TOffset extends string = string> {
  /**
   * Durable instance map (which provider sandbox to resume for a key). Pass
   * your own store to make resume survive across processes/replicas.
   *
   * Takes precedence over a store provided on the capability bus (see
   * `provideSandboxInstanceStore`), so the call site wins over ambient wiring.
   */
  instances?: SandboxInstanceStore
  /**
   * Distributed lock serializing resume-or-create for one key. Needed for
   * multi-replica correctness so two concurrent runs don't both create.
   *
   * Prefer `withLocks` from `@tanstack/ai/locks` when other middleware also
   * needs the lock; use this option to scope one to this sandbox. Takes
   * precedence over a bus-provided lock.
   */
  locks?: LockStore
  /**
   * Run lifecycle records. Pair with `durability.adapter` to make a run
   * DETACHABLE: a client disconnect then leaves the agent running and records
   * `detachedSince` instead of destroying the sandbox.
   *
   * Pass the SAME store chat persistence uses (`persistence.stores.runs`) so
   * one record describes the run instead of two that can disagree.
   *
   * Defaults to `undefined`: an app that passes neither this nor `durability`
   * keeps today's destroy-on-disconnect behavior exactly.
   */
  runs?: RunStore
  /**
   * Delivery durability for the run's event log, plus the journal and detach
   * knobs. Requires `runs`; either alone is not durable.
   *
   * `TOffset` is inferred from the adapter passed here, so a branded-cursor
   * backend (`durableStream`) wires without a cast and without the call site
   * ever naming the parameter.
   */
  durability?: SandboxDurabilityOptions<TOffset>
}

/**
 * Resolve the ensure seams. Precedence is explicit option → capability bus →
 * (in `ensure`) the in-memory fallback. The option wins because it is visible
 * at the call site; the bus remains for platform/framework injection.
 */
function buildEnsureCtx(
  ctx: ChatMiddlewareContext,
  // Narrowed to the two seams it reads rather than taking the whole options
  // object: `SandboxMiddlewareOptions` is now generic in the durability offset,
  // and `SandboxMiddlewareOptions<TOffset>` is not assignable to
  // `SandboxMiddlewareOptions<string>`. Both members here are offset-free, so
  // the narrowing keeps this helper independent of that parameter entirely.
  options: Pick<SandboxMiddlewareOptions, 'instances' | 'locks'> | undefined,
): SandboxEnsureContext {
  return {
    threadId: ctx.threadId,
    runId: ctx.runId,
    store:
      options?.instances ?? ctx.getOptional(SandboxInstanceStoreCapability),
    locks: options?.locks ?? ctx.getOptional(LocksCapability),
    tenant: tenantFrom(ctx.context),
    signal: ctx.signal,
  }
}

/**
 * Dispatch a sandbox file event to the per-type hooks declared on the
 * definition. Errors in individual hooks are swallowed so one bad hook
 * cannot break the run — but are logged under the `errors` category first, so
 * a throwing hook is observable (matching the run-scoped path in the engine
 * and the behavior the observability docs promise).
 */
async function dispatchDefinitionHooks(
  hooks: SandboxHooks | undefined,
  event: SandboxFileHookEvent,
  logger?: InternalLogger,
): Promise<void> {
  if (!hooks) return
  const typed = (
    {
      create: 'onFileCreate',
      change: 'onFileChange',
      delete: 'onFileDelete',
    } as const
  )[event.type]
  for (const fn of [hooks.onFile, hooks[typed]]) {
    if (!fn) continue
    try {
      await fn(event)
    } catch (error) {
      // swallowed — one bad hook must not break the run — but logged so the
      // failure isn't invisible.
      logger?.errors('sandbox file hook failed', {
        path: event.path,
        type: event.type,
        error,
      })
    }
  }
}

export function withSandbox<TOffset extends string = string>(
  definition: SandboxDefinition,
  options?: SandboxMiddlewareOptions<TOffset>,
): DefinedChatMiddleware<
  unknown,
  readonly [],
  readonly [typeof SandboxCapability, typeof ProjectionCapability]
> {
  return defineChatMiddleware({
    name: 'sandbox',
    provides: [SandboxCapability, ProjectionCapability],
    // SandboxPolicyCapability is provided conditionally (only when the
    // definition has a policy), so it is intentionally NOT declared here —
    // consumers read it via `getOptional`. SandboxDurabilityCapability and
    // DetachableRunCapability are conditional for the same reason (only when
    // `runs` + `durability` are both wired), so they are intentionally NOT
    // declared here either.
    optionalRequires: [SandboxInstanceStoreCapability, LocksCapability],

    async setup(ctx) {
      const ensureCtx = buildEnsureCtx(ctx, options)
      const handle = await definition.ensure(ensureCtx)
      provideSandbox(ctx, handle)
      if (definition.policy) provideSandboxPolicy(ctx, definition.policy)

      // Resolving here (not lazily on the abort path) is what keeps `setup` and
      // `onAbort` on one verdict: the payload the bus carries is the same object
      // the teardown path consults.
      // `TOffset` is passed explicitly: `options` is possibly `undefined` here,
      // so inference has nothing to work from on that branch and would fall
      // back to the `= string` default, re-erecting the very wall this
      // parameter exists to remove.
      const durability = resolveSandboxDurability<TOffset>(options)
      if (durability !== undefined) {
        provideSandboxDurability(ctx, durability)
        // A neutral boolean core owns, so `@tanstack/ai-persistence` can ask
        // "is this run detachable?" without depending on this package.
        provideDetachableRun(ctx, true)
      }

      // Pull the runtime (and its logger) up front so `baseSha` capture and
      // hook dispatch below can log through the same `sandbox`/`errors`
      // categories the engine uses.
      const runtime = getSandboxRuntime(ctx, { optional: true })
      const logger = runtime?.logger

      // Deliberately placed AFTER `logger` is in scope rather than next to the
      // `provideSandboxDurability` call above — there is no logger to warn
      // through until the runtime has been read.
      //
      // `ensureCtx.locks === undefined` counts as in-memory: `defineSandbox`'s
      // `ensure` falls back to a process-lifetime `InMemoryLockStore` when no
      // lock is wired, so an unwired lock has exactly the deficiency being
      // warned about — it is the MOST in-memory case, not an exempt one.
      if (
        durability !== undefined &&
        (ensureCtx.locks === undefined ||
          ensureCtx.locks instanceof InMemoryLockStore)
      ) {
        logger?.warn(
          'sandbox durability is wired over an InMemoryLockStore: run claims are ' +
            'serialized within this process only and the lease never signals loss, ' +
            'so two hosts can drive one run and duplicate its event log. Use a ' +
            'distributed LockStore via withLocks for any multi-replica deploy.',
          { runId: ctx.runId },
        )
      }

      const watchRoot = definition.workspace?.root ?? DEFAULT_WORKSPACE_ROOT
      let baseSha = ''
      try {
        const shaRes = await handle.process.exec('git rev-parse HEAD', {
          cwd: watchRoot,
        })
        if (shaRes.exitCode === 0) {
          baseSha = shaRes.stdout.trim()
          logger?.sandbox('sandbox git baseline captured', {
            root: watchRoot,
            baseSha,
          })
        } else {
          // Non-zero exit: either not a git repository (non-git workspace) or a
          // repo with no commits (no HEAD). Expected, but it silently degrades
          // every subsequent diff to a full-file add-patch, so surface it
          // under `sandbox` (with stderr) rather than leaving nothing to grep.
          logger?.sandbox('sandbox git baseline unavailable (non-zero exit)', {
            root: watchRoot,
            exitCode: shaRes.exitCode,
            stderr: shaRes.stderr,
          })
        }
      } catch (error) {
        // exec rejected (git not on PATH, exec seam broken) → baseSha stays ''
        // and accessors fall back, but this is a real anomaly, not a plain
        // non-git workspace, so warn.
        logger?.warn('sandbox git baseline capture failed', {
          root: watchRoot,
          error,
        })
      }

      const workspace = definition.workspace
      if (workspace !== undefined) {
        const root = workspace.root ?? DEFAULT_WORKSPACE_ROOT
        const workspaceHash = computeWorkspaceHash(workspace)
        const secrets = workspace.secrets
        provideWorkspaceProjection(ctx, {
          skills: workspace.skills ?? [],
          plugins: workspace.plugins ?? [],
          resolveSecret: (ref) => {
            if (secrets === undefined) {
              throw new Error(
                `resolveSecret: no secrets defined on this workspace (ref: "${ref.__secretName}")`,
              )
            }
            return resolveSecret(secrets, ref)
          },
          markerPath: `${root}/.tanstack-projected-${workspaceHash}`,
          root,
          ...(workspace.scripts !== undefined
            ? { scripts: workspace.scripts }
            : {}),
        })
      }

      const hooks = definition.hooks
      await hooks?.onReady?.(handle)

      const fe = resolveFileEvents(definition.fileEvents)
      const pendingDiffs: Array<Promise<void>> = []
      let watcher: SandboxWatchHandle | undefined
      if (fe.enabled) {
        watcher = await watchWorkspace(handle, {
          onEvent: (event: SandboxFileEvent) => {
            const enriched = buildFileHookEvent(
              handle,
              watchRoot,
              baseSha,
              event,
              logger,
            )
            void dispatchDefinitionHooks(hooks, enriched, logger)
            runtime?.emit(enriched)
            if (fe.diff) {
              pendingDiffs.push(
                enriched
                  .diff()
                  .then((diff) => {
                    runtime?.emitFileDiff({ path: event.path, diff })
                  })
                  .catch((error: unknown) => {
                    logger?.warn('sandbox file diff emit failed', {
                      path: event.path,
                      error,
                    })
                  }),
              )
            }
          },
          // Watch the SAME root the enrichment layer relativizes against
          // (`buildFileHookEvent(handle, watchRoot, …)` and the `baseSha`
          // capture). Without this the watcher defaults to `/workspace` while
          // enrichment uses `watchRoot`, so a custom `workspace.root` makes the
          // two look at different directories and git pathspecs break.
          root: watchRoot,
          ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
          ...(logger !== undefined ? { logger } : {}),
        })
        logger?.sandbox('sandbox watcher started', {
          root: watchRoot,
          diff: fe.diff,
        })
      }

      runState.set(ctx, {
        handle,
        ensureCtx,
        pendingDiffs,
        ...(watcher ? { watcher } : {}),
        ...(logger !== undefined ? { logger } : {}),
        ...(durability !== undefined ? { durability } : {}),
      })
    },

    async onFinish(ctx) {
      const state = runState.get(ctx)
      if (!state) return
      const { handle, ensureCtx } = state

      await drainWatcher(state, 'finish')

      const lifecycle = definition.lifecycle

      if (
        lifecycle?.snapshot === 'after-run' &&
        handle.capabilities.snapshots &&
        handle.snapshot
      ) {
        const snapshot = await handle.snapshot(`after-run-${ctx.runId}`)
        const store = ensureCtx.store
        if (store) {
          const key = definition.key(ensureCtx)
          const existing = await store.get(key)
          if (existing) {
            await store.upsert({
              ...existing,
              latestSnapshotId: snapshot.id,
              updatedAt: Date.now(),
            })
          }
        }
      }

      if (lifecycle?.destroyOnComplete) {
        await definition.destroy(ensureCtx)
        await definition.hooks?.onDestroy?.()
      }
    },

    async onAbort(ctx, info: AbortInfo) {
      const state = runState.get(ctx)
      if (!state) return

      // First on BOTH branches: a diff still in flight must be drained whether
      // the sandbox is about to be destroyed or merely detached, or the final
      // file's diff is dropped.
      await drainWatcher(state, 'abort')

      const durability = state.durability
      // A user pressing Stop and a user closing the tab produce the IDENTICAL
      // connection close, so intent is never inferred from the disconnect. It
      // arrives out of band, and either band is authoritative: in-process (the
      // abort reason carried the cancel sentinel) or durable (another host
      // recorded it on the run record).
      const cancelled =
        info.cancelRequested === true ||
        (durability !== undefined &&
          (await wasCancelRequested(durability.runs, ctx.runId)))

      if (
        durability !== undefined &&
        !cancelled &&
        durability.detachOnDisconnect
      ) {
        // DETACH: the agent keeps running and the sandbox stays up, so record
        // the two facts a later attach and the reaper both need. `update` is a
        // documented no-op for an unknown runId, so a vanished record does not
        // turn teardown into a throw.
        //
        // GUARDED, and on failure this branch is ABANDONED for the destroy one
        // below. This was the only unguarded await left on the abort path, and a
        // rejection here was the worst shape available: `provideRunDetached`
        // never ran, so core terminalized the log with a synthetic `RUN_ERROR`
        // and recorded a healthy detached run as failed — the exact harm this
        // branch exists to prevent; `detachedSince`/`sandboxKey` were never
        // written, so `listReclaimable` could never surface the run and
        // `reapDetachedRuns` could never reclaim it; and `definition.destroy`
        // was not reached either, so the sandbox ran forever with no recovery
        // path at all. A DESTROYED sandbox beats an unreachable one. This is the
        // same reasoning `drainWatcher` already applies to its own `stop()` — a
        // rejection there "leaks the sandbox on exactly the abort path that must
        // ALWAYS tear down" — carried across to the write that decides whether
        // the run is reachable at all.
        try {
          await durability.runs.update(ctx.runId, {
            detachedSince: Date.now(),
            sandboxKey: definition.key(state.ensureCtx),
          })
        } catch (error) {
          state.logger?.warn(
            'sandbox detach record write failed; destroying instead of detaching',
            { runId: ctx.runId, error },
          )
          await definition.destroy(state.ensureCtx)
          await definition.hooks?.onDestroy?.()
          return
        }
        // Publish the VERDICT, not just the record fields. Core's durable
        // delivery sink reads it (see `RunDetachedCapability`) and leaves the
        // run's log OPEN instead of appending a synthetic terminal `RUN_ERROR`
        // and closing it — a terminalized log ends a later attach's replay at
        // the prefix and diverges the takeover's journal replay, which recorded
        // a healthy detached run as `'failed'`.
        //
        // This hook is the only place that can answer it: the detach-vs-destroy
        // call needs BOTH out-of-band cancel bands and `detachOnDisconnect`,
        // resolved just above. Set on the DETACH branch only, so an explicit
        // cancel, a non-detachable disconnect, an error, and a normal finish all
        // leave it unpublished and core terminalizes exactly as it always has.
        provideRunDetached(ctx, true)
        return
      }

      // ALWAYS tear down on an explicit abort, regardless of `destroyOnComplete`.
      // The in-sandbox agent process is not killed by closing its IO stream
      // (e.g. a Docker exec survives client disconnect), so the only reliable way
      // to stop it — and the token/cost drain of its ongoing API calls — is to
      // destroy the sandbox (stop the container/VM). `keepAlive` /
      // `destroyOnComplete:false` governs *successful completion*, never cancel.
      await definition.destroy(state.ensureCtx)
      await definition.hooks?.onDestroy?.()
    },

    async onError(ctx, info) {
      const state = runState.get(ctx)
      if (!state) return

      await drainWatcher(state, 'error')
      await definition.hooks?.onError?.(info.error)

      // On failure, only tear down when the lifecycle says so; otherwise leave
      // the sandbox for a resumed retry.
      if (definition.lifecycle?.destroyOnComplete) {
        await definition.destroy(state.ensureCtx)
        await definition.hooks?.onDestroy?.()
      }
    },
  })
}
