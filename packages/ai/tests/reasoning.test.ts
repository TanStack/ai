import { describe, expect, it } from 'vitest'
import { chat } from '../src'
import {
  clampReasoningLevel,
  normalizeReasoning,
  reasoningBudget,
  reasoningValue,
  resolveReasoning,
  supportedReasoningLevels,
} from '../src/reasoning'
import { createMockAdapter, ev } from './test-utils'
import type { ModelReasoning, ReasoningLevel } from '../src/reasoning'

describe('supportedReasoningLevels (pi rules)', () => {
  it('a model that does not reason supports only off', () => {
    expect(supportedReasoningLevels(false)).toEqual(['off'])
  })

  it('a reasoning model with no map supports off to high, not xhigh or max', () => {
    expect(supportedReasoningLevels({ budget: false })).toEqual([
      'off',
      'minimal',
      'low',
      'medium',
      'high',
    ])
    expect(supportedReasoningLevels(undefined)).toEqual(
      supportedReasoningLevels({ budget: false }),
    )
  })

  it('drops a level mapped to null, and needs an entry for xhigh and max', () => {
    const reasoning: ModelReasoning = {
      budget: false,
      map: { off: null, minimal: null, medium: null, xhigh: 'xhigh' },
    }
    expect(supportedReasoningLevels(reasoning)).toEqual([
      'low',
      'high',
      'xhigh',
    ])
  })
})

describe('clampReasoningLevel (pi rules)', () => {
  const lowHighMax: ModelReasoning = {
    budget: false,
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: null,
      high: 'high',
      max: 'max',
    },
  }

  it.each<[ReasoningLevel, ReasoningLevel]>([
    ['low', 'low'],
    // Not supported: the nearest level above it.
    ['medium', 'high'],
    ['xhigh', 'max'],
    ['off', 'low'],
    ['minimal', 'low'],
  ])('clamps %s to %s', (requested, expected) => {
    expect(clampReasoningLevel(lowHighMax, requested)).toBe(expected)
  })

  it('goes below when there is nothing above', () => {
    expect(clampReasoningLevel({ budget: false }, 'max')).toBe('high')
    expect(clampReasoningLevel({ budget: false }, 'xhigh')).toBe('high')
  })

  it('gives off for a model that does not reason', () => {
    expect(clampReasoningLevel(false, 'high')).toBe('off')
  })
})

describe('reasoningValue and reasoningBudget', () => {
  it('sends the map value, else the level name, and null for "send nothing"', () => {
    const reasoning: ModelReasoning = {
      budget: false,
      map: { off: 'none', high: 'HIGH' },
    }
    expect(reasoningValue(reasoning, 'off')).toBe('none')
    expect(reasoningValue(reasoning, 'high')).toBe('HIGH')
    expect(reasoningValue(reasoning, 'low')).toBe('low')
    expect(reasoningValue({ budget: false, map: { off: null } }, 'off')).toBe(
      null,
    )
  })

  it("uses pi's budget table unless budgetTokens is set", () => {
    expect(reasoningBudget({ level: 'minimal', summary: true })).toBe(1024)
    expect(reasoningBudget({ level: 'medium', summary: true })).toBe(8192)
    expect(reasoningBudget({ level: 'max', summary: true })).toBe(16384)
    expect(reasoningBudget({ level: 'off', summary: true })).toBe(0)
    expect(
      reasoningBudget({ level: 'low', summary: true, budgetTokens: 3000 }),
    ).toBe(3000)
  })
})

describe('normalizeReasoning', () => {
  it('turns a level into a request that asks for the thinking text', () => {
    expect(normalizeReasoning('high')).toEqual({ level: 'high', summary: true })
    expect(normalizeReasoning(undefined)).toBeUndefined()
  })

  it('keeps summary and budgetTokens from the object form', () => {
    expect(
      normalizeReasoning({ level: 'low', summary: false, budgetTokens: 500 }),
    ).toEqual({ level: 'low', summary: false, budgetTokens: 500 })
  })
})

describe('chat({ reasoning })', () => {
  const done = [ev.runStarted(), ev.runFinished('stop')]

  it('passes the normalized request to the adapter', async () => {
    const { adapter, calls } = createMockAdapter({ iterations: [done] })
    await chat({
      adapter,
      reasoning: 'high',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    })
    expect(calls[0]?.reasoning).toEqual({ level: 'high', summary: true })
  })

  it('sends no reasoning when the option is not set', async () => {
    const { adapter, calls } = createMockAdapter({ iterations: [done] })
    await chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    })
    expect(calls[0]).not.toHaveProperty('reasoning')
  })

  it('lets a middleware change it in onConfig', async () => {
    const { adapter, calls } = createMockAdapter({ iterations: [done] })
    await chat({
      adapter,
      reasoning: 'low',
      middleware: [
        {
          name: 'more-thinking',
          onConfig: (_ctx, config) => ({
            reasoning: { ...config.reasoning, level: 'max', summary: false },
          }),
        },
      ],
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    })
    expect(calls[0]?.reasoning).toEqual({ level: 'max', summary: false })
  })
})

describe('resolveReasoning', () => {
  it('clamps the level and gives its value', () => {
    expect(
      resolveReasoning(
        { level: 'medium', summary: true },
        { budget: false, map: { medium: null, high: 'HIGH' } },
      ),
    ).toEqual({ level: 'high', value: 'HIGH', summary: true })
  })

  it('gives nothing to send without a request or for a model that does not reason', () => {
    expect(resolveReasoning(undefined, { budget: false })).toBeUndefined()
    expect(
      resolveReasoning({ level: 'high', summary: true }, false),
    ).toBeUndefined()
    expect(
      resolveReasoning({ level: 'high', summary: true }, undefined),
    ).toBeUndefined()
  })
})
