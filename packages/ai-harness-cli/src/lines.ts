import { createInterface } from 'node:readline'
import { handleLine } from './commands'
import {
  applyEvent,
  approvalQuestion,
  resolveAll,
  waitIdle,
} from './session-view'
import type { HarnessSession } from '@tanstack/ai-harness'
import type { ViewEntry } from './session-view'

interface Output {
  write: (text: string) => unknown
}

/**
 * The line mode, for piped input: one message or command per line. Each
 * line waits for the turn it started. When a turn stops for approval, the
 * next line answers it (`y` approves, anything else rejects).
 */
export async function runLines(
  session: HarnessSession,
  input: NodeJS.ReadableStream,
  stdout: Output,
): Promise<void> {
  const reader = new AbortController()
  let entries: Array<ViewEntry> = []
  let printed = 0
  const printing = (async () => {
    for await (const entry of session.events({
      from: session.snapshot().cursor,
      signal: reader.signal,
    })) {
      const next = applyEvent(entries, entry)
      const last = next.at(-1)
      if (next === entries || !last) continue
      // Print the growth of the last assistant entry, or each new entry.
      const previous = entries.at(-1)
      if (
        last.kind === 'assistant' &&
        previous?.kind === 'assistant' &&
        previous.operationId === last.operationId
      ) {
        stdout.write(last.text.slice(previous.text.length))
      } else {
        if (printed > 0) stdout.write('\n')
        stdout.write(last.kind === 'assistant' ? last.text : `[${last.text}]`)
      }
      printed += 1
      entries = next
    }
  })()

  const lines = createInterface({ input, crlfDelay: Infinity })
  const pendingLater: Array<Promise<void>> = []
  for await (const line of lines) {
    const snapshot = session.snapshot()
    if (snapshot.status === 'requires_action') {
      await resolveAll(
        session,
        snapshot.pendingInterrupts,
        /^y(es)?$/i.test(line.trim()),
      )
    } else {
      const result = await handleLine(session, line)
      if (result.type === 'exit') break
      if (result.type === 'notice' && result.text)
        stdout.write(`${result.text}\n`)
      if (result.type === 'notice' && result.later) {
        pendingLater.push(
          result.later.then((text) => void stdout.write(`\n${text}\n`)),
        )
      }
    }
    await waitIdle(session)
    const after = session.snapshot()
    if (after.status === 'requires_action') {
      stdout.write(`\n${approvalQuestion(after.pendingInterrupts)}\n`)
    }
  }
  lines.close()
  await Promise.allSettled(pendingLater)
  await waitIdle(session)
  reader.abort()
  await printing
  if (printed > 0) stdout.write('\n')
}
