import { describe, expect, it } from 'vitest'
import { makeMistralStructuredOutputCompatibleWithMap } from './schema-converter'

describe('makeMistralStructuredOutputCompatibleWithMap', () => {
  it('widens optional enum and const constraints to admit the omission marker', () => {
    const { schema, nullWideningMap } =
      makeMistralStructuredOutputCompatibleWithMap(
        {
          type: 'object',
          properties: {
            enumValue: { type: 'string', enum: ['canary'] },
            constValue: { type: 'string', const: 'fixed' },
          },
          required: [],
        },
        [],
      )

    expect(schema).toEqual({
      type: 'object',
      properties: {
        enumValue: {
          type: ['string', 'null'],
          enum: ['canary', null],
        },
        constValue: {
          type: ['string', 'null'],
          enum: ['fixed', null],
        },
      },
      required: ['enumValue', 'constValue'],
      additionalProperties: false,
    })
    expect(nullWideningMap).toEqual({
      properties: {
        enumValue: { widened: true },
        constValue: { widened: true },
      },
    })
  })

  it('does not mark original nullable fields as synthesized', () => {
    const { nullWideningMap } = makeMistralStructuredOutputCompatibleWithMap(
      {
        type: 'object',
        properties: {
          value: { type: ['string', 'null'] },
        },
        required: [],
      },
      [],
    )

    expect(nullWideningMap).toBeUndefined()
  })

  it('preserves boolean schemas while widening optional properties', () => {
    const inputSchema = {
      type: 'object',
      properties: {},
      required: [],
    }
    Reflect.set(inputSchema.properties, 'acceptAnything', true)
    Reflect.set(inputSchema.properties, 'rejectAnything', false)

    const { schema, nullWideningMap } =
      makeMistralStructuredOutputCompatibleWithMap(inputSchema, [])

    expect(schema).toEqual({
      type: 'object',
      properties: {
        acceptAnything: { anyOf: [true, { type: 'null' }] },
        rejectAnything: { anyOf: [false, { type: 'null' }] },
      },
      required: ['acceptAnything', 'rejectAnything'],
      additionalProperties: false,
    })
    expect(nullWideningMap).toEqual({
      properties: {
        rejectAnything: { widened: true },
      },
    })
  })
})
