import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/index'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { StreamChunk } from '../src/types'

const messages = [{ role: 'user' as const, content: 'hi' }]

const rateLimited = (retryAfterMs: number): Array<StreamChunk> => [
  ev.runStarted(),
  { ...ev.runError('rate limited'), retryAfterMs },
]

const answer: Array<StreamChunk> = [
  ev.runStarted(),
  ev.textStart(),
  ev.textContent('hello'),
  ev.textEnd(),
  ev.runFinished('stop'),
]

const types = (chunks: Array<StreamChunk>) => chunks.map((c) => c.type)

describe('chat({ retry })', () => {
  it('calls the model again after a rate-limit error', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [rateLimited(5), answer],
    })
    const chunks = await collectChunks(
      chat({ adapter, messages, retry: { maxRetries: 2 } }),
    )
    expect(calls).toHaveLength(2)
    expect(types(chunks)).not.toContain(EventType.RUN_ERROR)
    expect(
      types(chunks).filter((t) => t === EventType.RUN_STARTED),
    ).toHaveLength(1)
    expect(chunks).toContainEqual(expect.objectContaining({ delta: 'hello' }))
  })

  it('does not retry without the option', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [rateLimited(5), answer],
    })
    const chunks = await collectChunks(chat({ adapter, messages }))
    expect(calls).toHaveLength(1)
    expect(types(chunks)).toContain(EventType.RUN_ERROR)
  })

  it('stops after maxRetries and passes the last error on', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [rateLimited(5), rateLimited(5), rateLimited(5), answer],
    })
    const chunks = await collectChunks(
      chat({ adapter, messages, retry: { maxRetries: 2 } }),
    )
    expect(calls).toHaveLength(3)
    expect(chunks.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      metadata: { tanstack: { retryAfterMs: 5 } },
    })
  })

  it('does not retry when the wait is longer than maxWaitMs', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [rateLimited(5_000), answer],
    })
    await collectChunks(
      chat({ adapter, messages, retry: { maxRetries: 2, maxWaitMs: 1_000 } }),
    )
    expect(calls).toHaveLength(1)
  })

  it('does not retry an error without a wait time', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runError('boom')], answer],
    })
    await collectChunks(chat({ adapter, messages, retry: { maxRetries: 2 } }))
    expect(calls).toHaveLength(1)
  })

  it('does not retry after the call streamed output', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('part'),
          { ...ev.runError('rate limited'), retryAfterMs: 5 },
        ],
        answer,
      ],
    })
    await collectChunks(chat({ adapter, messages, retry: { maxRetries: 2 } }))
    expect(calls).toHaveLength(1)
  })

  it('stops waiting when the run aborts', async () => {
    const abortController = new AbortController()
    const { adapter, calls } = createMockAdapter({
      iterations: [rateLimited(60_000), answer],
    })
    const started = Date.now()
    setTimeout(() => abortController.abort(), 20)
    await collectChunks(
      chat({
        adapter,
        messages,
        abortController,
        retry: { maxRetries: 2, maxWaitMs: 120_000 },
      }),
    )
    expect(calls).toHaveLength(1)
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('sends the runId of the kept attempt on RUN_STARTED', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted('run-a'),
          { ...ev.runError('rate limited'), retryAfterMs: 5 },
        ],
        [
          ev.runStarted('run-b'),
          ev.textStart(),
          ev.textContent('hello'),
          ev.textEnd(),
          ev.runFinished('stop', 'run-b'),
        ],
      ],
    })
    const chunks = await collectChunks(
      chat({ adapter, messages, retry: { maxRetries: 2 } }),
    )
    const runIds = chunks
      .filter(
        (c) =>
          c.type === EventType.RUN_STARTED || c.type === EventType.RUN_FINISHED,
      )
      .map((c) => ('runId' in c ? c.runId : undefined))
    expect(runIds).toEqual(['run-b', 'run-b'])
  })

  it('stops waiting when middleware aborts the run', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [rateLimited(60_000), answer],
    })
    const aborter = defineChatMiddleware({
      name: 'test-aborter',
      onStart(ctx) {
        setTimeout(() => ctx.abort('stop'), 20)
      },
    })
    const started = Date.now()
    await collectChunks(
      chat({
        adapter,
        messages,
        middleware: [aborter],
        retry: { maxRetries: 2, maxWaitMs: 120_000 },
      }),
    )
    expect(calls).toHaveLength(1)
    expect(Date.now() - started).toBeLessThan(5_000)
  })
})
