import { describe, expect, it, vi } from 'vitest'
import {
  DetachableRunCapability,
  EventType,
  RUN_CANCEL_REASON,
  chat,
  defineChatMiddleware,
  provideDetachableRun,
  requestRunCancel,
} from '@tanstack/ai'
import type {
  AnyTextAdapter,
  ChatMiddleware,
  ChatMiddlewareContext,
  StreamChunk,
} from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'
import type { AIPersistence, RunStore } from '../src'

/**
 * Abort semantics (Phase 3, Task 6).
 *
 * `'interrupted'` is a human-in-the-loop PAUSE and is NOT terminal; `'aborted'`
 * is an explicit end. Conflating them meant a cancelled run never reached a
 * terminal status, so nothing downstream (notably the reaper) could classify it.
 */

/** Adapter that emits RUN_STARTED then hangs until the signal aborts. */
function hangingAdapter(signal: AbortSignal): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: () =>
      (async function* () {
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r1',
          threadId: 't1',
          timestamp: 1,
        } satisfies StreamChunk
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true })
        })
      })(),
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
}

/**
 * Stand-in for `withSandbox`'s durability wiring: declares the run detachable.
 * The capability is imported from CORE — persistence must never import
 * `@tanstack/ai-sandbox`, which is exactly why core owns it.
 */
const detachableProvider: ChatMiddleware = defineChatMiddleware({
  name: 'detachable-provider',
  provides: [DetachableRunCapability],
  setup(ctx: ChatMiddlewareContext) {
    provideDetachableRun(ctx, true)
  },
})

interface AbortScenario {
  /** Whether a middleware declares the run detachable. */
  detachable: boolean
  /** Abort reason. A string reaches `AbortInfo.reason`; omit for a bare close. */
  reason?: string
  /** Runs once the run row exists, before the abort (e.g. a durable cancel). */
  beforeAbort?: (runs: RunStore, runId: string) => Promise<void>
}

async function driveAbort(
  runId: string,
  scenario: AbortScenario,
): Promise<AIPersistence> {
  const persistence = memoryPersistence()
  const runs = persistence.stores.runs
  if (!runs) throw new Error('memoryPersistence must provide a run store')
  const controller = new AbortController()

  const stream = chat({
    adapter: hangingAdapter(controller.signal),
    messages: [{ role: 'user', content: 'hi' }],
    runId,
    threadId: 't1',
    abortController: controller,
    middleware: scenario.detachable
      ? [detachableProvider, withPersistence(persistence)]
      : [withPersistence(persistence)],
  }) as AsyncIterable<StreamChunk>

  const reader = (async () => {
    try {
      for await (const _ of stream) {
        // drain until the abort ends the stream
      }
    } catch {
      // an abort may reject the stream; the status is what is under test
    }
  })()

  // Let onConfig/onStart establish the run row before aborting.
  await vi.waitFor(async () => {
    expect((await runs.get(runId))?.status).toBe('running')
  })
  await scenario.beforeAbort?.(runs, runId)
  if (scenario.reason === undefined) controller.abort()
  else controller.abort(scenario.reason)
  await reader

  return persistence
}

describe('chat onAbort status', () => {
  it('writes aborted for an explicit cancel signalled in-process', async () => {
    // Detachable, so only the explicit cancel can make this terminal.
    const persistence = await driveAbort('cancel-inproc', {
      detachable: true,
      reason: RUN_CANCEL_REASON,
    })

    const run = await persistence.stores.runs!.get('cancel-inproc')
    expect(run?.status).toBe('aborted')
    expect(run?.finishedAt).toBeTypeOf('number')
  })

  it('writes aborted for an explicit cancel recorded durably', async () => {
    // The abort itself is indistinguishable from a disconnect (no cancel
    // reason); the intent is read back off the run record. This is the only
    // channel that works when the cancel reached a different host.
    const persistence = await driveAbort('cancel-durable', {
      detachable: true,
      beforeAbort: (runs, runId) => requestRunCancel(runs, runId),
    })

    const run = await persistence.stores.runs!.get('cancel-durable')
    expect(run?.status).toBe('aborted')
    expect(run?.finishedAt).toBeTypeOf('number')
  })

  it('writes NOTHING for a plain disconnect on a detachable run', async () => {
    const persistence = await driveAbort('detach-plain', {
      detachable: true,
    })

    // The agent is still running and a later attach can take it over, so the
    // record must stay claimable. `detachedSince` is the detach path's job.
    const run = await persistence.stores.runs!.get('detach-plain')
    expect(run?.status).toBe('running')
    expect(run?.finishedAt).toBeUndefined()
  })

  it('writes aborted for a plain disconnect on a non-detachable run', async () => {
    const persistence = await driveAbort('detach-absent', {
      detachable: false,
    })

    // No durability wired: there is no journal to reattach to, so the
    // disconnect really is the end of the run.
    const run = await persistence.stores.runs!.get('detach-absent')
    expect(run?.status).toBe('aborted')
    expect(run?.finishedAt).toBeTypeOf('number')
  })
})

describe('interrupt status shape', () => {
  it('marks an interrupt boundary interrupted with NO finishedAt', async () => {
    const persistence = memoryPersistence()
    const adapter = {
      kind: 'text',
      name: 'mock',
      model: 'test-model',
      '~types': {},
      chatStream: () =>
        (async function* () {
          yield {
            type: EventType.RUN_STARTED,
            runId: 'r1',
            threadId: 't1',
            timestamp: 1,
          } satisfies StreamChunk
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'r1',
            threadId: 't1',
            finishReason: 'tool_calls',
            timestamp: 1,
            outcome: {
              type: 'interrupt',
              interrupts: [
                { id: 'interrupt-1', reason: 'tool_call', toolCallId: 'tc1' },
              ],
            },
          } satisfies StreamChunk
        })(),
      structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    } as unknown as AnyTextAdapter

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'r1',
      threadId: 't1',
      middleware: [withPersistence(persistence)],
    }) as AsyncIterable<StreamChunk>
    for await (const _ of stream) {
      // drain
    }

    const run = await persistence.stores.runs!.get('r1')
    expect(run?.status).toBe('interrupted')
    // A non-terminal status has not finished. Stamping a terminal timestamp on
    // it was the incoherence this task removed.
    expect(run?.finishedAt).toBeUndefined()
  })
})

/**
 * Adapter that reaches an interrupt boundary and then hangs until the signal
 * aborts, so the abort lands on a run the middleware already marked
 * `'interrupted'`. That is the real shape: `chat()` skips its terminal hook at
 * an actionable-wait/interrupt boundary, so the `finally` block routes any
 * later cancellation to `onAbort`.
 */
function interruptThenHangAdapter(signal: AbortSignal): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: () =>
      (async function* () {
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r1',
          threadId: 't1',
          timestamp: 1,
        } satisfies StreamChunk
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          finishReason: 'tool_calls',
          timestamp: 1,
          outcome: {
            type: 'interrupt',
            interrupts: [
              { id: 'interrupt-1', reason: 'tool_call', toolCallId: 'tc1' },
            ],
          },
        } satisfies StreamChunk
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true })
        })
      })(),
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
}

async function driveInterruptedAbort(
  runId: string,
  reason?: string,
): Promise<AIPersistence> {
  const persistence = memoryPersistence()
  const runs = persistence.stores.runs
  if (!runs) throw new Error('memoryPersistence must provide a run store')
  const controller = new AbortController()

  // Non-detachable on purpose: no durability wired, which is the branch that
  // used to unconditionally terminalize the run.
  const stream = chat({
    adapter: interruptThenHangAdapter(controller.signal),
    messages: [{ role: 'user', content: 'hi' }],
    runId,
    threadId: 't1',
    abortController: controller,
    middleware: [withPersistence(persistence)],
  }) as AsyncIterable<StreamChunk>

  const reader = (async () => {
    try {
      for await (const _ of stream) {
        // drain until the abort ends the stream
      }
    } catch {
      // an abort may reject the stream; the status is what is under test
    }
  })()

  // Wait for the interrupt boundary to be recorded before aborting.
  await vi.waitFor(async () => {
    expect((await runs.get(runId))?.status).toBe('interrupted')
  })
  if (reason === undefined) controller.abort()
  else controller.abort(reason)
  await reader

  return persistence
}

describe('chat onAbort on a paused (interrupted) run', () => {
  it('writes NOTHING for a plain disconnect on a non-detachable interrupted run', async () => {
    const persistence = await driveInterruptedAbort('interrupted-plain')

    // The thread genuinely is waiting for a human: the interrupt rows stay
    // `'pending'` and the next request resumes them. Terminalizing the record
    // here produced a run that claimed to be finished while
    // `validatePendingResumes` still threw on it.
    const run = await persistence.stores.runs!.get('interrupted-plain')
    expect(run?.status).toBe('interrupted')
    expect(run?.finishedAt).toBeUndefined()
  })

  it('still writes aborted when an explicit cancel lands on an interrupted run', async () => {
    const persistence = await driveInterruptedAbort(
      'interrupted-cancel',
      RUN_CANCEL_REASON,
    )

    // The user gave up on the approval. The cancel band stays authoritative —
    // exempting interrupted runs from it would strand them forever.
    const run = await persistence.stores.runs!.get('interrupted-cancel')
    expect(run?.status).toBe('aborted')
    expect(run?.finishedAt).toBeTypeOf('number')
  })
})
