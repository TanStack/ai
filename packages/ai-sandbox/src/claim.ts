/**
 * The single-writer claim: what makes a takeover safe to attempt at all.
 *
 * WHY THIS MODULE EXISTS. `alignToStoredLog` decides where its appends start by
 * reading `durability.snapshot()`, and `snapshot()` carries NO LOCK — core says
 * so explicitly (`packages/ai/src/stream-durability.ts`: "a concurrent `append`
 * may land immediately after the snapshot is taken"). If two hosts drive one
 * run, both snapshot, both compute a "remainder", and both append it. The log
 * then holds the same logical chunk twice under two different offsets, and the
 * client CANNOT survive that: `ai-client`'s de-dup is keyed on the adapter's
 * offset string, so a re-appended chunk looks new, and the stream processor
 * applies text and tool-argument deltas unconditionally. The visible result is
 * doubled message text and `{"a":1}{"a":1}` tool arguments.
 *
 * Takeover is by definition two hosts wanting one run, so nothing may read a
 * journal for a run it has not claimed.
 *
 * THREE LAYERS, strongest first:
 *
 * 1. **The lease.** {@link withRunClaim} runs the whole drive inside
 *    `LockStore.withLock('run-driver:<runId>', …)`, so the snapshot and every
 *    append that follows are one critical section. A lease-backed lock aborts
 *    the callback signal the moment ownership is lost, and
 *    {@link fenceDurability} turns that into a thrown {@link RunClaimLostError}
 *    BEFORE the append reaches the log.
 * 2. **The epoch.** Each successful claim bumps `RunRecord.driverEpoch`.
 *    {@link fenceDurability} re-reads it every
 *    {@link DEFAULT_EPOCH_RECHECK_APPENDS} appends and refuses to append once a
 *    higher epoch exists. This covers what a lease cannot: an
 *    `InMemoryLockStore`, whose signal is a fresh `AbortController().signal`
 *    that is never aborted, and any backend whose renewal is coarser than the
 *    run's append rate. Once EITHER fence has refused an append, the fence
 *    latches shut and every later append refuses without re-reading anything.
 * 3. **Quiescence.** {@link awaitLogQuiescence} requires the stored log to stop
 *    growing before the successor appends anything, so a predecessor that is
 *    still writing is OBSERVED rather than raced.
 *
 * WHY THE EPOCH RE-CHECK COUNTS APPENDS, NOT MILLISECONDS. `pipeToRunLog`
 * appends ONE chunk per call, so a time-based interval couples the fence's
 * resolution to the run's chunk rate: at 500 chunks/sec a 2s interval lets a
 * superseded driver write ~1000 chunks before it notices. A count gives a hard
 * bound independent of rate — see {@link DEFAULT_EPOCH_RECHECK_APPENDS}.
 *
 * WHAT THIS IS NOT. It is not airtight fencing.
 *
 * - A predecessor paused (GC, VM suspend) for longer than the quiescence
 *   window, between its last fence check and its append landing at the backend,
 *   can still write one batch. Closing that requires a compare-and-set on the
 *   durability write; `StreamDurability.append` has no such parameter and this
 *   phase deliberately does not add one.
 * - Layer 3 is only meaningful across PROCESSES. On a single-process
 *   `InMemoryLockStore` the two claims are serialized by the lock, not
 *   concurrent, so `awaitLogQuiescence` can never observe a predecessor still
 *   writing there — and consequently no unit test on that backend proves layer
 *   3 does anything. What the tests do prove on that backend is layer 2.
 *
 * The mitigation for both is deployment-level: use a lease-backed distributed
 * `LockStore`, and keep `fenceQuietMs` above the lease's renewal interval.
 */
import { isTerminalRunStatus } from '@tanstack/ai'
import type { LockStore } from '@tanstack/ai/locks'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { RunStore, StreamChunk, StreamDurability } from '@tanstack/ai'

/** Quiescence window before a successor's first append. */
export const DEFAULT_FENCE_QUIET_MS = 5_000

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
const MAX_QUIESCENCE_PROBES = 6

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
export async function awaitLogQuiescence(
  durability: StreamDurability,
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
 */
export function fenceDurability(
  durability: StreamDurability,
  claim: RunClaim,
  options: { runs: RunStore; epochRecheckAppends?: number },
): StreamDurability {
  const recheckAppends = Math.max(
    1,
    Math.trunc(options.epochRecheckAppends ?? DEFAULT_EPOCH_RECHECK_APPENDS),
  )
  // Seeded at the threshold so the FIRST append always re-reads the epoch: a
  // successor may have claimed between this fence being built and its first
  // write.
  let appendsSinceEpochRead = recheckAppends
  // Latched by the FIRST refusal and never cleared. `undefined` means the fence
  // is still open; anything else is the refusal every later append replays.
  let lost: RunClaimLostError | undefined

  async function assertHeld(): Promise<void> {
    // The latch, checked first: once refused, no throttle and no store read can
    // let a later append through.
    if (lost !== undefined) throw lost
    // Layer 1: synchronous, no I/O, so nothing has been written yet.
    if (claim.signal.aborted) {
      lost = new RunClaimLostError(claim.runId, claim.epoch, 'lease-lost')
      throw lost
    }
    if (appendsSinceEpochRead < recheckAppends) {
      appendsSinceEpochRead += 1
      return
    }
    appendsSinceEpochRead = 1
    // Layer 2. A store failure is NOT treated as loss: the lease is the primary
    // fence and it has not fired, so fencing ourselves out on a store blip would
    // kill a healthy driver for no reason.
    let observed: number | undefined
    try {
      observed = (await options.runs.get(claim.runId))?.driverEpoch
    } catch {
      return
    }
    if (observed !== undefined && observed > claim.epoch) {
      lost = new RunClaimLostError(claim.runId, claim.epoch, observed)
      throw lost
    }
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
