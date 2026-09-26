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
  if (
    event.type === EventType.CUSTOM &&
    event.name === HARNESS_EVENTS.question
  ) {
    const value = event.value as { message?: unknown }
    return [
      ...entries,
      { kind: 'notice', text: `? ${String(value.message ?? '')}` },
    ]
  }
  if (
    event.type === EventType.CUSTOM &&
    event.name === HARNESS_EVENTS.authRequired
  ) {
    const value = event.value as {
      connector?: unknown
      url?: unknown
      userCode?: unknown
    }
    const code =
      typeof value.userCode === 'string'
        ? ` and enter the code ${value.userCode}`
        : ''
    const where =
      typeof value.url === 'string'
        ? ` Open ${value.url}${code}.`
        : ` Run /connect ${String(value.connector)}.`
    return [
      ...entries,
      {
        kind: 'notice',
        text: `Sign in to ${String(value.connector)}.${where}`,
      },
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

/** Open an http(s) URL in the default browser. No shell is involved. */
export function openUrl(url: string): void {
  if (!/^https?:\/\//.test(url)) return
  void import('node:child_process').then(({ spawn }) => {
    const [command, args] =
      process.platform === 'win32'
        ? // Not `cmd /c start`: cmd would read `&` in the URL as a command separator.
          ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : process.platform === 'darwin'
          ? ['open', [url]]
          : ['xdg-open', [url]]
    try {
      spawn(command, args, { stdio: 'ignore', detached: true }).unref()
    } catch {
      // The notice still shows the URL.
    }
  })
}

/** A short question for the open interrupts. */
export function approvalQuestion(interrupts: ReadonlyArray<Interrupt>): string {
  const names = interrupts.map(
    (interrupt) => interrupt.message ?? interrupt.toolCallId ?? interrupt.id,
  )
  return `Approve ${names.join(', ')}? [y/n]`
}

/**
 * Resolves when no chat turn runs or waits in the queue, or when the
 * session waits for an answer to a question.
 */
export async function waitIdle(session: HarnessSession): Promise<void> {
  while (true) {
    const snapshot = session.snapshot()
    if (snapshot.pendingQuestions.length > 0) return
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
