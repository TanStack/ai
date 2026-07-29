/**
 * The convenience that turns core's *injected* takeover seams into this
 * package's real ones.
 *
 * `@tanstack/ai`'s `RunDriverOptions` deliberately takes `claim` and `pipe` as
 * functions instead of importing them: {@link withRunClaim} and
 * {@link pipeToRunLog} live here, and core must not depend on this package to
 * serve a plain chat run. {@link sandboxRunDriver} fills both in so an
 * application writes four fields instead of six, and — more importantly — so
 * the *fencing* is wired correctly by construction rather than by every caller
 * remembering to.
 *
 * WHAT IS EASY TO GET WRONG HERE, and therefore what this module exists to
 * make impossible:
 *
 * 1. **Carrying the real epoch into `pipe`.** Core's `pipe` receives only
 *    `{ runId, threadId, signal }` — no epoch — because core has no concept of
 *    one. But {@link fenceDurability} needs the epoch this driver actually
 *    acquired: a hardcoded epoch (say `0`) is not a weaker fence, it is a
 *    permanently *tripped* one, since `withRunClaim` bumps `driverEpoch` to at
 *    least `1` before `fn` ever runs, so `observed > claim.epoch` holds on the
 *    very first append and EVERY takeover fails. The claim is therefore
 *    captured in a closure by the `claim` wrapper and read back by `pipe`.
 * 2. **Fencing `close()`.** {@link fenceDurability} wraps only `append` for the
 *    reason spelled out in `claim.ts`: `close()` runs on every teardown path,
 *    including the teardown caused by losing the claim, and a fenced `close`
 *    would wedge the record at `'running'` with every live tailer parked
 *    forever. This module must not add a second fence around it.
 * 2b. **Fencing only ONE of the two authoritative seams.** A run's facts live in
 *    its log *and* in its record, and `pipeToRunLog` reacts to a refused append
 *    by writing a terminal record — so wrapping the log alone just moves the harm
 *    from "a dead host poisons the successor's stream" to "a dead host marks the
 *    successor's live run failed". {@link fenceRunStore} must be wired here too,
 *    over the SAME claim, which is what makes the two fences share one latch.
 * 3. **Skipping quiescence.** The successor's first append must come after the
 *    stored log has stopped growing, so a predecessor still writing is observed
 *    rather than raced. The gate belongs inside `pipe`, before `pipeToRunLog`
 *    takes its first `snapshot`.
 */
import { pipeToRunLog } from './run'
import {
  DEFAULT_FENCE_QUIET_MS,
  awaitLogQuiescence,
  fenceDurability,
  fenceRunStore,
  withRunClaim,
} from './claim'
import type { RunClaim } from './claim'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { LockStore } from '@tanstack/ai/locks'
import type {
  RunDriverOptions,
  RunStore,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'

export interface SandboxRunDriverOptions {
  /** The attach request; core reads its run id with `resolveResumeRunId`. */
  request: Request
  runs: RunStore
  locks: LockStore
  /**
   * Per-run event log factory, the same shape `RunDeps.durability` takes — a
   * `StreamDurability` is bound to one run, so the log is resolved FROM the
   * `runId` rather than handed in pre-bound.
   */
  durability: (runId: string) => StreamDurability
  /** Produce the run's remaining events. Called only once the claim is held. */
  drive: (input: {
    runId: string
    threadId: string
    signal: AbortSignal
  }) => AsyncIterable<StreamChunk>
  /** Quiescence window; defaults to {@link DEFAULT_FENCE_QUIET_MS}. */
  fenceQuietMs?: number
  /** Platform keep-alive (e.g. `ctx.waitUntil`) for the background drive. */
  waitUntil?: (promise: Promise<unknown>) => void
  logger?: InternalLogger
}

/**
 * `pipe` ran without a held claim. Not a recoverable condition: it means the
 * returned options object was taken apart and `pipe` called outside `claim`, so
 * there is no epoch to fence with and no lease guaranteeing exclusivity. Any
 * append made in that state is exactly the duplicate-write bug the claim exists
 * to prevent, so this fails loudly rather than appending unfenced.
 */
export class RunDriverPipeOutsideClaimError extends Error {
  constructor(readonly runId: string) {
    super(
      `run ${runId}: sandboxRunDriver.pipe was called outside its claim, so the driver epoch is unknown; call it from within the claim callback`,
    )
    this.name = 'RunDriverPipeOutsideClaimError'
  }
}

/**
 * Fill in a core `driver` block with this package's claim and run log.
 *
 * @example
 * ```typescript
 * export async function GET(request: Request) {
 *   return resumeServerSentEventsResponse({
 *     adapter: memoryStream(request),
 *     driver: sandboxRunDriver({
 *       request,
 *       runs,
 *       locks,
 *       durability: (runId) => logFor(runId),
 *       drive: ({ runId, threadId, signal }) =>
 *         chat({ ...config, runId, threadId, signal }),
 *     }),
 *   })
 * }
 * ```
 */
export function sandboxRunDriver(
  input: SandboxRunDriverOptions,
): RunDriverOptions {
  const fenceQuietMs = input.fenceQuietMs ?? DEFAULT_FENCE_QUIET_MS
  // The seam between core's `claim` and core's `pipe`. One options object serves
  // one attach request and therefore one run, so a single slot is enough; it is
  // cleared on the way out so a `pipe` after the claim released cannot reuse a
  // stale epoch.
  let current: RunClaim | undefined

  return {
    request: input.request,
    runs: input.runs,
    locks: input.locks,
    drive: input.drive,
    claim: (claimInput, fn) =>
      withRunClaim(
        {
          ...claimInput,
          fenceQuietMs,
          ...(input.logger === undefined ? {} : { logger: input.logger }),
        },
        async (claim) => {
          const previous = current
          current = claim
          try {
            return await fn(claim)
          } finally {
            current = previous
          }
        },
      ),
    pipe: async (stream, i) => {
      const claim = current
      if (claim === undefined) {
        throw new RunDriverPipeOutsideClaimError(i.runId)
      }
      // Before the first append, never after: `pipeToRunLog` snapshots to align
      // and a predecessor still writing must be observed, not raced.
      await awaitLogQuiescence(input.durability(i.runId), fenceQuietMs)
      return pipeToRunLog(stream, {
        // BOTH authoritative seams are fenced at the epoch this driver actually
        // acquired, and they must be: `pipeToRunLog` answers a refused append by
        // recording a terminal record, so fencing only the log leaves a
        // superseded host marking a live run `'failed'` (see `fenceRunStore`).
        // Neither fence covers `close()` — that stays unfenced on purpose.
        runs: fenceRunStore(input.runs, claim, {
          ...(input.logger === undefined ? {} : { logger: input.logger }),
        }),
        durability: (runId) =>
          fenceDurability(input.durability(runId), claim, {
            runs: input.runs,
          }),
        runId: i.runId,
        threadId: i.threadId,
        signal: i.signal,
        ...(input.logger === undefined ? {} : { logger: input.logger }),
      })
    },
    ...(input.waitUntil === undefined ? {} : { waitUntil: input.waitUntil }),
    ...(input.logger === undefined ? {} : { logger: input.logger }),
  }
}
