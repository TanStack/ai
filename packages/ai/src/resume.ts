/**
 * Resume-source capability — the core seam that lets a reconnecting client pick
 * up a run where it left off.
 *
 * The contract lives in core (not in `@tanstack/ai-persistence`) because the
 * `chat()` engine itself owns the resume decision: when a `cursor` is supplied
 * and a `ResumeSource` has been provided by middleware, the engine replays the
 * persisted event tail instead of running the adapter again. `withPersistence`
 * PROVIDES a `ResumeSource` backed by its event log + run store; without it, the
 * `cursor` option is a silent no-op (a normal run is unaffected).
 *
 * Core depends only on this small read contract — never on the persistence
 * package — mirroring how {@link LocksCapability} lives in core.
 */
import { createCapability } from './activities/chat/middleware/capabilities'
import type { StreamChunk } from './types'

/** Lifecycle status of a persisted run. */
export type RunStatus = 'running' | 'completed' | 'failed' | 'interrupted'

/**
 * A read-only view of persisted run history sufficient for the engine to resume.
 * Provided by `withPersistence`; consumed by the `chat()` resume seam.
 */
export interface ResumeSource {
  /** Whether any events have been persisted for `runId`. */
  hasRun: (runId: string) => Promise<boolean>
  /**
   * Replay persisted chunks for `runId` whose cursor is strictly after
   * `afterCursor` (or from the beginning when omitted). Each yielded chunk
   * carries its stamped `cursor`.
   */
  replay: (
    runId: string,
    afterCursor?: string,
  ) => AsyncIterable<StreamChunk>
  /** Current status of `runId`, or null when unknown. */
  getStatus: (runId: string) => Promise<RunStatus | null>
}

/**
 * The resume capability. PROVIDED by `withPersistence`; OPTIONALLY consumed by
 * the chat engine. When absent, a supplied `cursor` is ignored.
 */
export const ResumeSourceCapability =
  createCapability<ResumeSource>()('resume-source')

/** Destructured accessors: `getResumeSource(ctx)` / `provideResumeSource(ctx, src)`. */
export const [getResumeSource, provideResumeSource] = ResumeSourceCapability
