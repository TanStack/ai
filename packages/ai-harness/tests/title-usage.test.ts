import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { usage } from '../src/first-party/session-tools'
import { TitleFailed, title } from '../src/first-party/title'
import { messageTexts, mockAdapter, text } from './helpers'
import type { StreamChunk, TokenUsage } from '@tanstack/ai'
import type { HarnessPersistence, HarnessPlugin } from '../src'
import type { Reply } from './helpers'

/** Open thread `t`. The main model answers `answer` unless `reply` is given. */
async function open(
  plugins: Array<HarnessPlugin>,
  {
    persistence = memoryPersistence(),
    reply = () => text('answer'),
  }: { persistence?: HarnessPersistence; reply?: Reply } = {},
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/title-usage',
      adapter: mockAdapter(reply).adapter,
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

describe('usage({ model })', () => {
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
  const withUsage = () =>
    text('answer').map(
      (chunk): StreamChunk =>
        chunk.type === EventType.RUN_FINISHED
          ? { ...chunk, usage: CALL }
          : chunk,
    )
  /** The prices of the mock adapter's model only. */
  const pricesOf = (modelId: string) =>
    modelId === 'test-model' ? { cost: PRICES } : undefined

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
      '1 model calls, 1000000 input tokens (250000 cache read, 250000 cache write), 100000 output tokens, 1100000 total. Cost: $0.0000 (cost unknown for 1 call).',
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
