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
 */
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import type { RunError, RunEvent, RunEventLog, RunRecord } from './run-log'

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
  const { log, runId, threadId, signal } = opts
  await log.open(threadId !== undefined ? { runId, threadId } : { runId })
  if (signal?.aborted) {
    await log.finish(runId, 'aborted')
    return reread(log, runId)
  }

  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        await log.finish(runId, 'aborted')
        return reread(log, runId)
      }
      await log.append(runId, chunk)
      if (isRunErrorChunk(chunk)) {
        await log.finish(runId, 'error', runErrorFromChunk(chunk))
        return reread(log, runId)
      }
    }
  } catch (error) {
    // Detached run: no caller to throw to. Record the failure in the log so
    // tailing clients observe it, then return — do NOT rethrow.
    const message = messageOf(error)
    await log.append(runId, syntheticRunError(message))
    await log.finish(runId, 'error', { message })
    return reread(log, runId)
  }

  await log.finish(runId, 'done')
  return reread(log, runId)
}

/** Re-read the now-terminal record; the run was just driven, so it must exist. */
async function reread(log: RunEventLog, runId: string): Promise<RunRecord> {
  const latest = await log.get(runId)
  if (!latest) throw new Error(`run: record for "${runId}" vanished mid-run`)
  return latest
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

  constructor(private readonly log: RunEventLog) {}

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
    })
    this.inFlight.add(done)
    void done.finally(() => this.inFlight.delete(done))
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

  /** Await every currently in-flight run's `done` promise. */
  async drain(): Promise<void> {
    await Promise.all([...this.inFlight])
  }
}
