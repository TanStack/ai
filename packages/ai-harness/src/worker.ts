import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { createHarnessHost } from './host'
import { scrubbedBy } from './session/harness-session'
import {
  applyInput,
  HARNESS_PROTOCOL_VERSION,
  versionError,
  parseControlFrame,
  requestIdOf,
} from './protocol'
import { wireFrame } from './wire'
import type { AnyHarness } from './define'
import type { HarnessPersistence } from './host'
import type { ControlFrame, HarnessErrorCode, HostFrame } from './protocol'

export interface HarnessWorkerOptions {
  input?: NodeJS.ReadableStream
  output?: { write: (text: string) => unknown }
  persistence?: HarnessPersistence
}

/**
 * Run a harness as a worker: session-tier frames as NDJSON on stdin and
 * stdout. The first frame must be `harness.subscribe`. The worker exits when
 * stdin closes, or after a `subscribe` with a `v` that it does not speak.
 * `artifactText` starts workers like this.
 *
 * @example
 * ```ts
 * await runHarnessWorker(assistant)
 * ```
 */
export async function runHarnessWorker(
  harness: AnyHarness,
  options: HarnessWorkerOptions = {},
): Promise<void> {
  const output = options.output ?? process.stdout
  const send = (frame: HostFrame | string) =>
    output.write(
      `${typeof frame === 'string' ? frame : JSON.stringify(frame)}\n`,
    )
  const host = createHarnessHost(
    options.persistence ? { persistence: options.persistence } : {},
  )
  const reader = new AbortController()
  let session: Awaited<ReturnType<typeof host.open>> | undefined
  const lines = createInterface({
    input: options.input ?? process.stdin,
    crlfDelay: Infinity,
  })

  // The error frame names the request that failed, so the client can match
  // it. A frame with no `requestId` gets one from the worker. The message
  // has no secrets of the session once it is open.
  const fail = (
    error: unknown,
    requestId: string,
    code: HarnessErrorCode = 'internal',
  ) => {
    const scrubbed = scrubbedBy(session, error)
    send({
      type: 'harness.error',
      message: scrubbed instanceof Error ? scrubbed.message : String(scrubbed),
      code,
      requestId,
    })
  }

  try {
    for await (const line of lines) {
      if (line.trim() === '') continue
      // Read the id before the full parse: a frame with a bad `input` still
      // names its request.
      const requestId = requestIdOf(line) ?? randomUUID()
      let frame: ControlFrame
      try {
        frame = parseControlFrame(line)
      } catch (error) {
        fail(error, requestId, 'invalid_frame')
        continue
      }
      try {
        if (frame.type === 'harness.subscribe') {
          if (session) {
            fail(new Error('Already subscribed.'), requestId, 'invalid_frame')
            continue
          }
          const refused = versionError(frame.v)
          if (refused) {
            // The worker speaks no other version, so it stops.
            send({ type: 'harness.error', requestId, ...refused })
            break
          }
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
            // Each event goes out as an AG-UI wire chunk.
            for await (const entry of events) send(wireFrame(entry))
          })().catch((error: unknown) => fail(error, requestId))
          continue
        }
        if (!session) {
          fail(
            new Error('Send harness.subscribe first.'),
            requestId,
            'invalid_frame',
          )
          continue
        }
        if (frame.type === 'harness.snapshot') {
          send({ type: 'harness.snapshot', snapshot: session.snapshot() })
          continue
        }
        const receipt = await applyInput({
          harness,
          session,
          input: frame.input,
          ...(frame.traceparent ? { traceparent: frame.traceparent } : {}),
        })
        send({
          type: 'harness.receipt',
          requestId: frame.requestId,
          ...receipt,
        })
      } catch (error) {
        fail(error, requestId)
      }
    }
  } finally {
    reader.abort()
    // The worker holds one handle for its life.
    await session?.close()
    await host.close()
  }
}
