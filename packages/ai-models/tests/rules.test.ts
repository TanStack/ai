import { describe, expect, it } from 'vitest'
import {
  costFrom,
  evaluatePrice,
  inputModalities,
  makesText,
  modelHints,
  reasoningFrom,
} from '../scripts/rules'
import type { SchemaModel } from '../scripts/rules'

const completions = { api: 'openai-completions', baseUrl: 'x' } as const
const messages = { api: 'anthropic-messages', baseUrl: 'x' } as const
const responses = { api: 'openai-responses', baseUrl: 'x' } as const

const effort = (
  efforts: Array<string>,
  mandatory: boolean | null = null,
): SchemaModel => ({
  rawId: 'm',
  reasoning: { mode: 'effort', mandatory, efforts },
})

// Narrows past `false` so a test can read `.levels`.
const levelsOf = (model: SchemaModel) => {
  const reasoning = reasoningFrom(model)
  if (!reasoning) throw new Error('expected reasoning')
  return reasoning.levels
}

describe('reasoningFrom (modelschemas reasoning to levels)', () => {
  it('maps efforts to their levels, and none to off', () => {
    expect(
      reasoningFrom(effort(['none', 'low', 'medium', 'high', 'xhigh'])),
    ).toEqual({
      levels: {
        off: 'none',
        low: 'low',
        medium: 'medium',
        high: 'high',
        xhigh: 'xhigh',
      },
      budget: false,
    })
  })

  it('keeps the provider case of a value', () => {
    expect(levelsOf(effort(['LOW', 'HIGH']))).toEqual({
      low: 'LOW',
      high: 'HIGH',
    })
  })

  it('cannot turn thinking off when mandatory is not known and there is no none', () => {
    expect(reasoningFrom(effort(['low', 'high', 'max']))).toEqual({
      levels: { low: 'low', high: 'high', max: 'max' },
      budget: false,
    })
  })

  it('a model that is not mandatory gets off (Claude adaptive)', () => {
    expect(
      levelsOf({
        rawId: 'm',
        reasoning: { mode: 'adaptive', mandatory: false, efforts: ['high'] },
      }),
    ).toEqual({ off: 'none', high: 'high' })
  })

  it('a mandatory model has no off, even with a none effort', () => {
    expect(levelsOf(effort(['none', 'high'], true))).toEqual({
      high: 'high',
    })
  })

  it('takes the off value from the request map', () => {
    expect(
      levelsOf({
        ...effort(['low', 'high'], false),
        requestMap: {
          thinking: { levels: { off: 'disabled', medium: 'high' } },
        },
      }),
    ).toEqual({ off: 'disabled', low: 'low', high: 'high' })
  })

  it('default with no high is the high value (Groq)', () => {
    expect(levelsOf(effort(['none', 'default']))).toEqual({
      off: 'none',
      high: 'default',
    })
  })

  it('a toggle gives only off and high', () => {
    expect(
      reasoningFrom({ rawId: 'm', reasoning: { mode: 'toggle' } }),
    ).toEqual({ levels: { off: 'off', high: 'high' }, budget: false })
  })

  it('a token budget, or reasoning with no mode, gives every level up to high', () => {
    const upToHigh = {
      off: 'off',
      minimal: 'minimal',
      low: 'low',
      medium: 'medium',
      high: 'high',
    }
    expect(
      reasoningFrom({ rawId: 'm', reasoning: { mode: 'budget' } }),
    ).toEqual({ levels: upToHigh, budget: true })
    expect(
      reasoningFrom({ rawId: 'm', capabilities: { reasoning: true } }),
    ).toEqual({ levels: upToHigh, budget: false })
    expect(reasoningFrom({ rawId: 'm' })).toBe(false)
  })
})

describe('modelHints', () => {
  it('reads the Chat Completions request map on that wire only', () => {
    const model: SchemaModel = {
      rawId: 'm',
      requestMap: {
        replayReasoningContent: true,
        maxTokensField: 'max_tokens',
        developerRole: false,
      },
    }
    expect(modelHints(model, completions, false)).toEqual({
      requiresReasoningContentOnAssistantMessages: true,
      maxTokensField: 'max_tokens',
      supportsDeveloperRole: false,
    })
    expect(modelHints(model, responses, false)).toEqual({})
  })

  it('reads temperature support', () => {
    expect(
      modelHints(
        { rawId: 'm', capabilities: { temperature: false } },
        messages,
        false,
      ),
    ).toEqual({ supportsTemperature: false })
  })

  it('gives adaptive thinking to an adaptive model on the Anthropic wire', () => {
    const adaptive: SchemaModel = {
      rawId: 'm',
      reasoning: { mode: 'adaptive' },
    }
    expect(modelHints(adaptive, messages, false)).toEqual({
      forceAdaptiveThinking: true,
    })
    expect(modelHints(adaptive, completions, false)).toEqual({})
    expect(modelHints(effort(['high']), messages, false)).toEqual({})
  })

  it('follows the request map, then the efforts, for reasoning_effort when the row asks for it', () => {
    expect(modelHints(effort(['low']), completions, true)).toEqual({
      supportsReasoningEffort: true,
    })
    expect(modelHints({ rawId: 'm' }, completions, true)).toEqual({
      supportsReasoningEffort: false,
    })
    expect(
      modelHints(
        { ...effort(['low']), requestMap: { reasoningEffort: false } },
        completions,
        true,
      ),
    ).toEqual({ supportsReasoningEffort: false })
  })
})

describe('models and inputs', () => {
  it('keeps chat rows that make text', () => {
    expect(makesText({ rawId: 'm', activity: 'chat' })).toBe(true)
    expect(
      makesText({ rawId: 'm', activity: 'chat', modalities: { output: [] } }),
    ).toBe(true)
    expect(
      makesText({
        rawId: 'm',
        activity: 'chat',
        modalities: { output: ['image'] },
      }),
    ).toBe(false)
    expect(makesText({ rawId: 'm', activity: 'embeddings' })).toBe(false)
  })

  it('maps input kinds and keeps text as the fallback', () => {
    expect(inputModalities(['text', 'image', 'pdf'])).toEqual([
      'text',
      'image',
      'document',
    ])
    expect(inputModalities(['weird'])).toEqual(['text'])
    expect(inputModalities([])).toEqual(['text'])
  })
})

/** A rate card like the modelschemas ones: a tier above 200k input tokens. */
const tiered: SchemaModel = {
  rawId: 'm',
  pricing: {
    tables: {
      rate: {
        base: { prompt: 1e-6, completion: 2e-6, input_cache_read: 1e-7 },
        '200000': { prompt: 3e-6, completion: 4e-6, input_cache_read: 3e-7 },
      },
    },
    price: {
      '+': ['input_tokens', 'output_tokens', 'cache_read_tokens'].map(
        (name, i) => ({
          '*': [
            { var: name },
            {
              lookup: {
                table: 'rate',
                keys: [
                  {
                    if: [
                      {
                        '>': [
                          {
                            '+': [
                              { var: 'input_tokens' },
                              { var: 'cache_read_tokens' },
                            ],
                          },
                          200000,
                        ],
                      },
                      '200000',
                      'base',
                    ],
                  },
                  ['prompt', 'completion', 'input_cache_read'][i],
                ],
              },
            },
          ],
        }),
      ),
    },
  },
}

describe('prices', () => {
  it('reads the base prices and the tiers by running the expression', () => {
    expect(costFrom(tiered)).toEqual({
      input: 1,
      output: 2,
      cacheRead: 0.1,
      cacheWrite: 0,
      tiers: [
        {
          inputTokensAbove: 200000,
          input: 3,
          output: 4,
          cacheRead: 0.3,
          cacheWrite: 0,
        },
      ],
    })
  })

  it('names a currency that is not USD', () => {
    const price = {
      currency: ['CNY', { '*': [{ var: 'input_tokens' }, 2e-6] }],
    }
    expect(costFrom({ rawId: 'm', pricing: { price } })).toEqual({
      input: 2,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      currency: 'CNY',
    })
  })

  it('costs 0 with no rate card', () => {
    expect(costFrom({ rawId: 'm' })).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    })
  })

  it('throws on an operator it does not know, so no wrong price is written', () => {
    expect(() => evaluatePrice({ min: [1, 2] }, {}, {})).toThrow(
      "Unknown price operator 'min'",
    )
  })
})
