import { describe, expect, it } from 'vitest'
import { transformNullsToUndefined, undoNullWidening } from '../src/transforms'
import type { NullWideningMap } from '../src/transforms'

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
      items: [
        { a: null, b: 1 },
        { a: 'x', b: null },
      ],
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

describe('undoNullWidening', () => {
  // The widening pass records a map of the nulls it synthesized. For an object
  // with one optional field (`opt`) and one nullable field (`nul`), only `opt`
  // is widened — so only `opt` is marked:
  //   req:  string (required)     -> not widened, absent from the map
  //   opt:  optional(string)      -> widened to `required` + null
  //   nul:  nullable(string)      -> already allowed null, not widened
  const map: NullWideningMap = {
    properties: {
      opt: { widened: true },
    },
  }

  it('drops a synthesized null on a widened field (key becomes absent)', () => {
    const result = undoNullWidening({ req: 'a', opt: null }, map)
    expect(result).toEqual({ req: 'a' })
    expect('opt' in (result as object)).toBe(false)
  })

  it('keeps a genuine null on a field the widener did not touch', () => {
    const result = undoNullWidening({ req: 'a', nul: null }, map)
    expect(result).toEqual({ req: 'a', nul: null })
  })

  it('handles widened and genuine nulls in the same object', () => {
    const result = undoNullWidening({ req: 'a', opt: null, nul: null }, map)
    expect(result).toEqual({ req: 'a', nul: null })
  })

  it('leaves present values untouched', () => {
    const result = undoNullWidening({ req: 'a', opt: 'b', nul: 'c' }, map)
    expect(result).toEqual({ req: 'a', opt: 'b', nul: 'c' })
  })

  it('descends into a widened object to drop its inner synthesized null', () => {
    // `obj` is itself optional (so it may come back null) AND has an inner
    // optional `note`. The map marks both the object and the nested field.
    const nested: NullWideningMap = {
      properties: {
        obj: {
          widened: true,
          properties: { note: { widened: true } },
        },
      },
    }
    // obj is present (kept), but its optional `note` came back null.
    const result = undoNullWidening({ obj: { inner: 'x', note: null } }, nested)
    expect(result).toEqual({ obj: { inner: 'x' } })

    // …and when the whole object comes back null, the key drops out.
    expect(undoNullWidening({ obj: null }, nested)).toEqual({})
  })

  it('strips synthesized nulls inside array items', () => {
    const arrMap: NullWideningMap = {
      properties: {
        items: {
          items: { properties: { label: { widened: true } } },
        },
      },
    }
    const result = undoNullWidening(
      {
        items: [
          { id: '1', label: null },
          { id: '2', label: 'two' },
        ],
      },
      arrMap,
    )
    expect(result).toEqual({ items: [{ id: '1' }, { id: '2', label: 'two' }] })
  })

  it('applies tuple-style item maps per index', () => {
    // [ { name }, { note? } ] — only the second position has a widened field.
    const tupleMap: NullWideningMap = {
      properties: {
        pair: {
          items: [{}, { properties: { note: { widened: true } } }],
        },
      },
    }
    const result = undoNullWidening(
      { pair: [{ name: 'Ada' }, { note: null }] },
      tupleMap,
    )
    // The synthesized null in the second tuple position is dropped using that
    // position's map, not the first's.
    expect(result).toEqual({ pair: [{ name: 'Ada' }, {}] })
  })

  it('returns the value untouched when no map is supplied', () => {
    const value = { a: null, b: 1 }
    expect(undoNullWidening(value)).toBe(value)
  })

  it('leaves nulls under positions the map does not describe', () => {
    // `extra` carries no map entry — the widener never synthesized a null
    // there, so it is preserved.
    const result = undoNullWidening({ req: 'a', extra: null }, map)
    expect(result).toEqual({ req: 'a', extra: null })
  })
})
