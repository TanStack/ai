import { describe, expect, it } from 'vitest'
import { snapToDurationOption } from '../src/activities/generateVideo/snap'

describe('snapToDurationOption', () => {
  it('returns undefined for kind: none', () => {
    expect(snapToDurationOption(7, { kind: 'none' })).toBeUndefined()
  })

  it('picks closest discrete numeric-string entry (Kling: 5 | 10)', () => {
    const opts = { kind: 'discrete', values: ['5', '10'] } as const
    expect(snapToDurationOption(7, opts)).toBe('5')
    expect(snapToDurationOption(8, opts)).toBe('10')
  })

  it('preserves the keyword-with-unit form (Veo3: 4s | 6s | 8s)', () => {
    const opts = { kind: 'discrete', values: ['4s', '6s', '8s'] } as const
    expect(snapToDurationOption(7, opts)).toBe('6s')
    expect(snapToDurationOption(9, opts)).toBe('8s')
  })

  it('clamps + rounds to step on kind: range', () => {
    const opts = {
      kind: 'range',
      min: 2,
      max: 15,
      step: 1,
      unit: 'seconds',
    } as const
    expect(snapToDurationOption(7, opts)).toBe(7)
    expect(snapToDurationOption(100, opts)).toBe(15)
    expect(snapToDurationOption(0, opts)).toBe(2)
  })

  it('falls back to first entry for keyword-only discrete sets', () => {
    const opts = { kind: 'discrete', values: ['auto'] } as const
    expect(snapToDurationOption(7, opts)).toBe('auto')
  })
})
