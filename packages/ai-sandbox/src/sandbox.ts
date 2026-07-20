/**
 * `defineSandbox()` returns a LAZY controller — it never creates a sandbox at
 * definition time. `withSandbox()` (and advanced users) call `ensure()` to
 * resume-or-create, following: provider.resume → provider.restoreSnapshot →
 * create + bootstrap. The controller folds provider/workspace/policy/lifecycle
 * into a stable instance key and coordinates through the (optional) lock +
 * sandbox stores.
 */
import { bootstrapWorkspace } from './bootstrap'
import { resolveAllSecrets } from './secrets'
import { computeSandboxKey } from './key'
import { InMemoryLockStore, InMemorySandboxStore } from './store'
import type { SandboxFileHookEvent } from '@tanstack/ai'
import type { SandboxHandle, SandboxProvider } from './contracts'
import type { SandboxKeyInput } from './key'
import type { LockStore, SandboxStore } from './store'
import type { SandboxPolicy } from './policy'
import type { WorkspaceDefinition } from './workspace'
import type { WorkspacePersistenceOptions } from './workspace-persistence-types'

/**
 * Sandbox-scoped hooks declared on `defineSandbox`. File hooks fire for every
 * create/change/delete during a chat run; lifecycle hooks fire server-side.
 */
export interface SandboxHooks {
  onFile?: (e: SandboxFileHookEvent) => void | Promise<void>
  onFileCreate?: (e: SandboxFileHookEvent) => void | Promise<void>
  onFileChange?: (e: SandboxFileHookEvent) => void | Promise<void>
  onFileDelete?: (e: SandboxFileHookEvent) => void | Promise<void>
  onReady?: (handle: SandboxHandle) => void | Promise<void>
  onError?: (err: unknown) => void | Promise<void>
  onDestroy?: () => void | Promise<void>
}

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
  /**
   * Maximum age of a sandbox record before it is discarded and re-created
   * instead of resumed. Accepts `'<n>h'` (hours) or `'<n>m'` (minutes),
   * e.g. `'2h'` or `'30m'`.
   */
  snapshotMaxAge?: string
}

export interface SandboxConfig {
  id: string
  provider: SandboxProvider
  workspace?: WorkspaceDefinition
  persistence?: {
    workspace?: boolean | WorkspacePersistenceOptions
  }
  policy?: SandboxPolicy
  lifecycle?: SandboxLifecycle
  /** Sandbox-scoped file/lifecycle hooks. */
  hooks?: SandboxHooks
  /** Watch the workspace for file events (default true). `false` disables the
   *  watcher; `{ diff: true }` also emits a per-file `sandbox.file.diff` event. */
  fileEvents?: boolean | { diff?: boolean }
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
  readonly persistence?: {
    workspace?: boolean | WorkspacePersistenceOptions
  }
  readonly policy?: SandboxPolicy
  readonly lifecycle?: SandboxLifecycle
  /** Sandbox-scoped file/lifecycle hooks. */
  readonly hooks?: SandboxHooks
  /** Watch the workspace for file events (default true). `false` disables the
   *  watcher; `{ diff: true }` also emits a per-file `sandbox.file.diff` event. */
  readonly fileEvents?: boolean | { diff?: boolean }
  /** Compound instance key for a given run context. */
  key: (ctx: SandboxEnsureContext) => string
  /** Resume-or-create the sandbox for this thread/run. */
  ensure: (ctx: SandboxEnsureContext) => Promise<SandboxHandle>
  /** Tear down the sandbox recorded for this key. */
  destroy: (ctx: SandboxEnsureContext) => Promise<void>
}

/**
 * Parse a human-readable duration string into milliseconds.
 * Supports `'<n>h'` (hours) and `'<n>m'` (minutes).
 * Returns `undefined` when the input is undefined or the format is unrecognised.
 */
function parseMaxAgeMs(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const hourMatch = /^(\d+)h$/.exec(value)
  if (hourMatch) return Number(hourMatch[1]) * 60 * 60 * 1000
  const minuteMatch = /^(\d+)m$/.exec(value)
  if (minuteMatch) return Number(minuteMatch[1]) * 60 * 1000
  return undefined
}

// Process-lifetime fallbacks shared across all definitions so concurrent
// ensures for the same key serialize even without an injected store/lock.
const fallbackStore = new InMemorySandboxStore()
const fallbackLocks = new InMemoryLockStore()

export function defineSandbox(config: SandboxConfig): SandboxDefinition {
  const keyInputFor = (ctx: SandboxEnsureContext): SandboxKeyInput => ({
    threadId:
      config.lifecycle?.reuse === 'none'
        ? `${ctx.threadId}:${ctx.runId}`
        : ctx.threadId,
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

    return locks.withLock(`sandbox:${key}`, async (lockSignal) => {
      const combined = combineAbortSignals(lockSignal, ctx.signal)
      const signal = combined.signal
      try {
        const effectiveSnapshot: SnapshotStrategy =
          config.lifecycle?.snapshot ??
          (caps.snapshots ? 'after-setup' : 'none')
        const maxAgeMs = parseMaxAgeMs(config.lifecycle?.snapshotMaxAge)

        const existing = await store.get(key)
        signal.throwIfAborted()
        if (existing) {
          // Check whether the record has exceeded snapshotMaxAge; if so,
          // discard and fall through to a fresh create.
          const tooOld =
            maxAgeMs !== undefined && Date.now() - existing.updatedAt > maxAgeMs

          if (!tooOld) {
            // 1) Try to reconnect to the still-running sandbox.
            const resumed = await config.provider.resume({
              id: existing.providerSandboxId,
              signal,
            })
            if (resumed) {
              signal.throwIfAborted()
              await store.upsert({
                ...existing,
                latestRunId: ctx.runId,
                updatedAt: Date.now(),
              })
              return resumed
            }
            // 2) Else restore from the latest snapshot, if supported.
            if (
              existing.latestSnapshotId &&
              caps.snapshots &&
              config.provider.restoreSnapshot
            ) {
              const restored = await config.provider.restoreSnapshot({
                snapshotId: existing.latestSnapshotId,
                workspace: config.workspace,
                policy: config.policy,
                env:
                  config.workspace?.secrets !== undefined
                    ? resolveAllSecrets(config.workspace.secrets)
                    : undefined,
                signal,
              })
              signal.throwIfAborted()
              await store.upsert({
                ...existing,
                providerSandboxId: restored.id,
                latestRunId: ctx.runId,
                updatedAt: Date.now(),
              })
              return restored
            }
          }
          // 3) Else fall through and re-create under the same identity
          //    (capability-aware degradation for ephemeral-disk providers, or
          //    snapshotMaxAge TTL exceeded).
        }

        const created = await config.provider.create({
          // Deterministic id so consumers can reconstruct the provider sandbox
          // address from run context (not just from the store record).
          id: key,
          workspace: config.workspace,
          policy: config.policy,
          env:
            config.workspace?.secrets !== undefined
              ? resolveAllSecrets(config.workspace.secrets)
              : undefined,
          signal,
        })
        await assertLeaseOwnedOrDestroy(signal, created)

        if (config.workspace) {
          try {
            await bootstrapWorkspace(created, config.workspace, {
              signal,
            })
          } catch (error) {
            // Bootstrap failed after the sandbox was created but before it was
            // recorded — destroy the orphan so a failed/retried run doesn't leak
            // a (billed) sandbox, then surface the original error.
            try {
              await created.destroy()
            } catch (cleanupError) {
              throw new AggregateError(
                [error, cleanupError],
                'Sandbox bootstrap and orphan cleanup failed',
              )
            }
            throw error
          }
        }

        let latestSnapshotId: string | undefined
        if (
          effectiveSnapshot === 'after-setup' &&
          caps.snapshots &&
          created.snapshot
        ) {
          latestSnapshotId = (await created.snapshot('after-setup')).id
        }

        await assertLeaseOwnedOrDestroy(signal, created)
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
      } finally {
        combined.dispose()
      }
    })
  }

  const destroy = async (ctx: SandboxEnsureContext): Promise<void> => {
    const store = ctx.store ?? fallbackStore
    const key = computeSandboxKey(keyInputFor(ctx))
    const existing = await store.get(key)
    if (!existing) return
    await config.provider.destroy({
      id: existing.providerSandboxId,
      signal: ctx.signal,
    })
    await store.delete(key)
  }

  return {
    id: config.id,
    provider: config.provider,
    workspace: config.workspace,
    persistence: config.persistence,
    policy: config.policy,
    lifecycle: config.lifecycle,
    hooks: config.hooks,
    fileEvents: config.fileEvents,
    key: (ctx) => computeSandboxKey(keyInputFor(ctx)),
    ensure,
    destroy,
  }
}

function combineAbortSignals(
  leaseSignal: AbortSignal,
  callerSignal: AbortSignal | undefined,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const signals = callerSignal ? [leaseSignal, callerSignal] : [leaseSignal]
  const listeners = new Map<AbortSignal, () => void>()

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    const onAbort = () => controller.abort(signal.reason)
    listeners.set(signal, onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
  }

  return {
    signal: controller.signal,
    dispose: () => {
      for (const [signal, listener] of listeners) {
        signal.removeEventListener('abort', listener)
      }
    },
  }
}

async function assertLeaseOwnedOrDestroy(
  signal: AbortSignal,
  handle: SandboxHandle,
): Promise<void> {
  try {
    signal.throwIfAborted()
  } catch (error) {
    try {
      await handle.destroy()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Sandbox lease loss and orphan cleanup failed',
      )
    }
    throw error
  }
}
