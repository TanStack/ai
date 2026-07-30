/**
 * The "run driver" for the inverted/serverless sandbox model: pump a `chat()`
 * stream into a {@link RunEventLog} so a trigger can return immediately while a
 * durable orchestrator drives the run and clients tail from a cursor.
 *
 * The key inversion vs. a classic request/response handler: there is no caller
 * holding the stream open, so nothing to throw an error *back to*. The log is
 * the only channel — every chunk (including a terminal {@link EventType.RUN_ERROR})
 * is persisted under a `seq`, and a thrown stream error is recorded as a
 * synthesized `RUN_ERROR` event plus the record's `error` field. Tailing clients
 * therefore always observe failures; {@link pipeToRunLog} never rejects.
 *
 * "Never rejects" is load-bearing rather than aspirational, and it USED TO BE
 * FALSE HERE: this module is a copy of core's pre-split driver
 * (`@tanstack/ai-sandbox`'s `src/run.ts`), and in that copy `log.open`, the terminal
 * `log.finish`, the recovery `append`/`finish` inside the `catch`, and `reread`'s
 * explicit `throw` were all unguarded. {@link RunController.start} consumes the
 * returned promise fire-and-forget, so any one of them rejecting was an UNHANDLED
 * REJECTION — instance-fatal inside a Durable Object, which is precisely where this
 * copy runs. Every log call is therefore individually guarded now, and because
 * absorbing a failure silently in the one module whose premise is that nobody is
 * listening would make the failure invisible, each guard reports through the
 * optional {@link PipeToRunLogOptions.logger}.
 */
import { EventType } from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { StreamChunk } from '@tanstack/ai'
import type {
  RunError,
  RunEvent,
  RunEventLog,
  RunRecord,
  TerminalRunStatus,
} from './run-log'

/** Whether a chunk is the terminal error event the chat engine emits. */
function isRunErrorChunk(
  chunk: StreamChunk,
): chunk is StreamChunk & { message: string; code?: string } {
  return chunk.type === EventType.RUN_ERROR
}

/** Pull `{ message, code }` off a RUN_ERROR chunk for the run record. */
function runErrorFromChunk(
  chunk: StreamChunk & { message: string; code?: string },
): RunError {
  return chunk.code !== undefined
    ? { message: chunk.message, code: chunk.code }
    : { message: chunk.message }
}

/** Render an unknown thrown value as a stable error message. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Build the synthetic RUN_ERROR chunk appended when the stream throws. */
function syntheticRunError(message: string): StreamChunk {
  const chunk: { type: EventType.RUN_ERROR; message: string } = {
    type: EventType.RUN_ERROR,
    message,
  }
  return chunk
}

export interface PipeToRunLogOptions {
  log: RunEventLog
  runId: string
  threadId?: string
  /** Abort consumption mid-stream; the run finishes as `aborted`. */
  signal?: AbortSignal
  /**
   * Optional sink for failures this driver ABSORBS rather than rejecting with.
   * A detached run has no caller to receive an error, so without a logger a
   * failing event log is invisible to an operator. Same `logger?.errors(...)`
   * contract core uses in `stream-to-response.ts` and in `run.ts`.
   */
  logger?: InternalLogger
}

/**
 * Report through a consumer-supplied logger without letting it break the caller.
 * Every logger call in this module sits on a failure path that must stay total, so
 * a throwing sink would defeat the guards it exists to report on. Swallowing here
 * is deliberate: there is no second channel left to report a reporting failure on.
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
 * Open the run, append every chunk from `stream`, and finish with the right
 * terminal status. Resolves with the final {@link RunRecord} and never rejects:
 * a thrown stream error is surfaced as a `RUN_ERROR` event + the record's
 * `error`, which is what tailing clients see.
 *
 * - normal completion → `finish('done')`
 * - a `RUN_ERROR` chunk → append it, then `finish('error', { message, code })`
 * - the stream throws → append a synthesized `RUN_ERROR`, then `finish('error')`
 * - `signal` aborts mid-stream → stop consuming, `finish('aborted')`
 */
export async function pipeToRunLog(
  stream: AsyncIterable<StreamChunk>,
  opts: PipeToRunLogOptions,
): Promise<RunRecord> {
  const { log, runId, threadId, signal, logger } = opts
  const createdAt = Date.now()
  let lastSeq = -1

  /**
   * The record to answer with when the log cannot supply one. Rebuilt locally
   * rather than thrown, because a caller that no longer exists cannot be told
   * "the store is unavailable" — and the alternative, rejecting, is fatal here.
   */
  const localRecord = (
    status: TerminalRunStatus,
    error?: RunError,
  ): RunRecord => ({
    runId,
    ...(threadId !== undefined ? { threadId } : {}),
    status,
    lastSeq,
    ...(error !== undefined ? { error } : {}),
    createdAt,
    updatedAt: Date.now(),
  })

  /**
   * Record the terminal status and answer with the run's final record. TOTAL BY
   * CONSTRUCTION: both the write and the re-read are guarded, so this never
   * throws. The re-read is best effort — an unknown-run rejection or a
   * `null` from an eventually-consistent backend must not turn a driven run
   * into a rejection.
   */
  const finish = async (
    status: TerminalRunStatus,
    error?: RunError,
  ): Promise<RunRecord> => {
    try {
      await log.finish(runId, status, error)
    } catch (finishError) {
      safeLog(logger, 'run-driver: recording the terminal run status failed', {
        runId,
        status,
        error: finishError,
      })
      // The log still holds the stale `running` row (or nothing at all), so the
      // locally rebuilt record is the truthful answer here.
      return localRecord(status, error)
    }
    try {
      const latest = await log.get(runId)
      if (latest !== null) return latest
      safeLog(
        logger,
        'run-driver: record vanished before the terminal re-read',
        {
          runId,
          status,
        },
      )
    } catch (getError) {
      safeLog(logger, 'run-driver: re-reading the terminal run record failed', {
        runId,
        status,
        error: getError,
      })
    }
    return localRecord(status, error)
  }

  try {
    // `log.open` is INSIDE the `try` so a log failure at creation is handled like
    // any other: recorded as a failed run, not rejected at a caller that is not
    // there. Unguarded, this was the first of the four unhandled-rejection paths.
    await log.open(threadId !== undefined ? { runId, threadId } : { runId })
    if (signal?.aborted) return finish('aborted')

    for await (const chunk of stream) {
      if (signal?.aborted) return finish('aborted')
      lastSeq = await log.append(runId, chunk)
      if (isRunErrorChunk(chunk)) {
        return finish('error', runErrorFromChunk(chunk))
      }
    }
  } catch (error) {
    // Detached run: no caller to throw to. Record the failure in the log so
    // tailing clients observe it, then return — do NOT rethrow.
    let recorded: RunError = { message: messageOf(error) }
    safeLog(logger, 'run-driver: the run failed before completing', {
      runId,
      error,
    })
    try {
      lastSeq = await log.append(runId, syntheticRunError(recorded.message))
    } catch (appendError) {
      // The recovery append is itself a failure path. It must not destroy the
      // cause it was recording, so the original error stays primary and this
      // secondary failure is merged into its message and logged separately.
      const phase = 'appending the synthesized RUN_ERROR failed'
      safeLog(logger, `run-driver: ${phase}`, { runId, error: appendError })
      recorded = {
        ...recorded,
        message: `${recorded.message}; ${phase}: ${messageOf(appendError)}`,
      }
    }
    return finish('error', recorded)
  }

  return finish('done')
}

export interface RunControllerStartInput {
  runId: string
  threadId?: string
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
 * Thin orchestration helper over a {@link RunEventLog}: fire-and-track a run via
 * {@link pipeToRunLog}, tail it from a cursor, and `drain()` all in-flight runs
 * (e.g. inside a `ctx.waitUntil`). Holds no run state of its own beyond the set
 * of currently in-flight `done` promises.
 */
export class RunController {
  private readonly inFlight = new Set<Promise<RunRecord>>()

  constructor(
    private readonly log: RunEventLog,
    /** Forwarded to every run; see {@link PipeToRunLogOptions.logger}. */
    private readonly logger?: InternalLogger,
  ) {}

  /**
   * Kick off `pipeToRunLog` without awaiting it and return the `runId`
   * immediately plus a `done` promise the orchestrator may await or detach.
   */
  start(input: RunControllerStartInput): RunHandle {
    const done = pipeToRunLog(input.stream, {
      log: this.log,
      runId: input.runId,
      ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
      ...(this.logger !== undefined ? { logger: this.logger } : {}),
    })
    this.inFlight.add(done)
    // Two-argument `then`, deliberately NOT `.finally`: `.finally` returns a new
    // promise that ADOPTS any rejection, and discarding that promise would make
    // the rejection unhandled — which kills the instance inside a Durable Object.
    // Handling both outcomes here means the derived promise always settles
    // fulfilled, so nothing is left unhandled even if `pipeToRunLog`'s
    // "never rejects" contract is ever broken again.
    const forget = (): void => void this.inFlight.delete(done)
    void done.then(forget, forget)
    return { runId: input.runId, done }
  }

  /** Resumable client tail — replay from `fromSeq`, then live-tail to terminal. */
  attach(
    runId: string,
    opts?: { fromSeq?: number; signal?: AbortSignal },
  ): AsyncIterable<RunEvent> {
    return this.log.read(runId, opts)
  }

  /** Current run record, or null if the run is unknown. */
  status(runId: string): Promise<RunRecord | null> {
    return this.log.get(runId)
  }

  /**
   * Await every currently in-flight run's `done` promise.
   *
   * `allSettled`, not `all`: this is typically awaited inside a `ctx.waitUntil`,
   * where `all` would reject on the first failure, abandon the wait on every other
   * run, and surface that rejection to the platform. Draining is about keeping the
   * instance alive until the runs settle; each run's own outcome is already in its
   * record and log.
   */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight])
  }
}
