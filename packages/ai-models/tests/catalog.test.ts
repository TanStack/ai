import { describe, expect, it } from 'vitest'
import {
  clampReasoningLevel as coreClamp,
  supportedReasoningLevels as coreSupported,
} from '@tanstack/ai'
import type { ModelReasoning as CoreModelReasoning } from '@tanstack/ai'
import {
  clampReasoningLevel,
  generatedAt,
  getModel,
  getModels,
  getProviders,
  modelCost,
  supportedReasoningLevels,
} from '../src'
import * as deepseek from '../src/providers/deepseek'
import type { Cost, ModelReasoning, ReasoningLevel } from '../src'

describe('the catalog', () => {
  it('has one module per provider, and the root lists them all', () => {
    expect(getProviders()).toHaveLength(38)
    expect(getModels('deepseek')).toBe(deepseek.models)
    expect(getModels('unknown')).toEqual([])
    expect(generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('finds a model and gives its quirks (DeepSeek replays reasoning)', () => {
    const model = getModel('deepseek', 'deepseek-v4-pro')
    expect(model).toMatchObject({
      provider: 'deepseek',
      api: 'openai-completions',
      baseUrl: 'https://api.deepseek.com',
      reasoning: { levels: { low: 'low', max: 'max' }, budget: false },
      compat: {
        thinkingFormat: 'deepseek',
        maxTokensField: 'max_tokens',
        requiresReasoningContentOnAssistantMessages: true,
      },
    })
    expect(model?.contextWindow).toBeGreaterThan(0)
    expect(getModel('deepseek', 'no-such-model')).toBeUndefined()
  })

  it('serves OpenRouter Claude on the Anthropic wire, and the rest on completions', () => {
    expect(getModel('openrouter', 'anthropic/claude-opus-4.5')).toMatchObject({
      api: 'anthropic-messages',
      baseUrl: 'https://openrouter.ai/api',
      compat: { cacheControlFormat: 'anthropic', supportsDeveloperRole: true },
    })
    expect(
      getModels('openrouter').find((model) => model.id.startsWith('z-ai/')),
    ).toMatchObject({
      api: 'openai-completions',
      compat: { thinkingFormat: 'openrouter', supportsDeveloperRole: false },
    })
  })

  it('leaves out models that are on another wire (Claude on Azure and Vertex)', () => {
    for (const provider of ['azure-openai-responses', 'google-vertex'])
      expect(
        getModels(provider).filter((model) => model.id.startsWith('claude-')),
      ).toEqual([])
  })

  it('lists credential alternatives, each a set of variables', () => {
    const bedrock = getProviders().find((p) => p.id === 'amazon-bedrock')
    expect(bedrock?.env).toContainEqual([
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
    ])
    const vertex = getProviders().find((p) => p.id === 'google-vertex')
    expect(vertex?.env[0]).toEqual(['GOOGLE_CLOUD_API_KEY'])
  })

  it('gives an alias a record of its own', () => {
    const dated = getModel('anthropic', 'claude-sonnet-4-5-20250929')
    expect(dated).toBeDefined()
    expect(getModel('anthropic', 'claude-sonnet-4-5')).toEqual({
      ...dated,
      id: 'claude-sonnet-4-5',
    })
  })

  it('names the currency of a price that is not in USD', () => {
    expect(getModel('ant-ling', 'Ling-2.6-1T')?.cost.currency).toBe('CNY')
    expect(getModel('openai', 'gpt-5.5')?.cost.currency).toBeUndefined()
  })
})

describe('modelCost', () => {
  // Long-context prices above 200k and 1M input tokens, like a tiered record.
  const tiered = {
    cost: {
      input: 2,
      output: 10,
      cacheRead: 0.2,
      cacheWrite: 2.5,
      tiers: [
        {
          inputTokensAbove: 1_000_000,
          input: 6,
          output: 30,
          cacheRead: 0.6,
          cacheWrite: 7.5,
        },
        {
          inputTokensAbove: 200_000,
          input: 4,
          output: 20,
          cacheRead: 0.4,
          cacheWrite: 5,
        },
      ],
    },
  }

  /** Each part of `cost` is close to `expected` (USD floats). */
  const expectCost = (cost: Cost, expected: Cost) => {
    for (const key of Object.keys(expected) as Array<keyof Cost>)
      expect(cost[key]).toBeCloseTo(expected[key], 10)
  }

  it('uses the base prices at or below the lowest tier', () => {
    expectCost(modelCost(tiered, { input: 200_000, output: 1_000_000 }), {
      input: 0.4,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      total: 10.4,
    })
  })

  it('uses the highest tier below the input, with the cache parts counted', () => {
    // 150k uncached + 60k cache read = 210k input: the 200k tier.
    expectCost(
      modelCost(tiered, { input: 150_000, output: 0, cacheRead: 60_000 }),
      { input: 0.6, output: 0, cacheRead: 0.024, cacheWrite: 0, total: 0.624 },
    )
    expect(
      modelCost(tiered, { input: 1_500_000, output: 0 }).input,
    ).toBeCloseTo(9, 10)
  })

  it('prices a 1-hour cache write at 2x the input price', () => {
    const base = {
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    }
    // 100k written: 40k with a 1-hour TTL, 60k with the 5-minute price.
    expectCost(
      modelCost(base, {
        input: 0,
        output: 0,
        cacheWrite: 100_000,
        cacheWrite1h: 40_000,
      }),
      { input: 0, output: 0, cacheRead: 0, cacheWrite: 0.465, total: 0.465 },
    )
  })

  it('counts no more 1-hour writes than cache writes', () => {
    const base = {
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    }
    expect(
      modelCost(base, { input: 0, output: 0, cacheWrite1h: 40_000 }).cacheWrite,
    ).toBe(0)
  })

  it('takes the 1-hour price from the tier', () => {
    // 300k written in all, so the 200k tier: 2 x 4 for the 1-hour part.
    expect(
      modelCost(tiered, {
        input: 0,
        output: 0,
        cacheWrite: 300_000,
        cacheWrite1h: 300_000,
      }).cacheWrite,
    ).toBeCloseTo(2.4, 10)
  })

  it('has the rate card tiers on catalog records', () => {
    const record = getModel('openai', 'gpt-5.5')
    expect(record?.cost.tiers).toEqual([
      expect.objectContaining({ inputTokensAbove: 272000 }),
    ])
  })

  it('prices each part per 1M tokens', () => {
    const cost = modelCost(
      { cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
      { input: 1_000_000, output: 100_000, cacheRead: 500_000 },
    )
    expect(cost).toEqual({
      input: 3,
      output: 1.5,
      cacheRead: 0.15,
      cacheWrite: 0,
      total: 4.65,
    })
  })
})

describe('reasoning data matches @tanstack/ai', () => {
  const data: ReadonlyArray<ModelReasoning> = [
    false,
    {
      levels: { off: 'off', minimal: 'minimal', low: 'low', high: 'high' },
      budget: true,
    },
    {
      levels: { off: 'none', low: 'low', high: 'high', xhigh: 'xhigh' },
      budget: false,
    },
    { levels: { max: 'max' }, budget: false },
    { levels: { off: 'off', high: 'high' }, budget: false },
    { levels: {}, budget: false },
  ]
  const levels: ReadonlyArray<ReasoningLevel> = [
    'off',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ]

  it.each(data)('gives the same levels and clamps for %j', (reasoning) => {
    const model = { reasoning }
    expect(supportedReasoningLevels(model)).toEqual(coreSupported(reasoning))
    for (const level of levels)
      expect(clampReasoningLevel(model, level)).toBe(
        coreClamp(reasoning, level),
      )
  })

  it('supports only off on a model that does not reason', () => {
    expect(supportedReasoningLevels({ reasoning: false })).toEqual(['off'])
    expect(clampReasoningLevel({ reasoning: false }, 'max')).toBe('off')
  })

  it('gives records the ModelReasoning shape of @tanstack/ai', () => {
    const record = getModel('anthropic', 'claude-sonnet-4-5-20250929')
    if (!record) throw new Error('Expected the catalog record')
    const reasoning: CoreModelReasoning = record.reasoning
    expect(reasoning).toEqual({
      levels: {
        off: 'off',
        minimal: 'minimal',
        low: 'low',
        medium: 'medium',
        high: 'high',
      },
      budget: true,
    })
    expect(supportedReasoningLevels(record)).toEqual(coreSupported(reasoning))
  })
})
