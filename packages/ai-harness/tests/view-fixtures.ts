import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import type { SessionEvent, SessionSnapshot } from '../src'

let cursor = 0

/** A session event with the next cursor. */
export function at(event: StreamChunk, operationId = 'op-1'): SessionEvent {
  cursor += 1
  return { cursor: String(cursor), operationId, event }
}

/** A `CUSTOM` event that the session itself sends. */
export function custom(name: string, value: unknown) {
  return at({ type: EventType.CUSTOM, name, value }, 'session')
}

/**
 * Run events of a child agent. At runtime they carry `subagentRunId`, but the
 * RUN_* event types do not list it. So they are values here, not object
 * literals at the call site.
 */
export const childRun = {
  started: {
    type: EventType.RUN_STARTED,
    threadId: 't',
    runId: 'r:child-1',
    subagentRunId: 'child-1',
  },
  finished: {
    type: EventType.RUN_FINISHED,
    threadId: 't',
    runId: 'r:child-1',
    subagentRunId: 'child-1',
  },
  error: {
    type: EventType.RUN_ERROR,
    message: 'child broke',
    subagentRunId: 'child-1',
  },
} as const

/** An idle session snapshot with nothing pending, and `over` on top. */
export function sessionSnapshot(
  over: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    threadId: 't',
    status: 'idle',
    activeOperations: [],
    queuedTurns: 0,
    pendingInterrupts: [],
    pendingQuestions: [],
    plugins: {},
    cursor: '0',
    ...over,
  }
}
