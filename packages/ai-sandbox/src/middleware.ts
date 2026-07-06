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
  restoreWorkspacePersistence,
} from './workspace-persistence'
import { resolveWorkspacePersistenceOptions } from './workspace-persistence-types'
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
 * cannot break the run.
 */
async function dispatchDefinitionHooks(
  hooks: SandboxHooks | undefined,
  event: SandboxFileHookEvent,
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
    } catch {
      // swallowed — one bad hook must not break the run
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
      const publicWatchRoot = definition.workspace?.root ?? DEFAULT_WORKSPACE_ROOT
      let baseSha = ''
      try {
        const shaRes = await handle.process.exec('git rev-parse HEAD', {
          cwd: publicWatchRoot,
        })
        if (shaRes.exitCode === 0) baseSha = shaRes.stdout.trim()
      } catch {
        // non-git workspace / exec rejects → baseSha stays '' (accessors fall back)
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
      if (workspacePersistenceOptions) {
        await restoreWorkspacePersistence({
          handle,
          persistence,
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
      const runtime = getSandboxRuntime(ctx, { optional: true })
      const enqueueWorkspacePersistence = (
        event: SandboxFileEvent,
      ): void => {
        if (!workspacePersistenceOptions) return
        pendingWorkspacePersistence.push(
          checkpointWorkspacePersistenceEvent(
            {
              handle,
              persistence,
              options: workspacePersistenceOptions,
              runId: ctx.runId,
              threadId: ctx.threadId,
            },
            event,
          ).catch((error) => {
            workspacePersistenceErrors.push(error)
          }),
        )
      }
      if (fe.enabled) {
        const persistenceSharesPublicRoot =
          workspacePersistenceOptions?.root === publicWatchRoot
        watchers.push(
          await watchWorkspace(handle, {
            root: publicWatchRoot,
            onEvent: (event: SandboxFileEvent) => {
              const enriched = buildFileHookEvent(
                handle,
                publicWatchRoot,
                baseSha,
                event,
              )
              void dispatchDefinitionHooks(hooks, enriched)
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
                    .catch(() => undefined),
                )
              }
            },
            ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
          }),
        )
      }
      if (
        workspacePersistenceOptions &&
        (!fe.enabled || workspacePersistenceOptions.root !== publicWatchRoot)
      ) {
        watchers.push(
          await watchWorkspace(handle, {
            root: workspacePersistenceOptions.root,
            onEvent: enqueueWorkspacePersistence,
            ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
          }),
        )
      }

      runState.set(ctx, {
        handle,
        ensureCtx,
        pendingDiffs,
        pendingWorkspacePersistence,
        workspacePersistenceErrors,
        watchers,
        ...(workspacePersistenceOptions ? { workspacePersistenceOptions } : {}),
      })
    },

    async onFinish(ctx) {
      const state = runState.get(ctx)
      if (!state) return
      const { handle, ensureCtx } = state

      await Promise.all(state.watchers.map((watcher) => watcher.stop()))
      await Promise.allSettled(state.pendingDiffs)
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

      await Promise.all(state.watchers.map((watcher) => watcher.stop()))
      await Promise.allSettled(state.pendingDiffs)
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

      await Promise.all(state.watchers.map((watcher) => watcher.stop()))
      await Promise.allSettled(state.pendingDiffs)
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
