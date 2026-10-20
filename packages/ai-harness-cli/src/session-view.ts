import { parseAnswer } from './commands'
import type { RunAgentResumeItem } from '@tanstack/ai'
import type {
  HarnessSession,
  SessionSnapshot,
  Wait,
} from '@tanstack/ai-harness'
import type { SignIn } from '@tanstack/ai-harness/view'

/** The waits of the stopped turn, in order. One resolve answers them all. */
export function turnWaits(snapshot: SessionSnapshot) {
  return snapshot.pendingWaits.filter(({ turn }) => turn)
}

const isYes = (text: string) => /^y(es)?$/i.test(text.trim())

/**
 * The answer of the reply `text` to `wait`, by its kind and schema:
 *
 * - `approval`: `y` approves and `n` rejects. Any other reply is read with
 *   the schema of the wait (for example `always` for an approval of
 *   `permissions()`), and an approval with no schema rejects it.
 * - `question` and `human`: the reply, read with the schema.
 * - `sign-in`: `y` goes on after the sign-in. Any other reply skips it.
 * - `client-tool`: a terminal cannot run it, so any reply skips it.
 */
export function answerOf(wait: Wait, text: string): RunAgentResumeItem {
  const resolved = (payload: unknown): RunAgentResumeItem => ({
    interruptId: wait.waitId,
    status: 'resolved',
    payload,
  })
  const skipped: RunAgentResumeItem = {
    interruptId: wait.waitId,
    status: 'cancelled',
  }
  switch (wait.kind) {
    case 'approval': {
      const reply = text.trim()
      if (isYes(reply)) return resolved(true)
      if (/^no?$/i.test(reply) || wait.schema === undefined) {
        return resolved(false)
      }
      return resolved(parseAnswer(reply, wait.schema))
    }
    case 'question':
    case 'human':
      return resolved(parseAnswer(text, wait.schema))
    case 'sign-in':
      return isYes(text) ? resolved(true) : skipped
    case 'client-tool':
      return skipped
  }
}

/** The line that asks the user for the answer to `wait`. */
export function waitQuestion(wait: Wait) {
  const message = wait.message ?? wait.waitId
  switch (wait.kind) {
    case 'approval':
      return `Approve ${message}? [y/n]`
    case 'question':
    case 'human':
      return `? ${message}`
    case 'sign-in':
      return `${message} Sign in, then answer y to go on, or n to skip. [y/n]`
    case 'client-tool':
      return `${message}: this tool runs in a client, not here. Send any line to skip it.`
  }
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

/**
 * Resolves when no chat turn runs or waits in the queue, or when a wait is
 * open (see `session.waitForRun`): the user answers it on the next line.
 */
export async function waitIdle(session: HarnessSession) {
  while (true) {
    const snapshot = session.snapshot()
    if (snapshot.pendingWaits.length > 0) return
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
