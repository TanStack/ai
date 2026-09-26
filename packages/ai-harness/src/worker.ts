import { createInterface } from 'node:readline'
import { createHarnessHost } from './host'
import {
  HARNESS_PROTOCOL_VERSION,
  applyInput,
  parseControlFrame,
} from './protocol'
import type { AnyHarness } from './define'
import type { HarnessPersistence } from './host'
import type { HostFrame } from './protocol'

export interface HarnessWorkerOptions {
  input?: NodeJS.ReadableStream
  output?: { write: (text: string) => unknown }
  persistence?: HarnessPersistence
}

/**
 * Run a harness as a worker: session-tier frames as NDJSON on stdin and
 * stdout. The first frame must be `harness.subscribe`. The worker exits when
 * stdin closes. `artifactText` starts workers like this.
 */
export async function runHarnessWorker(
  harness: AnyHarness,
  options: HarnessWorkerOptions = {},
): Promise<void> {
  const output = options.output ?? process.stdout
  const send = (frame: HostFrame) => output.write(`${JSON.stringify(frame)}\n`)
  const host = createHarnessHost(
    options.persistence ? { persistence: options.persistence } : {},
  )
  const reader = new AbortController()
  let session: Awaited<ReturnType<typeof host.open>> | undefined
  const lines = createInterface({
    input: options.input ?? process.stdin,
    crlfDelay: Infinity,
  })

  try {
    for await (const line of lines) {
      if (line.trim() === '') continue
      try {
        const frame = parseControlFrame(line)
        if (frame.type === 'harness.subscribe') {
          if (session) throw new Error('Already subscribed.')
          session = await host.open(harness, { threadId: frame.threadId })
          send({
            type: 'harness.hello',
            v: HARNESS_PROTOCOL_VERSION,
            threadId: frame.threadId,
          })
          const events = session.events({
            ...(frame.from ? { from: frame.from } : {}),
            signal: reader.signal,
          })
          void (async () => {
            for await (const entry of events)
              send({ type: 'harness.event', ...entry })
          })()
          continue
        }
        if (!session) throw new Error('Send harness.subscribe first.')
        if (frame.type === 'harness.snapshot') {
          send({ type: 'harness.snapshot', snapshot: session.snapshot() })
          continue
        }
        const receipt = await applyInput(harness, session, frame.input)
        send({
          type: 'harness.receipt',
          requestId: frame.requestId,
          ...receipt,
        })
      } catch (error) {
        send({
          type: 'harness.error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  } finally {
    reader.abort()
    await host.close()
  }
}
