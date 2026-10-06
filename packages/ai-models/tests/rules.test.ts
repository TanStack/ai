import { describe, expect, it } from 'vitest'
import {
  inputModalities,
  modelHints,
  normalizeModelId,
  reasoningMapFrom,
  takesBudget,
} from '../scripts/rules'

const completions = { api: 'openai-completions', baseUrl: 'x' } as const
const messages = { api: 'anthropic-messages', baseUrl: 'x' } as const

describe('reasoningMapFrom (models.dev reasoning_options to a level map)', () => {
  it('maps effort values to their levels, and none to off', () => {
    expect(
      reasoningMapFrom([
        { type: 'effort', values: ['none', 'low', 'medium', 'high', 'xhigh'] },
      ]),
    ).toEqual({
      off: 'none',
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: null,
    })
  })

  it('cannot turn thinking off when effort has no none and there is no toggle', () => {
    expect(
      reasoningMapFrom([{ type: 'effort', values: ['low', 'high', 'max'] }]),
    ).toMatchObject({ off: null, medium: null, max: 'max' })
  })

  it('a toggle next to effort gives the none off value (DeepSeek V4)', () => {
    expect(
      reasoningMapFrom([
        { type: 'toggle' },
        { type: 'effort', values: ['low', 'high', 'max'] },
      ]),
    ).toMatchObject({ off: 'none', low: 'low', high: 'high', max: 'max' })
  })

  it('a toggle alone gives only off and high', () => {
    expect(reasoningMapFrom([{ type: 'toggle' }])).toEqual({
      off: 'off',
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
    })
  })

  it('a token budget or no options gives no map', () => {
    expect(
      reasoningMapFrom([{ type: 'budget_tokens', min: 1024 }]),
    ).toBeUndefined()
    expect(reasoningMapFrom([])).toBeUndefined()
    expect(reasoningMapFrom(undefined)).toBeUndefined()
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

describe('ids and inputs', () => {
  it('normalizes ids so the same model matches across providers', () => {
    expect(normalizeModelId('anthropic/claude-opus-4.5')).toBe(
      'claude-opus-4-5',
    )
    expect(normalizeModelId('accounts/fireworks/models/kimi-k2p6')).toBe(
      'kimi-k2-6',
    )
    expect(normalizeModelId('openai/gpt-5:batch')).toBe('gpt-5')
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
