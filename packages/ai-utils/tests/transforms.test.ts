import { describe, it, expect } from 'vitest'
import type { JsonSchemaNode } from '../src/transforms'
import {
  transformNullsToUndefined,
  undoNullWidening,
} from '../src/transforms'

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
              properties: { inner: { type: 'string' }, note: { type: 'string' } },
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
      { items: [{ id: '1', label: null }, { id: '2', label: 'two' }] },
      arrSchema,
    )
    expect(result).toEqual({ items: [{ id: '1' }, { id: '2', label: 'two' }] })
  })

  it('returns the value untouched when no schema is supplied', () => {
    const value = { a: null, b: 1 }
    expect(undoNullWidening(value)).toBe(value)
  })

  it('leaves nulls under unknown (schemaless) properties untouched', () => {
    // `extra` is not described by the schema — we cannot prove its null is
    // synthetic, so it is preserved.
    const result = undoNullWidening({ req: 'a', extra: null } as object, schema)
    expect(result).toEqual({ req: 'a', extra: null })
  })
})
