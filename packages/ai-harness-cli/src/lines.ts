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

/**
 * The line mode, for piped input: one message or command per line. Each
 * line waits for the turn it started. When a turn stops for approval, the
 * next line answers it (`y` approves, anything else rejects).
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
  const printer = createPrinter((text) => stdout.write(text), {
    onMedia: (part) => {
      const saved = saveMediaLine(session, part, options.mediaDir)
      saves.push(saved.then(({ text }) => printer.line(text)))
    },
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
  for await (const typed of lines) {
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
