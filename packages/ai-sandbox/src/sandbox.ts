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
import { InMemoryLockStore } from '@tanstack/ai/locks'
import type { LockStore } from '@tanstack/ai/locks'
import type { SandboxFileHookEvent } from '@tanstack/ai'
import { InMemorySandboxInstanceStore } from './instance-store'
import type {
  SandboxInstanceRecord,
  SandboxInstanceStore,
} from './instance-store'
import type {
  SandboxCapabilities,
  SandboxHandle,
  SandboxProvider,
} from './contracts'
import type { SandboxKeyInput } from './key'
import type { SandboxPolicy } from './policy'
import type { WorkspaceDefinition } from './workspace'

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
  store?: SandboxInstanceStore
  /** Lock seam; falls back to an in-memory lock when absent. */
  locks?: LockStore
  tenant?: { userId?: string; orgId?: string }
  signal?: AbortSignal
  /** Harness adapter name (`grok-build`, `claude-code`, `codex`, `opencode`). Optional. */
  adapterName?: string
}

export interface SandboxDefinition {
  readonly id: string
  readonly provider: SandboxProvider
  readonly workspace?: WorkspaceDefinition
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
  /** Resume an existing sandbox only. Never creates or restores a sandbox. */
  ensureExisting: (ctx: SandboxEnsureContext) => Promise<SandboxHandle | null>
  /** Tear down the sandbox recorded for this key. */
  destroy: (ctx: SandboxEnsureContext) => Promise<void>
}

export type SandboxEnsureOutcome = {
  handle: SandboxHandle
  outcome: 'resumed' | 'native-restored' | 'created'
}

const outcomeEnsure = new WeakMap<
  object,
  (ctx: SandboxEnsureContext) => Promise<SandboxEnsureOutcome>
>()

interface SandboxEnsureExistingStage {
  key: string
  workspace: WorkspaceDefinition | undefined
  resolvedSecrets: Readonly<Record<string, string>> | undefined
  snapshotMaxAge: string | undefined
  resume: SandboxProvider['resume']
}

const existingEnsure = new WeakMap<
  object,
  (
    ctx: SandboxEnsureContext,
    stage?: SandboxEnsureExistingStage,
  ) => Promise<SandboxHandle | null>
>()

export function stageEnsureExistingSandbox(
  definition: SandboxDefinition,
): (
  ctx: SandboxEnsureContext,
  stage: SandboxEnsureExistingStage,
) => Promise<SandboxHandle | null> {
  const fn = existingEnsure.get(definition)
  if (fn) return (ctx, stage) => fn(ctx, stage)
  const ensureExisting = definition.ensureExisting.bind(definition)
  return (ctx) => ensureExisting(ctx)
}

export function ensureSandboxWithOutcome(
  definition: SandboxDefinition,
  ctx: SandboxEnsureContext,
) {
  const fn = outcomeEnsure.get(definition)
  if (!fn)
    throw new Error(
      'Sandbox snapshot mode requires a definition created by defineSandbox()',
    )
  return fn(ctx)
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

/**
 * Bound for the unfenced teardown `destroy` call (see `destroy` below). Long
 * enough that a slow provider API still completes, short enough that a wedged
 * one cannot pin the process forever.
 */
const DESTROY_TIMEOUT_MS = 60 * 1000

// Process-lifetime fallbacks shared across all definitions so concurrent
// ensures for the same key serialize even without an injected store/lock.
const fallbackStore = new InMemorySandboxInstanceStore()
const fallbackLocks = new InMemoryLockStore()

/**
 * Put workspace secrets onto a live handle. Resume and snapshot restore skip
 * bootstrap, so this is the only path that re-injects them after reconnect.
 * Create injects secrets via `provider.create({ env })`, but resume/restore
 * return a handle whose process env is empty unless we set it here. sbx in
 * particular has no Docker Env on resume, so this is the only way secrets
 * come back for that provider.
 */
async function applyWorkspaceSecrets(
  handle: SandboxHandle,
  workspace: WorkspaceDefinition | undefined,
  stagedSecrets?: Readonly<Record<string, string>>,
): Promise<void> {
  if (workspace?.secrets === undefined) return
  const resolved = stagedSecrets ?? resolveAllSecrets(workspace.secrets)
  if (Object.keys(resolved).length === 0) return
  await handle.env.set(resolved)
}

function workspaceCreateEnv(
  workspace: WorkspaceDefinition | undefined,
): Record<string, string> | undefined {
  return workspace?.secrets !== undefined
    ? resolveAllSecrets(workspace.secrets)
    : undefined
}

async function tryReuseExistingSandbox(input: {
  existing: SandboxInstanceRecord
  maxAgeMs: number | undefined
  config: SandboxConfig
  ctx: SandboxEnsureContext
  store: SandboxInstanceStore
  caps: SandboxCapabilities
}): Promise<SandboxEnsureOutcome | null> {
  const { existing, maxAgeMs, config, ctx, store, caps } = input
  const tooOld =
    maxAgeMs !== undefined && Date.now() - existing.updatedAt > maxAgeMs
  if (tooOld) return null

  const resumed = await config.provider.resume({
    id: existing.providerSandboxId,
    signal: ctx.signal,
  })
  if (resumed) {
    await applyWorkspaceSecrets(resumed, config.workspace)
    await store.upsert({
      ...existing,
      latestRunId: ctx.runId,
      updatedAt: Date.now(),
    })
    return { handle: resumed, outcome: 'resumed' }
  }
  if (
    existing.latestSnapshotId &&
    caps.snapshots &&
    config.provider.restoreSnapshot
  ) {
    const restored = await config.provider.restoreSnapshot({
      snapshotId: existing.latestSnapshotId,
      workspace: config.workspace,
      policy: config.policy,
      env: workspaceCreateEnv(config.workspace),
      signal: ctx.signal,
    })
    await applyWorkspaceSecrets(restored, config.workspace)
    await store.upsert({
      ...existing,
      providerSandboxId: restored.id,
      latestRunId: ctx.runId,
      updatedAt: Date.now(),
    })
    return { handle: restored, outcome: 'native-restored' }
  }
  return null
}

async function createBootstrappedSandbox(input: {
  key: string
  config: SandboxConfig
  ctx: SandboxEnsureContext
  store: SandboxInstanceStore
  caps: SandboxCapabilities
  effectiveSnapshot: SnapshotStrategy
}): Promise<SandboxEnsureOutcome> {
  const { key, config, ctx, store, caps, effectiveSnapshot } = input
  const created = await config.provider.create({
    id: key,
    workspace: config.workspace,
    policy: config.policy,
    env: workspaceCreateEnv(config.workspace),
    signal: ctx.signal,
    adapterName: ctx.adapterName,
  })

  if (config.workspace) {
    try {
      await bootstrapWorkspace(created, config.workspace, {
        signal: ctx.signal,
      })
    } catch (error) {
      // Bootstrap failed after the sandbox was created but before it was
      // recorded — destroy the orphan so a failed/retried run doesn't leak
      // a (billed) sandbox, then surface the original error.
      await created.destroy().catch(() => {})
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

  await store.upsert({
    key,
    provider: config.provider.name,
    providerSandboxId: created.id,
    latestSnapshotId,
    threadId: ctx.threadId,
    latestRunId: ctx.runId,
    updatedAt: Date.now(),
  })
  return { handle: created, outcome: 'created' }
}

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

  const ensureWithOutcome = async (
    ctx: SandboxEnsureContext,
  ): Promise<SandboxEnsureOutcome> => {
    const store = ctx.store ?? fallbackStore
    const locks = ctx.locks ?? fallbackLocks
    const key = computeSandboxKey(keyInputFor(ctx))
    const caps = config.provider.capabilities()

    return locks.withLock(`sandbox:${key}`, async () => {
      const effectiveSnapshot: SnapshotStrategy =
        config.lifecycle?.snapshot ?? (caps.snapshots ? 'after-setup' : 'none')
      const maxAgeMs = parseMaxAgeMs(config.lifecycle?.snapshotMaxAge)

      const existing = await store.get(key)
      if (existing) {
        // Check whether the record has exceeded snapshotMaxAge; if so,
        // discard and fall through to a fresh create.
        const reused = await tryReuseExistingSandbox({
          existing,
          maxAgeMs,
          config,
          ctx,
          store,
          caps,
        })
        if (reused) return reused
        // Fall through and re-create under the same identity
        // (capability-aware degradation for ephemeral-disk providers, or
        // snapshotMaxAge TTL exceeded).
      }

      // Deterministic id so consumers can reconstruct the provider sandbox
      // address from run context (not just from the store record).
      return createBootstrappedSandbox({
        key,
        config,
        ctx,
        store,
        caps,
        effectiveSnapshot,
      })
    })
  }

  const ensure = async (ctx: SandboxEnsureContext): Promise<SandboxHandle> =>
    (await ensureWithOutcome(ctx)).handle

  const ensureExistingWithStage = async (
    ctx: SandboxEnsureContext,
    stage?: SandboxEnsureExistingStage,
  ): Promise<SandboxHandle | null> => {
    const store = ctx.store ?? fallbackStore
    const locks = ctx.locks ?? fallbackLocks
    const key = stage?.key ?? computeSandboxKey(keyInputFor(ctx))
    const workspace = stage?.workspace ?? config.workspace
    const snapshotMaxAge = stage
      ? stage.snapshotMaxAge
      : config.lifecycle?.snapshotMaxAge
    const resume = stage?.resume ?? config.provider.resume.bind(config.provider)
    return locks.withLock(`sandbox:${key}`, async () => {
      const existing = await store.get(key)
      const maxAgeMs = parseMaxAgeMs(snapshotMaxAge)
      if (
        !existing ||
        (maxAgeMs !== undefined && Date.now() - existing.updatedAt > maxAgeMs)
      )
        return null
      const resumed = await resume({
        id: existing.providerSandboxId,
        signal: ctx.signal,
      })
      if (!resumed) return null
      await applyWorkspaceSecrets(resumed, workspace, stage?.resolvedSecrets)
      await store.upsert({
        ...existing,
        latestRunId: ctx.runId,
        updatedAt: Date.now(),
      })
      return resumed
    })
  }

  const ensureExisting = (
    ctx: SandboxEnsureContext,
  ): Promise<SandboxHandle | null> => ensureExistingWithStage(ctx)

  const destroy = async (ctx: SandboxEnsureContext): Promise<void> => {
    const store = ctx.store ?? fallbackStore
    const key = computeSandboxKey(keyInputFor(ctx))
    const existing = await store.get(key)
    if (!existing) return
    /*
     * TEARDOWN IS DELIBERATELY NOT FENCED BY `ctx.signal`.
     *
     * `destroy` runs on every teardown path INCLUDING the one caused by that
     * very signal aborting, so forwarding it hands the provider a signal that is
     * already aborted: a provider that honors it does nothing and returns
     * successfully, and `store.delete` below then removes the only pointer to a
     * live, billed sandbox. `SandboxInstanceStore` has no `list` (see the note
     * at the top of `reclaim.ts`), so that sandbox is unreachable from then on.
     *
     * Same reasoning as `close()` never being fenced by the run claim (see
     * `fenceDurability` in `claim.ts`): cleanup must outlive whatever cancelled
     * the work. A fresh controller with its own bounded timeout keeps the call
     * from hanging forever without letting the caller's abort cancel it.
     */
    const teardown = new AbortController()
    const timer = setTimeout(() => teardown.abort(), DESTROY_TIMEOUT_MS)
    try {
      await config.provider.destroy({
        id: existing.providerSandboxId,
        signal: teardown.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    await store.delete(key)
  }

  const definition: SandboxDefinition = {
    id: config.id,
    provider: config.provider,
    workspace: config.workspace,
    policy: config.policy,
    lifecycle: config.lifecycle,
    hooks: config.hooks,
    fileEvents: config.fileEvents,
    key: (ctx) => computeSandboxKey(keyInputFor(ctx)),
    ensure,
    ensureExisting,
    destroy,
  }
  outcomeEnsure.set(definition, ensureWithOutcome)
  existingEnsure.set(definition, ensureExistingWithStage)
  return definition
}
