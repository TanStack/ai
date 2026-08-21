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

  it('does not rewrap a node that already accepts null', () => {
    const note = { anyOf: [{ type: 'string' }, { type: 'null' }] }
    const { schema, nullWideningMap } =
      makeMistralStructuredOutputCompatibleWithMap(
        {
          type: 'object',
          properties: { note },
          required: [],
        },
        [],
      )

    expect(schema.properties).toEqual({ note })
    expect(nullWideningMap).toBeUndefined()
  })

  it('adds null to enum and const when type already includes null', () => {
    const { schema, nullWideningMap } =
      makeMistralStructuredOutputCompatibleWithMap(
        {
          type: 'object',
          properties: {
            enumValue: { type: ['string', 'null'], enum: ['canary'] },
            constValue: { type: ['string', 'null'], const: 'fixed' },
            note: { type: ['string', 'null'] },
          },
          required: ['enumValue', 'constValue', 'note'],
        },
        ['enumValue', 'constValue', 'note'],
      )

    expect(schema.properties).toEqual({
      enumValue: {
        type: ['string', 'null'],
        enum: ['canary', null],
      },
      constValue: {
        type: ['string', 'null'],
        enum: ['fixed', null],
      },
      note: { type: ['string', 'null'] },
    })
    expect(nullWideningMap).toBeUndefined()
  })

  it('recurses into objects whose type is a union that includes object', () => {
    const { schema, nullWideningMap } =
      makeMistralStructuredOutputCompatibleWithMap(
        {
          type: 'object',
          properties: {
            nested: {
              type: ['object', 'null'],
              properties: {
                mode: { type: ['string', 'null'], enum: ['canary'] },
              },
              required: ['mode'],
              additionalProperties: false,
            },
          },
          required: ['nested'],
        },
        ['nested'],
      )

    expect(schema.properties).toEqual({
      nested: {
        type: ['object', 'null'],
        properties: {
          mode: {
            type: ['string', 'null'],
            enum: ['canary', null],
          },
        },
        required: ['mode'],
        additionalProperties: false,
      },
    })
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
        acceptAnything: true,
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

  it('falls back from strict mode for branch-dependent compositions', () => {
    const input = {
      type: 'object',
      properties: {
        allOfValue: { allOf: [{ type: 'string' }] },
        oneOfValue: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        },
        notNullValue: { not: { type: 'null' } },
      },
      required: [],
    }
    const result = makeMistralStructuredOutputCompatibleWithMap(input, [])

    expect(result).toEqual({
      schema: input,
      nullWideningMap: undefined,
      strict: false,
    })
  })

  it('falls back when an anyOf branch needs branch-dependent widening', () => {
    const input = {
      anyOf: [
        {
          type: 'object',
          properties: { optional: { type: 'string' } },
          required: [],
        },
        {
          type: 'object',
          properties: { optional: { type: ['string', 'null'] } },
          required: ['optional'],
        },
      ],
    }

    expect(makeMistralStructuredOutputCompatibleWithMap(input, [])).toEqual({
      schema: input,
      nullWideningMap: undefined,
      strict: false,
    })
  })
})
