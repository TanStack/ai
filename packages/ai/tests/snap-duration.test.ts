import { describe, expect, it } from 'vitest'
import {
  durationToSeconds,
  snapToDurationOption,
} from '../src/activities/generateVideo/snap'
import type { DurationOptions } from '../src/activities/generateVideo/adapter'

const veo: DurationOptions<'4s' | '6s' | '8s'> = {
  kind: 'discrete',
  values: ['4s', '6s', '8s'],
}

const grok: DurationOptions<number> = {
  kind: 'range',
  min: 1,
  max: 15,
  step: 1,
  unit: 'seconds',
}

describe('durationToSeconds', () => {
  it('reads a number, a numeric string, or a seconds template', () => {
    expect(durationToSeconds(6)).toBe(6)
    expect(durationToSeconds('6')).toBe(6)
    expect(durationToSeconds('6s')).toBe(6)
    expect(durationToSeconds('6.5s')).toBe(6.5)
    expect(durationToSeconds('4.0')).toBe(4)
    expect(durationToSeconds('08')).toBe(8)
  })

  it('returns undefined for a keyword or a non-finite number', () => {
    expect(durationToSeconds('auto')).toBeUndefined()
    expect(durationToSeconds('')).toBeUndefined()
    expect(durationToSeconds('8S')).toBeUndefined()
    expect(durationToSeconds(' 6s')).toBeUndefined()
    expect(durationToSeconds('4s ')).toBeUndefined()
    expect(durationToSeconds('+4')).toBeUndefined()
    expect(durationToSeconds('6ss')).toBeUndefined()
    expect(durationToSeconds(Number.NaN)).toBeUndefined()
    expect(durationToSeconds(Number.POSITIVE_INFINITY)).toBeUndefined()
  })
})

describe('snapToDurationOption', () => {
  it('snaps a template onto a discrete list and keeps the earlier tie', () => {
    expect(snapToDurationOption('6s', veo)).toBe('6s')
    expect(snapToDurationOption(6, veo)).toBe('6s')
    expect(snapToDurationOption('6', veo)).toBe('6s')
    expect(snapToDurationOption(7, veo)).toBe('6s')
  })

  it('returns a listed keyword and ignores one the model does not list', () => {
    const withAuto: DurationOptions<'auto' | '5s'> = {
      kind: 'discrete',
      values: ['auto', '5s'],
    }
    expect(snapToDurationOption('auto', withAuto)).toBe('auto')
    expect(snapToDurationOption('auto', veo)).toBeUndefined()
    expect(snapToDurationOption('auto', grok)).toBeUndefined()
  })

  it('snaps a template onto a numeric range', () => {
    expect(snapToDurationOption('6s', grok)).toBe(6)
    expect(snapToDurationOption(2.5, grok)).toBe(3)
    expect(snapToDurationOption('2.5s', grok)).toBe(3)
    expect(snapToDurationOption(Number.POSITIVE_INFINITY, grok)).toBe(15)
    expect(snapToDurationOption(Number.NaN, grok)).toBeUndefined()
  })

  it('returns undefined when the model has no duration field', () => {
    expect(snapToDurationOption(6, { kind: 'none' })).toBeUndefined()
    expect(snapToDurationOption('6s', { kind: 'none' })).toBeUndefined()
  })
})
