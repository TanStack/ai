import { createInterface } from 'node:readline'
import { createSessionView } from '@tanstack/ai-harness/view'
import { saveMediaLine } from './attach'
import { firstQuestion, handleLine } from './commands'
import { createPrinter } from './printer'
import {
  answerOf,
  openUrl,
  turnWaits,
  waitIdle,
  waitQuestion,
} from './session-view'
import type { RunAgentResumeItem } from '@tanstack/ai'
import type { HarnessSession } from '@tanstack/ai-harness'

interface Output {
  write: (text: string) => unknown
}

/** A terminal, which can stop showing what the user types. A pipe cannot. */
function isTerminal(input: NodeJS.ReadableStream): input is NodeJS.ReadStream {
  return 'isTTY' in input && input.isTTY === true && 'setRawMode' in input
}

/**
 * The text of a line typed in raw mode, where the terminal does not edit
 * it: a backspace removes the character before it, and other control
 * characters are dropped.
 */
function typedText(raw: string) {
  let text = ''
  for (const char of raw) {
    if (char === '\u007f' || char === '\b') text = text.slice(0, -1)
    else if (char >= ' ') text += char
  }
  return text
}

/**
 * Hide what the user types in a terminal while a secret question (a key)
 * waits. Raw mode stops the echo. It also makes Ctrl+C a typed character
 * and not SIGINT, so this calls `onCtrlC`. Does nothing for a pipe.
 */
function secretTyping(input: NodeJS.ReadableStream, onCtrlC: () => void) {
  const terminal = isTerminal(input) ? input : undefined
  let hidden = false
  const onKeys = (chunk: unknown) => {
    if (!String(chunk).includes('\u0003')) return
    show()
    onCtrlC()
  }
  const show = () => {
    if (!terminal || !hidden) return
    hidden = false
    terminal.off('data', onKeys)
    terminal.setRawMode(false)
  }
  return {
    canHide: terminal !== undefined,
    isHidden: () => hidden,
    hide: () => {
      if (!terminal || hidden) return
      hidden = true
      terminal.setRawMode(true)
      terminal.on('data', onKeys)
    },
    show,
  }
}

/**
 * The line mode: one message or command per line. When a turn stops for
 * its waits, each next line answers one of them, by its kind and schema
 * (see `answerOf`: `y` approves an approval). After the last one, the turn
 * goes on. A question of a command or a durable tool takes the next line.
 * In a terminal, the answer to a secret question (a key) is not shown as
 * the user types. Line mode never prints the answer.
 *
 * `interactive`: the user types the lines (a terminal). Each line acts at
 * once: `/cancel` cancels the running turn, and a message steers it. Sign-in
 * links open in the browser. Without it (piped input), each line waits for
 * the turn that the line before it started, so a script runs in order.
 * `mediaDir`: the folder for the media a turn makes. Each new file is saved
 * there, with one `[image saved: <path>]` line.
 * `signal`: stop reading lines when it aborts.
 * `onCtrlC`: runs on Ctrl+C while typing is hidden, as the terminal then
 * sends no SIGINT.
 */
export async function runLines(
  session: HarnessSession,
  input: NodeJS.ReadableStream,
  stdout: Output,
  options: {
    interactive?: boolean
    mediaDir: string
    signal: AbortSignal
    onCtrlC: () => void
  },
) {
  const view = createSessionView(session)
  const saves: Array<Promise<unknown>> = []
  const typing = secretTyping(input, options.onCtrlC)
  const printer = createPrinter((text) => stdout.write(text), {
    onMedia: (part) => {
      const saved = saveMediaLine(session, part, options.mediaDir)
      saves.push(saved.then(({ text }) => printer.line(text)))
    },
    hidesSecrets: typing.canHide,
  })
  await view.ready
  // Line mode prints only what happens from now on.
  printer.mark(view.store.get())
  const printing = view.store.subscribe((state) => printer.print(state))
  const stopOpening = options.interactive
    ? view.on('signIn', (signIn) => {
        if (signIn.url) openUrl(signIn.url)
      })
    : () => {}
  const line = printer.line

  const lines = createInterface({
    input,
    crlfDelay: Infinity,
    signal: options.signal,
  })
  const pendingLater: Array<Promise<void>> = []
  /** The answers to the waits of the stopped turn so far, by wait id. */
  const decided = new Map<string, RunAgentResumeItem>()
  /**
   * Wait for the turn to end. Then ask for its next wait that has no
   * answer, and hide the typing for a secret question. In a terminal, this
   * runs while the next lines are read. Only one runs at a time, so each
   * wait is asked once.
   */
  const afterTurn = async () => {
    await waitIdle(session)
    const after = session.snapshot()
    const ask =
      after.status === 'requires_action'
        ? turnWaits(after).find(({ waitId }) => !decided.has(waitId))
        : undefined
    if (ask) line(waitQuestion(ask))
    if (firstQuestion(after)?.secret) typing.hide()
  }
  let waiting: Promise<void> | undefined
  try {
    for await (const raw of lines) {
      // Lines that came before the stop do not run.
      if (options.signal.aborted) break
      const typed = typing.isHidden() ? typedText(raw) : raw
      typing.show()
      const snapshot = session.snapshot()
      const waits = turnWaits(snapshot)
      const next = waits.find(({ waitId }) => !decided.has(waitId))
      if (snapshot.status === 'requires_action' && next) {
        decided.set(next.waitId, answerOf(next, typed))
        // One resolve answers every wait of the turn.
        if (waits.every(({ waitId }) => decided.has(waitId))) {
          const resume = waits.flatMap(
            ({ waitId }) => decided.get(waitId) ?? [],
          )
          decided.clear()
          await session.resolve({ resume })
        }
      } else {
        const result = await handleLine(session, typed)
        if (result.type === 'exit') break
        if (result.type === 'notice' && result.text) line(result.text)
        if (result.type === 'notice' && result.later) {
          pendingLater.push(result.later.then((text) => line(text)))
        }
      }
      if (!options.interactive) {
        await afterTurn()
        continue
      }
      // A secret question that the line asked hides the next line at once.
      if (firstQuestion(session.snapshot())?.secret) typing.hide()
      waiting ??= afterTurn().finally(() => {
        waiting = undefined
      })
    }
  } finally {
    typing.show()
  }
  lines.close()
  await waiting
  await Promise.allSettled(pendingLater)
  await waitIdle(session)
  stopOpening()
  printing.unsubscribe()
  printer.print(view.store.get())
  await Promise.allSettled(saves)
  view.dispose()
  printer.end()
}
