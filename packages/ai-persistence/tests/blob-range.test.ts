import { describe, expect, it } from 'vitest'
import { parseRangeHeader, resolveBlobRange } from '../src/blob-range'

describe('resolveBlobRange', () => {
  it('resolves a slice and defaults length to the end of the object', () => {
    expect(resolveBlobRange(1000, { offset: 100, length: 50 })).toEqual({
      offset: 100,
      length: 50,
    })
    expect(resolveBlobRange(1000, { offset: 900 })).toEqual({
      offset: 900,
      length: 100,
    })
  })

  it('clamps a length that runs past the end', () => {
    // `bytes=900-5000` against a 1000-byte object is a legal request that
    // serves 100 bytes — not an error, and not 4101 bytes of promise.
    expect(resolveBlobRange(1000, { offset: 900, length: 5000 })).toEqual({
      offset: 900,
      length: 100,
    })
  })

  it('throws on an offset outside the object', () => {
    // A store that returned an empty body here would serve a 206 claiming
    // bytes it does not carry. The route is supposed to have answered 416.
    expect(() => resolveBlobRange(1000, { offset: 1000 })).toThrow(RangeError)
    expect(() => resolveBlobRange(1000, { offset: -1 })).toThrow(RangeError)
    expect(() => resolveBlobRange(0, { offset: 0 })).toThrow(RangeError)
    expect(() => resolveBlobRange(1000, { offset: 1.5 })).toThrow(RangeError)
    expect(() => resolveBlobRange(1000, { offset: 0, length: -1 })).toThrow(
      RangeError,
    )
  })
})

describe('parseRangeHeader', () => {
  it('parses the three satisfiable forms', () => {
    expect(parseRangeHeader('bytes=0-499', 1000)).toEqual({
      offset: 0,
      length: 500,
    })
    expect(parseRangeHeader('bytes=500-', 1000)).toEqual({ offset: 500 })
    // A suffix range is the LAST n bytes — the form that is easy to read
    // backwards, and reading it backwards serves the wrong bytes as a 206.
    expect(parseRangeHeader('bytes=-500', 1000)).toEqual({ offset: 500 })
    expect(parseRangeHeader('bytes=-5000', 1000)).toEqual({ offset: 0 })
    expect(parseRangeHeader(' bytes=0-0 ', 1000)).toEqual({
      offset: 0,
      length: 1,
    })
  })

  it('clamps an end past the last byte', () => {
    expect(parseRangeHeader('bytes=900-5000', 1000)).toEqual({
      offset: 900,
      length: 100,
    })
  })

  it('reports unsatisfiable ranges so the route can answer 416', () => {
    expect(parseRangeHeader('bytes=1000-', 1000)).toBe('unsatisfiable')
    expect(parseRangeHeader('bytes=1500-1600', 1000)).toBe('unsatisfiable')
    expect(parseRangeHeader('bytes=-0', 1000)).toBe('unsatisfiable')
    // No range is satisfiable against a zero-byte object — including the
    // suffix form, which would otherwise resolve to `{ offset: 0 }` and throw
    // out of the store instead of answering 416.
    expect(parseRangeHeader('bytes=-1', 0)).toBe('unsatisfiable')
    expect(parseRangeHeader('bytes=0-', 0)).toBe('unsatisfiable')
  })

  it('ignores an invalid byte-range-spec rather than rejecting it', () => {
    // RFC 9110 §14.1.1: `last-byte-pos < first-byte-pos` is INVALID, not
    // unsatisfiable, and an invalid spec is ignored — the request still
    // succeeds with the whole representation. A 416 here would fail a request
    // that is supposed to work.
    expect(parseRangeHeader('bytes=500-499', 1000)).toBeUndefined()
    // Invalid wins over unsatisfiable: the size must not turn an ignorable
    // spec into a 416.
    expect(parseRangeHeader('bytes=5000-499', 1000)).toBeUndefined()
  })

  it('serves the whole object for an absent or unimplemented header', () => {
    expect(parseRangeHeader(null, 1000)).toBeUndefined()
    expect(parseRangeHeader(undefined, 1000)).toBeUndefined()
    expect(parseRangeHeader('', 1000)).toBeUndefined()
    expect(parseRangeHeader('bytes=-', 1000)).toBeUndefined()
    // Multiple ranges and non-`bytes` units are legal to answer in full.
    expect(parseRangeHeader('bytes=0-99,200-299', 1000)).toBeUndefined()
    expect(parseRangeHeader('items=0-99', 1000)).toBeUndefined()
    expect(parseRangeHeader('bytes 0-99', 1000)).toBeUndefined()
  })
})
