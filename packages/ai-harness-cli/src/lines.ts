import { createInterface } from 'node:readline'
import { createSessionView } from '@tanstack/ai-harness/view'
import { saveMediaLine } from './attach'
import { handleLine } from './commands'
import { createPrinter } from './printer'
import { approvalQuestion, openUrl, resolveAll, waitIdle } from './session-view'
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
 * waits. Raw mode stops the echo. It also stops Ctrl+C, so this sends
 * SIGINT itself. Does nothing for a pipe.
 */
function secretTyping(input: NodeJS.ReadableStream) {
  const terminal = isTerminal(input) ? input : undefined
  let hidden = false
  const onKeys = (chunk: unknown) => {
    if (!String(chunk).includes('\u0003')) return
    show()
    process.kill(process.pid, 'SIGINT')
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
 * The line mode, for piped input: one message or command per line. Each
 * line waits for the turn it started. When a turn stops for approval, the
 * next line answers it (`y` approves, anything else rejects). In a
 * terminal, the answer to a secret question (a key) is not shown as the
 * user types. Line mode never prints the answer.
 *
 * `openSignIns`: open sign-in links in the browser (for an interactive terminal).
 * `mediaDir`: the folder for the media a turn makes. Each new file is saved
 * there, with one `[image saved: <path>]` line.
 */
export async function runLines(
  session: HarnessSession,
  input: NodeJS.ReadableStream,
  stdout: Output,
  options: { openSignIns?: boolean; mediaDir: string },
) {
  const view = createSessionView(session)
  const saves: Array<Promise<unknown>> = []
  const typing = secretTyping(input)
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
  const stopOpening = options.openSignIns
    ? view.on('signIn', (signIn) => {
        if (signIn.url) openUrl(signIn.url)
      })
    : () => {}
  const line = printer.line

  const lines = createInterface({ input, crlfDelay: Infinity })
  const pendingLater: Array<Promise<void>> = []
  try {
    for await (const raw of lines) {
      const typed = typing.isHidden() ? typedText(raw) : raw
      typing.show()
      const snapshot = session.snapshot()
      if (snapshot.status === 'requires_action') {
        await resolveAll(
          session,
          snapshot.pendingInterrupts,
          /^y(es)?$/i.test(typed.trim()),
        )
      } else {
        const result = await handleLine(session, typed)
        if (result.type === 'exit') break
        if (result.type === 'notice' && result.text) line(result.text)
        if (result.type === 'notice' && result.later) {
          pendingLater.push(result.later.then((text) => line(text)))
        }
      }
      await waitIdle(session)
      const after = session.snapshot()
      if (after.status === 'requires_action') {
        line(approvalQuestion(after.pendingInterrupts))
      }
      if (after.pendingQuestions[0]?.secret) typing.hide()
    }
  } finally {
    typing.show()
  }
  lines.close()
  await Promise.allSettled(pendingLater)
  await waitIdle(session)
  stopOpening()
  printing.unsubscribe()
  printer.print(view.store.get())
  await Promise.allSettled(saves)
  view.dispose()
  printer.end()
}
