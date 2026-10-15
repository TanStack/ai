import { describe, expect, it } from 'vitest'
import { toRecord } from '../scripts/catalog'
import { PROVIDERS } from '../scripts/providers'
import {
  inputModalities,
  makesText,
  modelHints,
  reasoningLevelsFrom,
  takesBudget,
} from '../scripts/rules'

const completions = { api: 'openai-completions', baseUrl: 'x' } as const
const messages = { api: 'anthropic-messages', baseUrl: 'x' } as const

describe('reasoningLevelsFrom (models.dev reasoning_options to levels)', () => {
  it('maps effort values to their levels, and none to off', () => {
    expect(
      reasoningLevelsFrom([
        { type: 'effort', values: ['none', 'low', 'medium', 'high', 'xhigh'] },
      ]),
    ).toEqual({
      off: 'none',
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
    })
  })

  it('cannot turn thinking off when effort has no none and there is no toggle', () => {
    expect(
      reasoningLevelsFrom([{ type: 'effort', values: ['low', 'high', 'max'] }]),
    ).toEqual({ low: 'low', high: 'high', max: 'max' })
  })

  it('a toggle next to effort gives the none off value (DeepSeek V4)', () => {
    expect(
      reasoningLevelsFrom([
        { type: 'toggle' },
        { type: 'effort', values: ['low', 'high', 'max'] },
      ]),
    ).toEqual({ off: 'none', low: 'low', high: 'high', max: 'max' })
  })

  it('default with no high is the high value (Groq)', () => {
    expect(
      reasoningLevelsFrom([{ type: 'effort', values: ['none', 'default'] }]),
    ).toEqual({ off: 'none', high: 'default' })
  })

  it('a toggle alone gives only off and high', () => {
    expect(reasoningLevelsFrom([{ type: 'toggle' }])).toEqual({
      off: 'off',
      high: 'high',
    })
  })

  it('a token budget or no options gives every level up to high', () => {
    const upToHigh = {
      off: 'off',
      minimal: 'minimal',
      low: 'low',
      medium: 'medium',
      high: 'high',
    }
    expect(reasoningLevelsFrom([{ type: 'budget_tokens', min: 1024 }])).toEqual(
      upToHigh,
    )
    expect(reasoningLevelsFrom([])).toEqual(upToHigh)
    expect(reasoningLevelsFrom(undefined)).toEqual(upToHigh)
    expect(takesBudget([{ type: 'toggle' }, { type: 'budget_tokens' }])).toBe(
      true,
    )
  })
})

describe('modelHints', () => {
  it('asks for reasoning_content replay when the model interleaves it', () => {
    expect(
      modelHints(
        { id: 'm', interleaved: { field: 'reasoning_content' } },
        completions,
        false,
      ),
    ).toEqual({ requiresReasoningContentOnAssistantMessages: true })
  })

  it('reads temperature support', () => {
    expect(
      modelHints({ id: 'm', temperature: false }, messages, false),
    ).toEqual({ supportsTemperature: false })
  })

  it('gives adaptive thinking to Claude 4.6 and later only (pi), with dash or dot ids', () => {
    const effort = [{ type: 'effort', values: ['low', 'high'] }]
    const adaptive = (id: string) =>
      modelHints({ id, reasoning_options: effort }, messages, false)
        .forceAdaptiveThinking === true
    expect(adaptive('claude-opus-4-7')).toBe(true)
    expect(adaptive('anthropic/claude-opus-4.7')).toBe(true)
    expect(adaptive('anthropic/claude-sonnet-4.6')).toBe(true)
    expect(adaptive('claude-fable-5-1')).toBe(true)
    expect(adaptive('claude-opus-4-5')).toBe(false)
    expect(adaptive('anthropic/claude-sonnet-4.5')).toBe(false)
    expect(adaptive('claude-sonnet-4-20250514')).toBe(false)
    // models.dev lists `effort` for it, but a gateway gives it budget thinking.
    expect(adaptive('openai/gpt-5')).toBe(false)
  })

  it('follows the effort option for reasoning_effort when the row asks for it', () => {
    const effort = {
      id: 'm',
      reasoning_options: [{ type: 'effort', values: ['low'] }],
    }
    expect(modelHints(effort, completions, true)).toEqual({
      supportsReasoningEffort: true,
    })
    expect(modelHints({ id: 'm' }, completions, true)).toEqual({
      supportsReasoningEffort: false,
    })
  })
})

describe('models and inputs', () => {
  it('keeps chat models, and leaves out embedding and transcription models', () => {
    expect(makesText({ id: 'gpt-5.6' })).toBe(true)
    expect(
      makesText({ id: 'gpt-image-2', modalities: { output: ['image'] } }),
    ).toBe(false)
    expect(makesText({ id: 'text-embedding-3-small' })).toBe(false)
    expect(makesText({ id: 'whisper-large-v3' })).toBe(false)
  })

  it('takes a tier price models.dev leaves out from the base price', () => {
    const row = PROVIDERS.find((provider) => provider.id === 'google')
    if (!row) throw new Error('Expected the google row')
    const record = toRecord(
      row,
      'm',
      {
        id: 'm',
        cost: {
          input: 1,
          output: 2,
          cache_read: 0.1,
          cache_write: 0.5,
          tiers: [
            { input: 3, output: 4, tier: { type: 'context', size: 200_000 } },
          ],
        },
      },
      'm',
    )
    expect(record.cost.tiers).toEqual([
      {
        inputTokensAbove: 200_000,
        input: 3,
        output: 4,
        cacheRead: 0.1,
        cacheWrite: 0.5,
      },
    ])
  })

  it('maps input kinds and keeps text as the fallback', () => {
    expect(inputModalities(['text', 'image', 'pdf'])).toEqual([
      'text',
      'image',
      'document',
    ])
    expect(inputModalities(['weird'])).toEqual(['text'])
  })
})
