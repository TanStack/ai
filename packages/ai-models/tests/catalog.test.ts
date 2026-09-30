import { describe, expect, it } from 'vitest'
import {
  clampReasoningLevel as coreClamp,
  supportedReasoningLevels as coreSupported,
} from '@tanstack/ai'
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
import type { ModelRecord, ReasoningLevel, ReasoningMap } from '../src'

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
