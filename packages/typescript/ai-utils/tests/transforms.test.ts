import { describe, it, expect } from 'vitest'
import { transformNullsToUndefined } from '../src/transforms'

describe('transformNullsToUndefined', () => {
  it('should convert null values to undefined', () => {
    const result = transformNullsToUndefined({ a: null, b: 'hello' })
    expect(result).toEqual({ b: 'hello' })
    expect('a' in result).toBe(false)
  })

  it('should handle nested objects', () => {
    const result = transformNullsToUndefined({
      a: { b: null, c: 'value' },
      d: null,
    })
    expect(result).toEqual({ a: { c: 'value' } })
  })

  it('should handle arrays', () => {
    const result = transformNullsToUndefined({
      items: [{ a: null, b: 1 }, { a: 'x', b: null }],
    })
    expect(result).toEqual({
      items: [{ b: 1 }, { a: 'x' }],
    })
  })

  it('should return non-objects unchanged', () => {
    expect(transformNullsToUndefined('hello')).toBe('hello')
    expect(transformNullsToUndefined(42)).toBe(42)
    expect(transformNullsToUndefined(true)).toBe(true)
  })

  it('should return null as undefined', () => {
    expect(transformNullsToUndefined(null)).toBeUndefined()
  })

  it('should handle empty objects', () => {
    expect(transformNullsToUndefined({})).toEqual({})
  })

  it('should handle deeply nested nulls', () => {
    const result = transformNullsToUndefined({
      a: { b: { c: { d: null, e: 'keep' } } },
    })
    expect(result).toEqual({ a: { b: { c: { e: 'keep' } } } })
  })
})
