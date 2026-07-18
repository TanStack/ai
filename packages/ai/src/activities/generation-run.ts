import { EventType } from '@ag-ui/core'
import { toRunErrorPayload } from './error-payload'
import type {
  GenerationReplayInput,
  GenerationRunIdentity,
} from './middleware/types'
import type { StreamChunk } from '../types'

export function rejectEventsOnlyReplay(
  replay: GenerationReplayInput<unknown> | undefined,
): void {
  if (replay?.events && !('result' in replay)) {
    throw new Error(
      'Generation replay with events requires stream: true or a replay.result.',
    )
  }
}

export function generationIdentityFields(identity: GenerationRunIdentity): {
  threadId?: string
  runId?: string
} {
  return {
    ...(identity.threadId !== undefined ? { threadId: identity.threadId } : {}),
    ...(identity.runId !== undefined ? { runId: identity.runId } : {}),
  }
}

/**
 * Build the RUN_ERROR terminal chunk used by both the live generation path and
 * replay. Mirrors the envelope emitted by `streamGenerationResult`'s catch: a
 * top-level `message`/`code` plus the deprecated nested `error` form.
 */
function buildGenerationRunError(
  error: unknown,
  identity: GenerationRunIdentity,
  fallbackMessage: string,
): StreamChunk {
  const payload = toRunErrorPayload(error, fallbackMessage)
  const codeFields =
    payload.code !== undefined ? { code: payload.code } : undefined
  return {
    type: EventType.RUN_ERROR,
    ...generationIdentityFields(identity),
    message: payload.message,
    ...codeFields,
    // Deprecated nested form for backward compatibility.
    error: {
      message: payload.message,
      ...codeFields,
    },
    timestamp: Date.now(),
  }
}

function isTerminalEvent(event: StreamChunk): boolean {
  return (
    event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR
  )
}

function eventIdentity(event: StreamChunk): GenerationRunIdentity {
  return {
    ...('runId' in event && typeof event.runId === 'string'
      ? { runId: event.runId }
      : {}),
    ...('threadId' in event && typeof event.threadId === 'string'
      ? { threadId: event.threadId }
      : {}),
  }
}

/**
 * Replay persisted generation events with the same terminal guarantees as the
 * live path, so a replayed stream always completes the StreamProcessor:
 *
 * - If iterating the persisted log throws (e.g. a persistence store fails
 *   mid-read), emit a RUN_ERROR terminal instead of letting the raw error
 *   escape uncaught.
 * - If the log ends without a terminal event (RUN_FINISHED/RUN_ERROR) — e.g. a
 *   run interrupted mid-persist truncated the log — synthesize a RUN_ERROR so
 *   consumers don't hang waiting for a completion that will never come.
 */
export async function* replayGenerationEvents(
  replay: GenerationReplayInput<unknown>,
): AsyncIterable<StreamChunk> {
  if (!replay.events) return
  let sawTerminal = false
  let lastIdentity: GenerationRunIdentity = {}
  try {
    for await (const event of replay.events) {
      const identity = eventIdentity(event)
      lastIdentity = { ...lastIdentity, ...identity }
      if (isTerminalEvent(event)) sawTerminal = true
      yield event
    }
  } catch (error: unknown) {
    yield buildGenerationRunError(
      error,
      lastIdentity,
      'Generation replay failed',
    )
    return
  }
  if (!sawTerminal) {
    yield buildGenerationRunError(
      new Error(
        'Persisted generation replay ended before a terminal RUN_FINISHED or ' +
          'RUN_ERROR event (the run was likely interrupted mid-persist).',
      ),
      lastIdentity,
      'Generation replay truncated',
    )
  }
}
