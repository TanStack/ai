import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import {
  InMemoryRunStore,
  provideDetachableRun,
  provideRunDetached,
} from '../src/activities/chat/middleware/run-store'
import { requestRunCancel } from '../src/activities/chat/cancel'
import { getRunDisconnect } from '../src/activities/chat/middleware/run-disconnect'
import { memoryStream } from '../src/stream-durability'
import { toServerSentEventsResponse } from '../src/stream-to-response'
import { EventType } from '../src/types'
import { createMockAdapter, ev } from './test-utils'
import type { RunStore } from '../src/activities/chat/middleware/run-store'
import type { StreamChunk } from '../src/types'

/**
 * A DURABLE RUN MUST SURVIVE LOSING ITS VIEWER.
 *
 * The defect these tests pin is the most expensive one in the durable-run seam,
 * and it was invisible because every symptom pointed somewhere else.
 *
 * To make a disconnect reach `withSandbox`, an application had only one route:
 * mirror `request.signal` into `chat()`'s `abortController`. That ABORTS THE RUN.
 * `chat()` then returns at its `isCancelled()` check immediately after middleware
 * `setup`, so the harness adapter's `chatStream` is never called and the agent in
 * the sandbox that `setup` just spent minutes building is NEVER LAUNCHED. The user
 * switched tabs during "starting the sandbox", came back, and found an empty log
 * belonging to a run that had done nothing — and no takeover could recover it,
 * because an agent that never started wrote no journal to replay.
 *
 * The fix separates the two facts that were conflated: a socket closing is a
 * NOTIFICATION (delivered through the internal `RunDisconnectCapability`), not a
 * cancellation. The run keeps producing into its still-open durable log, and a
 * re-attaching client tails that log to the real terminal.
 *
 * These drive the whole seam — a real `chat()`, a real `toServerSentEventsResponse`
 * with a real `memoryStream`, and a middleware using exactly `withSandbox`'s rule —
 * so they pin production behavior rather than a sketch of it.
 */

function runId(label: string): string {
  return `${label}-${crypto.randomUUID()}`
}

/** A `memoryStream` that also counts `close()` calls. */
function spyLog(id: string) {
  const inner = memoryStream(
    new Request(`https://example.test/api/chat?runId=${id}`, {
      method: 'POST',
    }),
  )
  let closes = 0
  return {
    closes: () => closes,
    async types(): Promise<Array<string>> {
      return (await inner.snapshot()).map((entry) => entry.chunk.type)
    },
    async text(): Promise<string> {
      const entries = await inner.snapshot()
      return entries
        .map((entry) =>
          entry.chunk.type === EventType.TEXT_MESSAGE_CONTENT
            ? (entry.chunk.delta ?? '')
            : '',
        )
        .join('')
    },
    adapter: {
      ...inner,
      close: async () => {
        closes += 1
        await inner.close()
      },
    },
  }
}

function gate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

/**
 * `withSandbox`'s rules, reduced to what core cares about.
 *
 * `setup` blocks on `setupGate` to model `definition.ensure` — the minutes-wide
 * await that creates the sandbox and clones the repo, and the window the common
 * disconnect actually lands in. The disconnect subscriber does the detach
 * bookkeeping and NOTHING that a still-running run depends on.
 */
function slowSandbox(options: {
  setupGate: Promise<void>
  onSetupEntered?: () => void
  runs?: RunStore
  detachOnDisconnect?: boolean
  record: { disconnects: number; aborts: number; finishes: number }
}) {
  return defineChatMiddleware({
    name: 'test-slow-sandbox',
    async setup(ctx) {
      provideDetachableRun(ctx, true)
      // Subscribed from inside `setup`, exactly as `withSandbox` does, and BEFORE
      // the long await — so this also pins that core calls back immediately for a
      // disconnect that lands while `setup` is still running.
      getRunDisconnect(ctx, { optional: true })?.subscribe(async () => {
        options.record.disconnects += 1
        if (options.detachOnDisconnect === false) return
        if (
          options.runs !== undefined &&
          (await options.runs.get(ctx.runId))?.cancelRequested === true
        ) {
          return
        }
        provideRunDetached(ctx, true)
      })
      options.onSetupEntered?.()
      await options.setupGate
    },
    onAbort() {
      options.record.aborts += 1
    },
    onFinish() {
      options.record.finishes += 1
    },
  })
}

/** The work the agent produces AFTER the slow setup completes. */
function agentAdapter() {
  return createMockAdapter({
    chatStreamFn: () =>
      (async function* () {
        yield ev.runStarted()
        yield ev.textStart()
        yield ev.textContent('the ')
        yield ev.textContent('remainder')
        yield ev.textEnd()
        yield ev.runFinished('stop')
      })(),
  })
}

interface Delivered {
  closes: number
  types: Array<string>
  text: string
  disconnects: number
  aborts: number
  finishes: number
}

/**
 * Start a durable run, close the delivery socket while `setup` is still blocked,
 * then let `setup` finish and observe what the run does with no viewer attached.
 */
async function disconnectMidSetup(options: {
  id: string
  runs?: RunStore
  detachOnDisconnect?: boolean
  /** Mirror `request.signal` into the run, i.e. the OLD wiring. */
  abortTheRun?: boolean
}): Promise<Delivered> {
  const log = spyLog(options.id)
  const setupGate = gate()
  const setupEntered = gate()
  const abortController = new AbortController()
  const record = { disconnects: 0, aborts: 0, finishes: 0 }

  const stream = chat({
    adapter: agentAdapter().adapter,
    messages: [{ role: 'user', content: 'triage this issue' }],
    runId: options.id,
    threadId: `thread-${options.id}`,
    abortController,
    middleware: [
      slowSandbox({
        setupGate: setupGate.promise,
        onSetupEntered: setupEntered.release,
        record,
        ...(options.runs !== undefined ? { runs: options.runs } : {}),
        ...(options.detachOnDisconnect !== undefined
          ? { detachOnDisconnect: options.detachOnDisconnect }
          : {}),
      }),
    ],
  })

  const response = toServerSentEventsResponse(
    stream as AsyncIterable<StreamChunk>,
    { durability: { adapter: log.adapter, batch: 1 } },
  )
  const body = response.body
  if (!body) throw new Error('Expected a response body')
  const reader = body.getReader()
  const drained = (async () => {
    try {
      for (;;) {
        const result = await reader.read()
        if (result.done) return
      }
    } catch {
      // the reader was cancelled; the producer carries on without it
    }
  })()

  // The client goes away while the sandbox is still being built. Waiting for
  // `setup` to actually be entered is what makes this the REAL scenario (a user
  // switching away seconds into "starting the sandbox") rather than a race against
  // `chat()`'s own start-up.
  await setupEntered.promise
  await reader.cancel()
  if (options.abortTheRun === true) abortController.abort()

  // `ensure` finally returns, minutes later.
  setupGate.release()
  await drained
  // Let the detached producer finish draining into the log.
  await new Promise((resolve) => setTimeout(resolve, 50))

  return {
    closes: log.closes(),
    types: await log.types(),
    text: await log.text(),
    disconnects: record.disconnects,
    aborts: record.aborts,
    finishes: record.finishes,
  }
}

describe('a durable run whose viewer disconnects mid-setup', () => {
  it('keeps running, launches the agent, and drains the remainder into the log', async () => {
    // THE REGRESSION TEST. Before the fix the only way the middleware heard about
    // the disconnect was an abort, and the run then returned right after `setup`
    // without ever calling the adapter: the log held nothing and the agent never
    // ran. Now the disconnect is a notification, so the work still happens.
    const out = await disconnectMidSetup({ id: runId('survives-mid-setup') })

    expect(out.disconnects).toBe(1)
    // The agent RAN — this is the assertion that fails without the fix.
    expect(out.text).toBe('the remainder')
    expect(out.types).toContain(EventType.RUN_STARTED)
    // …and reached its own real terminal, rather than a synthetic one.
    expect(out.types.at(-1)).toBe(EventType.RUN_FINISHED)
    expect(out.types).not.toContain(EventType.RUN_ERROR)
    // A run that finished is not an aborted run.
    expect(out.aborts).toBe(0)
    expect(out.finishes).toBe(1)
  })

  it('closes the log once the run reaches its own terminal, so tailers are not parked forever', async () => {
    // The counterpart to "a detached log stays open". Open is correct only while
    // someone may still continue the log; once the run has terminalized it itself,
    // leaving it open would park every later tailer forever on a log nobody will
    // ever append to — the wedge `claim.ts` refuses to create.
    const out = await disconnectMidSetup({ id: runId('closes-after-finish') })
    expect(out.types.at(-1)).toBe(EventType.RUN_FINISHED)
    expect(out.closes).toBe(1)
  })

  it('is dispatched at most once, however many times the body is cancelled', async () => {
    const id = runId('once-only')
    const log = spyLog(id)
    const setupGate = gate()
    const setupEntered = gate()
    const record = { disconnects: 0, aborts: 0, finishes: 0 }

    const stream = chat({
      adapter: agentAdapter().adapter,
      messages: [{ role: 'user', content: 'go' }],
      runId: id,
      threadId: `thread-${id}`,
      abortController: new AbortController(),
      middleware: [
        slowSandbox({
          setupGate: setupGate.promise,
          onSetupEntered: setupEntered.release,
          record,
        }),
      ],
    })
    const response = toServerSentEventsResponse(
      stream as AsyncIterable<StreamChunk>,
      { durability: { adapter: log.adapter, batch: 1 } },
    )
    const body = response.body
    if (!body) throw new Error('Expected a response body')
    const reader = body.getReader()
    const drained = (async () => {
      try {
        for (;;) {
          if ((await reader.read()).done) return
        }
      } catch {
        /* cancelled */
      }
    })()

    await setupEntered.promise
    await reader.cancel()
    await reader.cancel()
    setupGate.release()
    await drained
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(record.disconnects).toBe(1)
  })

  it('does not stamp a detach for a run with an out-of-band cancel recorded', async () => {
    // Intent is never inferred from a disconnect, but an intent already RECORDED
    // is authoritative. Detaching such a run would hand a deliberately-stopped run
    // to the reaper as reclaimable work.
    const id = runId('cancel-recorded')
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: id,
      threadId: `thread-${id}`,
      startedAt: 1,
    })
    await requestRunCancel(runs, id)

    const out = await disconnectMidSetup({ id, runs })

    expect(out.disconnects).toBe(1)
    // The verdict was withheld, so the log terminalizes and closes as always.
    expect(out.closes).toBe(1)
  })

  it('still runs to completion when the middleware opts out of detach-on-disconnect', async () => {
    // Opting out governs whether the run is RECORDED as detached, never whether it
    // is allowed to finish the work it already started.
    const out = await disconnectMidSetup({
      id: runId('opted-out'),
      detachOnDisconnect: false,
    })
    expect(out.disconnects).toBe(1)
    expect(out.text).toBe('the remainder')
    expect(out.closes).toBe(1)
  })

  it('a genuine abort still stops the run — the notification is not a substitute', async () => {
    // The guard against over-correcting: making a disconnect harmless must not
    // make a real stop harmless too.
    const out = await disconnectMidSetup({
      id: runId('genuine-abort'),
      abortTheRun: true,
    })
    expect(out.aborts).toBe(1)
    expect(out.finishes).toBe(0)
    expect(out.text).toBe('')
  })
})
