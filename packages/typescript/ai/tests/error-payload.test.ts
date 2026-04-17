import { describe, expect, it } from 'vitest'
import { toRunErrorPayload } from '../src/activities/error-payload'

describe('toRunErrorPayload', () => {
  it('narrows an Error instance, extracting message and code', () => {
    const err = Object.assign(new Error('boom'), { code: 'E_BOOM' })
    expect(toRunErrorPayload(err)).toEqual({
      message: 'boom',
      code: 'E_BOOM',
    })
  })

  it('falls back when an Error has no message', () => {
    const err = new Error('')
    expect(toRunErrorPayload(err)).toEqual({
      message: 'Unknown error occurred',
      code: undefined,
    })
  })

  it('uses the supplied fallback when provided', () => {
    expect(toRunErrorPayload(new Error(''), 'Generation failed')).toEqual({
      message: 'Generation failed',
      code: undefined,
    })
  })

  it('narrows plain objects with string message + code fields', () => {
    expect(toRunErrorPayload({ message: 'rate-limited', code: '429' })).toEqual(
      {
        message: 'rate-limited',
        code: '429',
      },
    )
  })

  it('ignores non-string code fields (returns undefined)', () => {
    expect(toRunErrorPayload({ message: 'x', code: 500 })).toEqual({
      message: 'x',
      code: undefined,
    })
  })

  it('ignores non-string code fields on Error instances too', () => {
    const err = Object.assign(new Error('numeric code'), { code: 500 })
    expect(toRunErrorPayload(err)).toEqual({
      message: 'numeric code',
      code: undefined,
    })
  })

  it('accepts a bare string as a thrown value', () => {
    expect(toRunErrorPayload('plain string error')).toEqual({
      message: 'plain string error',
      code: undefined,
    })
  })

  it('returns the fallback for null / undefined / numbers / empty strings', () => {
    for (const value of [null, undefined, 42, false, '']) {
      expect(toRunErrorPayload(value, 'default')).toEqual({
        message: 'default',
        code: undefined,
      })
    }
  })

  it('does not leak extra properties from the original error', () => {
    const err = Object.assign(new Error('leaky'), {
      request: { headers: { authorization: 'Bearer secret' } },
    })
    const payload = toRunErrorPayload(err)
    expect(payload).toEqual({ message: 'leaky', code: undefined })
    expect(payload).not.toHaveProperty('request')
  })
})
