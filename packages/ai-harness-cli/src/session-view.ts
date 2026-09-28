import type { Interrupt, RunAgentResumeItem } from '@tanstack/ai'
import type { HarnessSession } from '@tanstack/ai-harness'
import type { SignIn } from '@tanstack/ai-harness/view'

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
export function openUrl(url: string) {
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
export function approvalQuestion(interrupts: ReadonlyArray<Interrupt>) {
  const names = interrupts.map(
    (interrupt) => interrupt.message ?? interrupt.toolCallId ?? interrupt.id,
  )
  return `Approve ${names.join(', ')}? [y/n]`
}

/**
 * Resolves when no chat turn runs or waits in the queue, or when the
 * session waits for an answer to a question.
 */
export async function waitIdle(session: HarnessSession) {
  while (true) {
    const snapshot = session.snapshot()
    if (snapshot.pendingQuestions.length > 0) return
    const chatActive = snapshot.activeOperations.some(
      (operation) => operation.kind === 'chat',
    )
    const isIdle =
      snapshot.status !== 'running' && !chatActive && snapshot.queuedTurns === 0
    if (isIdle) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/** The first 200 characters of a child's answer, on one line. */
export function shortAnswer(text: string) {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 200 ? `${line.slice(0, 200)}...` : line
}

/** The sign-in line for a connector: its link and code, or the command. */
export function signInText(signIn: SignIn) {
  const code = signIn.userCode ? ` and enter the code ${signIn.userCode}` : ''
  const where = signIn.url
    ? ` Open ${signIn.url}${code}.`
    : ` Run /connect ${signIn.connector}.`
  return `Sign in to ${signIn.connector}.${where}`
}
