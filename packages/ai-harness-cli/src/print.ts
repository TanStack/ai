import { EventType } from '@tanstack/ai'
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
 * `ndjson` prints every AG-UI event as one JSON line.
 */
export async function runPrint(
  session: HarnessSession,
  prompt: string,
  options: { output: 'text' | 'ndjson'; stdout: Output; stderr: Output },
): Promise<number> {
  const { stdout, stderr } = options
  const operation = session.prompt(prompt)
  for await (const chunk of operation.stream()) {
    if (options.output === 'ndjson') {
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
      'The turn stopped for an approval. Run the interactive mode to answer it.\n',
    )
    return EXIT.needsAction
  }
  if (status === 'cancelled') return EXIT.cancelled
  stderr.write(
    `The turn failed: ${failure instanceof Error ? failure.message : String(failure)}\n`,
  )
  return EXIT.failed
}
