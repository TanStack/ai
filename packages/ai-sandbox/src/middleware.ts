import {
  defineChatMiddleware,
  provideDetachableRun,
  provideRunDetached,
  wasCancelRequested,
} from '@tanstack/ai'
import { InMemoryLockStore, LocksCapability } from '@tanstack/ai/locks'
import {
  getPendingTurn,
  getRunDisconnect,
  getSandboxRuntime,
} from '@tanstack/ai/adapter-internals'
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
import { resolveAllSecrets, resolveSecret } from './secrets'
import {
  createToolHistoryRecorder,
  stripObservedToolCalls,
} from './tool-history'
import { watchWorkspace } from './watch'
import { DEFAULT_WORKSPACE_ROOT } from './bootstrap'
import { resolveHarnessCwd } from './harness-cwd'
import { ensureSandboxWithOutcome } from './sandbox'
import {
  restoreSandboxFiles,
  captureSandboxFiles,
  captureSandboxArtifacts,
  resolveSandboxSnapshotPolicy,
} from './snapshots'
import type { SandboxSnapshotPolicy } from './snapshots'
import type {
  SandboxCheckpointStore,
  SandboxCheckpointWriterLease,
} from './checkpoint-store'
import { SandboxCheckpointError } from './checkpoint-store'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { LockStore } from '@tanstack/ai/locks'
import type {
  AbortInfo,
  ChatMiddlewareContext,
  DefinedChatMiddleware,
  ModelMessage,
  RunStore,
  SandboxFileEvent,
  SandboxFileHookEvent,
} from '@tanstack/ai'
import type {
  SandboxDurabilityOptions,
  SandboxRunDurability,
} from './durability'
import type { SandboxInstanceStore } from './instance-store'
import type { ToolHistoryRecorder } from './tool-history'
import type { SandboxHandle } from './contracts'
import type {
  SandboxDefinition,
  SandboxEnsureContext,
  SandboxHooks,
} from './sandbox'
import type { SandboxWatchHandle } from './watch'

/** Per-request state we need to carry from `setup` to the terminal hooks. */
interface SandboxRunState {
  snapshotLease?: SandboxCheckpointWriterLease
  snapshotRenewal?: ReturnType<typeof setTimeout>
  snapshotRenewTask?: Promise<void>
  snapshotCaptureTask?: Promise<void>
  snapshotRenewalGeneration: number
  snapshotStop?: Promise<void>
  /** A detached or paused run cannot later publish portable state. */
  snapshotClosed?: boolean
  snapshotLost?: Error
  snapshotCleaned?: boolean
  snapshotConfig?: NonNullable<SandboxMiddlewareOptions['snapshots']>
  snapshotPolicy?: SandboxSnapshotPolicy
  snapshotRuntime?: {
    persistence: NonNullable<
      SandboxMiddlewareOptions['snapshots']
    >['persistence']
    completion: { waitForRunCompletion: () => Promise<void> }
  }
  /**
     * OPTIONAL because the state is registered BEFORE `definition.ensure()` is
     * awaited, and `ensure` is the slowest thing in the whole run — cloning a repo
     * into a fresh sandbox is minutes wide. That window is where the most common
     * disconnect of all lands (a user starts a run and switches away while the UI
     * still says "starting the sandbox"), so it is the one window the teardown and
     * disconnect hooks most need to be able to act in. Registering only after the
     * handle exists left exactly that window uncovered.
     *
     * Nothing the disconnect path does needs the handle: `detachedSince` and
     * `sandboxKey` come from `ensureCtx`, which is built before `ensure` is called.
     * Only `onFinish`'s snapshot needs it, and that cannot run before `setup` has
     * completed.
     */
  handle?: SandboxHandle
  privateHandle?: boolean
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
  /**
     * Records the harness's own tool calls into the transcript, so a finished run
     * restores its tool cards from the message store instead of only from the (live,
     * rejoin-only) delivery log. See `./tool-history`.
     */
  toolHistory: ToolHistoryRecorder
}

const runState = new WeakMap<object, SandboxRunState>()

function stopSnapshotLease(
  state: SandboxRunState,
  options: { closePortable?: boolean } = {},
): Promise<void> {
  if (options.closePortable) state.snapshotClosed = true
  if (state.snapshotStop) return state.snapshotStop
  if (state.snapshotCleaned) return Promise.resolve()
  state.snapshotCleaned = true
  state.snapshotRenewalGeneration++
  if (state.snapshotRenewal !== undefined) clearTimeout(state.snapshotRenewal)
  state.snapshotRenewal = undefined
  const renewTask = state.snapshotRenewTask
  const captureTask = state.snapshotCaptureTask
  const lease = state.snapshotLease
  state.snapshotLease = undefined
  state.snapshotStop = (async () => {
    await renewTask?.catch(() => {})
    await captureTask?.catch(() => {})
    await lease?.release()
  })()
  return state.snapshotStop
}

function startSnapshotRenewal(state: SandboxRunState): void {
  const lease = state.snapshotLease
  if (!lease) return
  const schedule = (): void => {
    const generation = state.snapshotRenewalGeneration
    state.snapshotRenewal = setTimeout(() => {
      void (async (): Promise<void> => {
        state.snapshotRenewal = undefined
        const isStaleSnapshotRenewal =
          state.snapshotCleaned ||
          generation !== state.snapshotRenewalGeneration
        if (isStaleSnapshotRenewal) return
        const renewal = Promise.resolve().then(async (): Promise<void> => {
          await lease.renew()
        })
        state.snapshotRenewTask = renewal
        try {
          await renewal
        } catch (error) {
          state.snapshotLost =
            error instanceof Error ? error : new Error(String(error))
        } finally {
          if (state.snapshotRenewTask === renewal)
            state.snapshotRenewTask = undefined
        }
        if (state.snapshotLost) await stopSnapshotLease(state).catch(() => {})
        else {
          const shouldRescheduleSnapshotRenewal =
            !state.snapshotCleaned &&
            generation === state.snapshotRenewalGeneration
          if (shouldRescheduleSnapshotRenewal) schedule()
        }
      })()
    }, lease.renewAfterMs)
  }
  schedule()
}

/**
 * Stop the watcher and drain any in-flight `diff()` promises before teardown,
 * so the final file's diff isn't dropped when a run finishes/aborts/errors
 * mid-computation. The `pendingDiffs` await is the load-bearing line — without
 * it a deferred diff resolves after the run is gone and its chunk is lost.
 */
async function drainWatcher(
  state: SandboxRunState,
  phase: 'finish' | 'pause' | 'abort' | 'error',
): Promise<void> {
  try {
    await state.watcher?.stop()
  } catch (error) {
    state.logger?.warn('sandbox watcher stop failed', { phase, error })
  }
  await Promise.allSettled(state.pendingDiffs)
  if (state.watcher) state.logger?.sandbox('sandbox watcher stopped', { phase })
}

function canPublishPortableSnapshot(
  state: SandboxRunState,
  lease: SandboxCheckpointWriterLease,
): boolean {
  if (state.snapshotLost) throw state.snapshotLost
  return (
    !state.snapshotClosed &&
    !state.snapshotCleaned &&
    state.snapshotLease === lease
  )
}

/**
 * Record the two facts a later attach and the reaper both need, then publish the
 * detach verdict core reads.
 *
 * Shared by the DISCONNECT subscriber registered in `setup` (the run is still
 * going — the normal case) and `onAbort`'s detach branch (the run is being torn
 * down while detachable), so the two can never write a different shape of detach.
 *
 * GUARDED, and reports failure rather than throwing. `update` is a documented
 * no-op for an unknown runId, so a vanished record does not turn teardown into a
 * throw; a genuinely rejecting store is the caller's to react to — `onAbort` falls
 * through to destroying the sandbox, because a DESTROYED sandbox beats an
 * unreachable one, while the disconnect subscriber has nothing to fall back to
 * (the run is alive and still using the sandbox) and simply leaves the verdict
 * unpublished.
 *
 * The verdict is published ONLY on success. Publishing it after a failed record
 * write would leave core holding the log open for a takeover that can never be
 * found, since nothing in the store points at the run.
 */
async function recordDetach(
  definition: SandboxDefinition,
  state: SandboxRunState,
  durability: SandboxRunDurability,
  ctx: ChatMiddlewareContext,
  phase: 'disconnect' | 'abort',
): Promise<boolean> {
  try {
    await durability.runs.update(ctx.runId, {
      detachedSince: Date.now(),
      sandboxKey: definition.key(state.ensureCtx),
    })
  } catch (error) {
    state.logger?.warn('sandbox detach record write failed', {
      runId: ctx.runId,
      phase,
      error,
    })
    return false
  }
  provideRunDetached(ctx, true)
  return true
}

/**
 * Whether an out-of-band cancel has been recorded for this run, in EITHER band.
 * A user pressing Stop and a user closing the tab produce the IDENTICAL
 * connection close, so intent is never inferred from the disconnect itself: it
 * arrives in-process (the abort reason carried the cancel sentinel) or durably
 * (another host recorded it on the run record).
 */
async function cancelIntent(
  durability: SandboxRunDurability | undefined,
  runId: string,
  inProcess: boolean,
): Promise<boolean> {
  if (inProcess) return true
  if (durability === undefined) return false
  return wasCancelRequested(durability.runs, runId)
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
  snapshots?: {
    persistence: {
      stores: {
        messages: {
          loadThread: (threadId: string) => Promise<ReadonlyArray<ModelMessage>>
        }
        artifacts: {
          listForThread: (threadId: string) => Promise<
            ReadonlyArray<{
              artifactId: string
              runId: string
              threadId: string
              blobKey?: string
              name: string
              mimeType: string
              size: number
              createdAt: number
            }>
          >
        }
        blobs: {
          get: (key: string) => Promise<{
            arrayBuffer: () => Promise<ArrayBuffer>
          } | null>
          head: (key: string) => Promise<unknown>
          put: (key: string, body: Uint8Array) => Promise<unknown>
        }
      }
    }
    checkpoints: SandboxCheckpointStore
    policy?: SandboxSnapshotPolicy
  }
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
  durability?: SandboxDurabilityOptions<TOffset>
}

/**
 * Resolve the ensure seams. Precedence is explicit option → capability bus →
 * (in `ensure`) the in-memory fallback. The option wins because it is visible
 * at the call site; the bus remains for platform/framework injection.
 */
function buildEnsureCtx(
  ctx: ChatMiddlewareContext,
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
    adapterName: ctx.provider,
  }
}

type SnapshotConfig = NonNullable<SandboxMiddlewareOptions['snapshots']>
type SnapshotRuntime = NonNullable<SandboxRunState['snapshotRuntime']>

async function acquireSnapshotResources(
  ctx: ChatMiddlewareContext,
  definition: SandboxDefinition,
  options: Pick<SandboxMiddlewareOptions, 'snapshots'> | undefined,
): Promise<{
  snapshotConfig?: SnapshotConfig
  snapshotPolicy?: SandboxSnapshotPolicy
  snapshotRuntime?: SnapshotRuntime
  snapshotLease?: SandboxCheckpointWriterLease
}> {
  const snapshotConfig = options?.snapshots
  const snapshotWorkspaceHash = definition.workspace
    ? computeWorkspaceHash(definition.workspace)
    : undefined
  const snapshotPolicy = snapshotConfig
    ? resolveSandboxSnapshotPolicy(snapshotConfig.policy, snapshotWorkspaceHash)
    : undefined
  if (!snapshotConfig) return { snapshotConfig, snapshotPolicy }
  const lacksSnapshotStores =
    !snapshotConfig.persistence?.stores?.messages ||
    !snapshotConfig.persistence.stores.artifacts ||
    !snapshotConfig.persistence.stores.blobs
  if (lacksSnapshotStores)
    throw new Error(
      'Sandbox snapshots require persistence stores.messages, stores.artifacts, and stores.blobs',
    )
  const persistenceModule = await import('@tanstack/ai-persistence')
  const persistence = ctx.getOptional(persistenceModule.PersistenceCapability)
  if (persistence === undefined)
    throw new Error(
      'Sandbox snapshots require withPersistence(snapshots.persistence) before withSandbox',
    )
  if (persistence !== snapshotConfig.persistence)
    throw new Error(
      'Sandbox snapshots require the same persistence instance passed to withPersistence',
    )
  const completion = ctx.getOptional(
    persistenceModule.PersistenceCompletionCapability,
  )
  if (!completion)
    throw new Error(
      'Sandbox snapshots require withPersistence before withSandbox',
    )
  return {
    snapshotConfig,
    snapshotPolicy,
    snapshotRuntime: {
      persistence: snapshotConfig.persistence,
      completion,
    },
    snapshotLease: await snapshotConfig.checkpoints.acquireWriter(ctx.threadId),
  }
}

async function precreateDurableRun(
  ctx: ChatMiddlewareContext,
  durability: SandboxRunDurability | undefined,
  logger: InternalLogger | undefined,
): Promise<void> {
  if (durability === undefined) return
  try {
    await durability.runs.createOrResume({
      runId: ctx.runId,
      threadId: ctx.threadId,
      startedAt: Date.now(),
    })
  } catch (error) {
    logger?.warn('sandbox run record pre-create failed', {
      runId: ctx.runId,
      error,
    })
  }

  // STORE THE USER'S TURN NOW, before `ensure` takes minutes. The persistence
  // layer owns WHAT gets stored (see `PendingTurnCapability`).
  try {
    await getPendingTurn(ctx, { optional: true })?.snapshot()
  } catch (error) {
    logger?.warn('sandbox pending-turn snapshot failed', {
      runId: ctx.runId,
      error,
    })
  }
}

function logSnapshotReleaseFailure(
  state: SandboxRunState,
  ctx: ChatMiddlewareContext,
  error: unknown,
): void {
  state.logger?.warn('sandbox snapshot writer release failed', {
    runId: ctx.runId,
    phase: 'disconnect',
    error,
  })
}

async function handleSandboxDisconnect(
  definition: SandboxDefinition,
  state: SandboxRunState,
  durability: SandboxRunDurability,
  ctx: ChatMiddlewareContext,
): Promise<void> {
  const snapshotStop = stopSnapshotLease(state, {
    closePortable: true,
  })
  void snapshotStop.catch(() => {})
  // BOOKKEEPING ONLY — the run is still executing. Deliberately absent:
  // `drainWatcher` and `definition.destroy`. Both belong to the terminal hooks.
  if (await cancelIntent(durability, ctx.runId, false)) {
    await snapshotStop.catch((error: unknown) => {
      logSnapshotReleaseFailure(state, ctx, error)
    })
    return
  }
  if (await recordDetach(definition, state, durability, ctx, 'disconnect')) {
    try {
      await snapshotStop
    } catch (error) {
      logSnapshotReleaseFailure(state, ctx, error)
    }
    state.logger?.sandbox(
      'sandbox run detached on disconnect; the run continues',
      { runId: ctx.runId },
    )
  } else {
    await snapshotStop.catch((error: unknown) => {
      logSnapshotReleaseFailure(state, ctx, error)
    })
  }
}

function subscribeDisconnectDetach(
  ctx: ChatMiddlewareContext,
  definition: SandboxDefinition,
  state: SandboxRunState,
  durability: SandboxRunDurability | undefined,
): void {
  const shouldKeepAttached =
    durability === undefined || !durability.detachOnDisconnect
  if (shouldKeepAttached) return
  getRunDisconnect(ctx, { optional: true })?.subscribe(async () => {
    await handleSandboxDisconnect(definition, state, durability, ctx)
  })
}

async function restoreCheckpointFilesIfNeeded(
  ctx: ChatMiddlewareContext,
  definition: SandboxDefinition,
  handle: SandboxHandle,
  snapshotConfig: SnapshotConfig | undefined,
  snapshotPolicy: SandboxSnapshotPolicy | undefined,
  outcome: 'resumed' | 'native-restored' | 'created',
): Promise<void> {
  const shouldSkipSnapshot = !snapshotConfig || outcome === 'resumed'
  if (shouldSkipSnapshot) return
  const head = await snapshotConfig.checkpoints.getHead(ctx.threadId)
  if (!head) return
  const checkpoint = await snapshotConfig.checkpoints.get(head)
  if (!checkpoint)
    throw new SandboxCheckpointError(
      'SANDBOX_SNAPSHOT_CHECKPOINT_NOT_FOUND',
      `Checkpoint '${head}' was not found`,
    )
  await restoreSandboxFiles(
    handle,
    {
      blobs: snapshotConfig.persistence.stores.blobs,
      workspaceRoot: definition.workspace?.root ?? DEFAULT_WORKSPACE_ROOT,
    },
    checkpoint,
    snapshotPolicy,
  )
}

async function ensureHandleAndRestore(
  ctx: ChatMiddlewareContext,
  definition: SandboxDefinition,
  ensureCtx: SandboxEnsureContext,
  snapshot: {
    snapshotConfig?: SnapshotConfig
    snapshotPolicy?: SandboxSnapshotPolicy
  },
  state: SandboxRunState,
): Promise<SandboxHandle> {
  const { snapshotConfig, snapshotPolicy } = snapshot
  let outcome: 'resumed' | 'native-restored' | 'created' = 'created'
  let handle: SandboxHandle
  try {
    if (snapshotConfig)
      ({ handle, outcome } = await ensureSandboxWithOutcome(
        definition,
        ensureCtx,
      ))
    else handle = await definition.ensure(ensureCtx)
    state.handle = handle
    state.privateHandle = snapshotConfig ? outcome !== 'resumed' : true
    await restoreCheckpointFilesIfNeeded(
      ctx,
      definition,
      handle,
      snapshotConfig,
      snapshotPolicy,
      outcome,
    )
  } catch (error) {
    await stopSnapshotLease(state).catch(() => {})
    const hasPrivateHandle = state.handle && state.privateHandle
    if (hasPrivateHandle) await definition.destroy(ensureCtx).catch(() => {})
    throw error
  }
  return handle
}

function warnIfInMemoryLocks(
  durability: SandboxRunDurability | undefined,
  ensureCtx: SandboxEnsureContext,
  logger: InternalLogger | undefined,
  runId: string,
): void {
  const isInMemoryDurable =
    durability !== undefined &&
    (ensureCtx.locks === undefined ||
      ensureCtx.locks instanceof InMemoryLockStore)
  if (isInMemoryDurable) {
    logger?.warn(
      'sandbox durability is wired over an InMemoryLockStore: run claims are ' +
        'serialized within this process only and the lease never signals loss, ' +
        'so two hosts can drive one run and duplicate its event log. Use a ' +
        'distributed LockStore via withLocks for any multi-replica deploy.',
      { runId },
    )
  }
}

async function captureGitBaseline(
  handle: SandboxHandle,
  watchRoot: string,
  logger: InternalLogger | undefined,
): Promise<string> {
  try {
    const shaRes = await handle.process.exec('git rev-parse HEAD', {
      cwd: watchRoot,
    })
    if (shaRes.exitCode === 0) {
      const baseSha = shaRes.stdout.trim()
      logger?.sandbox('sandbox git baseline captured', {
        root: watchRoot,
        baseSha,
      })
      return baseSha
    }
    logger?.sandbox('sandbox git baseline unavailable (non-zero exit)', {
      root: watchRoot,
      exitCode: shaRes.exitCode,
      stderr: shaRes.stderr,
    })
  } catch (error) {
    logger?.warn('sandbox git baseline capture failed', {
      root: watchRoot,
      error,
    })
  }
  return ''
}

function provideWorkspaceProjectionIfAny(
  ctx: ChatMiddlewareContext,
  definition: SandboxDefinition,
  handle: SandboxHandle,
): void {
  const workspace = definition.workspace
  if (workspace === undefined) return
  const virtualRoot = workspace.root ?? DEFAULT_WORKSPACE_ROOT
  const root = resolveHarnessCwd(handle, virtualRoot)
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
    ...(workspace.scripts !== undefined ? { scripts: workspace.scripts } : {}),
  })
}

function emitWatchedFileEvent(
  event: SandboxFileEvent,
  input: {
    handle: SandboxHandle
    watchRoot: string
    baseSha: string
    hooks: SandboxHooks | undefined
    /** Logger captured at setup, so terminal hooks can log watcher teardown. */
    logger: InternalLogger | undefined
    runtime: ReturnType<typeof getSandboxRuntime>
    pendingDiffs: Array<Promise<void>>
    diff: boolean
  },
): void {
  const enriched = buildFileHookEvent(
    input.handle,
    input.watchRoot,
    input.baseSha,
    event,
    input.logger,
  )
  void dispatchDefinitionHooks(input.hooks, enriched, input.logger)
  input.runtime?.emit(enriched)
  if (!input.diff) return
  input.pendingDiffs.push(
    enriched
      .diff()
      .then((diff) => {
        input.runtime?.emitFileDiff({ path: event.path, diff })
      })
      .catch((error: unknown) => {
        input.logger?.warn('sandbox file diff emit failed', {
          path: event.path,
          error,
        })
      }),
  )
}

async function startFileWatcher(input: {
  handle: SandboxHandle
  definition: SandboxDefinition
  ctx: ChatMiddlewareContext
  state: SandboxRunState
  runtime: ReturnType<typeof getSandboxRuntime>
  logger: InternalLogger | undefined
  watchRoot: string
  baseSha: string
}): Promise<void> {
  const hooks = input.definition.hooks
  await hooks?.onReady?.(input.handle)
  const fe = resolveFileEvents(input.definition.fileEvents)
  if (!fe.enabled) return
  const pendingDiffs = input.state.pendingDiffs
  const watcher = await watchWorkspace(input.handle, {
    onEvent: (event: SandboxFileEvent) => {
      emitWatchedFileEvent(event, {
        handle: input.handle,
        watchRoot: input.watchRoot,
        baseSha: input.baseSha,
        hooks,
        logger: input.logger,
        runtime: input.runtime,
        pendingDiffs,
        diff: fe.diff,
      })
    },
    // Watch the SAME root the enrichment layer relativizes against.
    root: input.watchRoot,
    ...(input.ctx.signal !== undefined ? { signal: input.ctx.signal } : {}),
    ...(input.logger !== undefined ? { logger: input.logger } : {}),
  })
  input.logger?.sandbox('sandbox watcher started', {
    root: input.watchRoot,
    diff: fe.diff,
  })
  input.state.watcher = watcher
}

async function attachSandboxToRun(input: {
  ctx: ChatMiddlewareContext
  definition: SandboxDefinition
  ensureCtx: SandboxEnsureContext
  handle: SandboxHandle
  state: SandboxRunState
  durability: SandboxRunDurability | undefined
  runtime: ReturnType<typeof getSandboxRuntime>
  logger: InternalLogger | undefined
}): Promise<void> {
  const {
    ctx,
    definition,
    ensureCtx,
    handle,
    state,
    durability,
    runtime,
    logger,
  } = input
  try {
    provideSandbox(ctx, handle)
    if (definition.policy) provideSandboxPolicy(ctx, definition.policy)
    warnIfInMemoryLocks(durability, ensureCtx, logger, ctx.runId)
    const watchRoot = definition.workspace?.root ?? DEFAULT_WORKSPACE_ROOT
    const baseSha = await captureGitBaseline(handle, watchRoot, logger)
    provideWorkspaceProjectionIfAny(ctx, definition, handle)
    await startFileWatcher({
      handle,
      definition,
      ctx,
      state,
      runtime,
      logger,
      watchRoot,
      baseSha,
    })
  } catch (error) {
    await drainWatcher(state, 'error')
    await stopSnapshotLease(state).catch(() => {})
    if (state.privateHandle) await definition.destroy(ensureCtx).catch(() => {})
    throw error
  }
}

function snapshotWorkspaceRoot(definition: SandboxDefinition): string {
  return definition.workspace?.root ?? DEFAULT_WORKSPACE_ROOT
}

function snapshotResolvedSecrets(
  definition: SandboxDefinition,
): Record<string, string> {
  return definition.workspace?.secrets !== undefined
    ? resolveAllSecrets(definition.workspace.secrets)
    : {}
}

async function publishPortableSnapshot(
  ctx: ChatMiddlewareContext,
  definition: SandboxDefinition,
  state: SandboxRunState,
  handle: SandboxHandle | undefined,
): Promise<void> {
  const config = state.snapshotConfig
  const runtime = state.snapshotRuntime
  const lease = state.snapshotLease
  if (state.snapshotLost && (!config || !runtime || !handle || !lease)) {
    throw state.snapshotLost
  }
  if (
    config === undefined ||
    runtime === undefined ||
    handle === undefined ||
    lease === undefined
  ) {
    return
  }
  if (!canPublishPortableSnapshot(state, lease)) return

  await runtime.completion.waitForRunCompletion()
  if (!canPublishPortableSnapshot(state, lease)) return

  const conversation = await runtime.persistence.stores.messages.loadThread(
    ctx.threadId,
  )
  if (!canPublishPortableSnapshot(state, lease)) return

  const files = await captureSandboxFiles(
    handle,
    {
      blobs: config.persistence.stores.blobs,
      workspaceRoot: snapshotWorkspaceRoot(definition),
    },
    state.snapshotPolicy,
    snapshotResolvedSecrets(definition),
  )
  if (!canPublishPortableSnapshot(state, lease)) return

  const artifacts = await captureSandboxArtifacts(
    {
      blobs: config.persistence.stores.blobs,
      artifacts: config.persistence.stores.artifacts,
    },
    ctx.threadId,
    snapshotResolvedSecrets(definition),
  )
  if (!canPublishPortableSnapshot(state, lease)) return

  const parentCheckpointId = await config.checkpoints.getHead(ctx.threadId)
  if (!canPublishPortableSnapshot(state, lease)) return

  try {
    await config.checkpoints.append({
      checkpoint: {
        id: `checkpoint-${ctx.runId}`,
        threadId: ctx.threadId,
        parentCheckpointId,
        createdAt: Date.now(),
        reason: 'automatic',
        sourceRunId: ctx.runId,
        files: files.files,
        conversation,
        artifacts,
      },
      expectedHeadId: parentCheckpointId,
      writer: lease,
    })
  } catch (error) {
    if (state.snapshotLost) throw state.snapshotLost
    throw error
  }
  if (state.snapshotLost) throw state.snapshotLost
}

async function captureAfterRunNativeSnapshot(
  ctx: ChatMiddlewareContext,
  definition: SandboxDefinition,
  handle: SandboxHandle | undefined,
  ensureCtx: SandboxEnsureContext,
): Promise<void> {
  const lifecycle = definition.lifecycle
  if (
    lifecycle?.snapshot === 'after-run' &&
    handle?.capabilities.snapshots &&
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
}

async function destroySandboxIfComplete(
  definition: SandboxDefinition,
  ensureCtx: SandboxEnsureContext,
): Promise<void> {
  if (!definition.lifecycle?.destroyOnComplete) return
  await definition.destroy(ensureCtx)
  await definition.hooks?.onDestroy?.()
}

async function destroyAfterFinishFailure(
  definition: SandboxDefinition,
  state: SandboxRunState,
  ensureCtx: SandboxEnsureContext,
  ctx: ChatMiddlewareContext,
): Promise<void> {
  try {
    await destroySandboxIfComplete(definition, ensureCtx)
  } catch (cleanupError) {
    state.logger?.warn('sandbox destroy after terminal failure failed', {
      runId: ctx.runId,
      phase: 'finish',
      error: cleanupError,
    })
  }
}

async function finishSnapshotCleanup(
  state: SandboxRunState,
  ctx: ChatMiddlewareContext,
  primaryError: unknown,
): Promise<void> {
  let snapshotCleanupError: unknown
  try {
    await stopSnapshotLease(state, { closePortable: true })
  } catch (error) {
    snapshotCleanupError = error
  }
  if (primaryError !== undefined) {
    if (snapshotCleanupError !== undefined)
      state.logger?.warn('sandbox snapshot writer release failed', {
        runId: ctx.runId,
        phase: 'finish',
        error: snapshotCleanupError,
      })
    throw primaryError
  }
  if (snapshotCleanupError !== undefined) throw snapshotCleanupError
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
    optionalRequires: [SandboxInstanceStoreCapability, LocksCapability],

    async setup(ctx) {
      const ensureCtx = buildEnsureCtx(ctx, options)
      const snapshot = await acquireSnapshotResources(ctx, definition, options)

      const durability = resolveSandboxDurability<TOffset>(options)
      if (durability !== undefined) {
        provideSandboxDurability(ctx, durability)
        provideDetachableRun(ctx, true)
      }

      const runtime = getSandboxRuntime(ctx, { optional: true })
      const logger = runtime?.logger

      // REGISTER THE RUN STATE NOW — before `definition.ensure()`, not merely
      // before the end of `setup`.
      const state: SandboxRunState = {
        ensureCtx,
        snapshotRenewalGeneration: 0,
        pendingDiffs: [],
        toolHistory: createToolHistoryRecorder(),
        ...(logger ? { logger } : {}),
        ...(durability ? { durability } : {}),
      }
      runState.set(ctx, state)
      if (snapshot.snapshotLease) {
        state.snapshotLease = snapshot.snapshotLease
        startSnapshotRenewal(state)
      }

      await precreateDurableRun(ctx, durability, logger)
      subscribeDisconnectDetach(ctx, definition, state, durability)
      const handle = await ensureHandleAndRestore(
        ctx,
        definition,
        ensureCtx,
        snapshot,
        state,
      )
      // MUTATE, don't re-`set`: a disconnect that landed during `ensure` already
      // captured this object.
      state.handle = handle
      if (snapshot.snapshotConfig) {
        state.snapshotConfig = snapshot.snapshotConfig
        state.snapshotPolicy = snapshot.snapshotPolicy
        state.snapshotRuntime = snapshot.snapshotRuntime
      }
      await attachSandboxToRun({
        ctx,
        definition,
        ensureCtx,
        handle,
        state,
        durability,
        runtime,
        logger,
      })
    },

    onConfig(_ctx, config) {
      const messages = stripObservedToolCalls(config.messages)
      if (messages.length === config.messages.length) return
      return { messages }
    },

    onIteration(ctx) {
      runState.get(ctx)?.toolHistory.reconcile(ctx)
    },

    // Record the harness's own tool calls as transcript messages. Observe only:
    // returning nothing passes every chunk through untouched.
    async onChunk(ctx, chunk) {
      const state = runState.get(ctx)
      state?.toolHistory.observe(chunk, ctx)
      const isInterruptFinish =
        state &&
        chunk.type === 'RUN_FINISHED' &&
        chunk.outcome?.type === 'interrupt'
      if (isInterruptFinish) {
        await drainWatcher(state, 'pause')
        await stopSnapshotLease(state, { closePortable: true })
      }
    },

    async onFinish(ctx) {
      const state = runState.get(ctx)
      if (!state) return
      const { handle, ensureCtx } = state

      state.toolHistory.reconcile(ctx)

      await drainWatcher(state, 'finish')

      let primaryError: unknown
      try {
        const snapshotCaptureTask = Promise.resolve().then(() =>
          publishPortableSnapshot(ctx, definition, state, handle),
        )
        state.snapshotCaptureTask = snapshotCaptureTask
        try {
          await snapshotCaptureTask
        } finally {
          if (state.snapshotCaptureTask === snapshotCaptureTask)
            state.snapshotCaptureTask = undefined
        }

        // `handle` is absent only if `setup` never got past `definition.ensure`, in
        // which case there is no sandbox to snapshot.
        await captureAfterRunNativeSnapshot(ctx, definition, handle, ensureCtx)
        await destroySandboxIfComplete(definition, ensureCtx)
      } catch (error) {
        primaryError = error
        await destroyAfterFinishFailure(definition, state, ensureCtx, ctx)
      }

      await finishSnapshotCleanup(state, ctx, primaryError)
    },

    async onAbort(ctx, info: AbortInfo) {
      const state = runState.get(ctx)
      if (!state) return

      await drainWatcher(state, 'abort')
      let releaseError: unknown
      try {
        await stopSnapshotLease(state, { closePortable: true })
      } catch (error) {
        releaseError = error
      }

      const durability = state.durability
      const cancelled = await cancelIntent(
        durability,
        ctx.runId,
        info.cancelRequested === true,
      )

      const shouldDetachOnDisconnect =
        durability !== undefined && !cancelled && durability.detachOnDisconnect
      if (shouldDetachOnDisconnect) {
        if (await recordDetach(definition, state, durability, ctx, 'abort')) {
          if (releaseError) throw releaseError
          return
        }
        await definition.destroy(state.ensureCtx)
        await definition.hooks?.onDestroy?.()
        if (releaseError) throw releaseError
        return
      }

      await definition.destroy(state.ensureCtx)
      await definition.hooks?.onDestroy?.()
      if (releaseError) throw releaseError
    },

    async onError(ctx, info) {
      const state = runState.get(ctx)
      if (!state) return

      await drainWatcher(state, 'error')
      let releaseError: unknown
      try {
        await stopSnapshotLease(state)
      } catch (error) {
        releaseError = error
      }
      await definition.hooks?.onError?.(info.error)

      // On failure, only tear down when the lifecycle says so; otherwise leave
      // the sandbox for a resumed retry.
      if (definition.lifecycle?.destroyOnComplete) {
        await definition.destroy(state.ensureCtx)
        await definition.hooks?.onDestroy?.()
      }
      if (releaseError) throw releaseError
    },
  })
}
