/**
 * `withSandbox(definition)` — the middleware that PROVIDES the
 * {@link SandboxCapability} a harness adapter requires.
 *
 * - `setup`: resume-or-create the sandbox (via the definition's ensure
 *   algorithm), provide the handle, using the optional SandboxStore/Locks
 *   capabilities when a persistence middleware supplied them (in-memory
 *   fallback otherwise).
 * - `onFinish`/`onError`: snapshot (`after-run`) and/or destroy per lifecycle.
 *
 * NOTE: streamed sandbox lifecycle events (sandbox.created, workspace.setup.*)
 * are emitted by the harness adapter's chatStream (which can yield CUSTOM
 * chunks), not from here — middleware setup runs before streaming begins.
 */
import { defineChatMiddleware } from '@tanstack/ai'
import {
  LocksCapability,
  SandboxCapability,
  SandboxStoreCapability,
  provideSandbox,
  provideSandboxPolicy,
} from './capabilities'
import type { ChatMiddlewareContext, DefinedChatMiddleware } from '@tanstack/ai'
import type { SandboxHandle } from './contracts'
import type { SandboxDefinition, SandboxEnsureContext } from './sandbox'

/** Per-request state we need to carry from `setup` to the terminal hooks. */
interface SandboxRunState {
  handle: SandboxHandle
  ensureCtx: SandboxEnsureContext
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

export function withSandbox(
  definition: SandboxDefinition,
): DefinedChatMiddleware<
  unknown,
  readonly [],
  readonly [typeof SandboxCapability]
> {
  return defineChatMiddleware({
    name: 'sandbox',
    provides: [SandboxCapability],
    // SandboxPolicyCapability is provided conditionally (only when the
    // definition has a policy), so it is intentionally NOT declared here —
    // consumers read it via `getOptional`.
    optionalRequires: [SandboxStoreCapability, LocksCapability],

    async setup(ctx) {
      const ensureCtx = buildEnsureCtx(ctx)
      const handle = await definition.ensure(ensureCtx)
      provideSandbox(ctx, handle)
      if (definition.policy) provideSandboxPolicy(ctx, definition.policy)
      runState.set(ctx, { handle, ensureCtx })
    },

    async onFinish(ctx) {
      const state = runState.get(ctx)
      if (!state) return
      const { handle, ensureCtx } = state
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
      }
    },

    async onError(ctx) {
      const state = runState.get(ctx)
      if (!state) return
      // On failure, only tear down when the lifecycle says so; otherwise leave
      // the sandbox for a resumed retry.
      if (definition.lifecycle?.destroyOnComplete) {
        await definition.destroy(state.ensureCtx)
      }
    },
  })
}
