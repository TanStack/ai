import { describe, expect, it } from 'vitest'
import {
  fromSpecTokenUsage,
  rebuildTokenUsage,
  toSpecTokenUsage,
} from './ag-ui-usage'
import type { TokenUsage } from '../types'

const rich: TokenUsage = {
  promptTokens: 100,
  completionTokens: 50,
  totalTokens: 150,
  promptTokensDetails: { cachedTokens: 10 },
  completionTokensDetails: { reasoningTokens: 7 },
  billed: { quantity: 3, unit: 'units' },
  cost: 0.02,
  costDetails: { upstreamInputCost: 0.01, upstreamOutputCost: 0.01 },
  providerUsageDetails: { foo: 1 },
  durationSeconds: 2,
  unitsBilled: 3,
}

describe('toSpecTokenUsage', () => {
  it('maps core fields to spec usage[0] and keeps leftovers under tanstack.usage', () => {
    const { usage, leftover } = toSpecTokenUsage(rich, {
      provider: 'openai',
      model: 'gpt-5.5',
    })
    expect(usage).toEqual([
      {
        provider: 'openai',
        model: 'gpt-5.5',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cachedInputTokens: 10,
        reasoningTokens: 7,
      },
    ])
    expect(leftover).toEqual({
      billed: { quantity: 3, unit: 'units' },
      cost: 0.02,
      costDetails: { upstreamInputCost: 0.01, upstreamOutputCost: 0.01 },
      providerUsageDetails: { foo: 1 },
      durationSeconds: 2,
      unitsBilled: 3,
    })
  })

  it('returns undefined leftover when only mapped token fields exist', () => {
    const { leftover } = toSpecTokenUsage({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      promptTokensDetails: { cachedTokens: 10 },
      completionTokensDetails: { reasoningTokens: 7 },
    })
    expect(leftover).toBeUndefined()
  })

  it('keeps unmapped detail keys in leftover', () => {
    const { usage, leftover } = toSpecTokenUsage({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      promptTokensDetails: { cachedTokens: 10, audioTokens: 4 },
      completionTokensDetails: { reasoningTokens: 7, audioTokens: 1 },
    })
    expect(usage[0]?.cachedInputTokens).toBe(10)
    expect(usage[0]?.reasoningTokens).toBe(7)
    expect(leftover).toEqual({
      promptTokensDetails: { audioTokens: 4 },
      completionTokensDetails: { audioTokens: 1 },
    })
  })
})

describe('fromSpecTokenUsage', () => {
  it('rebuilds TokenUsage from spec array plus leftover', () => {
    const { usage, leftover } = toSpecTokenUsage(rich, {
      provider: 'openai',
      model: 'gpt-5.5',
    })
    expect(fromSpecTokenUsage(usage, leftover)).toEqual(rich)
  })

  it('rebuilds from spec array alone', () => {
    expect(
      fromSpecTokenUsage([{ inputTokens: 4, outputTokens: 5, totalTokens: 9 }]),
    ).toEqual({
      promptTokens: 4,
      completionTokens: 5,
      totalTokens: 9,
    })
  })

  it('rebuilds spec-only cachedInputTokens and reasoningTokens into details', () => {
    expect(
      fromSpecTokenUsage([
        {
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
          cachedInputTokens: 10,
          reasoningTokens: 7,
        },
      ]),
    ).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      promptTokensDetails: { cachedTokens: 10 },
      completionTokensDetails: { reasoningTokens: 7 },
    })
  })

  it('keeps spec cachedTokens and leftover extra promptTokensDetails keys', () => {
    expect(
      fromSpecTokenUsage(
        [
          {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            cachedInputTokens: 10,
          },
        ],
        { promptTokensDetails: { audioTokens: 5 } },
      ),
    ).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      promptTokensDetails: { cachedTokens: 10, audioTokens: 5 },
    })
  })

  it('keeps spec reasoningTokens and leftover extra completionTokensDetails keys', () => {
    expect(
      fromSpecTokenUsage(
        [
          {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            reasoningTokens: 7,
          },
        ],
        { completionTokensDetails: { audioTokens: 4 } },
      ),
    ).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      completionTokensDetails: { reasoningTokens: 7, audioTokens: 4 },
    })
  })

  it('returns undefined for missing or empty spec usage without leftover', () => {
    expect(fromSpecTokenUsage(undefined)).toBeUndefined()
    expect(fromSpecTokenUsage([])).toBeUndefined()
  })
})

describe('rebuildTokenUsage', () => {
  it('returns TokenUsage objects unchanged', () => {
    expect(
      rebuildTokenUsage({
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        cost: 0.01,
      }),
    ).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      cost: 0.01,
    })
  })

  it('rebuilds spec usage[] plus leftover into TokenUsage', () => {
    expect(
      rebuildTokenUsage([{ inputTokens: 4, outputTokens: 5, totalTokens: 9 }], {
        cost: 0.02,
      }),
    ).toEqual({
      promptTokens: 4,
      completionTokens: 5,
      totalTokens: 9,
      cost: 0.02,
    })
  })
})

it('maps cache-write usage in both directions', () => {
  const usage: TokenUsage = {
    promptTokens: 12,
    completionTokens: 3,
    totalTokens: 15,
    promptTokensDetails: { cachedTokens: 4, cacheWriteTokens: 5 },
  }
  const wire = toSpecTokenUsage(usage)
  expect(wire.usage).toEqual([
    {
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
      cachedInputTokens: 4,
      cacheWriteInputTokens: 5,
    },
  ])
  // Old readers only know the leftover field, so it stays there too.
  expect(wire.leftover).toEqual({
    promptTokensDetails: { cacheWriteTokens: 5 },
  })
  expect(fromSpecTokenUsage(wire.usage, wire.leftover)).toEqual(usage)
  expect(fromSpecTokenUsage(wire.usage)).toEqual(usage)
})

it('sums every spec usage entry', () => {
  expect(
    fromSpecTokenUsage([
      { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      { inputTokens: 4, outputTokens: 5, totalTokens: 9 },
    ]),
  ).toEqual({
    promptTokens: 5,
    completionTokens: 7,
    totalTokens: 12,
  })
})
