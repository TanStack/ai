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

function toRunError(error: unknown): RunError {
  const payload = toRunErrorPayload(error)
  return {
    message: payload.message,
    ...(payload.code === undefined ? {} : { code: payload.code }),
  }
}

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

export interface RunDeps<TOffset extends string = string> {
  /** Run lifecycle record (status, thread, timings). */
  runs: RunStore
  durability: (runId: string) => StreamDurability<TOffset>
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
  runs: RunStore
  durability: Pick<StreamDurability, 'close'>
  runId: string
  threadId: string
  startedAt: number
  logger?: InternalLogger
}

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

export class RunController<TOffset extends string = string> {
  private readonly inFlight = new Set<Promise<RunRecord>>()

  constructor(private readonly deps: RunDeps<TOffset>) {}

  start(input: RunControllerStartInput): RunHandle {
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

  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight])
  }
}
