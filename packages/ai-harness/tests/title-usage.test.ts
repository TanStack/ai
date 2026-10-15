import { describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { usage } from '../src/first-party/session-tools'
import { TitleFailed, title } from '../src/first-party/title'
import { messageTexts, mockAdapter, text } from './helpers'
import type { StreamChunk, TokenUsage } from '@tanstack/ai'
import type { AnyAgent, HarnessPersistence, HarnessPlugin } from '../src'
import type { Reply } from './helpers'

/**
 * Open thread `t`. The main model answers `answer` unless `reply` is given.
 * `agents` are the background agents of the session.
 */
async function open(
  plugins: Array<HarnessPlugin>,
  {
    persistence = memoryPersistence(),
    reply = () => text('answer'),
    agents = [],
  }: {
    persistence?: HarnessPersistence
    reply?: Reply
    agents?: Array<AnyAgent>
  } = {},
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/title-usage',
      adapter: mockAdapter(reply).adapter,
      agents,
      plugins: () => plugins,
    }),
    { threadId: 't' },
  )
  return { host, session }
}

describe('title()', () => {
  it('writes a title from the first user message after the first turn', async () => {
    const titler = mockAdapter(() => text('"Trip to Rome"\nA second line'))
    const { host, session } = await open([title({ adapter: titler.adapter })])

    const turn = await session.prompt('Plan a trip to Rome for me')

    expect(turn.text).toBe('answer')
    await vi.waitFor(async () =>
      expect((await host.sessions.get('t'))?.title).toBe('Trip to Rome'),
    )
    expect(messageTexts(titler.calls[0])[0]).toContain(
      'Plan a trip to Rome for me',
    )
    await host.close()
  })

  it('does not ask for a title again once the session has one', async () => {
    const titler = mockAdapter([
      () => text('Trip to Rome'),
      () => text('Another title'),
    ])
    const { host, session } = await open([title({ adapter: titler.adapter })])
    await session.prompt('Plan a trip to Rome for me')
    await vi.waitFor(async () =>
      expect((await host.sessions.get('t'))?.title).toBe('Trip to Rome'),
    )

    await session.prompt('Add a day in Florence')

    expect(titler.calls).toHaveLength(1)
    expect((await host.sessions.get('t'))?.title).toBe('Trip to Rome')
    await host.close()
  })

  it('keeps the turn when the title call fails', async () => {
    const failures: Array<{ message: string }> = []
    const listener = definePlugin({
      name: 'test/listener',
      setup: (ctx) => {
        ctx.on(TitleFailed, (failure) => failures.push(failure))
      },
    })
    const titler = mockAdapter(() => {
      throw new Error('title model down')
    })
    const { host, session } = await open([
      listener,
      title({ adapter: titler.adapter }),
    ])

    const turn = await session.prompt('Plan a trip to Rome for me')

    expect(turn.text).toBe('answer')
    await vi.waitFor(() =>
      expect(failures).toEqual([{ message: 'title model down' }]),
    )
    expect((await host.sessions.get('t'))?.title).toBeUndefined()
    await host.close()
  })

  it('does nothing without a sessions store', async () => {
    const { messages, runs, metadata } = memoryPersistence().stores
    const titler = mockAdapter(() => text('Trip to Rome'))
    const { host, session } = await open([title({ adapter: titler.adapter })], {
      persistence: { stores: { messages, runs, metadata } },
    })

    await session.prompt('Plan a trip to Rome for me')

    expect(titler.calls).toHaveLength(0)
    await host.close()
  })
})

describe('usage()', () => {
  /** Prices in USD per 1M tokens. */
  const PRICES = { input: 2, output: 10, cacheRead: 1, cacheWrite: 4 }
  /**
   * One model call. With PRICES it costs $3.25: 500k uncached input ($1),
   * 100k output ($1), 250k cache read ($0.25), 250k cache write ($1).
   */
  const CALL: TokenUsage = {
    promptTokens: 1_000_000,
    completionTokens: 100_000,
    totalTokens: 1_100_000,
    promptTokensDetails: { cachedTokens: 250_000, cacheWriteTokens: 250_000 },
  }
  /** The `/usage` line of one CALL. */
  const CALL_LINE =
    '1 model calls, 1000000 input tokens (250000 cache read, 250000 cache write), 100000 output tokens, 1100000 total.'
  /** A model call that answers and reports `usage`. */
  const replyWith = (usage: TokenUsage) => () =>
    text('answer').map(
      (chunk): StreamChunk =>
        chunk.type === EventType.RUN_FINISHED ? { ...chunk, usage } : chunk,
    )
  const withUsage = replyWith(CALL)
  /** The prices of the mock adapter's model only. */
  const pricesOf = (modelId: string) =>
    modelId === 'test-model' ? { cost: PRICES } : undefined
  /** A background agent. Its model, `worker-model`, reports `usage`. */
  const workerWith = (usage: TokenUsage) => {
    const { adapter } = mockAdapter(replyWith(usage))
    return defineAgent({
      name: 'worker',
      description: 'Works',
      run: (ctx) =>
        ctx.chat({ adapter: { ...adapter, model: 'worker-model' } }),
    })
  }

  it('uses a provider cost as is, and prices only the calls with no provider cost', async () => {
    // The lookup knows every model: it would price the worker call at $3.25.
    const { host, session } = await open(
      [usage({ model: () => ({ cost: PRICES }) })],
      { reply: withUsage, agents: [workerWith({ ...CALL, cost: 0.5 })] },
    )

    await session.prompt('one')
    await session.agent('worker')?.start()

    // The lead call costs $3.25 from the lookup, the worker call $0.50 from
    // its provider.
    expect(await session.command('usage')).toBe(
      [
        '2 model calls, 2000000 input tokens (500000 cache read, 500000 cache write), 200000 output tokens, 2200000 total. Cost: $3.7500.',
        `mock/test-model: ${CALL_LINE}`,
        `mock/worker-model: ${CALL_LINE}`,
      ].join('\n'),
    )
    // `/usage` shows the totals of the session.
    expect(session.usage().total).toEqual({
      calls: 2,
      promptTokens: 2_000_000,
      completionTokens: 200_000,
      totalTokens: 2_200_000,
      cachedTokens: 500_000,
      cacheWriteTokens: 500_000,
      cost: 0.5,
    })
    expect((await host.sessions.get('t'))?.usage?.cost).toBeCloseTo(3.75, 10)
    await host.close()
  })

  it('shows a provider cost without the model option, and writes it to the index entry', async () => {
    const { host, session } = await open([usage()], {
      reply: replyWith({ ...CALL, cost: 0.5 }),
    })

    await session.prompt('one')

    expect(await session.command('usage')).toBe(`${CALL_LINE} Cost: $0.5000.`)
    expect((await host.sessions.get('t'))?.usage?.cost).toBe(0.5)
    await host.close()
  })

  it('counts a provider cost once in the index entry', async () => {
    const { host, session } = await open([usage({ model: pricesOf })], {
      reply: replyWith({ ...CALL, cost: 0.5 }),
    })

    await session.prompt('one')
    await session.prompt('two')

    // Two calls at $0.50. The host writes no cost of its own.
    expect((await host.sessions.get('t'))?.usage?.cost).toBeCloseTo(1, 10)
    await host.close()
  })

  it('writes the session totals to the index entry, with the calls of a background agent', async () => {
    const { host, session } = await open([usage()], {
      reply: withUsage,
      agents: [workerWith(CALL)],
    })

    await session.prompt('one')
    await session.agent('worker')?.start()
    await session.prompt('two')

    // Two lead calls and one worker call.
    expect((await host.sessions.get('t'))?.usage).toEqual({
      turns: 3,
      promptTokens: 3_000_000,
      completionTokens: 300_000,
      totalTokens: 3_300_000,
      cachedTokens: 750_000,
      cacheWriteTokens: 750_000,
    })
    await host.close()
  })

  it('keeps a copy of the session totals in its state', async () => {
    const { host, session } = await open([usage()], {
      reply: withUsage,
      agents: [workerWith({ ...CALL, promptTokens: 2_000_000 })],
    })

    await session.prompt('one')
    await session.agent('worker')?.start()

    // The worker's call is in the copy too.
    expect(session.snapshot().plugins['tanstack/usage']).toEqual({
      calls: 2,
      promptTokens: 3_000_000,
      completionTokens: 200_000,
      totalTokens: 2_200_000,
      cachedTokens: 500_000,
      cacheWriteTokens: 500_000,
      // The input of the lead's latest call, not the worker's.
      contextTokens: 1_000_000,
    })
    await host.close()
  })

  it('prices each model call and shows the cost in /usage', async () => {
    const { host, session } = await open([usage({ model: pricesOf })], {
      reply: withUsage,
    })

    await session.prompt('one')
    await session.prompt('two')

    expect(await session.command('usage')).toBe(
      '2 model calls, 2000000 input tokens (500000 cache read, 500000 cache write), 200000 output tokens, 2200000 total. Cost: $6.5000.',
    )
    await host.close()
  })

  it('writes the cost to the index entry and keeps the token totals of the host', async () => {
    const { host, session } = await open([usage({ model: pricesOf })], {
      reply: withUsage,
    })

    await session.prompt('one')
    await session.prompt('two')

    expect((await host.sessions.get('t'))?.usage).toEqual({
      turns: 2,
      promptTokens: 2_000_000,
      completionTokens: 200_000,
      totalTokens: 2_200_000,
      cachedTokens: 500_000,
      cacheWriteTokens: 500_000,
      cost: expect.closeTo(6.5, 10),
    })
    await host.close()
  })

  it('adds no cost for a model with no prices, and says so in /usage', async () => {
    const { host, session } = await open([usage({ model: () => undefined })], {
      reply: withUsage,
    })

    await session.prompt('one')

    expect(await session.command('usage')).toBe(
      `${CALL_LINE} Cost: $0.0000 (cost unknown for 1 call).`,
    )
    expect((await host.sessions.get('t'))?.usage).toEqual({
      turns: 1,
      promptTokens: 1_000_000,
      completionTokens: 100_000,
      totalTokens: 1_100_000,
      cachedTokens: 250_000,
      cacheWriteTokens: 250_000,
    })
    await host.close()
  })
})
