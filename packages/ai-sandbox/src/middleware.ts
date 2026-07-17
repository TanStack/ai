/**
 * `withSandbox(definition)` — the middleware that PROVIDES the
 * {@link SandboxCapability} a harness adapter requires.
 *
 * - `setup`: resume-or-create the sandbox (via the definition's ensure
 *   algorithm), provide the handle, using the optional SandboxStore/Locks
 *   capabilities when a persistence middleware supplied them (in-memory
 *   fallback otherwise). If `fileEvents` is not false, starts a watcher
 *   that dispatches to sandbox-scoped hooks and forwards to the runtime sink.
 * - `onFinish`/`onAbort`/`onError`: stop the watcher, snapshot (`after-run`)
 *   and/or destroy per lifecycle.
 *
 * NOTE: streamed sandbox lifecycle events (sandbox.created, workspace.setup.*)
 * are emitted by the harness adapter's chatStream (which can yield CUSTOM
 * chunks), not from here — middleware setup runs before streaming begins.
 */
import { defineChatMiddleware } from '@tanstack/ai'
import { getSandboxRuntime } from '@tanstack/ai/adapter-internals'
import {
  LocksCapability,
  SandboxCapability,
  SandboxStoreCapability,
  provideSandbox,
  provideSandboxPolicy,
} from './capabilities'
import { computeWorkspaceHash } from './key'
import { buildFileHookEvent, resolveFileEvents } from './file-diff'
import { ProjectionCapability, provideWorkspaceProjection } from './projection'
import { resolveSecret } from './secrets'
import { watchWorkspace } from './watch'
import { DEFAULT_WORKSPACE_ROOT } from './bootstrap'
import {
  checkpointWorkspacePersistenceEvent,
  requireWorkspacePersistence,
  restoreWorkspacePersistence,
} from './workspace-persistence'
import { resolveWorkspacePersistenceOptions } from './workspace-persistence-types'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  AbortInfo,
  ChatMiddlewareContext,
  DefinedChatMiddleware,
  SandboxFileEvent,
  SandboxFileHookEvent,
} from '@tanstack/ai'
import type { AIPersistence } from '@tanstack/ai-persistence'
import type { SandboxHandle } from './contracts'
import type {
  SandboxDefinition,
  SandboxEnsureContext,
  SandboxHooks,
} from './sandbox'
import type { SandboxRecord, SandboxStore } from './store'
import type { SandboxWatchHandle } from './watch'
import type { ResolvedWorkspacePersistenceOptions } from './workspace-persistence-types'

/** Per-request state we need to carry from `setup` to the terminal hooks. */
interface SandboxRunState {
  handle: SandboxHandle
  ensureCtx: SandboxEnsureContext
  watchers: Array<SandboxWatchHandle>
  /** In-flight `enriched.diff()` promises queued by the `fileEvents.diff`
   * watcher callback, awaited before teardown so a pending diff isn't
   * dropped when the run finishes/aborts/errors mid-computation. */
  pendingDiffs: Array<Promise<void>>
  /** In-flight workspace persistence checkpoints queued by file events. */
  pendingWorkspacePersistence: Array<Promise<void>>
  workspacePersistenceErrors: Array<unknown>
  workspacePersistenceOptions?: ResolvedWorkspacePersistenceOptions
  /** Logger captured at setup, so terminal hooks can log watcher teardown. */
  logger?: InternalLogger
}

const runState = new WeakMap<object, SandboxRunState>()
const persistenceStores = new WeakMap<AIPersistence, SandboxStore>()
const SANDBOX_METADATA_SCOPE = 'tanstack.ai.sandbox'

async function getOptionalPersistence(
  ctx: ChatMiddlewareContext,
): Promise<AIPersistence | undefined> {
  try {
    const { PersistenceCapability } = await import('@tanstack/ai-persistence')
    return ctx.getOptional(PersistenceCapability)
  } catch (error) {
    if (isMissingOptionalPersistence(error)) return undefined
    throw error
  }
}

function isMissingOptionalPersistence(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('@tanstack/ai-persistence') ||
      error.message.includes('ERR_MODULE_NOT_FOUND') ||
      error.message.includes('MODULE_NOT_FOUND'))
  )
}

function isSandboxRecord(value: unknown): value is SandboxRecord {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.key === 'string' &&
    typeof record.provider === 'string' &&
    typeof record.providerSandboxId === 'string' &&
    typeof record.threadId === 'string' &&
    typeof record.updatedAt === 'number' &&
    (record.latestSnapshotId === undefined ||
      typeof record.latestSnapshotId === 'string') &&
    (record.latestRunId === undefined || typeof record.latestRunId === 'string')
  )
}

function sandboxStoreFromPersistence(
  persistence: AIPersistence | undefined,
): SandboxStore | undefined {
  const metadata = persistence?.stores.metadata
  if (!persistence || !metadata) return undefined

  const existing = persistenceStores.get(persistence)
  if (existing) return existing

  const store: SandboxStore = {
    async get(key) {
      const value = await metadata.get(SANDBOX_METADATA_SCOPE, key)
      return isSandboxRecord(value) ? value : null
    },
    async upsert(record) {
      await metadata.set(SANDBOX_METADATA_SCOPE, record.key, record)
    },
    async delete(key) {
      await metadata.delete(SANDBOX_METADATA_SCOPE, key)
    },
  }
  persistenceStores.set(persistence, store)
  return store
}

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
  for (const watcher of state.watchers) {
    try {
      await watcher.stop()
    } catch (error) {
      state.logger?.warn('sandbox watcher stop failed', { phase, error })
    }
  }
  await Promise.allSettled(state.pendingDiffs)
  if (state.watchers.length > 0) {
    state.logger?.sandbox('sandbox watcher stopped', {
      phase,
      count: state.watchers.length,
    })
  }
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

function buildEnsureCtx(
  ctx: ChatMiddlewareContext,
  persistence?: AIPersistence,
): SandboxEnsureContext {
  return {
    threadId: ctx.threadId,
    runId: ctx.runId,
    store:
      ctx.getOptional(SandboxStoreCapability) ??
      sandboxStoreFromPersistence(persistence),
    locks: ctx.getOptional(LocksCapability),
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

async function workspacePersistenceError(
  state: SandboxRunState,
): Promise<unknown | undefined> {
  await Promise.allSettled(state.pendingWorkspacePersistence)
  if (
    state.workspacePersistenceOptions?.consistency === 'strict' &&
    state.workspacePersistenceErrors.length > 0
  ) {
    return state.workspacePersistenceErrors[0]
  }
  return undefined
}

export function withSandbox(
  definition: SandboxDefinition,
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
    // consumers read it via `getOptional`.
    optionalRequires: [SandboxStoreCapability, LocksCapability],

    async setup(ctx) {
      const persistence = await getOptionalPersistence(ctx)
      const ensureCtx = buildEnsureCtx(ctx, persistence)
      const handle = await definition.ensure(ensureCtx)
      provideSandbox(ctx, handle)
      if (definition.policy) provideSandboxPolicy(ctx, definition.policy)

      const workspacePersistenceOptions = resolveWorkspacePersistenceOptions({
        workspacePersistence: definition.persistence?.workspace,
        workspace: definition.workspace,
        defaultKey: definition.key(ensureCtx),
      })
      const workspacePersistence = workspacePersistenceOptions
        ? requireWorkspacePersistence(persistence)
        : undefined
      // Pull the runtime (and its logger) up front so `baseSha` capture and
      // hook dispatch below can log through the same `sandbox`/`errors`
      // categories the engine uses.
      const runtime = getSandboxRuntime(ctx, { optional: true })
      const logger = runtime?.logger

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
      if (workspacePersistenceOptions && workspacePersistence) {
        await restoreWorkspacePersistence({
          handle,
          persistence: workspacePersistence,
          options: workspacePersistenceOptions,
          runId: ctx.runId,
          threadId: ctx.threadId,
        })
      }
      await hooks?.onReady?.(handle)

      const fe = resolveFileEvents(definition.fileEvents)
      const pendingDiffs: Array<Promise<void>> = []
      const pendingWorkspacePersistence: Array<Promise<void>> = []
      const workspacePersistenceErrors: Array<unknown> = []
      const watchers: Array<SandboxWatchHandle> = []
      const enqueueWorkspacePersistence = (event: SandboxFileEvent): void => {
        if (!workspacePersistenceOptions || !workspacePersistence) return
        pendingWorkspacePersistence.push(
          checkpointWorkspacePersistenceEvent(
            {
              handle,
              persistence: workspacePersistence,
              options: workspacePersistenceOptions,
              runId: ctx.runId,
              threadId: ctx.threadId,
            },
            event,
          ).catch((error) => {
            workspacePersistenceErrors.push(error)
            logger?.warn('sandbox workspace persistence checkpoint failed', {
              path: event.path,
              error,
            })
          }),
        )
      }
      if (fe.enabled) {
        const persistenceSharesPublicRoot =
          workspacePersistenceOptions?.root === watchRoot
        watchers.push(
          await watchWorkspace(handle, {
            root: watchRoot,
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
              if (persistenceSharesPublicRoot) {
                enqueueWorkspacePersistence(event)
              }
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
            ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
            ...(logger !== undefined ? { logger } : {}),
          }),
        )
        logger?.sandbox('sandbox watcher started', {
          root: watchRoot,
          diff: fe.diff,
        })
      }
      if (
        workspacePersistenceOptions &&
        (!fe.enabled || workspacePersistenceOptions.root !== watchRoot)
      ) {
        watchers.push(
          await watchWorkspace(handle, {
            root: workspacePersistenceOptions.root,
            onEvent: enqueueWorkspacePersistence,
            ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
            ...(logger !== undefined ? { logger } : {}),
          }),
        )
        logger?.sandbox('sandbox watcher started', {
          root: workspacePersistenceOptions.root,
          diff: false,
          persistence: true,
        })
      }

      runState.set(ctx, {
        handle,
        ensureCtx,
        pendingDiffs,
        pendingWorkspacePersistence,
        workspacePersistenceErrors,
        watchers,
        ...(workspacePersistenceOptions ? { workspacePersistenceOptions } : {}),
        ...(logger !== undefined ? { logger } : {}),
      })
    },

    async onFinish(ctx) {
      const state = runState.get(ctx)
      if (!state) return
      const { handle, ensureCtx } = state

      await drainWatcher(state, 'finish')
      const persistenceError = await workspacePersistenceError(state)

      const lifecycle = definition.lifecycle
      if (persistenceError) {
        if (lifecycle?.destroyOnComplete) {
          await definition.destroy(ensureCtx)
          await definition.hooks?.onDestroy?.()
        }
        throw persistenceError
      }

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

    async onAbort(ctx, _info: AbortInfo) {
      const state = runState.get(ctx)
      if (!state) return

      await drainWatcher(state, 'abort')
      const persistenceError = await workspacePersistenceError(state)

      // ALWAYS tear down on an explicit abort, regardless of `destroyOnComplete`.
      // The in-sandbox agent process is not killed by closing its IO stream
      // (e.g. a Docker exec survives client disconnect), so the only reliable way
      // to stop it — and the token/cost drain of its ongoing API calls — is to
      // destroy the sandbox (stop the container/VM). `keepAlive` /
      // `destroyOnComplete:false` governs *successful completion*, never cancel.
      await definition.destroy(state.ensureCtx)
      await definition.hooks?.onDestroy?.()
      if (persistenceError) throw persistenceError
    },

    async onError(ctx, info) {
      const state = runState.get(ctx)
      if (!state) return

      await drainWatcher(state, 'error')
      const persistenceError = await workspacePersistenceError(state)
      await definition.hooks?.onError?.(info.error)

      // On failure, only tear down when the lifecycle says so; otherwise leave
      // the sandbox for a resumed retry.
      if (definition.lifecycle?.destroyOnComplete) {
        await definition.destroy(state.ensureCtx)
        await definition.hooks?.onDestroy?.()
      }
      if (persistenceError) throw persistenceError
    },
  })
}
