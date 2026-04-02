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
