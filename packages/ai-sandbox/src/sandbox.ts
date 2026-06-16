/**
 * `defineSandbox()` returns a LAZY controller — it never creates a sandbox at
 * definition time. `withSandbox()` (and advanced users) call `ensure()` to
 * resume-or-create, following: provider.resume → provider.restoreSnapshot →
 * create + bootstrap. The controller folds provider/workspace/policy/lifecycle
 * into a stable instance key and coordinates through the (optional) lock +
 * sandbox stores.
 */
import { bootstrapWorkspace } from './bootstrap'
import { computeSandboxKey } from './key'
import { InMemoryLockStore, InMemorySandboxStore } from './store'
import type { SandboxHandle, SandboxProvider } from './contracts'
import type { SandboxKeyInput } from './key'
import type { LockStore, SandboxStore } from './store'
import type { SandboxPolicy } from './policy'
import type { WorkspaceDefinition } from './workspace'

export type ReuseStrategy = 'thread' | 'none'
export type SnapshotStrategy = 'after-setup' | 'after-run' | 'none'

export interface SandboxLifecycle {
  /** `'thread'` resumes one sandbox per thread; `'none'` is fresh per run. */
  reuse?: ReuseStrategy
  /** When to snapshot (provider-permitting). */
  snapshot?: SnapshotStrategy
  /** Hint for how long a provider should keep the sandbox warm between runs. */
  keepAlive?: string
  /** Destroy the sandbox after the run completes. */
  destroyOnComplete?: boolean
}

export interface SandboxConfig {
  id: string
  provider: SandboxProvider
  workspace?: WorkspaceDefinition
  policy?: SandboxPolicy
  lifecycle?: SandboxLifecycle
}

/** Context passed to `ensure()` by `withSandbox` (or advanced callers). */
export interface SandboxEnsureContext {
  threadId: string
  runId: string
  /** Persistence seam; falls back to an in-memory store when absent. */
  store?: SandboxStore
  /** Lock seam; falls back to an in-memory lock when absent. */
  locks?: LockStore
  tenant?: { userId?: string; orgId?: string }
  signal?: AbortSignal
}

export interface SandboxDefinition {
  readonly id: string
  readonly provider: SandboxProvider
  readonly workspace?: WorkspaceDefinition
  readonly policy?: SandboxPolicy
  readonly lifecycle?: SandboxLifecycle
  /** Compound instance key for a given run context. */
  key: (ctx: SandboxEnsureContext) => string
  /** Resume-or-create the sandbox for this thread/run. */
  ensure: (ctx: SandboxEnsureContext) => Promise<SandboxHandle>
  /** Tear down the sandbox recorded for this key. */
  destroy: (ctx: SandboxEnsureContext) => Promise<void>
}

// Process-lifetime fallbacks shared across all definitions so concurrent
// ensures for the same key serialize even without an injected store/lock.
const fallbackStore = new InMemorySandboxStore()
const fallbackLocks = new InMemoryLockStore()

export function defineSandbox(config: SandboxConfig): SandboxDefinition {
  const keyInputFor = (ctx: SandboxEnsureContext): SandboxKeyInput => ({
    threadId: config.lifecycle?.reuse === 'none' ? `${ctx.threadId}:${ctx.runId}` : ctx.threadId,
    sandboxId: config.id,
    providerName: config.provider.name,
    workspace: config.workspace,
    tenant: ctx.tenant,
  })

  const ensure = async (ctx: SandboxEnsureContext): Promise<SandboxHandle> => {
    const store = ctx.store ?? fallbackStore
    const locks = ctx.locks ?? fallbackLocks
    const key = computeSandboxKey(keyInputFor(ctx))
    const caps = config.provider.capabilities()

    return locks.withLock(`sandbox:${key}`, async () => {
      const existing = await store.get(key)
      if (existing) {
        // 1) Try to reconnect to the still-running sandbox.
        const resumed = await config.provider.resume({
          id: existing.providerSandboxId,
          signal: ctx.signal,
        })
        if (resumed) {
          await store.upsert({ ...existing, latestRunId: ctx.runId, updatedAt: Date.now() })
          return resumed
        }
        // 2) Else restore from the latest snapshot, if supported.
        if (existing.latestSnapshotId && caps.snapshots && config.provider.restoreSnapshot) {
          const restored = await config.provider.restoreSnapshot({
            snapshotId: existing.latestSnapshotId,
            workspace: config.workspace,
            policy: config.policy,
            env: config.workspace?.secrets,
            signal: ctx.signal,
          })
          await store.upsert({
            ...existing,
            providerSandboxId: restored.id,
            latestRunId: ctx.runId,
            updatedAt: Date.now(),
          })
          return restored
        }
        // 3) Else fall through and re-create under the same identity
        //    (capability-aware degradation for ephemeral-disk providers).
      }

      const created = await config.provider.create({
        workspace: config.workspace,
        policy: config.policy,
        env: config.workspace?.secrets,
        signal: ctx.signal,
      })

      if (config.workspace) {
        await bootstrapWorkspace(created, config.workspace, { signal: ctx.signal })
      }

      let latestSnapshotId: string | undefined
      if (config.lifecycle?.snapshot === 'after-setup' && caps.snapshots && created.snapshot) {
        latestSnapshotId = (await created.snapshot('after-setup')).id
      }

      await store.upsert({
        key,
        provider: config.provider.name,
        providerSandboxId: created.id,
        latestSnapshotId,
        threadId: ctx.threadId,
        latestRunId: ctx.runId,
        updatedAt: Date.now(),
      })
      return created
    })
  }

  const destroy = async (ctx: SandboxEnsureContext): Promise<void> => {
    const store = ctx.store ?? fallbackStore
    const key = computeSandboxKey(keyInputFor(ctx))
    const existing = await store.get(key)
    if (!existing) return
    await config.provider.destroy({ id: existing.providerSandboxId, signal: ctx.signal })
    await store.delete(key)
  }

  return {
    id: config.id,
    provider: config.provider,
    workspace: config.workspace,
    policy: config.policy,
    lifecycle: config.lifecycle,
    key: (ctx) => computeSandboxKey(keyInputFor(ctx)),
    ensure,
    destroy,
  }
}
