import { describe, expect, it } from 'vitest'
import { EventType, chat, defineChatMiddleware } from '@tanstack/ai'
import { getPendingTurn } from '@tanstack/ai/adapter-internals'
import type {
  AnyTextAdapter,
  ChatMiddlewareContext,
  StreamChunk,
} from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'

/**
 * Storing the user's pending turn BEFORE a slow `setup`.
 *
 * Persistence stores the turn from `onStart`, which runs after every middleware
 * `setup`. That is milliseconds for a normal run and MINUTES for one that builds a
 * sandbox, and for that whole window the thread reads as empty — so a reload, or a
 * second device, shows no sign of the message the user just sent.
 *
 * `PendingTurnCapability` lets the slow middleware ask for the turn to be stored
 * first. These tests drive the REAL `withPersistence` through a probe middleware
 * that stands in for `withSandbox`: it calls the seam from its own `setup`, exactly
 * where the sandbox does, and reports what the store held at that moment.
 */

function finishingAdapter(): AnyTextAdapter {
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
          timestamp: 2,
          finishReason: 'stop',
        } as StreamChunk
      })(),
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
}

/**
 * Stands in for `withSandbox`. Calls the seam from `setup` — the same place, and
 * therefore the same ordering, as the sandbox — and records what the thread held
 * immediately afterwards. Listed AFTER `withPersistence`, because setups run in
 * array order and the seam only exists once persistence has offered it.
 */
type Persistence = ReturnType<typeof memoryPersistence>

/** The transcript store, which `memoryPersistence` always provides. */
function messagesOf(persistence: Persistence) {
  const messages = persistence.stores.messages
  if (!messages)
    throw new Error('memoryPersistence must provide a message store')
  return messages
}

function slowMiddleware(
  persistence: Persistence,
  seen: { stored: Array<string> },
) {
  return defineChatMiddleware({
    name: 'slow-probe',
    async setup(ctx: ChatMiddlewareContext) {
      await getPendingTurn(ctx, { optional: true })?.snapshot()
      const thread = await messagesOf(persistence).loadThread(ctx.threadId)
      seen.stored = thread.map((m) => m.role)
    },
  })
}

async function drive(input: {
  persistence: Persistence
  messages: Array<{ role: 'user'; content: string }>
  seen: { stored: Array<string> }
}): Promise<void> {
  const stream = chat({
    adapter: finishingAdapter(),
    messages: input.messages,
    runId: 'r1',
    threadId: 't1',
    middleware: [
      withPersistence(input.persistence),
      slowMiddleware(input.persistence, input.seen),
    ],
  }) as AsyncIterable<StreamChunk>
  for await (const _ of stream) {
    // drain
  }
}

describe('pending-turn snapshot', () => {
  it("stores the user's turn during setup, before the run produces anything", async () => {
    // THE REGRESSION. Without the seam the thread is empty here, so a reload mid
    // setup shows nothing at all.
    const persistence = memoryPersistence()
    const seen = { stored: [] as Array<string> }

    await drive({
      persistence,
      messages: [{ role: 'user', content: 'triage this' }],
      seen,
    })

    expect(seen.stored).toEqual(['user'])
  })

  it('does not delete stored history when the client sends nothing', async () => {
    // `saveThread` REPLACES the thread. A caller that stored only the newly-sent
    // list would wipe the history, which is why the rule lives in persistence.
    const persistence = memoryPersistence()
    await messagesOf(persistence).saveThread('t1', [
      { role: 'user', content: 'older' },
      { role: 'assistant', content: 'reply' },
    ])
    const seen = { stored: [] as Array<string> }

    await drive({ persistence, messages: [], seen })

    expect(seen.stored).toEqual(['user', 'assistant'])
  })

  it('is offered on every run, so a run that never calls it is unaffected', async () => {
    // The seam is opt-in: offering it must not change a run whose middleware does
    // not use it. The final transcript is written by `onStart`/`onFinish` as always.
    const persistence = memoryPersistence()
    const stream = chat({
      adapter: finishingAdapter(),
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'r1',
      threadId: 't1',
      middleware: [withPersistence(persistence)],
    }) as AsyncIterable<StreamChunk>
    for await (const _ of stream) {
      // drain
    }

    const thread = await messagesOf(persistence).loadThread('t1')
    expect(thread.map((m) => m.role)).toContain('user')
  })
})
