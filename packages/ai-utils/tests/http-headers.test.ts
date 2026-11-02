import { describe, expect, it } from 'vitest'
import { mergeHeaders, toHeaderRecord } from '../src/http/headers'

describe('toHeaderRecord', () => {
  it('returns an empty record for absent headers', () => {
    expect(toHeaderRecord(undefined)).toEqual({})
    expect(toHeaderRecord(null)).toEqual({})
  })

  it('flattens a Headers instance with lowercase names', () => {
    expect(toHeaderRecord(new Headers({ 'X-Test-Id': 'abc' }))).toEqual({
      'x-test-id': 'abc',
    })
  })

  it('keeps the caller casing for entry lists and records', () => {
    expect(
      toHeaderRecord([
        ['X-Test-Id', 'abc'],
        ['X-Other', 'def'],
      ]),
    ).toEqual({ 'X-Test-Id': 'abc', 'X-Other': 'def' })
    expect(toHeaderRecord({ 'X-Test-Id': 'abc' })).toEqual({
      'X-Test-Id': 'abc',
    })
  })

  it('drops null, undefined, and array values in the record form', () => {
    expect(
      toHeaderRecord({
        'X-Test-Id': 'abc',
        'X-Removed': null,
        'X-Absent': undefined,
        'X-Repeated': ['a', 'b'],
      }),
    ).toEqual({ 'X-Test-Id': 'abc' })
  })

  it('drops entry-list pairs with a null or undefined value', () => {
    expect(
      toHeaderRecord([
        ['X-Test-Id', 'abc'],
        ['X-Removed', null],
        ['X-Absent', undefined],
      ]),
    ).toEqual({ 'X-Test-Id': 'abc' })
  })

  it('reads the SDK NullableHeaders shape', () => {
    expect(
      toHeaderRecord({
        values: new Headers({ 'x-kept': '1' }),
        nulls: new Set(['x-gone']),
      }),
    ).toEqual({ 'x-kept': '1' })
  })
})

describe('mergeHeaders', () => {
  it('lets a later source replace a name in any case', () => {
    const merged = mergeHeaders(
      { Authorization: 'Bearer old', 'x-keep': '1' },
      new Headers({ AUTHORIZATION: 'Bearer new' }),
    )
    expect(merged.get('authorization')).toBe('Bearer new')
    expect(merged.get('x-keep')).toBe('1')
  })

  it('deletes a header for a null value and ignores undefined', () => {
    const merged = mergeHeaders(
      { 'x-api-key': 'k', 'x-beta': 'b' },
      { 'X-Api-Key': null, 'x-beta': undefined },
    )
    expect(merged.has('x-api-key')).toBe(false)
    expect(merged.get('x-beta')).toBe('b')
  })

  it('appends repeated values inside one source', () => {
    const merged = mergeHeaders(
      { 'x-tag': 'old' },
      {
        'x-tag': ['a', 'b'],
      },
    )
    expect(merged.get('x-tag')).toBe('a, b')
  })

  it('deletes the names listed in a NullableHeaders source', () => {
    const merged = mergeHeaders(
      { 'x-gone': '1' },
      { values: new Headers({ 'x-new': '2' }), nulls: new Set(['x-gone']) },
    )
    expect(merged.has('x-gone')).toBe(false)
    expect(merged.get('x-new')).toBe('2')
  })
})
