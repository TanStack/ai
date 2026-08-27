import { EventType } from '@tanstack/ai'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  RunError,
  RunRecord,
  RunStore,
  StreamChunk,
  StreamDurability,
  TerminalRunStatus,
} from '@tanstack/ai'

/** Whether a chunk is the terminal error event the chat engine emits. */
function isRunErrorChunk(
  chunk: StreamChunk,
): chunk is StreamChunk & { message: string; code?: string } {
  return chunk.type === EventType.RUN_ERROR
}

/**
 * Narrow a thrown value (or a `RUN_ERROR` chunk's payload) to the record's
 * structured error, keeping the provider's `code` when it supplies one: a bare
 * message is prose that changes between model versions, while `code` is what a
 * consumer branches on to retry, escalate, or show specific UI.
 */
function toRunError(error: unknown): RunError {
  const payload = toRunErrorPayload(error)
  return {
    message: payload.message,
    ...(payload.code === undefined ? {} : { code: payload.code }),
  }
}

/**
 * Fold a secondary failure into the primary error, mirroring `combineFailures`
 * in `packages/ai/src/stream-to-response.ts`: the primary cause stays first and
 * keeps its `code`, and the phase that produced the secondary failure is named.
 * The secondary must never *replace* the primary: the provider's error is what
 * an operator needs, and a failure while recording it is the lesser fact.
 */
function withSecondaryFailure(
  primary: RunError,
  secondary: unknown,
  phase: string,
): RunError {
  return {
    ...primary,
    message: `${primary.message}; ${phase}: ${toRunError(secondary).message}`,
  }
}

/** Build the synthetic RUN_ERROR chunk appended when the stream throws. */
function syntheticRunError(error: RunError): StreamChunk {
  const chunk: { type: EventType.RUN_ERROR; message: string; code?: string } = {
    type: EventType.RUN_ERROR,
    message: error.message,
    ...(error.code === undefined ? {} : { code: error.code }),
  }
  return chunk
}

/**
 * The two durable seams a run driver needs: lifecycle record + event log.
 *
 * Generic in the log's offset type, and DEFAULTED to `string` so every existing
 * call site keeps compiling unchanged. The parameter is not decoration: a
 * backend that brands its cursors — `@tanstack/ai-durable-stream`'s
 * `durableStream` returns `StreamDurability<DurableStreamOffset>` — is NOT
 * assignable to `StreamDurability<string>`, because `read` takes an offset and
 * is therefore contravariant in it. Hardcoding the default here made the
 * production multi-host backend unusable without a cast (see
 * `tests/offset-generics.test-d.ts`).
 */
export interface RunDeps<TOffset extends string = string> {
  /** Run lifecycle record (status, thread, timings). */
  runs: RunStore
  /**
     * Per-run delivery-durable event log the run's chunks are appended to.
     *
     * A FACTORY, not an instance, and that is load-bearing rather than stylistic.
     * A `StreamDurability` is bound to one run — `memoryStream(request)` resolves
     * its `runId` from the request, and a backend adapter's offsets embed a cursor
     * into one log. Holding a single instance made two failures reachable:
     *
     * - **Silent mis-binding at concurrency 1.** `start({ runId })` accepted an
     *   arbitrary id while the instance was bound to another, writing the record
     *   under one id and the events under another with no error raised. Resolving
     *   the log FROM the `runId` makes that unrepresentable.
     * - **Cross-talk at concurrency > 1.** Parallel runs interleaved their chunks
     *   into one log, and whichever finished first called `close()` and
     *   terminalized every other run's stream.
     *
     * Called exactly once per run, at the start of {@link pipeToRunLog}. An
     * implementation MUST return the same instance for the same `runId` within a
     * process if it wants `snapshot()` to see its own appends.
     */
  durability: (runId: string) => StreamDurability<TOffset>
  /**
     * Optional sink for failures this driver absorbs rather than rejecting with.
     * A detached run has no caller to receive an error, so without a logger a
     * failing store or event log is invisible to an operator. Same
     * `logger?.errors(...)` contract core uses in `stream-to-response.ts`.
     */
  logger?: InternalLogger
}

export interface PipeToRunLogOptions<
  TOffset extends string = string,
> extends RunDeps<TOffset> {
  runId: string
  threadId: string
  /** Abort consumption mid-stream; the run finishes as `aborted`. */
  signal?: AbortSignal
}

/** Everything {@link finish} needs, including the fields it rebuilds a record from. */
interface FinishContext {
  /** Run lifecycle record (status, thread, timings). */
  runs: RunStore
  durability: Pick<StreamDurability, 'close'>
  runId: string
  threadId: string
  startedAt: number
  logger?: InternalLogger
}

/**
 * Report through a consumer-supplied logger without letting it break the
 * caller. Every logger call in this module sits inside a `catch` body, so an
 * throwing sink would escape that body and defeat the totality the guards
 * exist to provide. Swallowing here is deliberate: there is no second channel
 * left to report a reporting failure on.
 */
function safeLog(
  logger: InternalLogger | undefined,
  message: string,
  context: Record<string, unknown>,
): void {
  try {
    logger?.errors(message, context)
  } catch {
    // Intentionally empty: see above.
  }
}

/**
 * Record the terminal status, terminalize the event log, and answer with the
 * run's final record.
 *
 * TOTAL BY CONSTRUCTION: every step is individually guarded, so this never
 * throws and never rejects. Two consequences the guards buy:
 *
 * - `durability.close()` runs on EVERY exit path, including a failed `update`.
 *   Skipping it would wedge the record at `running` *and* park every live
 *   tailer forever, because a durability `read` only ends once the log closes.
 * - The re-read of the record is best effort. An eventually-consistent or
 *   read-replica store may answer `null` for a run that was just driven, which
 *   must not turn a successful run into a rejection; the locally rebuilt record
 *   is returned instead. It is also preferred outright when `update` failed,
 *   since the store then still holds the stale `running` row.
 *
 * THE TERMINAL WRITE IS NOT GUARANTEED TO LAND, and this function deliberately
 * does not check whether it did. Under `sandboxRunDriver` the `runs` handed in is
 * `fenceRunStore`d (`src/claim.ts`), which SUPPRESSES a terminal write — resolving
 * without writing — when the driver has lost its claim, because a host that no
 * longer owns the run must not declare it over while the successor is streaming
 * it. From here that is indistinguishable from a successful write, on purpose:
 * the epoch belongs to the claim module, not to this generic driver, and the
 * re-read below then answers with the successor's live record, which is the
 * truthful thing to resolve with. A driver wired without a claim (a plain
 * `pipeToRunLog` call) is unfenced and always writes.
 */
async function finish(
  ctx: FinishContext,
  status: TerminalRunStatus,
  error?: RunError,
): Promise<RunRecord> {
  const { runs, durability, runId, logger } = ctx
  const finishedAt = Date.now()
  const patch = {
    status,
    finishedAt,
    ...(error === undefined ? {} : { error }),
  }
  const local: RunRecord = {
    runId,
    threadId: ctx.threadId,
    startedAt: ctx.startedAt,
    ...patch,
  }

  let recorded = true
  try {
    await runs.update(runId, patch)
  } catch (updateError) {
    recorded = false
    safeLog(logger, 'run: recording the terminal run record failed', {
      runId,
      status,
      error: updateError,
    })
  }

  try {
    await durability.close()
  } catch (closeError) {
    safeLog(logger, 'run: closing the run event log failed', {
      runId,
      status,
      error: closeError,
    })
  }

  if (!recorded) return local

  try {
    const latest = await runs.get(runId)
    if (latest !== null) return latest
    safeLog(logger, 'run: record vanished before the terminal re-read', {
      runId,
      status,
    })
  } catch (getError) {
    safeLog(logger, 'run: re-reading the terminal run record failed', {
      runId,
      status,
      error: getError,
    })
  }
  return local
}

/**
 * Open the run, append every chunk from `stream`, and finish with the right
 * terminal status. Resolves with the final {@link RunRecord} and never rejects:
 * a thrown stream error is surfaced as a `RUN_ERROR` event plus the record's
 * `error`, which is what tailing clients see. A store or event-log failure
 * along the way is logged through {@link RunDeps.logger} and still terminalizes
 * the run rather than escaping to a caller that does not exist.
 *
 * - normal completion → `completed`
 * - a `RUN_ERROR` chunk → append it, then `failed`
 * - the stream throws → append a synthesized `RUN_ERROR`, then `failed`
 * - `signal` aborts at ANY point before the stream ends → `aborted`, whether the
 *   producer keeps yielding, ends its stream, or is never asked for another
 *   chunk. An abort outranks a clean exit: the run did not complete.
 */
export async function pipeToRunLog<TOffset extends string = string>(
  stream: AsyncIterable<StreamChunk>,
  opts: PipeToRunLogOptions<TOffset>,
): Promise<RunRecord> {
  const { runs, runId, threadId, signal, logger } = opts
  const durability = opts.durability(runId)
  const ctx: FinishContext = {
    runs,
    durability,
    runId,
    threadId,
    startedAt: Date.now(),
    ...(logger === undefined ? {} : { logger }),
  }

  try {
    // Inside the `try` so a store failure at creation is handled like any
    // other: recorded as a failed run with a terminalized log, not rejected.
    await runs.createOrResume({ runId, threadId, startedAt: ctx.startedAt })
    if (signal?.aborted) return finish(ctx, 'aborted')

    for await (const chunk of stream) {
      if (signal?.aborted) return finish(ctx, 'aborted')
      await durability.append([chunk])
      if (isRunErrorChunk(chunk)) {
        return finish(
          ctx,
          'failed',
          toRunError({ message: chunk.message, code: chunk.code }),
        )
      }
    }
  } catch (streamError) {
    // Detached run: no caller to throw to. Record the failure in the log so
    // tailing clients observe it, then return — do NOT rethrow.
    let recorded = toRunError(streamError)
    safeLog(logger, 'run: the run failed before completing', {
      runId,
      error: streamError,
    })
    try {
      await durability.append([syntheticRunError(recorded)])
    } catch (appendError) {
      const phase = 'appending the synthesized RUN_ERROR failed'
      safeLog(logger, `run: ${phase}`, { runId, error: appendError })
      recorded = withSecondaryFailure(recorded, appendError, phase)
    }
    return finish(ctx, 'failed', recorded)
  }

  if (signal?.aborted) return finish(ctx, 'aborted')
  return finish(ctx, 'completed')
}

export interface RunControllerStartInput {
  runId: string
  threadId: string
  stream: AsyncIterable<StreamChunk>
  /** Abort consumption mid-stream; the run finishes as `aborted`. */
  signal?: AbortSignal
}

export interface RunHandle {
  runId: string
  /** Resolves with the final record once the run reaches a terminal status. */
  done: Promise<RunRecord>
}

/**
 * Thin orchestration helper over {@link RunDeps}: fire-and-track a run via
 * {@link pipeToRunLog}, tail one run by id, and `drain()` all in-flight runs
 * (e.g. inside a `ctx.waitUntil`). Holds no run state of its own beyond the set
 * of currently in-flight `done` promises.
 *
 * Safe for concurrent runs. {@link RunDeps.durability} is a per-run factory, so
 * each run appends to its own log and no run's `close()` terminalizes another's.
 * The identity trap this class used to document — `start({ runId })` writing the
 * lifecycle record under one id and the events under another, silently and at
 * concurrency 1 — is unrepresentable now that the log is resolved FROM the
 * `runId`. Every method is keyed by run accordingly: `attach(runId, …)` and
 * `status(runId)` no longer disagree about whether the surface is per-run.
 */
export class RunController<TOffset extends string = string> {
  private readonly inFlight = new Set<Promise<RunRecord>>()

  constructor(private readonly deps: RunDeps<TOffset>) {}

  /**
     * Kick off `pipeToRunLog` without awaiting it and return the `runId`
     * immediately plus a `done` promise the orchestrator may await or detach.
     */
  start(input: RunControllerStartInput): RunHandle {
    /** Resolves with the final record once the run reaches a terminal status. */
    const done = pipeToRunLog(input.stream, {
      ...this.deps,
      runId: input.runId,
      threadId: input.threadId,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    })
    this.inFlight.add(done)
    const forget = (): void => void this.inFlight.delete(done)
    void done.then(forget, forget)
    return { runId: input.runId, done }
  }

  /**
     * Resumable client tail for ONE run — replay from `fromOffset`, then
     * live-tail. Takes `runId` because the log it reads is per-run; the old
     * `attach(fromOffset)` signature advertised a multi-run surface the type could
     * not deliver.
     */
  attach(
    runId: string,
    fromOffset: TOffset,
    signal?: AbortSignal,
  ): AsyncIterable<{ offset: TOffset; chunk: StreamChunk }> {
    return this.deps.durability(runId).read(fromOffset, signal)
  }

  /** Current run record, or null when the run is unknown. */
  status(runId: string): Promise<RunRecord | null> {
    return this.deps.runs.get(runId)
  }

  /**
     * Await every currently in-flight run's `done` promise.
     *
     * Uses `allSettled` rather than `all` because this is typically awaited
     * inside a `ctx.waitUntil`: `all` would reject on the first failure, abandon
     * the wait on every other run, and surface that rejection to the platform.
     * Draining is about keeping the isolate alive until the runs settle; each
     * run's own outcome is already recorded in its record and log.
     */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight])
  }
}
