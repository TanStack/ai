import { describe, expect, it } from 'vitest'
import { EventType, isContextOverflow } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, retryTransientErrors } from '../src'
import { messageTexts, mockAdapter, text } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { HarnessTurnOptions, ProjectOptions } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

/** A model call that ends with a RUN_ERROR. */
const failsWith =
  (message: string, partial?: string): Reply =>
  () => [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: Date.now(),
    },
    ...(partial
      ? ([
          {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'p',
            role: 'assistant',
            timestamp: Date.now(),
          },
          {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'p',
            delta: partial,
            timestamp: Date.now(),
          },
        ] satisfies Array<StreamChunk>)
      : []),
    { type: EventType.RUN_ERROR, message, timestamp: Date.now() },
  ]

/** A model call whose adapter throws. */
const throws =
  (message: string): Reply =>
  () =>
    (async function* (): AsyncGenerator<StreamChunk> {
      yield {
        type: EventType.RUN_STARTED,
        runId: 'r',
        threadId: 't',
        timestamp: Date.now(),
      }
      throw new Error(message)
    })()

/** Compaction: the summary replaces the whole transcript. */
const project: ProjectOptions = {
  record: ({ record }) =>
    record.type === 'app.compaction' && typeof record.summary === 'string'
      ? [{ role: 'user', content: record.summary }]
      : undefined,
}

async function open(options: {
  replies: Array<Reply> | Reply
  turn: HarnessTurnOptions
  durable?: boolean
}) {
  const { adapter, calls } = mockAdapter(options.replies)
  const { runs, metadata } = memoryPersistence().stores
  const host = options.durable
    ? createHarnessHost({
        persistence: { stores: { log: memoryLogStore(), runs, metadata } },
        project,
      })
    : createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({ name: 'test/turn-control', adapter, turn: options.turn }),
    { threadId: THREAD },
  )
  return { host, session, calls }
}

/** The events of one operation, as `type` or `type:name`. */
async function eventsOf(
  session: Awaited<ReturnType<typeof open>>['session'],
  operationId: string,
) {
  const seen: Array<string> = []
  for await (const entry of session.events({
    signal: AbortSignal.timeout(200),
  })) {
    if (entry.operationId !== operationId) continue
    seen.push(
      entry.event.type === EventType.CUSTOM
        ? `CUSTOM:${entry.event.name}`
        : entry.event.type,
    )
  }
  return seen
}

describe('turn.onModelError', () => {
  it('compacts after an overflow, retries once, and succeeds', async () => {
    const { host, session, calls } = await open({
      durable: true,
      replies: [
        failsWith('prompt is too long: 250000 tokens > 200000 maximum'),
        () => text('fits now'),
      ],
      turn: {
        onModelError: async ({ session: current, error, retries }) => {
          if (retries > 0 || !isContextOverflow({ error: error.message }))
            return
          await current.append([
            { type: 'app.compaction', summary: 'summary of the chat' },
          ])
          return 'retry'
        },
      },
    })

    expect(await session.prompt('a very long chat')).toEqual({
      text: 'fits now',
    })
    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[1])).toEqual(['summary of the chat'])
    await host.close()
  })

  it('retries a transient error with the backoff, then fails after the limit', async () => {
    const { host, session, calls } = await open({
      replies: failsWith('503 Service Unavailable'),
      turn: {
        onModelError: retryTransientErrors({ maxRetries: 2, baseDelayMs: 1 }),
      },
    })

    const turn = session.prompt('go')
    await expect(turn).rejects.toThrow('503 Service Unavailable')

    expect(calls).toHaveLength(3)
    const events = await eventsOf(session, turn.id)
    expect(
      events.filter((type) => type === 'CUSTOM:harness.turn.retry'),
    ).toHaveLength(2)
    expect(events.filter((type) => type === EventType.RUN_ERROR)).toHaveLength(
      1,
    )
    await host.close()
  })

  it('stops at the limit when each failed call streamed text', async () => {
    const { host, session, calls } = await open({
      replies: failsWith('overloaded', 'partial '),
      turn: {
        onModelError: retryTransientErrors({ maxRetries: 2, baseDelayMs: 1 }),
      },
    })

    await expect(session.prompt('go')).rejects.toThrow('overloaded')

    expect(calls).toHaveLength(3)
    await host.close()
  })

  it('retries an error that the adapter throws, and drops the failed text', async () => {
    const { host, session } = await open({
      replies: [throws('fetch failed'), () => text('second try')],
      turn: { onModelError: retryTransientErrors({ baseDelayMs: 1 }) },
    })

    expect(await session.prompt('go')).toEqual({ text: 'second try' })
    await host.close()
  })

  it('keeps today behavior without the hook', async () => {
    const { host, session, calls } = await open({
      replies: [failsWith('overloaded'), () => text('never')],
      turn: {},
    })

    await expect(session.prompt('go')).rejects.toThrow('overloaded')
    expect(calls).toHaveLength(1)
    await host.close()
  })
})
