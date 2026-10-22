import { EventType } from '@tanstack/ai'
import { HARNESS_EVENTS } from '@tanstack/ai-harness'
import { isMediaRecord } from '@tanstack/ai-harness/media'
import { attach, saveMediaLine } from './attach'
import type { HarnessSession, Wait } from '@tanstack/ai-harness'

/**
 * The exit codes of the CLI. `needsAction` (3): the turn waits for a person
 * (an approval, an answer, a sign-in).
 */
export const EXIT = {
  ok: 0,
  failed: 1,
  needsAction: 3,
  cancelled: 130,
} as const

/** What `--print` says on stderr when the turn waits for `wait`. */
function needsActionText(wait: Wait | undefined) {
  const what =
    wait?.kind === 'approval'
      ? 'an approval'
      : wait?.kind === 'sign-in'
        ? 'a sign-in'
        : 'an answer'
  const message = wait?.message ? `: ${wait.message}` : ''
  return `The turn waits for ${what}${message}. Run without --print, in line mode, to answer it.\n`
}

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
 *
 * When the turn waits for a person (an approval, a question, a sign-in),
 * it stops there and resolves with `EXIT.needsAction`: nobody can answer
 * in this mode.
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
  const operation = session.send(input)
  /** Print the events of the turn. Resolves with its failure, if any. */
  const stream = async (): Promise<unknown> => {
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
    return operation.then(
      () => undefined,
      (error: unknown) => error,
    )
  }
  const stop = new AbortController()
  // A wait of the turn ends the run of --print: nobody can answer it here.
  const opened = session
    .waitForRun({ runId: operation.id, signal: stop.signal })
    .then(
      (wait) => ({ type: 'wait' as const, wait }),
      () => new Promise<never>(() => {}),
    )
  const ended = stream().then((failure) => ({ type: 'end' as const, failure }))
  const first = await Promise.race([ended, opened])
  stop.abort()
  const isTurnStop =
    first.type === 'wait' &&
    session
      .snapshot()
      .pendingWaits.some(
        ({ waitId, turn }) => turn && waitId === first.wait.waitId,
      )
  if (first.type === 'wait' && !isTurnStop) {
    if (options.output === 'text') stdout.write('\n')
    stderr.write(needsActionText(first.wait))
    return EXIT.needsAction
  }
  // A turn that stopped for its waits ends its stream first.
  const { failure } = await ended
  if (options.output === 'text') stdout.write('\n')
  const status = operation.status()
  if (status === 'completed') return EXIT.ok
  if (status === 'interrupted') {
    const [wait] = session.snapshot().pendingWaits
    stderr.write(needsActionText(wait))
    return EXIT.needsAction
  }
  if (status === 'cancelled') return EXIT.cancelled
  stderr.write(
    `The turn failed: ${failure instanceof Error ? failure.message : String(failure)}\n`,
  )
  return EXIT.failed
}
