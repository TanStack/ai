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
