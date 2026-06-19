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
import { ProjectionCapability, provideWorkspaceProjection } from './projection'
import { resolveSecret } from './secrets'
import { watchWorkspace } from './watch'
import { DEFAULT_WORKSPACE_ROOT } from './bootstrap'
import type { AbortInfo, ChatMiddlewareContext, DefinedChatMiddleware, SandboxFileEvent } from '@tanstack/ai'
import type { SandboxHandle } from './contracts'
import type { SandboxDefinition, SandboxEnsureContext, SandboxHooks } from './sandbox'
import type { SandboxWatchHandle } from './watch'

/** Per-request state we need to carry from `setup` to the terminal hooks. */
interface SandboxRunState {
  handle: SandboxHandle
  ensureCtx: SandboxEnsureContext
  watcher?: SandboxWatchHandle
}

const runState = new WeakMap<object, SandboxRunState>()

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

function buildEnsureCtx(ctx: ChatMiddlewareContext): SandboxEnsureContext {
  return {
    threadId: ctx.threadId,
    runId: ctx.runId,
    store: ctx.getOptional(SandboxStoreCapability),
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
  event: SandboxFileEvent,
): Promise<void> {
  if (!hooks) return
  const typed = (
    { create: 'onFileCreate', change: 'onFileChange', delete: 'onFileDelete' } as const
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
      const ensureCtx = buildEnsureCtx(ctx)
      const handle = await definition.ensure(ensureCtx)
      provideSandbox(ctx, handle)
      if (definition.policy) provideSandboxPolicy(ctx, definition.policy)

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
        })
      }

      const hooks = definition.hooks
      await hooks?.onReady?.(handle)

      let watcher: SandboxWatchHandle | undefined
      if (definition.fileEvents !== false) {
        const runtime = getSandboxRuntime(ctx, { optional: true })
        watcher = await watchWorkspace(handle, {
          onEvent: (event: SandboxFileEvent) => {
            void dispatchDefinitionHooks(hooks, event)
            runtime?.emit(event)
          },
          ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
        })
      }

      runState.set(ctx, { handle, ensureCtx, ...(watcher ? { watcher } : {}) })
    },

    async onFinish(ctx) {
      const state = runState.get(ctx)
      if (!state) return
      const { handle, ensureCtx } = state

      await state.watcher?.stop()

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

    async onAbort(ctx, _info: AbortInfo) {
      const state = runState.get(ctx)
      if (!state) return

      await state.watcher?.stop()

      if (definition.lifecycle?.destroyOnComplete) {
        await definition.destroy(state.ensureCtx)
        await definition.hooks?.onDestroy?.()
      }
    },

    async onError(ctx, info) {
      const state = runState.get(ctx)
      if (!state) return

      await state.watcher?.stop()
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
