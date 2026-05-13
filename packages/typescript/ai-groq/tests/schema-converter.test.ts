import { describe, expect, it } from 'vitest'
import { makeGroqStructuredOutputCompatible } from '../src/utils/schema-converter'

describe('makeGroqStructuredOutputCompatible', () => {
  it('should remove empty required arrays inside anyOf variants', () => {
    const schema = {
      type: 'object',
      properties: {
        value: {
          anyOf: [
            {
              type: 'object',
              properties: {},
              required: [],
            },
            { type: 'null' },
          ],
        },
      },
      required: ['value'],
    }

    const result = makeGroqStructuredOutputCompatible(schema, ['value'])

    // Empty required inside anyOf variant should be removed
    const objectVariant = result.properties.value.anyOf.find(
      (v: any) => v.type === 'object',
    )
    expect(objectVariant.required).toBeUndefined()
  })

  it('should not have any empty required arrays in nested structures', () => {
    const schema = {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            inner: { type: 'string' },
          },
          required: ['inner'],
        },
      },
      required: ['data'],
    }

    // First create a schema that would produce empty required after processing
    const result = makeGroqStructuredOutputCompatible(schema, ['data'])

    // Should not have empty required arrays anywhere
    const checkNoEmptyRequired = (obj: any): void => {
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj.required)) {
          expect(obj.required.length).toBeGreaterThan(0)
        }
        for (const value of Object.values(obj)) {
          if (typeof value === 'object' && value !== null) {
            checkNoEmptyRequired(value)
          }
        }
      }
    }
    checkNoEmptyRequired(result)
  })

  it('should normalise nested empty-object schemas in properties', () => {
    // Reproduces the bug where a nested `{ type: 'object' }` without
    // `properties` slipped past the ai-openai-base transformer because the
    // ai-groq layer only normalised the top-level node.
    const schema = {
      type: 'object',
      properties: {
        child: { type: 'object' },
      },
      required: ['child'],
    }

    const result = makeGroqStructuredOutputCompatible(schema, ['child'])

    expect(result.properties.child.type).toBe('object')
    expect(result.properties.child.properties).toEqual({})
    // ai-openai-base sets additionalProperties: false on every rewritten object
    expect(result.properties.child.additionalProperties).toBe(false)
  })

  it('should normalise nested empty-object schemas in array items', () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'object' },
        },
      },
      required: ['items'],
    }

    const result = makeGroqStructuredOutputCompatible(schema, ['items'])

    expect(result.properties.items.items.type).toBe('object')
    expect(result.properties.items.items.properties).toEqual({})
    expect(result.properties.items.items.additionalProperties).toBe(false)
  })

  it('should normalise nested empty-object schemas inside anyOf', () => {
    const schema = {
      type: 'object',
      properties: {
        value: {
          anyOf: [{ type: 'object' }, { type: 'string' }],
        },
      },
      required: ['value'],
    }

    const result = makeGroqStructuredOutputCompatible(schema, ['value'])

    const objectVariant = result.properties.value.anyOf.find(
      (v: any) => v.type === 'object',
    )
    expect(objectVariant.properties).toEqual({})
    expect(objectVariant.additionalProperties).toBe(false)
  })

  it('should remove empty required in additionalProperties', () => {
    const schema = {
      type: 'object',
      properties: {
        meta: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      required: ['meta'],
    }

    const result = makeGroqStructuredOutputCompatible(schema, ['meta'])

    // meta should have required with allPropertyNames
    expect(result.properties.meta.required).toEqual(['name'])
    // additionalProperties' empty required should be removed
    if (
      result.properties.meta.additionalProperties &&
      typeof result.properties.meta.additionalProperties === 'object'
    ) {
      expect(
        result.properties.meta.additionalProperties.required,
      ).toBeUndefined()
    }
  })
})
