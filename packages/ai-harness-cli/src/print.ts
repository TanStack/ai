import { EventType } from '@tanstack/ai'
import { HARNESS_EVENTS, isMediaRecord } from '@tanstack/ai-harness'
import { attach, saveMediaLine } from './attach'
import type { HarnessSession } from '@tanstack/ai-harness'

export const EXIT = {
  ok: 0,
  failed: 1,
  needsAction: 2,
  cancelled: 130,
} as const

interface Output {
  write: (text: string) => unknown
}

/**
 * Run one prompt and print it. `text` prints the answer as it streams.
 * `ndjson` prints every AG-UI event as one JSON line. Each `@path` file in
 * the prompt goes with it.
 *
 * Each media file the turn makes is saved into `mediaDir`. `ndjson` adds the
 * saved `path` to the value of its `harness.media` event. `text` prints the
 * saved line to stderr, so stdout keeps only the answer.
 */
export async function runPrint(
  session: HarnessSession,
  prompt: string,
  options: {
    output: 'text' | 'ndjson'
    stdout: Output
    stderr: Output
    mediaDir: string
  },
) {
  const { stdout, stderr } = options
  const input = await attach(session, prompt, { cwd: process.cwd() })
  const operation = session.prompt(input)
  for await (const chunk of operation.stream()) {
    const media =
      chunk.type === EventType.CUSTOM &&
      chunk.name === HARNESS_EVENTS.media &&
      isMediaRecord(chunk.value)
        ? chunk.value
        : undefined
    if (media !== undefined) {
      const saved = await saveMediaLine(session, media, options.mediaDir)
      if (options.output === 'text' || saved.path === undefined) {
        stderr.write(`${saved.text}\n`)
      }
      if (options.output === 'ndjson') {
        // A file that was not saved has no `path`: JSON drops `undefined`.
        const value = { ...media, path: saved.path }
        stdout.write(`${JSON.stringify({ ...chunk, value })}\n`)
      }
    } else if (options.output === 'ndjson') {
      stdout.write(`${JSON.stringify(chunk)}\n`)
    } else if (
      chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
      !('subagentRunId' in chunk && chunk.subagentRunId)
    ) {
      stdout.write(chunk.delta)
    }
  }
  const failure: unknown = await operation.then(
    () => undefined,
    (error: unknown) => error,
  )
  if (options.output === 'text') stdout.write('\n')
  const status = operation.status()
  if (status === 'completed') return EXIT.ok
  if (status === 'interrupted') {
    stderr.write(
      'The turn stopped for an approval. Run without --print, in line mode, to answer it.\n',
    )
    return EXIT.needsAction
  }
  if (status === 'cancelled') return EXIT.cancelled
  stderr.write(
    `The turn failed: ${failure instanceof Error ? failure.message : String(failure)}\n`,
  )
  return EXIT.failed
}
