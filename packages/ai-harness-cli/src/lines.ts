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
  // True while streamed text has no line break at its end yet.
  let midLine = false
  const line = (text: string) => {
    if (midLine) stdout.write('\n')
    midLine = false
    stdout.write(`${text}\n`)
  }
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
        midLine = true
      } else if (last.kind === 'assistant') {
        if (midLine) stdout.write('\n')
        stdout.write(last.text)
        midLine = true
      } else {
        line(`[${last.text}]`)
      }
      entries = next
    }
  })()

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
  reader.abort()
  await printing
  if (midLine) stdout.write('\n')
}
