import { isTerminalRunStatus } from '@tanstack/ai'
import type { LockStore } from '@tanstack/ai/locks'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { RunStore, StreamChunk, StreamDurability } from '@tanstack/ai'

/** Quiescence window before a successor's first append. */
export const /** Quiescence window before a successor's first append. */
DEFAULT_FENCE_QUIET_MS = 5_000

/**
 * Appends a fenced log makes between `driverEpoch` re-reads.
 *
 * Deliberately a COUNT, not an interval: `pipeToRunLog` appends one chunk per
 * call, so this bounds a superseded driver to at most 31 further chunk batches
 * (the bump can land immediately after a check) regardless of how fast the run
 * streams. At 500 chunks/sec that worst case is ~62ms of writes; at 5
 * chunks/sec it is ~6s of writes — either way 31 chunks, never ~1000.
 *
 * The cost of a smaller number is one extra `RunStore.get` per 32 chunks.
 */
export const DEFAULT_EPOCH_RECHECK_APPENDS = 32

/** Probes {@link awaitLogQuiescence} makes before giving up. */
const /** Probes {@link awaitLogQuiescence} makes before giving up. */
MAX_QUIESCENCE_PROBES = 6

/** Lock key for a run's driver. Per-run, so two runs never serialize. */
export function runDriverLockKey(runId: string): string {
  return `run-driver:${runId}`
}

/** The claim was never acquired, so the caller must not drive the run. */
export class RunClaimNotAcquiredError extends Error {
  constructor(
    readonly runId: string,
    readonly reason: 'terminal' | 'unknown' | 'superseded',
  ) {
    super(`run ${runId}: driver claim not acquired (${reason})`)
    this.name = 'RunClaimNotAcquiredError'
  }
}

/** The claim was held and has been superseded; stop writing immediately. */
export class RunClaimLostError extends Error {
  constructor(
    readonly runId: string,
    readonly heldEpoch: number,
    readonly observedEpoch: number | 'lease-lost',
  ) {
    super(
      `run ${runId}: driver claim lost (held epoch ${heldEpoch}, observed ${observedEpoch})`,
    )
    this.name = 'RunClaimLostError'
  }
}

/** A held claim on one run. */
export interface RunClaim {
  runId: string
  /** This driver's fencing token; strictly greater than any predecessor's. */
  epoch: number
  /** Aborts when the lock can no longer guarantee ownership. */
  signal: AbortSignal
}

export interface WithRunClaimOptions {
  runs: RunStore
  locks: LockStore
  runId: string
  /**
     * Quiescence window for {@link awaitLogQuiescence}. Defaults to
     * {@link DEFAULT_FENCE_QUIET_MS}.
     *
     * `withRunClaim` itself does not read this: it has no durability handle. It
     * lives here so a caller assembling a drive passes ONE options object to
     * `withRunClaim`, `awaitLogQuiescence`, and {@link fenceDurability} instead of
     * three that can drift apart.
     */
  fenceQuietMs?: number
  /**
     * Forwarded to {@link fenceDurability}. Defaults to
     * {@link DEFAULT_EPOCH_RECHECK_APPENDS}. Same rationale as `fenceQuietMs`.
     */
  epochRecheckAppends?: number
  logger?: InternalLogger
}

/**
 * Claim exclusive driver rights on `runId` for the duration of `fn`.
 *
 * The ENTIRE body runs inside the lock, so a snapshot taken by `fn` and every
 * append that follows it sit in one critical section.
 *
 * Rejects with {@link RunClaimNotAcquiredError} when the run is unknown or
 * already terminal — a terminal run has nothing left to drive, and bumping its
 * epoch would fence out nobody while confusing an operator reading the record.
 *
 * The epoch is bumped INSIDE the lock and only after those checks pass, so a
 * refused claim leaves `driverEpoch` untouched.
 */
export async function withRunClaim<T>(
  options: WithRunClaimOptions,
  fn: (claim: RunClaim) => Promise<T>,
): Promise<T> {
  const { runs, locks, runId, logger } = options
  return locks.withLock(runDriverLockKey(runId), async (signal) => {
    const record = await runs.get(runId)
    if (record === null) {
      throw new RunClaimNotAcquiredError(runId, 'unknown')
    }
    if (isTerminalRunStatus(record.status)) {
      throw new RunClaimNotAcquiredError(runId, 'terminal')
    }
    /** This driver's fencing token; strictly greater than any predecessor's. */
    const epoch = (record.driverEpoch ?? 0) + 1
    await runs.update(runId, { driverEpoch: epoch })
    logger?.sandbox(`run ${runId}: driver claim acquired at epoch ${epoch}`, {
      runId,
      epoch,
    })
    return fn({ runId, epoch, signal })
  })
}

/**
 * Wait until the stored log stops growing, then answer how many entries it
 * holds.
 *
 * Uses `snapshot()`, never `read()`: `read` tails and only resolves once the log
 * is terminalized or the caller aborts, and a taken-over run's log is open by
 * definition — the host that would have closed it is the host that died.
 *
 * Rejects rather than looping forever. A log that never quiesces means a
 * predecessor is still actively writing, which is a condition to surface, not to
 * append into.
 *
 * This only detects a CONCURRENT predecessor, which means it can only fire when
 * the two drivers are in different processes. Within one process an
 * `InMemoryLockStore` serializes the claims, so the predecessor has already
 * stopped by the time the successor probes.
 */
export async function awaitLogQuiescence<TOffset extends string = string>(
  durability: StreamDurability<TOffset>,
  quietMs: number,
): Promise<number> {
  let previous = (await durability.snapshot()).length
  for (let probe = 0; probe < MAX_QUIESCENCE_PROBES; probe += 1) {
    await sleep(quietMs)
    const current = (await durability.snapshot()).length
    if (current === previous) return current
    previous = current
  }
  throw new Error(
    `journal takeover: the event log never quiesced after ${MAX_QUIESCENCE_PROBES} probes (${previous} entries and still growing); another host is still driving this run`,
  )
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * The one-way "this claim is gone" flag, latched by the first refusal.
 *
 * Keyed by the claim rather than held in one wrapper's closure because a claim
 * has TWO fenced seams — its log ({@link fenceDurability}) and its record
 * ({@link fenceRunStore}) — and a latch per wrapper would let them disagree: a
 * lease that flaps back to `aborted === false`, or an epoch read that fails,
 * would re-open the fence that had not refused yet. Losing a claim is not
 * transient, so one observation must close both.
 *
 * A `WeakMap` and not a field on {@link RunClaim} so the claim stays the plain
 * data structure core's `RunDriverOptions.claim` types it as, and so the latch is
 * collected with the claim.
 */
interface ClaimLatch {
  /** `undefined` while the fence is open; otherwise the refusal to replay. */
  lost: RunClaimLostError | undefined
}

const CLAIM_LATCHES = new WeakMap<RunClaim, ClaimLatch>()

function latchFor(claim: RunClaim): ClaimLatch {
  const existing = CLAIM_LATCHES.get(claim)
  if (existing !== undefined) return existing
  const latch: ClaimLatch = { lost: undefined }
  CLAIM_LATCHES.set(claim, latch)
  return latch
}

/**
 * The I/O-free half of the check: the latch and the lease. Synchronous on
 * purpose — a fenced write must be refused BEFORE anything can half-land.
 */
function claimLostSynchronously(
  claim: RunClaim,
  latch: ClaimLatch,
): RunClaimLostError | undefined {
  if (latch.lost !== undefined) return latch.lost
  if (claim.signal.aborted) {
    latch.lost = new RunClaimLostError(claim.runId, claim.epoch, 'lease-lost')
    return latch.lost
  }
  return undefined
}

/**
 * The other half: re-read `driverEpoch` and refuse once a successor exists.
 *
 * A store failure is NOT treated as loss. The lease is the primary fence and it
 * has not fired, so fencing ourselves out on a store blip would kill a healthy
 * driver — and, for the record fence, would suppress a legitimate terminal write
 * and strand the run at `'running'`, which is worse than the write it prevents.
 */
async function claimLostByEpoch(
  claim: RunClaim,
  latch: ClaimLatch,
  runs: RunStore,
): Promise<RunClaimLostError | undefined> {
  let observed: number | undefined
  try {
    observed = (await runs.get(claim.runId))?.driverEpoch
  } catch {
    return undefined
  }
  if (observed !== undefined && observed > claim.epoch) {
    latch.lost = new RunClaimLostError(claim.runId, claim.epoch, observed)
    return latch.lost
  }
  return undefined
}

/**
 * Wrap a log so every `append` is fenced by `claim`.
 *
 * `append` is the ONLY fenced method, deliberately:
 *
 * - `close()` must never be fenced. It runs on every teardown path including
 *   the teardown caused by losing the claim, and a fenced `close` would leave
 *   the record wedged at `'running'` with every live tailer parked forever (a
 *   `read` only ends when the log closes).
 * - `read` / `snapshot` / `resumeFrom` do not mutate, so a superseded host
 *   reading them is harmless.
 *
 * The lease check is synchronous and happens before any I/O, so a fenced append
 * cannot half-land. The epoch re-check is throttled to `epochRecheckAppends`
 * because it costs a store read and the append path is hot.
 *
 * ONE REFUSAL CLOSES THE FENCE FOR GOOD. The first `append` that is refused —
 * for EITHER cause, lost lease or moved epoch — latches this wrapper shut, and
 * every later `append` refuses immediately without consulting the throttle and
 * without a store read. This is not a nicety:
 *
 * - Losing a claim is not transient. Epochs only move forward and a lease is
 *   never handed back, so a wrapper that has refused once can never legitimately
 *   append again. Re-deciding per append can only produce a WRONG answer.
 * - The throttle makes that wrong answer reachable. A refusal consumes the
 *   re-read budget, so the very next append rides a fresh throttle window and is
 *   NOT re-checked. `pipeToRunLog`'s recovery path appends a `RUN_ERROR` right
 *   after the refusal it is recovering from, and that log belongs to the
 *   SUCCESSOR: a terminal `RUN_ERROR` from a dead host would fail the stream for
 *   every client attached to the live, healthy run.
 * - It is also strictly cheaper: a latched boolean replaces a store read.
 *
 * The latch deliberately does NOT extend to `close()` — see above.
 *
 * PASSES THE OFFSET TYPE THROUGH, rather than collapsing it to `string`. The
 * fence sits mid-chain between a caller's log and `pipeToRunLog`, so widening
 * here would reintroduce the branded-offset wall one layer in: a
 * `StreamDurability<DurableStreamOffset>` would go in and a
 * `StreamDurability<string>` would come out, which is not assignable back to
 * the caller's own type.
 */
export function fenceDurability<TOffset extends string = string>(
  durability: StreamDurability<TOffset>,
  claim: RunClaim,
  options: { runs: RunStore; epochRecheckAppends?: number },
): StreamDurability<TOffset> {
  const recheckAppends = Math.max(
    1,
    Math.trunc(options.epochRecheckAppends ?? DEFAULT_EPOCH_RECHECK_APPENDS),
  )
  let appendsSinceEpochRead = recheckAppends
  // Latched by the FIRST refusal and never cleared, and SHARED with this claim's
  // record fence so the two seams cannot disagree.
  const latch = latchFor(claim)

  async function assertHeld(): Promise<void> {
    // Layer 1 plus the latch: no I/O, so nothing has been written yet, and once
    // refused no throttle and no store read can let a later append through.
    const synchronous = claimLostSynchronously(claim, latch)
    if (synchronous !== undefined) throw synchronous
    if (appendsSinceEpochRead < recheckAppends) {
      appendsSinceEpochRead += 1
      return
    }
    appendsSinceEpochRead = 1
    // Layer 2, throttled because it costs a store read.
    const byEpoch = await claimLostByEpoch(claim, latch, options.runs)
    if (byEpoch !== undefined) throw byEpoch
  }

  return {
    resumeFrom: () => durability.resumeFrom(),
    append: async (chunks: Array<StreamChunk>) => {
      await assertHeld()
      return durability.append(chunks)
    },
    read: (offset, signal) => durability.read(offset, signal),
    close: () => durability.close(),
    snapshot: () => durability.snapshot(),
  }
}

/**
 * Wrap a run store so a TERMINAL record write is fenced by `claim`.
 *
 * The record is the run's other authoritative channel, and the same rule applies
 * to it: a host that has lost its claim must not state that the run is over. It
 * reaches this seam by the most ordinary route — `pipeToRunLog` catches the
 * `RunClaimLostError` its refused append threw, folds it in, and calls
 * `finish(ctx, 'failed', …)` — so fencing the log alone only moves where the harm
 * surfaces. `'completed'` and `'aborted'` arrive the same way (an empty stream
 * that never appended; a lease loss that aborts `claim.signal`, which
 * `pipeToRunLog` reads as an abort before it appends anything), which is why the
 * gate is {@link isTerminalRunStatus} and not "did an append refuse".
 *
 * SUPPRESSED, NOT ATTEMPTED-AND-SWALLOWED, and not thrown either. `update`
 * resolves without writing. `pipeToRunLog` must not reject — `RunController.start`
 * consumes its promise fire-and-forget — and a rejection here would additionally
 * make `finish` report the run through the local rebuilt record as if the store
 * had broken, which is a different and false fact.
 *
 * WHAT IS *NOT* FENCED, deliberately:
 *
 * - **`close()`** is not on this seam at all, and must stay off it: see
 *   {@link fenceDurability}. A wedged `'running'` record with tailers parked
 *   forever is worse than the write being prevented.
 * - **Non-terminal writes pass through**, including `detachedSince` and
 *   `sandboxKey` written by a superseded host. They are stale, but staleness is
 *   not the harm being fixed: none of them can make a live run look finished, so
 *   none can mislead `isTerminalRunStatus`, `findActiveRun`, or the reaper. They
 *   are also self-healing — the successor owns those fields and overwrites them —
 *   whereas over-suppressing strands a record: `createOrResume` is how the row
 *   comes into existence at all, and refusing a non-terminal write on a
 *   mis-observed loss would leave a run with no record to recover from. Suppress
 *   the writes that assert an outcome; let bookkeeping through.
 * - **Reads** (`get`, `listByThread`, `listReclaimable`, `findActiveRun`) do not
 *   mutate, so a superseded host reading them is harmless. `finish`'s terminal
 *   re-read therefore still works and answers with the SUCCESSOR's live record,
 *   which is the truthful thing to resolve with.
 * - **Another run's record.** The fence knows about `claim.runId` only; a write
 *   aimed elsewhere is not this claim's to judge.
 *
 * The OPTIONAL methods (`listByThread`, `listReclaimable`) are forwarded only
 * when the wrapped store actually has them: consumers feature-detect
 * (`store.listReclaimable?.(…)`), so materializing one that delegates to a
 * missing method would turn a graceful degrade into a `TypeError`.
 * `findActiveRun` is required on the contract, so it forwards unconditionally.
 */
export function fenceRunStore(
  runs: RunStore,
  claim: RunClaim,
  options: { logger?: InternalLogger } = {},
): RunStore {
  const latch = latchFor(claim)
  // Bound, not merely captured: the store may be a class instance
  // (`InMemoryRunStore`), whose methods need their receiver.
  const listByThread = runs.listByThread?.bind(runs)
  const listReclaimable = runs.listReclaimable?.bind(runs)

  return {
    createOrResume: (input) => runs.createOrResume(input),
    get: (runId) => runs.get(runId),
    findActiveRun: (threadId) => runs.findActiveRun(threadId),
    update: async (runId, patch) => {
      const status = patch.status
      const isTerminalClaimWrite =
        runId === claim.runId &&
        status !== undefined &&
        isTerminalRunStatus(status)
      if (!isTerminalClaimWrite) {
        return runs.update(runId, patch)
      }
      /** `undefined` while the fence is open; otherwise the refusal to replay. */
      const lost =
        claimLostSynchronously(claim, latch) ??
        (await claimLostByEpoch(claim, latch, runs))
      if (lost === undefined) return runs.update(runId, patch)
      try {
        options.logger?.sandbox(
          `run ${runId}: suppressed a terminal '${status}' record write from a superseded driver`,
          { runId, status, heldEpoch: claim.epoch, error: lost },
        )
      } catch {
        // Intentionally empty: there is no second channel to report on.
      }
      return undefined
    },
    ...(listByThread === undefined ? {} : { listByThread }),
    ...(listReclaimable === undefined ? {} : { listReclaimable }),
  }
}
