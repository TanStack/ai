import { EventType } from '@tanstack/ai'
import { HARNESS_EVENTS } from '@tanstack/ai-harness'
import type { Interrupt, RunAgentResumeItem } from '@tanstack/ai'
import type { HarnessSession, SessionEvent } from '@tanstack/ai-harness'

/** One line in the transcript view. */
export type ViewEntry =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; operationId: string; text: string }
  | { kind: 'tool'; text: string }
  | { kind: 'notice'; text: string }

/**
 * Fold one session event into the view entries. Returns the new list, or the
 * same list when the event changes nothing on screen.
 */
export function applyEvent(
  entries: Array<ViewEntry>,
  entry: SessionEvent,
): Array<ViewEntry> {
  const { event, operationId } = entry
  if ('subagentRunId' in event && event.subagentRunId) {
    if (event.type === EventType.SUBAGENT_STARTED) {
      return [
        ...entries,
        { kind: 'tool', text: `agent ${event.name ?? ''} started` },
      ]
    }
    return entries
  }
  if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
    const last = entries.at(-1)
    if (last?.kind === 'assistant' && last.operationId === operationId) {
      return [
        ...entries.slice(0, -1),
        { ...last, text: last.text + event.delta },
      ]
    }
    return [...entries, { kind: 'assistant', operationId, text: event.delta }]
  }
  if (event.type === EventType.TOOL_CALL_START) {
    return [...entries, { kind: 'tool', text: `tool ${event.toolCallName}` }]
  }
  if (event.type === EventType.RUN_ERROR) {
    return [...entries, { kind: 'notice', text: `Error: ${event.message}` }]
  }
  if (
    event.type === EventType.CUSTOM &&
    event.name === HARNESS_EVENTS.operationResumed
  ) {
    return [
      ...entries,
      { kind: 'notice', text: 'Resumed a turn that a crash stopped.' },
    ]
  }
  return entries
}

/** Answer every open interrupt of the last turn with one decision. */
export function resolveAll(
  session: HarnessSession,
  interrupts: ReadonlyArray<Interrupt>,
  approved: boolean,
) {
  const resume: Array<RunAgentResumeItem> = interrupts.map((interrupt) => ({
    interruptId: interrupt.id,
    status: 'resolved',
    payload: approved,
  }))
  return session.resolve(resume)
}

/** A short question for the open interrupts. */
export function approvalQuestion(interrupts: ReadonlyArray<Interrupt>): string {
  const names = interrupts.map(
    (interrupt) => interrupt.message ?? interrupt.toolCallId ?? interrupt.id,
  )
  return `Approve ${names.join(', ')}? [y/n]`
}

/** Resolves when no chat turn runs or waits in the queue. */
export async function waitIdle(session: HarnessSession): Promise<void> {
  while (true) {
    const snapshot = session.snapshot()
    const chatActive = snapshot.activeOperations.some(
      (operation) => operation.kind === 'chat',
    )
    if (
      snapshot.status !== 'running' &&
      !chatActive &&
      snapshot.queuedTurns === 0
    )
      return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
