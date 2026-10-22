import { describe, expect, it } from 'vitest'
import { chat } from '../src'
import {
  clampReasoningLevel,
  normalizeReasoning,
  reasoningBudget,
  resolveReasoning,
  supportedReasoningLevels,
} from '../src/reasoning'
import { createMockAdapter, ev } from './test-utils'
import type { ModelReasoning, ReasoningLevel } from '../src/reasoning'

describe('supportedReasoningLevels', () => {
  it('a model that does not reason, or has no data, supports only off', () => {
    expect(supportedReasoningLevels(false)).toEqual(['off'])
    expect(supportedReasoningLevels(undefined)).toEqual(['off'])
  })

  it('supports only the listed levels, from least to most thinking', () => {
    const reasoning: ModelReasoning = {
      budget: false,
      levels: { xhigh: 'xhigh', off: 'none', low: 'low' },
    }
    expect(supportedReasoningLevels(reasoning)).toEqual(['off', 'low', 'xhigh'])
    expect(supportedReasoningLevels({ budget: false, levels: {} })).toEqual([])
  })
})

describe('clampReasoningLevel (pi rules)', () => {
  const lowHighMax: ModelReasoning = {
    budget: false,
    levels: { low: 'low', high: 'high', max: 'max' },
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
    const offToHigh: ModelReasoning = {
      budget: false,
      levels: { off: 'off', low: 'low', high: 'high' },
    }
    expect(clampReasoningLevel(offToHigh, 'max')).toBe('high')
    expect(clampReasoningLevel(offToHigh, 'xhigh')).toBe('high')
  })

  it('gives off for a model that does not reason', () => {
    expect(clampReasoningLevel(false, 'high')).toBe('off')
  })
})

describe('reasoningBudget', () => {
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
      threadId: 'thread-1',
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
      threadId: 'thread-1',
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    })
    expect(calls[0]).not.toHaveProperty('reasoning')
  })

  it('lets a middleware change it in onConfig', async () => {
    const { adapter, calls } = createMockAdapter({ iterations: [done] })
    await chat({
      threadId: 'thread-1',
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
    const reasoning: ModelReasoning = {
      budget: false,
      levels: { off: 'none', high: 'HIGH' },
    }
    expect(
      resolveReasoning({ level: 'medium', summary: true }, reasoning),
    ).toEqual({ level: 'high', value: 'HIGH', summary: true })
    expect(
      resolveReasoning({ level: 'off', summary: true }, reasoning),
    ).toEqual({ level: 'off', value: 'none', summary: true })
  })

  it('gives nothing to send without a request, for a model that does not reason, or one with no levels', () => {
    expect(
      resolveReasoning(undefined, { budget: false, levels: { high: 'high' } }),
    ).toBeUndefined()
    expect(
      resolveReasoning(
        { level: 'high', summary: true },
        {
          budget: true,
          levels: {},
        },
      ),
    ).toBeUndefined()
    expect(
      resolveReasoning({ level: 'high', summary: true }, false),
    ).toBeUndefined()
    expect(
      resolveReasoning({ level: 'high', summary: true }, undefined),
    ).toBeUndefined()
  })
})
