import { EventType } from '@tanstack/ai'
import { emptyUsage } from '../src/usage'
import { waitFromInterrupt, waitFromQuestion } from '../src/waits'
import type { Interrupt, StreamChunk } from '@tanstack/ai'
import type { PendingQuestion, SessionEvent, SessionSnapshot } from '../src'

let cursor = 0

/** A session event with the next cursor. */
export function at(event: StreamChunk, operationId = 'op-1'): SessionEvent {
  cursor += 1
  return { cursor: String(cursor), threadId: 't1', operationId, event }
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

/**
 * An idle session snapshot with nothing pending, and `over` on top.
 * `interrupts` are the waits of the stopped turn, and `questions` the
 * question waits of the log, both in `pendingWaits`.
 */
export function sessionSnapshot({
  interrupts = [],
  questions = [],
  ...over
}: Partial<SessionSnapshot> & {
  interrupts?: Array<Interrupt>
  questions?: Array<PendingQuestion>
} = {}): SessionSnapshot {
  return {
    threadId: 't',
    status: 'idle',
    activeOperations: [],
    queuedTurns: 0,
    pendingWaits: [
      ...interrupts.map((interrupt) => ({
        ...waitFromInterrupt({ interrupt, runId: 'op-1' }),
        interrupt,
        turn: true as const,
      })),
      ...questions.map(({ secret, url, ...question }) => ({
        ...waitFromQuestion({ question, runId: 'op-1' }),
        ...(secret ? { secret: true as const } : {}),
        ...(url ? { url } : {}),
      })),
    ],
    plugins: {},
    usage: emptyUsage(),
    cursor: '0',
    ...over,
  }
}
