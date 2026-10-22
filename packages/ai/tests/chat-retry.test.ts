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
      chat({
        threadId: 'thread-1',
        adapter,
        messages,
        retry: { maxRetries: 2 },
      }),
    )
    expect(calls).toHaveLength(2)
    expect(types(chunks)).not.toContain(EventType.RUN_ERROR)
    expect(
      types(chunks).filter((t) => t === EventType.RUN_STARTED),
    ).toHaveLength(1)
    expect(chunks).toContainEqual(expect.objectContaining({ delta: 'hello' }))
  })

  it('sends RUN_STARTED before an error from a call that sent no start', async () => {
    const { adapter } = createMockAdapter({
      iterations: [[ev.runError('boom')]],
    })
    const chunks = await collectChunks(
      chat({ threadId: 'thread-1', adapter, messages }),
    )
    expect(types(chunks)).toEqual([EventType.RUN_STARTED, EventType.RUN_ERROR])
  })

  it('does not retry without the option', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [rateLimited(5), answer],
    })
    const chunks = await collectChunks(
      chat({ threadId: 'thread-1', adapter, messages }),
    )
    expect(calls).toHaveLength(1)
    expect(types(chunks)).toContain(EventType.RUN_ERROR)
  })

  it('stops after maxRetries and passes the last error on', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [rateLimited(5), rateLimited(5), rateLimited(5), answer],
    })
    const chunks = await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages,
        retry: { maxRetries: 2 },
      }),
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
    const chunks = await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages,
        retry: { maxRetries: 2, maxWaitMs: 1_000 },
      }),
    )
    expect(calls).toHaveLength(1)
    expect(types(chunks)).toContain(EventType.RUN_ERROR)
  })

  it('does not retry an error without a wait time', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runError('boom')], answer],
    })
    const chunks = await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages,
        retry: { maxRetries: 2 },
      }),
    )
    expect(calls).toHaveLength(1)
    expect(types(chunks)).toContain(EventType.RUN_ERROR)
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
    const chunks = await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages,
        retry: { maxRetries: 2 },
      }),
    )
    expect(calls).toHaveLength(1)
    expect(chunks).toContainEqual(expect.objectContaining({ delta: 'part' }))
    expect(chunks.at(-1)).toMatchObject({ type: EventType.RUN_ERROR })
  })

  it('stops waiting when the run aborts', async () => {
    const abortController = new AbortController()
    const { adapter, calls } = createMockAdapter({
      iterations: [rateLimited(60_000), answer],
    })
    const started = Date.now()
    setTimeout(() => abortController.abort(), 20)
    const chunks = await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages,
        abortController,
        retry: { maxRetries: 2, maxWaitMs: 120_000 },
      }),
    )
    expect(calls).toHaveLength(1)
    expect(types(chunks)).toEqual([EventType.RUN_STARTED, EventType.RUN_ERROR])
    expect(chunks.at(-1)).toMatchObject({
      metadata: { tanstack: { retryAfterMs: 60_000 } },
    })
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('waits for the retryAfterMs time before the next call', async () => {
    const callTimes: Array<number> = []
    const iterations = [rateLimited(50), answer]
    const { adapter } = createMockAdapter({
      chatStreamFn: () => {
        callTimes.push(Date.now())
        const chunks = iterations.shift() ?? []
        return (async function* () {
          yield* chunks
        })()
      },
    })
    await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages,
        retry: { maxRetries: 1 },
      }),
    )
    expect(callTimes).toHaveLength(2)
    // Timers can fire a few ms early, so the bound is under 50.
    const [first = 0, second = 0] = callTimes
    expect(second - first).toBeGreaterThanOrEqual(40)
  })

  it.each([
    { maxRetries: -1 },
    { maxRetries: 1.5 },
    { maxRetries: Number.NaN },
    { maxRetries: Infinity },
    { maxRetries: 1, maxWaitMs: -1 },
  ])('rejects the bad retry config %o', async (retry) => {
    const { adapter, calls } = createMockAdapter({ iterations: [answer] })
    await expect(
      collectChunks(chat({ threadId: 'thread-1', adapter, messages, retry })),
    ).rejects.toThrow(TypeError)
    expect(calls).toHaveLength(0)
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
      chat({
        threadId: 'thread-1',
        adapter,
        messages,
        retry: { maxRetries: 2 },
      }),
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
        threadId: 'thread-1',
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

describe('ctx.retry() in onModelError', () => {
  const overflow: Array<StreamChunk> = [
    ev.runStarted(),
    { ...ev.runError('too long'), code: 'context_overflow' },
  ]

  it('drops the failed call, runs onConfig again, and calls the model again', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [overflow, answer],
    })
    const phases: Array<string> = []
    const seen: Array<string | undefined> = []
    const retrier = defineChatMiddleware({
      name: 'retrier',
      onConfig(ctx, config) {
        phases.push(ctx.phase)
        if (seen.length === 0) return
        return {
          messages: [
            { role: 'user', content: 'shorter' },
            ...config.messages.slice(-1),
          ],
        }
      },
      onModelError(ctx, error) {
        seen.push(error.code)
        ctx.retry()
      },
    })
    const chunks = await collectChunks(
      chat({ threadId: 'thread-1', adapter, messages, middleware: [retrier] }),
    )
    expect(seen).toEqual(['context_overflow'])
    expect(calls).toHaveLength(2)
    expect(phases.filter((p) => p === 'beforeModel')).toHaveLength(2)
    expect(JSON.stringify(calls[1]?.messages)).toContain('shorter')
    expect(types(chunks)).not.toContain(EventType.RUN_ERROR)
    expect(
      types(chunks).filter((t) => t === EventType.RUN_STARTED),
    ).toHaveLength(1)
    expect(chunks).toContainEqual(expect.objectContaining({ delta: 'hello' }))
  })

  it('passes the error on when no middleware calls ctx.retry()', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [overflow, answer],
    })
    const watcher = defineChatMiddleware({
      name: 'watcher',
      onModelError() {},
    })
    const chunks = await collectChunks(
      chat({ threadId: 'thread-1', adapter, messages, middleware: [watcher] }),
    )
    expect(calls).toHaveLength(1)
    expect(types(chunks)).toEqual([EventType.RUN_STARTED, EventType.RUN_ERROR])
  })

  it('stops after 2 retries and passes the last error on', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [overflow, overflow, overflow, answer],
    })
    let errors = 0
    const always = defineChatMiddleware({
      name: 'always',
      onModelError(ctx) {
        errors++
        ctx.retry()
      },
    })
    const chunks = await collectChunks(
      chat({ threadId: 'thread-1', adapter, messages, middleware: [always] }),
    )
    expect(calls).toHaveLength(3)
    // The hook still sees the last error, but it does not retry.
    expect(errors).toBe(3)
    expect(chunks.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      code: 'context_overflow',
    })
  })

  it('does not call onModelError after the call streamed output', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('part'),
          { ...ev.runError('too long'), code: 'context_overflow' },
        ],
        answer,
      ],
    })
    let called = false
    const retrier = defineChatMiddleware({
      name: 'retrier',
      onModelError(ctx) {
        called = true
        ctx.retry()
      },
    })
    const chunks = await collectChunks(
      chat({ threadId: 'thread-1', adapter, messages, middleware: [retrier] }),
    )
    expect(called).toBe(false)
    expect(calls).toHaveLength(1)
    expect(chunks.at(-1)).toMatchObject({ type: EventType.RUN_ERROR })
  })

  it('throws when ctx.retry() is called outside onModelError', async () => {
    const { adapter } = createMockAdapter({ iterations: [answer] })
    let thrown: unknown
    const early = defineChatMiddleware({
      name: 'early',
      onStart(ctx) {
        try {
          ctx.retry()
        } catch (error) {
          thrown = error
        }
      },
    })
    await collectChunks(
      chat({ threadId: 'thread-1', adapter, messages, middleware: [early] }),
    )
    expect(thrown).toBeInstanceOf(Error)
  })
})
