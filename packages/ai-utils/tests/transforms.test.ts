import { describe, expect, it } from 'vitest'
import { transformNullsToUndefined, undoNullWidening } from '../src/transforms'
import type { JsonSchemaNode } from '../src/transforms'

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
  // Mirrors the un-widened JSON Schema a Valibot/Zod object produces:
  //   req:  string (required)            -> v.string()
  //   opt:  string, not required         -> v.optional(v.string())
  //   nul:  anyOf[string, null]          -> v.nullable(v.string())
  const schema: JsonSchemaNode = {
    type: 'object',
    properties: {
      req: { type: 'string' },
      opt: { type: 'string' },
      nul: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
    required: ['req', 'nul'],
  }

  it('drops a synthesized null on an optional field (key becomes absent)', () => {
    const result = undoNullWidening({ req: 'a', opt: null }, schema)
    expect(result).toEqual({ req: 'a' })
    expect('opt' in (result as object)).toBe(false)
  })

  it('keeps a genuine null on a nullable field', () => {
    const result = undoNullWidening({ req: 'a', nul: null }, schema)
    expect(result).toEqual({ req: 'a', nul: null })
  })

  it('handles optional and nullable nulls in the same object', () => {
    const result = undoNullWidening({ req: 'a', opt: null, nul: null }, schema)
    expect(result).toEqual({ req: 'a', nul: null })
  })

  it('leaves present values untouched', () => {
    const result = undoNullWidening({ req: 'a', opt: 'b', nul: 'c' }, schema)
    expect(result).toEqual({ req: 'a', opt: 'b', nul: 'c' })
  })

  it('recurses into a nullable object via its anyOf branch', () => {
    const nested: JsonSchemaNode = {
      type: 'object',
      properties: {
        obj: {
          anyOf: [
            {
              type: 'object',
              properties: {
                inner: { type: 'string' },
                note: { type: 'string' },
              },
              required: ['inner'],
            },
            { type: 'null' },
          ],
        },
      },
      required: ['obj'],
    }
    // obj itself is present (kept), but its optional `note` came back null.
    const result = undoNullWidening({ obj: { inner: 'x', note: null } }, nested)
    expect(result).toEqual({ obj: { inner: 'x' } })
  })

  it('strips synthesized nulls inside array items', () => {
    const arrSchema: JsonSchemaNode = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, label: { type: 'string' } },
            required: ['id'],
          },
        },
      },
      required: ['items'],
    }
    const result = undoNullWidening(
      {
        items: [
          { id: '1', label: null },
          { id: '2', label: 'two' },
        ],
      },
      arrSchema,
    )
    expect(result).toEqual({ items: [{ id: '1' }, { id: '2', label: 'two' }] })
  })

  it('applies tuple-style item schemas per index', () => {
    const tupleSchema: JsonSchemaNode = {
      type: 'object',
      properties: {
        pair: {
          type: 'array',
          // [ { name }, { note? } ] — only the second position is optional.
          items: [
            {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
            {
              type: 'object',
              properties: { note: { type: 'string' } },
              required: [],
            },
          ],
        },
      },
      required: ['pair'],
    }
    const result = undoNullWidening(
      { pair: [{ name: 'Ada' }, { note: null }] },
      tupleSchema,
    )
    // The synthesized null in the second tuple position is dropped using that
    // position's schema, not the first's.
    expect(result).toEqual({ pair: [{ name: 'Ada' }, {}] })
  })

  it('keeps nulls when the anyOf branch is ambiguous (multiple object variants)', () => {
    const ambiguous: JsonSchemaNode = {
      type: 'object',
      properties: {
        node: {
          anyOf: [
            {
              type: 'object',
              properties: { a: { type: 'string' } },
              required: [],
            },
            {
              type: 'object',
              properties: { b: { type: 'string' } },
              required: [],
            },
            { type: 'null' },
          ],
        },
      },
      required: ['node'],
    }
    // Two object branches match, so we can't tell which applies — leave the
    // value (and any nulls inside it) untouched rather than risk mis-stripping.
    const value = { node: { a: null } }
    expect(undoNullWidening(value, ambiguous)).toEqual({ node: { a: null } })
  })

  it('returns the value untouched when no schema is supplied', () => {
    const value = { a: null, b: 1 }
    expect(undoNullWidening(value)).toBe(value)
  })

  it('leaves nulls under unknown (schemaless) properties untouched', () => {
    // `extra` is not described by the schema — we cannot prove its null is
    // synthetic, so it is preserved.
    const result = undoNullWidening({ req: 'a', extra: null }, schema)
    expect(result).toEqual({ req: 'a', extra: null })
  })
})
