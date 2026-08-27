import { createCapability } from './capabilities'
import type { TokenUsage } from '../../../types'

/** A terminal run status: no further events will be appended. */
export type TerminalRunStatus = 'completed' | 'failed' | 'aborted'

/**
 * Lifecycle status of one run (one agent turn within a conversation).
 *
 * `interrupted` is a human-in-the-loop PAUSE that interrupt-resume continues
 * from — it is deliberately NOT terminal, and must never be conflated with
 * `aborted` (an explicit cancellation).
 *
 * The two are now written by different hooks and cannot be confused:
 *
 * - `'interrupted'` is written ONLY by `withPersistence`'s `onInterrupt`, and
 *   carries NO `finishedAt` (a non-terminal status has not finished).
 * - `'aborted'` is written by `withPersistence`'s `onAbort`, and only for an
 *   abort that is an explicit cancel or that is ending the run for good.
 * - A mere client disconnect on a run with durable storage wired writes
 *   NEITHER: the record stays `'running'` and gains `detachedSince`, because the
 *   agent is still running and a later attach can take it over.
 *
 * Intent is never inferred from the abort itself — see `RUN_CANCEL_REASON` and
 * `requestRunCancel` in `../cancel`.
 */
export type RunStatus = 'running' | 'interrupted' | TerminalRunStatus

const TERMINAL: Record<TerminalRunStatus, true> = {
  completed: true,
  failed: true,
  aborted: true,
}

// Same exhaustiveness trick over the FULL union, for {@link isRunStatus}.
const ALL_STATUSES: Record<RunStatus, true> = {
  running: true,
  interrupted: true,
  completed: true,
  failed: true,
  aborted: true,
}

/**
 * Whether `value` is a {@link RunStatus} — the guard a backend validates a row
 * with at DESERIALIZATION.
 *
 * `RunStatus` is a compile-time claim about a storage column. A row arrives as
 * JSON out of D1, a Durable Object, or Postgres, and nothing in the type system
 * checked what that column actually held, so a `RunStore` implementation should
 * run its row's `status` through this before handing the record on. The readers
 * downstream act DESTRUCTIVELY on the answer — `@tanstack/ai-sandbox`'s journal
 * sweep DELETES the journal of a run it believes terminal — so a row that lies
 * about its status is not a display bug.
 */
export function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && Object.hasOwn(ALL_STATUSES, value)
}

/**
 * Whether `status` means no further events will be appended. Narrows, so a
 * caller inside the guard can pass `status` where a {@link TerminalRunStatus}
 * is required without a cast.
 *
 * `Object.hasOwn`, never `in`: `in` walks the prototype chain, so a row whose
 * `status` column held `'toString'` or `'constructor'` would be reported
 * terminal. `status` is TYPED `RunStatus`, but every value reaching here comes
 * off a user-implemented {@link RunStore} and the type is only a claim (see
 * {@link isRunStatus}). A false `true` deletes a live run's journal
 * (`@tanstack/ai-sandbox`'s journal sweep), fails its attach as `'terminal-run'`
 * (`attach-preflight`), and refuses to drive it (`stream-to-response.ts`).
 */
export function isTerminalRunStatus(
  status: RunStatus,
): status is TerminalRunStatus {
  return Object.hasOwn(TERMINAL, status)
}

/**
 * Why a run failed.
 *
 * A bare message is an LLM provider's prose: it changes between model
 * versions and cannot be branched on. `code` is what a consumer switches over
 * to decide whether to retry, escalate, or surface a specific UI.
 */
export interface RunError {
  message: string
  /** Stable, machine-branchable classification, when the provider supplies one. */
  code?: string
}

/** Durable bookkeeping for a single run. */
export interface RunRecord {
  runId: string
  /**
   * Conversation this run belongs to — the `Scope.threadId`.
   *
   * Generation jobs (a one-shot `generate()` with no conversation) must not
   * reuse this record by faking `threadId = requestId`; they need a separate
   * job store. `withGenerationPersistence` currently does exactly that and
   * labels itself a stopgap — do not copy it.
   */
  threadId: string
  status: RunStatus
  startedAt: number
  finishedAt?: number
  error?: RunError
  usage?: TokenUsage
  /**
   * Compound sandbox key this run was bound to, when it ran in a sandbox.
   * Recorded so a future reclaimer can identify the sandbox to tear down
   * without re-deriving the key. Written by `withSandbox`'s detach path
   * (`onAbort` in `@tanstack/ai-sandbox`'s `middleware.ts`) at the same time as
   * `detachedSince`, when a disconnect leaves the run detached rather than
   * destroying the sandbox. A backend must round-trip this field — see
   * `listReclaimable` below for who eventually reads it.
   */
  sandboxKey?: string
  /**
   * Epoch ms when the last viewer detached; absent while someone is attached.
   * Written by `withSandbox`'s detach path (`onAbort` in `@tanstack/ai-sandbox`'s
   * `middleware.ts`) alongside `sandboxKey`, when a disconnect leaves the
   * agent running rather than tearing the sandbox down. A backend must
   * round-trip this field: `listReclaimable` depends on it, and
   * `@tanstack/ai-sandbox`'s `reapDetachedRuns` sweeps the candidates it
   * surfaces (see that method's doc comment).
   */
  detachedSince?: number
  /**
   * Set by an explicit out-of-band cancel, to be distinguished from a mere
   * client disconnect (the two produce an identical TCP close, so intent is not
   * inferable from the disconnect).
   *
   * Written by `requestRunCancel` and read by `wasCancelRequested` (both in
   * `../cancel`). Deliberately NOT a status: recording intent is not the same as
   * the run having stopped, and only the driver knows when it has.
   */
  cancelRequested?: boolean
  /**
   * Monotonic fencing token for the run's driver. Bumped by each host that
   * successfully claims the run (see `withRunClaim` in `@tanstack/ai-sandbox`),
   * so a superseded host can discover it lost by comparing the stored value
   * against the one it holds.
   *
   * A lock alone cannot provide this: it tells the winner it won, but gives a
   * loser nothing to read. Absent on a run that was never claimed.
   */
  driverEpoch?: number
}

/**
 * Durable store for run lifecycle records.
 *
 * REQUIRED: `createOrResume`, `update`, `get`, `findActiveRun`. Every backend
 * must implement all four — they are what the persistence middleware calls
 * unconditionally. `findActiveRun` is required rather than feature-detected
 * because a backend that has not implemented it is indistinguishable from one
 * whose answer is legitimately `null`, so reconnect would silently do nothing
 * instead of failing at build time. It was optional for exactly one release
 * cycle and cost precisely that.
 *
 * OPTIONAL: `listByThread`, `listReclaimable`. Each serves one higher-level
 * feature (thread history, reclaim reaping) and callers feature-detect them,
 * degrading gracefully when a backend omits them.
 */
export interface RunStore {
  /**
   * Create a run record, or return the existing one unchanged if `runId` is
   * already present.
   *
   * INVARIANT (idempotency): an existing record is returned **unchanged** and
   * the passed `threadId`/`startedAt`/`status` are ignored. This is what makes
   * resuming a run safe. `status` defaults to `'running'` on first creation.
   */
  createOrResume: (
    input: Pick<RunRecord, 'runId' | 'threadId' | 'startedAt'> & {
      status?: RunStatus
    },
  ) => Promise<RunRecord>
  /**
   * Patch a record's mutable fields.
   *
   * INVARIANT: updating an unknown `runId` is a **no-op** — it must not throw
   * and must not create a record.
   */
  update: (
    runId: string,
    patch: Partial<
      Pick<
        RunRecord,
        | 'status'
        | 'finishedAt'
        | 'error'
        | 'usage'
        | 'sandboxKey'
        | 'detachedSince'
        | 'cancelRequested'
        | 'driverEpoch'
      >
    >,
  ) => Promise<void>
  /** Current record, or null when unknown. */
  get: (runId: string) => Promise<RunRecord | null>
  /**
   * Every run in a conversation, ascending by `startedAt`. OPTIONAL: only
   * needed to render a thread's past agent activity. Consumers feature-detect.
   */
  listByThread?: (threadId: string) => Promise<Array<RunRecord>>
  /**
   * Runs that may be reclaimed: ALL THREE of `status === 'running'`,
   * `detachedSince` is set, and `detachedSince <= now - ttlMs`. The cutoff is
   * **inclusive** — a run detached at exactly `now - ttlMs` IS reclaimable.
   *
   * OPTIONAL: only needed by a reaper. Consumers feature-detect.
   *
   * `detachedSince` is populated by `withSandbox`'s detach path (see
   * {@link RunRecord.detachedSince}). The sweep over the candidates this
   * surfaces is `@tanstack/ai-sandbox`'s `reapDetachedRuns`: it finalizes a run
   * whose agent already finished, expires one past its TTL, and reclaims the
   * sandbox. That is a function, not a scheduler — the application invokes it
   * (cron, queue, `alarm()`, `waitUntil`) — and a backend that omits this
   * method cannot be reaped at all.
   */
  listReclaimable?: (opts: {
    now: number
    ttlMs: number
  }) => Promise<Array<RunRecord>>
  /**
   * The most recent `'running'` run for `threadId`, or `null` if none is active.
   *
   * REQUIRED. This resolves "does this thread have a live run to attach to?"
   * from the STABLE thread id, which is the durable basis for reconnecting a
   * client (a reload, or the same thread opened on another device) — independent
   * of the ephemeral run id, which a single turn may mint several of. When more
   * than one run is `'running'`, the one with the greatest `startedAt` wins.
   *
   * A backend that stubs this to `null` turns reconnect off silently, because
   * `null` is also the correct answer for an idle thread. A backend with no run
   * lifecycle at all should omit the whole `runs` store instead — capability
   * tiers belong at the store level, not the method level.
   */
  findActiveRun: (threadId: string) => Promise<RunRecord | null>
}

/**
 * Type a {@link RunStore} implementation inline: pass the object and get
 * autocomplete plus contract checking with no separate annotation. Mirrors
 * `defineLock` / `defineSandboxInstanceStore`.
 *
 * The generic return preserves the argument's own type, so an optional method
 * the implementation actually provides stays known-present on the result
 * instead of collapsing back to `| undefined` on the interface.
 */
export function defineRunStore<const T extends RunStore>(store: T): T {
  return store
}

/**
 * Whether the current run can be DETACHED rather than destroyed when its client
 * disconnects — `true` only when some middleware has both a {@link RunStore} and
 * a durable event log wired (`withSandbox`'s `runs` + `durability.adapter`).
 *
 * Lives in core for the same reason `LockStore` does: it is a coordination fact
 * that two consumer packages must agree on, and neither may depend on the other.
 * `@tanstack/ai-sandbox` provides it; `@tanstack/ai-persistence` reads it to
 * decide whether an abort is terminal (`'aborted'`) or a detach (write nothing).
 * A persistence → sandbox import would be a layering inversion.
 *
 * Consumers read it with `{ optional: true }`: absent means "not detachable",
 * which is every app that has not wired durability.
 *
 * Typed `true`, not `boolean`: ABSENCE is the negative, so a published `false`
 * has no meaning — and a consumer that tests PRESENCE rather than the value
 * would read one as "detachable". Narrowing the payload makes that
 * unrepresentable instead of merely undocumented.
 */
export const DetachableRunCapability =
  createCapability<true>()('detachable-run')

/**
 * Destructured accessors: `getDetachableRun(ctx, { optional: true })` /
 * `provideDetachableRun(ctx, true)`.
 */
export const [getDetachableRun, provideDetachableRun] = DetachableRunCapability

/**
 * Whether this run's teardown DID detach — the disconnect was survived, the
 * agent is still working, and a later attach can take the run over.
 *
 * The past-tense counterpart of {@link DetachableRunCapability}, and the two must
 * not be confused:
 *
 * - **detachABLE** is published at `setup`, and only says a disconnect *may* be
 *   survived (a `RunStore` and a durable log are wired).
 * - **detachED** is published on the ABORT path, by the middleware that actually
 *   makes the call — `withSandbox`'s `onAbort`, which is the only actor that has
 *   resolved BOTH out-of-band cancel bands (`AbortInfo.cancelRequested` and
 *   `wasCancelRequested` on the record) and `detachOnDisconnect`. An explicit
 *   cancel, a non-detachable disconnect, an error, and a normal finish all leave
 *   it unpublished.
 *
 * Its consumer is the durable DELIVERY sink in `stream-to-response.ts`: a
 * detached run's log must stay OPEN and un-terminalized so the takeover can
 * continue it (see `wasRunDetached` in `../../../delivery-detach`). Reading it
 * is safe and race-free only because a `for await` over the chat stream awaits
 * the generator's `return()` — and therefore the whole `onAbort` chain — before
 * the sink's own `finally` runs.
 *
 * Read with `{ optional: true }`: absent means "not detached", which is every
 * other exit path and every app that has not wired durability.
 *
 * Typed `true`, not `boolean`, for the same reason as
 * {@link DetachableRunCapability}: absence is the only negative, so publishing
 * `false` must not be representable.
 */
export const RunDetachedCapability = createCapability<true>()('run-detached')

/**
 * Destructured accessors: `getRunDetached(ctx, { optional: true })` /
 * `provideRunDetached(ctx, true)`.
 */
export const [getRunDetached, provideRunDetached] = RunDetachedCapability

/** In-memory {@link RunStore}. Single process only. */
export class InMemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>()

  createOrResume(
    input: Pick<RunRecord, 'runId' | 'threadId' | 'startedAt'> & {
      status?: RunStatus
    },
  ): Promise<RunRecord> {
    const existing = this.runs.get(input.runId)
    if (existing) return Promise.resolve(existing)
    const record: RunRecord = {
      runId: input.runId,
      threadId: input.threadId,
      status: input.status ?? 'running',
      startedAt: input.startedAt,
    }
    this.runs.set(record.runId, record)
    return Promise.resolve(record)
  }

  update(
    runId: string,
    patch: Partial<
      Pick<
        RunRecord,
        | 'status'
        | 'finishedAt'
        | 'error'
        | 'usage'
        | 'sandboxKey'
        | 'detachedSince'
        | 'cancelRequested'
        | 'driverEpoch'
      >
    >,
  ): Promise<void> {
    const existing = this.runs.get(runId)
    if (existing) this.runs.set(runId, { ...existing, ...patch })
    return Promise.resolve()
  }

  /** Current record, or null when unknown. */
  get(runId: string): Promise<RunRecord | null> {
    return Promise.resolve(this.runs.get(runId) ?? null)
  }

  listByThread(threadId: string): Promise<Array<RunRecord>> {
    const matching = [...this.runs.values()]
      .filter((run) => run.threadId === threadId)
      .sort((a, b) => a.startedAt - b.startedAt)
    return Promise.resolve(matching)
  }

  listReclaimable(opts: {
    now: number
    ttlMs: number
  }): Promise<Array<RunRecord>> {
    const cutoff = opts.now - opts.ttlMs
    const matching = [...this.runs.values()].filter(
      (run) =>
        run.status === 'running' &&
        run.detachedSince !== undefined &&
        run.detachedSince <= cutoff,
    )
    return Promise.resolve(matching)
  }

  findActiveRun(threadId: string): Promise<RunRecord | null> {
    let active: RunRecord | null = null
    const runs = this.runs.values()
    for (const run of runs) {
      const isInactiveRun =
        run.threadId !== threadId || run.status !== 'running'
      if (isInactiveRun) continue
      const isNewerRun = active === null || run.startedAt > active.startedAt
      if (isNewerRun) active = run
    }
    return Promise.resolve(active)
  }
}
