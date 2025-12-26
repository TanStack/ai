import { describe, expect, it } from 'vitest'
import {
  makeOpenAIStructuredOutputCompatible,
  transformNullsToUndefined,
} from '../src/utils/schema-converter'

describe('transformNullsToUndefined', () => {
  it('should convert null to undefined', () => {
    expect(transformNullsToUndefined(null)).toBe(undefined)
  })

  it('should handle nested objects with null values', () => {
    const input = { a: 'hello', b: null, c: { d: null, e: 'world' } }
    const result = transformNullsToUndefined(input)
    expect(result).toEqual({ a: 'hello', c: { e: 'world' } })
  })

  it('should handle arrays with null values', () => {
    const input = [1, null, 3]
    const result = transformNullsToUndefined(input)
    expect(result).toEqual([1, undefined, 3])
  })

  it('should preserve non-null values', () => {
    const input = { a: 'string', b: 123, c: true, d: [1, 2, 3] }
    const result = transformNullsToUndefined(input)
    expect(result).toEqual(input)
  })
})

describe('makeOpenAIStructuredOutputCompatible', () => {
  it('should add additionalProperties: false to object schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    }

    const result = makeOpenAIStructuredOutputCompatible(schema, ['name'])
    expect(result.additionalProperties).toBe(false)
  })

  it('should make all properties required', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    }

    const result = makeOpenAIStructuredOutputCompatible(schema, ['name'])
    expect(result.required).toEqual(['name', 'age'])
  })

  it('should make optional fields nullable', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        nickname: { type: 'string' },
      },
      required: ['name'],
    }

    const result = makeOpenAIStructuredOutputCompatible(schema, ['name'])
    expect(result.properties.name.type).toBe('string')
    expect(result.properties.nickname.type).toEqual(['string', 'null'])
  })

  it('should handle anyOf (union types) by transforming each variant', () => {
    const schema = {
      type: 'object',
      properties: {
        u: {
          anyOf: [
            {
              type: 'object',
              properties: { a: { type: 'string' } },
              required: ['a'],
            },
            {
              type: 'object',
              properties: { b: { type: 'number' } },
              required: ['b'],
            },
          ],
        },
      },
      required: ['u'],
    }

    const result = makeOpenAIStructuredOutputCompatible(schema, ['u'])

    // Each variant in anyOf should have additionalProperties: false
    expect(result.properties.u.anyOf[0].additionalProperties).toBe(false)
    expect(result.properties.u.anyOf[1].additionalProperties).toBe(false)
  })

  it('should handle nested objects inside anyOf', () => {
    const schema = {
      type: 'object',
      properties: {
        data: {
          anyOf: [
            {
              type: 'object',
              properties: {
                nested: {
                  type: 'object',
                  properties: { x: { type: 'string' } },
                  required: ['x'],
                },
              },
              required: ['nested'],
            },
          ],
        },
      },
      required: ['data'],
    }

    const result = makeOpenAIStructuredOutputCompatible(schema, ['data'])

    // The nested object inside anyOf variant should also have additionalProperties: false
    expect(result.properties.data.anyOf[0].additionalProperties).toBe(false)
    expect(
      result.properties.data.anyOf[0].properties.nested.additionalProperties,
    ).toBe(false)
  })

  it('should handle arrays with items', () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
      },
      required: ['items'],
    }

    const result = makeOpenAIStructuredOutputCompatible(schema, ['items'])
    expect(result.properties.items.items.additionalProperties).toBe(false)
  })
})
