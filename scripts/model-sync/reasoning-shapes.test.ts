import { describe, expect, it } from 'vitest'
import {
  formatReasoningShape,
  reasoningShapeName,
  reasoningShapeTable,
} from './reasoning-shapes'

describe('reasoning shapes', () => {
  it('names a shape after its levels and values', () => {
    expect(
      reasoningShapeName({
        levels: { off: 'none', low: 'low', medium: 'medium', high: 'high' },
        budget: false,
      }),
    ).toBe('EFFORT_NONE_LOW_TO_HIGH')
    expect(
      reasoningShapeName({
        levels: { off: 'false', high: 'true' },
        budget: false,
      }),
    ).toBe('EFFORT_FALSE_TRUE')
    expect(
      reasoningShapeName({
        levels: { low: 'low', high: 'high', max: 'max' },
        budget: true,
      }),
    ).toBe('BUDGET_LOW_HIGH_MAX')
  })

  it('writes the levels from least to most thinking', () => {
    expect(
      formatReasoningShape({
        levels: { high: 'high', off: 'none' },
        budget: false,
      }),
    ).toBe(`{ levels: { off: 'none', high: 'high' }, budget: false }`)
  })

  it('writes one constant per distinct shape', () => {
    const shape = { levels: { high: 'high' }, budget: false }
    const { names, code } = reasoningShapeTable([shape, { ...shape }])
    expect([...names.values()]).toEqual(['EFFORT_HIGH'])
    expect(code).toBe(
      `const EFFORT_HIGH = { levels: { high: 'high' }, budget: false } as const`,
    )
  })
})
