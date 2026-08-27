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

export interface SandboxRunDriverOptions<TOffset extends string = string> {
  /** The attach request; core reads its run id with `resolveResumeRunId`. */
  request: Request
  runs: RunStore
  locks: LockStore
  /**
     * Per-run event log factory, the same shape `RunDeps.durability` takes — a
     * `StreamDurability` is bound to one run, so the log is resolved FROM the
     * `runId` rather than handed in pre-bound.
     *
     * Generic in the offset type, defaulted to `string` so an existing call site
     * needs no change. Hardcoding the default made a branded-cursor backend
     * unusable here: `durableStream` returns
     * `StreamDurability<DurableStreamOffset>`, which is not assignable to
     * `StreamDurability<string>` because `read` is contravariant in its offset.
     */
  durability: (runId: string) => StreamDurability<TOffset>
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
 * `drive` receives an `AbortSignal` — the driver owns the abort, so it hands
 * out a signal rather than a controller — but `chat()` takes an
 * `AbortController`. Mirror one onto the other, exactly as
 * {@link https://tanstack.com/ai/latest/docs/sandbox/takeover | Takeover & Detached Runs}'s
 * `controllerFor` does, so a lost claim actually stops the drive.
 *
 * @example
 * ```typescript
 * function controllerFor(signal: AbortSignal): AbortController {
 *   const controller = new AbortController()
 *   const abort = (): void => controller.abort(signal.reason)
 *   if (signal.aborted) abort()
 *   else signal.addEventListener('abort', abort, { once: true })
 *   return controller
 * }
 *
 * export async function GET(request: Request) {
 *   return resumeServerSentEventsResponse({
 *     adapter: memoryStream(request),
 *     driver: sandboxRunDriver({
 *       request,
 *       runs,
 *       locks,
 *       durability: (runId) => logFor(runId),
 *       drive: ({ runId, threadId, signal }) =>
 *         chat({
 *           ...config,
 *           runId,
 *           threadId,
 *           abortController: controllerFor(signal),
 *         }),
 *     }),
 *   })
 * }
 * ```
 */
export function sandboxRunDriver<TOffset extends string = string>(
  input: SandboxRunDriverOptions<TOffset>,
): RunDriverOptions {
  /** Quiescence window; defaults to {@link DEFAULT_FENCE_QUIET_MS}. */
  const fenceQuietMs = input.fenceQuietMs ?? DEFAULT_FENCE_QUIET_MS
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
