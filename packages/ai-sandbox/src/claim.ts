import { isTerminalRunStatus } from '@tanstack/ai'
import type { LockStore } from '@tanstack/ai/locks'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { RunStore, StreamChunk, StreamDurability } from '@tanstack/ai'

/** Quiescence window before a successor's first append. */
export const DEFAULT_FENCE_QUIET_MS = 5_000

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
  fenceQuietMs?: number
  epochRecheckAppends?: number
  logger?: InternalLogger
}

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
