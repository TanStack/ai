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
  modelReasoning,
  supportedReasoningLevels,
} from '../src'
import * as deepseek from '../src/providers/deepseek'
import type { Cost, ModelRecord, ReasoningLevel, ReasoningMap } from '../src'

describe('the catalog', () => {
  it('has one module per provider, and the root lists them all', () => {
    expect(getProviders()).toHaveLength(38)
    expect(getModels('deepseek')).toBe(deepseek.models)
    expect(getModels('unknown')).toEqual([])
    expect(generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('finds a model and gives its quirks (DeepSeek replays reasoning)', () => {
    const model = getModel('deepseek', 'deepseek-v4-flash')
    expect(model).toMatchObject({
      provider: 'deepseek',
      api: 'openai-completions',
      baseUrl: 'https://api.deepseek.com',
      reasoning: true,
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

  it('lists credential alternatives, each a set of variables', () => {
    const bedrock = getProviders().find((p) => p.id === 'amazon-bedrock')
    expect(bedrock?.env).toContainEqual([
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
    ])
    const vertex = getProviders().find((p) => p.id === 'google-vertex')
    expect(vertex?.env[0]).toEqual(['GOOGLE_CLOUD_API_KEY'])
  })

  it('marks a model whose data came from another provider', () => {
    expect(
      getModel('cloudflare-ai-gateway', 'workers-ai/@cf/openai/gpt-oss-120b')
        ?.borrowedFrom,
    ).toBe('cloudflare-workers-ai/@cf/openai/gpt-oss-120b')
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

  it('has the models.dev tiers on catalog records', () => {
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

describe('reasoning helpers match @tanstack/ai', () => {
  const maps: ReadonlyArray<ReasoningMap | undefined> = [
    undefined,
    { off: 'none', low: 'low', high: 'high', xhigh: 'xhigh' },
    { off: null, minimal: null, medium: null, max: 'max' },
    { off: 'off', minimal: null, low: null, medium: null, high: 'high' },
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

  it.each(maps)('gives the same levels and clamps for %j', (map) => {
    const model: Pick<ModelRecord, 'reasoning' | 'reasoningMap'> = {
      reasoning: true,
      ...(map ? { reasoningMap: map } : {}),
    }
    const core = { budget: false, ...(map ? { map } : {}) }
    expect(supportedReasoningLevels(model)).toEqual(coreSupported(core))
    for (const level of levels)
      expect(clampReasoningLevel(model, level)).toBe(coreClamp(core, level))
  })

  it('supports only off on a model that does not reason', () => {
    expect(supportedReasoningLevels({ reasoning: false })).toEqual(['off'])
    expect(clampReasoningLevel({ reasoning: false }, 'max')).toBe('off')
  })
})

describe('modelReasoning', () => {
  const map: ReasoningMap = { off: null, xhigh: 'xhigh' }

  it('gives false for a model that does not reason', () => {
    expect(modelReasoning({ reasoning: false, reasoningMap: map })).toBe(false)
  })

  it('gives the level map and the budget flag', () => {
    expect(
      modelReasoning({
        reasoning: true,
        reasoningMap: map,
        reasoningBudget: true,
      }),
    ).toEqual({ map, budget: true })
    expect(modelReasoning({ reasoning: true })).toEqual({ budget: false })
  })

  it('fits the reasoning config of the adapters', () => {
    const record = getModel('anthropic', 'claude-sonnet-4-5-20250929')
    if (!record) throw new Error('Expected the catalog record')
    const config: CoreModelReasoning = modelReasoning(record)
    expect(config).toEqual({
      ...(record.reasoningMap ? { map: record.reasoningMap } : {}),
      budget: record.reasoningBudget === true,
      adaptive: false,
    })
  })

  /** The thinking shape fields of a catalog record's config. */
  const shape = (provider: string, id: string) => {
    const record = getModel(provider, id)
    if (!record) throw new Error(`Expected the record ${provider}/${id}`)
    const config = modelReasoning(record)
    if (!config) throw new Error(`Expected ${provider}/${id} to reason`)
    return {
      adaptive: config.adaptive,
      midConversationEffort: config.midConversationEffort,
    }
  }

  it('sets adaptive from compat.forceAdaptiveThinking on the Anthropic wire', () => {
    // Claude 4.6 and later with a dot id: adaptive.
    expect(shape('vercel-ai-gateway', 'anthropic/claude-opus-4.7')).toEqual({
      adaptive: true,
      midConversationEffort: undefined,
    })
    // Older Claude: budget.
    expect(shape('openrouter', 'anthropic/claude-sonnet-4.5').adaptive).toBe(
      false,
    )
    // Another model on the Anthropic wire: budget.
    expect(shape('vercel-ai-gateway', 'openai/gpt-5').adaptive).toBe(false)
    // Another wire: no thinking shape.
    expect(shape('openai', 'gpt-5').adaptive).toBeUndefined()
  })

  it('sets midConversationEffort from compat.supportsMidConvoEffort', () => {
    expect(shape('anthropic', 'claude-opus-5-5')).toEqual({
      adaptive: true,
      midConversationEffort: true,
    })
    expect(
      shape('openrouter', 'anthropic/claude-opus-5.5').midConversationEffort,
    ).toBe(true)
    expect(
      shape('anthropic', 'claude-opus-4-8').midConversationEffort,
    ).toBeUndefined()
  })
})
